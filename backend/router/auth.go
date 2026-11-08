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
	loginMaxFailures      = 5
	loginWindow           = 15 * time.Minute
	loginLockout          = 15 * time.Minute
	loginFailureDelay     = 200 * time.Millisecond
	loginMaxBodyBytes     = 64 << 10
	loginMaxAttemptsPerIP = 30
	loginMaxRecords       = 1024
)

type loginRecord struct {
	failures     int
	windowStart  time.Time
	blockedUntil time.Time
}

// ipAttemptRecord counts every login attempt from one IP in the window.
type ipAttemptRecord struct {
	count       int
	windowStart time.Time
}

type loginLimiter struct {
	mu         sync.Mutex
	records    map[string]*loginRecord
	ipAttempts map[string]*ipAttemptRecord
}

var loginLimits = &loginLimiter{
	records:    map[string]*loginRecord{},
	ipAttempts: map[string]*ipAttemptRecord{},
}

// AllowIP counts one login attempt from ip and reports whether the IP
// stays under the coarse attempt cap. It counts every attempt, so one
// account's failures alone cannot trip the coarse cap.
func (l *loginLimiter) AllowIP(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	record, ok := l.ipAttempts[ip]
	if !ok || now.Sub(record.windowStart) >= loginWindow {
		record = &ipAttemptRecord{count: 1, windowStart: now}
		l.ipAttempts[ip] = record
	} else {
		record.count++
	}

	l.pruneIPAttempts(now, ip)
	return record.count <= loginMaxAttemptsPerIP
}

// RetryAfterIP returns the time until the IP window resets.
func (l *loginLimiter) RetryAfterIP(ip string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()

	record, ok := l.ipAttempts[ip]
	if !ok {
		return 0
	}

	remaining := loginWindow - time.Since(record.windowStart)
	if remaining < 0 {
		return 0
	}
	return remaining
}

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

	l.pruneRecords(now, ip)
}

// pruneRecords drops expired account records, then evicts the oldest live
// record while the map stays over the cap. The caller must hold the lock.
// The kept key is never evicted. An evicted record loses its failure
// history, but the coarse per-IP cap still bounds the source.
func (l *loginLimiter) pruneRecords(now time.Time, keep string) {
	if len(l.records) <= loginMaxRecords {
		return
	}
	for key, item := range l.records {
		if now.Sub(item.windowStart) >= loginWindow && !now.Before(item.blockedUntil) {
			delete(l.records, key)
		}
	}
	for len(l.records) > loginMaxRecords {
		oldest := ""
		var oldestStart time.Time
		first := true
		for key, item := range l.records {
			if key == keep {
				continue
			}
			if first || item.windowStart.Before(oldestStart) {
				oldest, oldestStart, first = key, item.windowStart, false
			}
		}
		if oldest == "" {
			return
		}
		delete(l.records, oldest)
	}
}

// pruneIPAttempts drops expired IP records, then evicts the oldest live
// record while the map stays over the cap. The caller must hold the lock.
// The kept IP is never evicted.
func (l *loginLimiter) pruneIPAttempts(now time.Time, keep string) {
	if len(l.ipAttempts) <= loginMaxRecords {
		return
	}
	for key, item := range l.ipAttempts {
		if now.Sub(item.windowStart) >= loginWindow {
			delete(l.ipAttempts, key)
		}
	}
	for len(l.ipAttempts) > loginMaxRecords {
		oldest := ""
		var oldestStart time.Time
		first := true
		for key, item := range l.ipAttempts {
			if key == keep {
				continue
			}
			if first || item.windowStart.Before(oldestStart) {
				oldest, oldestStart, first = key, item.windowStart, false
			}
		}
		if oldest == "" {
			return
		}
		delete(l.ipAttempts, oldest)
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
	l.ipAttempts = map[string]*ipAttemptRecord{}
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

func (c *Auth) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	if !c.trustedProxies.contains(host) {
		return host
	}
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			candidate := strings.TrimSpace(parts[i])
			if net.ParseIP(candidate) == nil || c.trustedProxies.contains(candidate) {
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

// trustedProxies holds the parsed TRUSTED_PROXIES list. The list is parsed
// once when the router is built, so a request never re-reads the variable.
// TRUSTED_PROXIES holds IPs and CIDRs, comma separated. Empty means no
// proxy is trusted, so forwarded headers are ignored.
type trustedProxies struct {
	cidrs  []*net.IPNet
	ips    []net.IP
	others []string
}

func parseTrustedProxies(value string) *trustedProxies {
	parsed := &trustedProxies{}
	for _, entry := range strings.Split(value, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if _, network, err := net.ParseCIDR(entry); err == nil {
			parsed.cidrs = append(parsed.cidrs, network)
			continue
		}
		if ip := net.ParseIP(entry); ip != nil {
			parsed.ips = append(parsed.ips, ip)
			continue
		}
		// Unparseable entries (hostnames, zone-scoped addresses) compare
		// case-insensitively: DNS names are case-insensitive, and a zone
		// suffix keeps an address from parsing.
		parsed.others = append(parsed.others, entry)
	}
	return parsed
}

// contains reports whether ip is a configured trusted proxy.
func (t *trustedProxies) contains(ip string) bool {
	if t == nil {
		return false
	}
	parsed := net.ParseIP(ip)
	for _, network := range t.cidrs {
		if parsed != nil && network.Contains(parsed) {
			return true
		}
	}
	for _, entry := range t.ips {
		if parsed != nil && entry.Equal(parsed) {
			return true
		}
	}
	for _, entry := range t.others {
		if strings.EqualFold(entry, ip) {
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

type Auth struct {
	trustedProxies *trustedProxies
}

func (c *Auth) Login(w http.ResponseWriter, r *http.Request) {
	ip := c.clientIP(r)

	// The coarse counter bounds every attempt from one IP, including
	// malformed bodies, which never reach the per-account limiter.
	if !loginLimits.AllowIP(ip) {
		seconds := int(loginLimits.RetryAfterIP(ip).Seconds())
		if seconds < 1 {
			seconds = 1
		}

		w.Header().Set("Retry-After", strconv.Itoa(seconds))
		utils.ResponseErrorStatus(w, errors.New("too many login attempts; try again later"), http.StatusTooManyRequests)
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, loginMaxBodyBytes)).Decode(&body); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			utils.ResponseErrorStatus(w, errors.New("request body too large"), http.StatusRequestEntityTooLarge)
		} else {
			utils.ResponseErrorStatus(w, errors.New("invalid request body"), http.StatusBadRequest)
		}
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
	if err := utils.Session.RenewToken(r); err != nil {
		utils.ResponseErrorStatus(w, errors.New("cannot rotate the session token"), http.StatusInternalServerError)
		return
	}
	utils.Session.Set(r, "authenticated", true)
	utils.ResponseSuccess(w, map[string]bool{
		"authenticated": true,
	})
}

func (c *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if err := utils.Session.Destroy(r); err != nil {
		utils.ResponseError(w, err)
		return
	}
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
