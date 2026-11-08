package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"khairul169/garage-webui/utils"

	"golang.org/x/crypto/bcrypt"
)

func newTestAPIHandler() http.Handler {
	sessionMgr := utils.InitSessionManager()
	return sessionMgr.LoadAndSave(HandleApiRouter())
}

func TestAuthMiddlewareRejectsRequestsWhenCredentialsAreUnset(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "")
	t.Setenv("AUTH_DISABLED", "")

	handler := newTestAPIHandler()

	req := httptest.NewRequest(http.MethodGet, "/auth/status", nil)
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

	req := httptest.NewRequest(http.MethodGet, "/auth/status", nil)
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

	var status map[string]bool
	if err := json.Unmarshal(rec.Body.Bytes(), &status); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}

	if !status["authenticated"] {
		t.Error("expected authenticated true when auth is disabled, got false")
	}
	if status["enabled"] {
		t.Error("expected enabled false without AUTH_USER_PASS, got true")
	}
}

func TestGetStatusReportsUnauthenticatedWhenAuthIsEnabledWithoutSession(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "admin:unused-hash")
	t.Setenv("AUTH_DISABLED", "")

	// Call the handler directly: the middleware never lets a session-less
	// request through when auth is enabled, so the router cannot show it.
	auth := &Auth{}
	sessionMgr := utils.InitSessionManager()
	handler := sessionMgr.LoadAndSave(http.HandlerFunc(auth.GetStatus))

	req := httptest.NewRequest(http.MethodGet, "/auth/status", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var status map[string]bool
	if err := json.Unmarshal(rec.Body.Bytes(), &status); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}

	if status["authenticated"] {
		t.Error("expected authenticated false without a session, got true")
	}
	if !status["enabled"] {
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

	var status map[string]bool
	if err := json.Unmarshal(rec.Body.Bytes(), &status); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}

	if !status["authenticated"] {
		t.Error("expected authenticated true with a session, got false")
	}
	if !status["enabled"] {
		t.Error("expected enabled true with AUTH_USER_PASS set, got false")
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

	if code := statusCodeWithSessionCookie(t, handler, "/auth/status", first); code != http.StatusUnauthorized {
		t.Errorf("expected the old token to be rejected with 401, got %d", code)
	}
	if code := statusCodeWithSessionCookie(t, handler, "/auth/status", second); code != http.StatusOK {
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

	if code := statusCodeWithSessionCookie(t, handler, "/auth/status", token); code != http.StatusUnauthorized {
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

