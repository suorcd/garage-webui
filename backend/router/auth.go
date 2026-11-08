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
	return host
}

type Auth struct{}

func (c *Auth) Login(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !loginLimits.Allow(ip) {
		seconds := int(loginLimits.RetryAfter(ip).Seconds())
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
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		loginLimits.Fail(ip)
		time.Sleep(loginFailureDelay)
		utils.ResponseError(w, err)
		return
	}

	userPass := strings.SplitN(utils.GetEnv("AUTH_USER_PASS", ""), ":", 2)
	if len(userPass) < 2 || userPass[1] == "" {
		utils.ResponseErrorStatus(w, errors.New("AUTH_USER_PASS not set"), http.StatusInternalServerError)
		return
	}

	passwordErr := bcrypt.CompareHashAndPassword([]byte(userPass[1]), []byte(body.Password))
	if strings.TrimSpace(body.Username) != userPass[0] || passwordErr != nil {
		loginLimits.Fail(ip)
		time.Sleep(loginFailureDelay)
		utils.ResponseErrorStatus(w, errors.New("invalid username or password"), http.StatusUnauthorized)
		return
	}

	loginLimits.Reset(ip)
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
