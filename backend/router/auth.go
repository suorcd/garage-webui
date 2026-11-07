package router

import (
	"encoding/json"
	"errors"
	"khairul169/garage-webui/utils"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	loginMaxFailures  = 5
	loginWindow       = 15 * time.Minute
	loginLockout      = 15 * time.Minute
	loginFailureDelay = 200 * time.Millisecond
	loginMaxBodyBytes = 64 << 10
)

type loginRecord struct {
	failures     int
	windowStart  time.Time
	blockedUntil time.Time
}

type loginLimiter struct {
	mu      sync.Mutex
	records map[string]*loginRecord
}

var loginLimits = &loginLimiter{records: map[string]*loginRecord{}}

func (l *loginLimiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	record, ok := l.records[ip]
	if !ok {
		return true
	}

	now := time.Now()
	if now.Before(record.blockedUntil) {
		return false
	}
	if now.Sub(record.windowStart) < loginWindow {
		return record.failures < loginMaxFailures
	}

	delete(l.records, ip)
	return true
}

func (l *loginLimiter) Fail(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	record, ok := l.records[ip]
	if !ok || now.Sub(record.windowStart) >= loginWindow {
		record = &loginRecord{windowStart: now}
		l.records[ip] = record
	}

	record.failures++
	if record.failures >= loginMaxFailures {
		record.blockedUntil = now.Add(loginLockout)
	}

	if len(l.records) > 1024 {
		for key, item := range l.records {
			if now.Sub(item.windowStart) >= loginWindow && !now.Before(item.blockedUntil) {
				delete(l.records, key)
			}
		}
	}
}

func (l *loginLimiter) Reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	delete(l.records, ip)
}

// ResetAll clears every limiter record. Tests call it in cleanup so one
// test cannot lock out the next.
func (l *loginLimiter) ResetAll() {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.records = map[string]*loginRecord{}
}

func (l *loginLimiter) RetryAfter(ip string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()

	record, ok := l.records[ip]
	if !ok {
		return 0
	}

	remaining := time.Until(record.blockedUntil)
	if remaining < 0 {
		return 0
	}
	return remaining
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	if !trustedProxy(host) {
		return host
	}
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			candidate := strings.TrimSpace(parts[i])
			if net.ParseIP(candidate) == nil || trustedProxy(candidate) {
				continue
			}
			return candidate
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); net.ParseIP(realIP) != nil {
		return realIP
	}
	return host
}

// trustedProxy reports whether ip is a configured trusted proxy. TRUSTED_PROXIES
// holds IPs and CIDRs, comma separated. Empty means no proxy is trusted, so
// forwarded headers are ignored.
func trustedProxy(ip string) bool {
	for _, entry := range strings.Split(utils.GetEnv("TRUSTED_PROXIES", ""), ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if _, network, err := net.ParseCIDR(entry); err == nil {
			if parsed := net.ParseIP(ip); parsed != nil && network.Contains(parsed) {
				return true
			}
			continue
		}
		if parsed := net.ParseIP(entry); parsed != nil {
			if ipParsed := net.ParseIP(ip); ipParsed != nil && parsed.Equal(ipParsed) {
				return true
			}
			continue
		}
		if entry == ip {
			return true
		}
	}
	return false
}

// loginLimitKey keys the limiter on the client IP and the username. Failures
// for one username cannot lock out another user behind the same ingress IP.
// The NUL separator cannot appear in an IP, so the split is unambiguous.
func loginLimitKey(ip, username string) string {
	return ip + "\x00" + username
}

type Auth struct{}

func (c *Auth) Login(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, loginMaxBodyBytes)).Decode(&body); err != nil {
		loginLimits.Fail(loginLimitKey(ip, ""))
		time.Sleep(loginFailureDelay)
		utils.ResponseError(w, err)
		return
	}

	key := loginLimitKey(ip, strings.TrimSpace(body.Username))
	if !loginLimits.Allow(key) {
		seconds := int(loginLimits.RetryAfter(key).Seconds())
		if seconds < 1 {
			seconds = 1
		}

		w.Header().Set("Retry-After", strconv.Itoa(seconds))
		utils.ResponseErrorStatus(w, errors.New("too many login attempts; try again later"), http.StatusTooManyRequests)
		return
	}

	userPass := strings.SplitN(utils.GetEnv("AUTH_USER_PASS", ""), ":", 2)
	if len(userPass) < 2 || userPass[1] == "" {
		utils.ResponseErrorStatus(w, errors.New("AUTH_USER_PASS not set"), http.StatusInternalServerError)
		return
	}

	passwordErr := bcrypt.CompareHashAndPassword([]byte(userPass[1]), []byte(body.Password))
	if strings.TrimSpace(body.Username) != userPass[0] || passwordErr != nil {
		loginLimits.Fail(key)
		time.Sleep(loginFailureDelay)
		utils.ResponseErrorStatus(w, errors.New("invalid username or password"), http.StatusUnauthorized)
		return
	}

	loginLimits.Reset(key)
	utils.Session.Set(r, "authenticated", true)
	utils.ResponseSuccess(w, map[string]bool{
		"authenticated": true,
	})
}

func (c *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	utils.Session.Clear(r)
	utils.ResponseSuccess(w, true)
}

func (c *Auth) GetStatus(w http.ResponseWriter, r *http.Request) {
	enabled := utils.GetEnv("AUTH_USER_PASS", "") != ""
	isAuthenticated := !enabled

	if authSession := utils.Session.Get(r, "authenticated"); authSession != nil && authSession.(bool) {
		isAuthenticated = true
	}

	utils.ResponseSuccess(w, map[string]bool{
		"enabled":       enabled,
		"authenticated": isAuthenticated,
	})
}
