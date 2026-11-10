package router

import (
	"encoding/json"
	"errors"
	"fmt"
	"golang.org/x/crypto/bcrypt"
	"khairul169/garage-webui/utils"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func newTestAPIHandler() http.Handler {
	sessionMgr := utils.InitSessionManager()
	return sessionMgr.LoadAndSave(HandleApiRouter())
}

type authStatusResponse struct {
	Enabled       bool   `json:"enabled"`
	Authenticated bool   `json:"authenticated"`
	Username      string `json:"username"`
	Role          string `json:"role"`
}

func TestAuthMiddlewareRejectsRequestsWhenCredentialsAreUnset(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "")
	t.Setenv("AUTH_DISABLED", "")

	handler := newTestAPIHandler()

	// /auth/status is public by design, so probe a protected route.
	req := httptest.NewRequest(http.MethodGet, "/config", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAuthMiddlewareAllowsRequestsWhenAuthIsDisabled(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "")
	t.Setenv("AUTH_DISABLED", "true")

	handler := newTestAPIHandler()

	// /auth/status answers 200 without a session on any configuration, so it
	// cannot show that the middleware passed the request. Use a protected route.
	req := httptest.NewRequest(http.MethodGet, "/config", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCSRFMiddlewareRejectsMutationWithoutHeader(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "")
	t.Setenv("AUTH_DISABLED", "true")

	handler := newTestAPIHandler()

	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 without the CSRF header, got %d: %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 with the CSRF header, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestLoginRejectsRepeatedFailedAttempts(t *testing.T) {
	// The limiter is package state: without this, the failures below lock
	// admin out of every later test that logs in from the same address.
	t.Cleanup(func() { loginLimits.ResetAll() })

	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("cannot hash test password: %v", err)
	}

	t.Setenv("AUTH_USER_PASS", "admin:"+string(hash))
	t.Setenv("AUTH_DISABLED", "")

	handler := newTestAPIHandler()
	body := `{"username":"admin","password":"wrong-password"}`

	const maxFailures = 5
	for i := 0; i < maxFailures; i++ {
		req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d: %s", i+1, rec.Code, rec.Body.String())
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected status 429 after %d failed attempts, got %d: %s", maxFailures, rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Error("expected a Retry-After header")
	}
}

func TestGetStatusReportsAuthenticatedWhenAuthIsDisabled(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "")
	t.Setenv("AUTH_DISABLED", "true")

	handler := newTestAPIHandler()

	req := httptest.NewRequest(http.MethodGet, "/auth/status", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var status authStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &status); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}

	if !status.Authenticated {
		t.Error("expected authenticated true when auth is disabled, got false")
	}
	if status.Enabled {
		t.Error("expected enabled false without AUTH_USER_PASS, got true")
	}
	if status.Role != "admin" {
		t.Errorf("expected the admin role when auth is disabled, got %q", status.Role)
	}
}

func TestGetStatusReportsUnauthenticatedWhenAuthIsEnabledWithoutSession(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "admin:unused-hash")
	t.Setenv("AUTH_DISABLED", "")

	// Call the handler directly. The router also reaches it without a session
	// (see TestStatusIsReachableWithoutSession); this test pins the handler's
	// own answer.
	auth := &Auth{}
	sessionMgr := utils.InitSessionManager()
	handler := sessionMgr.LoadAndSave(http.HandlerFunc(auth.GetStatus))

	req := httptest.NewRequest(http.MethodGet, "/auth/status", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var status authStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &status); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}

	if status.Authenticated {
		t.Error("expected authenticated false without a session, got true")
	}
	if !status.Enabled {
		t.Error("expected enabled true with AUTH_USER_PASS set, got false")
	}
}

func TestGetStatusReportsAuthenticatedWithSession(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("cannot hash test password: %v", err)
	}

	t.Setenv("AUTH_USER_PASS", "admin:"+string(hash))
	t.Setenv("AUTH_DISABLED", "")

	handler := newTestAPIHandler()

	loginReq := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"admin","password":"correct-password"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginReq.Header.Set("X-Requested-With", "XMLHttpRequest")
	loginReq.RemoteAddr = "192.0.2.99:1234"
	loginRec := httptest.NewRecorder()
	handler.ServeHTTP(loginRec, loginReq)

	if loginRec.Code != http.StatusOK {
		t.Fatalf("expected login status 200, got %d: %s", loginRec.Code, loginRec.Body.String())
	}

	cookies := loginRec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected a session cookie from login, got none")
	}

	req := httptest.NewRequest(http.MethodGet, "/auth/status", nil)
	req.RemoteAddr = "192.0.2.99:1234"
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var status authStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &status); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}

	if !status.Authenticated {
		t.Error("expected authenticated true with a session, got false")
	}
	if !status.Enabled {
		t.Error("expected enabled true with AUTH_USER_PASS set, got false")
	}
	if status.Role != "admin" {
		t.Errorf("expected the admin role, got %q", status.Role)
	}
	if status.Username != "admin" {
		t.Errorf("expected the admin username, got %q", status.Username)
	}
}

func setupLoginHandler(t *testing.T) http.Handler {
	t.Helper()

	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("cannot hash test password: %v", err)
	}

	t.Setenv("AUTH_USER_PASS", "admin:"+string(hash))
	t.Setenv("AUTH_DISABLED", "")

	return newTestAPIHandler()
}

func loginAttempt(t *testing.T, handler http.Handler, remoteAddr, forwardedFor, realIP, username, password string) int {
	t.Helper()

	body := fmt.Sprintf(`{"username":%q,"password":%q}`, username, password)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}
	if forwardedFor != "" {
		req.Header.Set("X-Forwarded-For", forwardedFor)
	}
	if realIP != "" {
		req.Header.Set("X-Real-IP", realIP)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec.Code
}

func TestLoginLimiterKeysOnUsername(t *testing.T) {
	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "192.0.2.1:1234", "", "", "alice", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "", "", "alice", "wrong-password"); code != http.StatusTooManyRequests {
		t.Errorf("expected a sixth alice attempt to be rate limited, got %d", code)
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "", "", "admin", "correct-password"); code != http.StatusOK {
		t.Errorf("expected admin to log in from the same IP, got %d", code)
	}
}

func TestLoginLimiterTrustsForwardedForFromTrustedProxy(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "192.0.2.1")

	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.5", "", "admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.6", "", "admin", "correct-password"); code != http.StatusOK {
		t.Errorf("expected a different client behind the proxy to log in, got %d", code)
	}
}

func TestLoginLimiterIgnoresForwardedForFromUntrustedProxy(t *testing.T) {
	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	// Same username for the failures and the login: only the X-Forwarded-For
	// value differs, so a trusted header would split the bucket.
	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.5", "", "admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.6", "", "admin", "correct-password"); code != http.StatusTooManyRequests {
		t.Errorf("expected the ingress IP to stay locked out, got %d", code)
	}
}

func TestLoginLimiterIgnoresSpoofedForwardedFor(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "192.0.2.1")

	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.99, 203.0.113.5", "", "admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.99, 203.0.113.6", "", "admin", "correct-password"); code != http.StatusOK {
		t.Errorf("expected a different client behind the proxy to log in, got %d", code)
	}
}

func TestLoginLimiterSharesBudgetAcrossWhitespaceUsernames(t *testing.T) {
	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	// The credential check trims the username, so " admin" and "admin" are
	// the same account. Their failures must share one budget.
	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "192.0.2.1:1234", "", "", " admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "", "", "admin", "wrong-password"); code != http.StatusTooManyRequests {
		t.Errorf("expected a sixth attempt as admin to be rate limited, got %d", code)
	}
}

func TestLoginLimiterTrustsCIDRProxy(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "192.0.2.0/24")

	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.5", "", "admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.6", "", "admin", "correct-password"); code != http.StatusOK {
		t.Errorf("expected a different client behind the CIDR proxy to log in, got %d", code)
	}
}

func TestLoginLimiterTrustsRealIPFromTrustedProxy(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "192.0.2.1")

	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "192.0.2.1:1234", "", "203.0.113.5", "admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "", "203.0.113.6", "admin", "correct-password"); code != http.StatusOK {
		t.Errorf("expected a different client behind the proxy to log in, got %d", code)
	}
}

func TestLoginLimiterTrustsMultiEntryProxyList(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "10.0.0.1, 192.0.2.1")

	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.5", "", "admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.6", "", "admin", "correct-password"); code != http.StatusOK {
		t.Errorf("expected a different client behind the proxy to log in, got %d", code)
	}
}

func TestLoginLimiterTrustsIPv6ProxyCaseInsensitively(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "FD00::1")

	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "[fd00::1]:1234", "203.0.113.5", "", "admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "[fd00::1]:1234", "203.0.113.6", "", "admin", "correct-password"); code != http.StatusOK {
		t.Errorf("expected a different client behind the IPv6 proxy to log in, got %d", code)
	}
}

func TestLoginLimiterTrustsZoneScopedIPv6Proxy(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "FE80::1%eth0")

	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "[fe80::1%eth0]:1234", "203.0.113.5", "", "admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "[fe80::1%eth0]:1234", "203.0.113.6", "", "admin", "correct-password"); code != http.StatusOK {
		t.Errorf("expected a different client behind the zone-scoped proxy to log in, got %d", code)
	}
}

func TestLoginRejectsOversizedBody(t *testing.T) {
	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	body := `{"username":"admin","password":"correct-password","padding":"` + strings.Repeat("x", 70*1024) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.RemoteAddr = "192.0.2.99:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected status 413 for an oversized body, got %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "http:") {
		t.Errorf("expected a generic error message, got %q", rec.Body.String())
	}
}

// loginAttemptRaw sends a login request with the given raw body and returns
// the status code. Tests that send malformed bodies use it.
func loginAttemptRaw(t *testing.T, handler http.Handler, remoteAddr, body string) int {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec.Code
}

// TestLoginLimiterCapsAttemptsPerIP reproduces the spray measurement: 40
// attempts from one IP with a distinct username each. The first 30 fail
// with 401, the rest hit the coarse per-IP cap with 429.
func TestLoginLimiterCapsAttemptsPerIP(t *testing.T) {
	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	counts := map[int]int{}
	for i := 0; i < 40; i++ {
		code := loginAttempt(t, handler, "192.0.2.1:1234", "", "", fmt.Sprintf("user-%d", i), "wrong-password")
		counts[code]++
	}
	if counts[http.StatusUnauthorized] != loginMaxAttemptsPerIP {
		t.Errorf("expected %d attempts with 401, got %d: %v", loginMaxAttemptsPerIP, counts[http.StatusUnauthorized], counts)
	}
	if counts[http.StatusTooManyRequests] != 40-loginMaxAttemptsPerIP {
		t.Errorf("expected %d attempts with 429, got %d: %v", 40-loginMaxAttemptsPerIP, counts[http.StatusTooManyRequests], counts)
	}

	// A second IP is not affected by the first IP's cap.
	if code := loginAttempt(t, handler, "192.0.2.2:1234", "", "", "admin", "correct-password"); code != http.StatusOK {
		t.Errorf("expected a login from a second IP to succeed, got %d", code)
	}
}

func TestLoginLimiterCapsMalformedBodies(t *testing.T) {
	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	counts := map[int]int{}
	for i := 0; i < 35; i++ {
		code := loginAttemptRaw(t, handler, "192.0.2.1:1234", "{not json")
		counts[code]++
	}
	if counts[http.StatusBadRequest] != loginMaxAttemptsPerIP {
		t.Errorf("expected %d malformed bodies with 400, got %d: %v", loginMaxAttemptsPerIP, counts[http.StatusBadRequest], counts)
	}
	if counts[http.StatusTooManyRequests] != 35-loginMaxAttemptsPerIP {
		t.Errorf("expected %d malformed bodies with 429, got %d: %v", 35-loginMaxAttemptsPerIP, counts[http.StatusTooManyRequests], counts)
	}
}

func TestLoginLimiterEvictsOldestRecordAtCap(t *testing.T) {
	loginLimits.ResetAll()
	t.Cleanup(func() { loginLimits.ResetAll() })

	now := time.Now()
	loginLimits.mu.Lock()
	for i := 0; i < loginMaxRecords; i++ {
		key := fmt.Sprintf("192.0.2.1\x00user-%d", i)
		loginLimits.records[key] = &loginRecord{
			failures:    1,
			windowStart: now.Add(-time.Duration(loginMaxRecords-i) * time.Millisecond),
		}
	}
	loginLimits.mu.Unlock()

	loginLimits.Fail("192.0.2.1\x00new-user")

	loginLimits.mu.Lock()
	defer loginLimits.mu.Unlock()
	if len(loginLimits.records) > loginMaxRecords {
		t.Errorf("expected at most %d records, got %d", loginMaxRecords, len(loginLimits.records))
	}
	if _, ok := loginLimits.records["192.0.2.1\x00new-user"]; !ok {
		t.Error("expected the new key to be tracked")
	}
	if _, ok := loginLimits.records["192.0.2.1\x00user-0"]; ok {
		t.Error("expected the oldest record to be evicted")
	}
}

func TestLoginLimiterEvictsOldestIPAttemptAtCap(t *testing.T) {
	loginLimits.ResetAll()
	t.Cleanup(func() { loginLimits.ResetAll() })

	now := time.Now()
	loginLimits.mu.Lock()
	for i := 0; i < loginMaxRecords; i++ {
		ip := fmt.Sprintf("192.0.%d.%d", i/256, i%256)
		loginLimits.ipAttempts[ip] = &ipAttemptRecord{
			count:       1,
			windowStart: now.Add(-time.Duration(loginMaxRecords-i) * time.Millisecond),
		}
	}
	loginLimits.mu.Unlock()

	if !loginLimits.AllowIP("198.51.100.1") {
		t.Error("expected the first attempt from a new IP to be allowed")
	}

	loginLimits.mu.Lock()
	defer loginLimits.mu.Unlock()
	if len(loginLimits.ipAttempts) > loginMaxRecords {
		t.Errorf("expected at most %d IP records, got %d", loginMaxRecords, len(loginLimits.ipAttempts))
	}
	if _, ok := loginLimits.ipAttempts["198.51.100.1"]; !ok {
		t.Error("expected the new IP to be tracked")
	}
	if _, ok := loginLimits.ipAttempts["192.0.0.0"]; ok {
		t.Error("expected the oldest IP record to be evicted")
	}
}

func TestLoginLimiterIgnoresProxySetAfterHandlerBuilt(t *testing.T) {
	handler := setupLoginHandler(t)
	t.Cleanup(func() { loginLimits.ResetAll() })

	// TRUSTED_PROXIES is set after the handler is built, so the handler
	// must not trust the proxy.
	t.Setenv("TRUSTED_PROXIES", "192.0.2.1")

	for i := 0; i < loginMaxFailures; i++ {
		if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.5", "", "admin", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status 401, got %d", i+1, code)
		}
	}
	if code := loginAttempt(t, handler, "192.0.2.1:1234", "203.0.113.6", "", "admin", "correct-password"); code != http.StatusTooManyRequests {
		t.Errorf("expected the ingress IP to stay locked out, got %d", code)
	}
}

func loginAndGetSessionCookie(t *testing.T, handler http.Handler, cookie string) string {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"admin","password":"correct-password"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.RemoteAddr = "192.0.2.99:1234"
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "session", Value: cookie})
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected login status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	for _, c := range rec.Result().Cookies() {
		if c.Name == "session" {
			return c.Value
		}
	}
	t.Fatal("expected a session cookie from login, got none")
	return ""
}

func statusCodeWithSessionCookie(t *testing.T, handler http.Handler, path, cookie string) int {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.RemoteAddr = "192.0.2.99:1234"
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "session", Value: cookie})
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec.Code
}

func TestLoginRotatesSessionToken(t *testing.T) {
	handler := setupLoginHandler(t)

	first := loginAndGetSessionCookie(t, handler, "")
	if first == "" {
		t.Fatal("expected a session cookie from the first login")
	}

	second := loginAndGetSessionCookie(t, handler, first)
	if second == "" {
		t.Fatal("expected a session cookie from the second login")
	}
	if second == first {
		t.Error("expected login to rotate the session token, got the same token")
	}

	if code := statusCodeWithSessionCookie(t, handler, "/config", first); code != http.StatusUnauthorized {
		t.Errorf("expected the old token to be rejected with 401, got %d", code)
	}
	if code := statusCodeWithSessionCookie(t, handler, "/config", second); code != http.StatusOK {
		t.Errorf("expected the new token to return 200, got %d", code)
	}
}

func TestLogoutDestroysSessionToken(t *testing.T) {
	handler := setupLoginHandler(t)

	token := loginAndGetSessionCookie(t, handler, "")
	if token == "" {
		t.Fatal("expected a session cookie from login")
	}

	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.RemoteAddr = "192.0.2.99:1234"
	req.AddCookie(&http.Cookie{Name: "session", Value: token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected logout status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var logoutCookie *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == "session" {
			logoutCookie = c
		}
	}
	if logoutCookie == nil {
		t.Fatal("expected logout to set a session cookie")
	}
	if logoutCookie.Value == token {
		t.Error("expected logout to destroy the session token, got the same token")
	}
	if logoutCookie.Value != "" && logoutCookie.MaxAge >= 0 {
		t.Errorf("expected logout to delete or rotate the session cookie, got value %q with MaxAge %d", logoutCookie.Value, logoutCookie.MaxAge)
	}

	if code := statusCodeWithSessionCookie(t, handler, "/config", token); code != http.StatusUnauthorized {
		t.Errorf("expected the logged-out token to be rejected with 401, got %d", code)
	}
}

func TestLoginSetsSecureCookie(t *testing.T) {
	handler := setupLoginHandler(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"admin","password":"correct-password"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.RemoteAddr = "192.0.2.99:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected login status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	setCookie := rec.Header().Get("Set-Cookie")
	if !strings.Contains(setCookie, "; Secure") {
		t.Errorf("expected the session cookie to be Secure, got %q", setCookie)
	}
	if !strings.Contains(setCookie, "; HttpOnly") {
		t.Errorf("expected the session cookie to be HttpOnly, got %q", setCookie)
	}
	if !strings.Contains(setCookie, "; SameSite=Lax") {
		t.Errorf("expected the session cookie to be SameSite=Lax, got %q", setCookie)
	}
}

func TestLoginCookieSecureCanBeDisabled(t *testing.T) {
	t.Setenv("SESSION_COOKIE_SECURE", "false")

	handler := setupLoginHandler(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"admin","password":"correct-password"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.RemoteAddr = "192.0.2.99:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected login status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	setCookie := rec.Header().Get("Set-Cookie")
	if strings.Contains(setCookie, "; Secure") {
		t.Errorf("expected the session cookie to skip Secure when disabled, got %q", setCookie)
	}
}

func TestLoginCookieSecureAcceptsCapitalisedFalse(t *testing.T) {
	t.Setenv("SESSION_COOKIE_SECURE", "False")

	handler := setupLoginHandler(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"admin","password":"correct-password"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.RemoteAddr = "192.0.2.99:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected login status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	setCookie := rec.Header().Get("Set-Cookie")
	if strings.Contains(setCookie, "; Secure") {
		t.Errorf("expected the session cookie to skip Secure for SESSION_COOKIE_SECURE=False, got %q", setCookie)
	}
}

// failingDeleteStore keeps session data in memory but fails every delete,
// so a test can force RenewToken to fail.
type failingDeleteStore struct {
	mu    sync.Mutex
	items map[string][]byte
}

func newFailingDeleteStore() *failingDeleteStore {
	return &failingDeleteStore{items: make(map[string][]byte)}
}

func (s *failingDeleteStore) Find(token string) ([]byte, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.items[token]
	return b, ok, nil
}

func (s *failingDeleteStore) Commit(token string, b []byte, expiry time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[token] = b
	return nil
}

func (s *failingDeleteStore) Delete(string) error {
	return errors.New("session store unavailable")
}

func TestLoginHidesSessionRotationFailure(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("cannot hash test password: %v", err)
	}

	t.Setenv("AUTH_USER_PASS", "admin:"+string(hash))
	t.Setenv("AUTH_DISABLED", "")

	sessionMgr := utils.InitSessionManager()
	sessionMgr.Store = newFailingDeleteStore()
	handler := sessionMgr.LoadAndSave(HandleApiRouter())

	first := loginAndGetSessionCookie(t, handler, "")
	if first == "" {
		t.Fatal("expected a session cookie from the first login")
	}

	// A second login must rotate the old token, which deletes it from the
	// store. The failing store makes that delete fail.
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"admin","password":"correct-password"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.RemoteAddr = "192.0.2.99:1234"
	req.AddCookie(&http.Cookie{Name: "session", Value: first})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected login status 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "cannot rotate the session token" {
		t.Errorf("expected a generic rotation error, got %q", rec.Body.String())
	}
}

func TestLoginReadOnlyRole(t *testing.T) {
	t.Cleanup(func() { loginLimits.ResetAll() })

	adminHash, err := bcrypt.GenerateFromPassword([]byte("admin-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("cannot hash the admin password: %v", err)
	}
	viewerHash, err := bcrypt.GenerateFromPassword([]byte("viewer-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("cannot hash the viewer password: %v", err)
	}

	t.Setenv("AUTH_USER_PASS", "admin:"+string(adminHash))
	t.Setenv("AUTH_READONLY_USER_PASS", "viewer:"+string(viewerHash))
	t.Setenv("AUTH_DISABLED", "")

	handler := newTestAPIHandler()

	loginReq := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"viewer","password":"viewer-password"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginReq.Header.Set("X-Requested-With", "XMLHttpRequest")
	loginReq.RemoteAddr = "192.0.2.77:1234"
	loginRec := httptest.NewRecorder()
	handler.ServeHTTP(loginRec, loginReq)

	if loginRec.Code != http.StatusOK {
		t.Fatalf("expected login status 200, got %d: %s", loginRec.Code, loginRec.Body.String())
	}

	cookies := loginRec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected a session cookie from the viewer login, got none")
	}

	statusReq := httptest.NewRequest(http.MethodGet, "/auth/status", nil)
	statusReq.RemoteAddr = "192.0.2.77:1234"
	for _, cookie := range cookies {
		statusReq.AddCookie(cookie)
	}
	statusRec := httptest.NewRecorder()
	handler.ServeHTTP(statusRec, statusReq)

	if statusRec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", statusRec.Code, statusRec.Body.String())
	}

	var status authStatusResponse
	if err := json.Unmarshal(statusRec.Body.Bytes(), &status); err != nil {
		t.Fatalf("cannot decode status: %v", err)
	}
	if !status.Authenticated || status.Role != "readonly" || status.Username != "viewer" {
		t.Fatalf("unexpected viewer status: %+v", status)
	}

	mutationReq := httptest.NewRequest(http.MethodPost, "/v2/DeleteKey", strings.NewReader(`{"id":"key-1"}`))
	mutationReq.Header.Set("X-Requested-With", "XMLHttpRequest")
	mutationReq.RemoteAddr = "192.0.2.77:1234"
	for _, cookie := range cookies {
		mutationReq.AddCookie(cookie)
	}
	mutationRec := httptest.NewRecorder()
	handler.ServeHTTP(mutationRec, mutationReq)

	if mutationRec.Code != http.StatusForbidden {
		t.Fatalf("expected a read-only mutation to return 403, got %d: %s", mutationRec.Code, mutationRec.Body.String())
	}
	if !strings.Contains(mutationRec.Body.String(), "read-only user") {
		t.Errorf("expected the read-only error, got %q", mutationRec.Body.String())
	}

	readReq := httptest.NewRequest(http.MethodGet, "/config", nil)
	readReq.RemoteAddr = "192.0.2.77:1234"
	for _, cookie := range cookies {
		readReq.AddCookie(cookie)
	}
	readRec := httptest.NewRecorder()
	handler.ServeHTTP(readRec, readReq)

	if readRec.Code != http.StatusOK {
		t.Fatalf("expected a read-only GET to return 200, got %d: %s", readRec.Code, readRec.Body.String())
	}
}

// TestStatusIsReachableWithoutSession pins the route the UI reads before it
// can render the login form. It must answer 200 with authenticated=false, not
// 401 from the auth middleware.
func TestStatusIsReachableWithoutSession(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "user:hash")
	t.Setenv("AUTH_DISABLED", "")

	handler := newTestAPIHandler()

	req := httptest.NewRequest(http.MethodGet, "/auth/status", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 without a session, got %d: %s", rec.Code, rec.Body.String())
	}

	var status authStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &status); err != nil {
		t.Fatalf("cannot decode status: %v", err)
	}
	if !status.Enabled {
		t.Fatalf("expected enabled=true, got %+v", status)
	}
	if status.Authenticated {
		t.Fatalf("expected authenticated=false without a session, got %+v", status)
	}
}

// TestRouteAuthSurface pins which routes are reachable without a session. The
// public list is a contract: the UI reads the status route before it can
// render the login form, and a 401 there is indistinguishable from a server
// fault. A route that drifts across the middleware boundary fails here.
func TestRouteAuthSurface(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "user:hash")
	t.Setenv("AUTH_DISABLED", "")

	handler := newTestAPIHandler()

	cases := []struct {
		method string
		path   string
		public bool
	}{
		{http.MethodGet, "/auth/status", true},
		{http.MethodGet, "/config", false},
		{http.MethodGet, "/buckets", false},
		{http.MethodGet, "/v2/GetClusterStatus", false},
		{http.MethodPost, "/v2/DeleteKey", false},
	}

	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{}`))
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if tc.public && rec.Code == http.StatusUnauthorized {
			t.Errorf("%s %s must answer without a session, got 401", tc.method, tc.path)
		}
		if !tc.public && rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s must require a session, got %d: %s", tc.method, tc.path, rec.Code, rec.Body.String())
		}
	}
}
