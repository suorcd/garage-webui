package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
