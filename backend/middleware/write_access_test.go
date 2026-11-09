package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"khairul169/garage-webui/utils"
)

func requestWithRole(t *testing.T, role, method, path string) *http.Request {
	t.Helper()

	sessionMgr := utils.InitSessionManager()
	req := httptest.NewRequest(method, path, nil)
	ctx, err := sessionMgr.Load(req.Context(), "")
	if err != nil {
		t.Fatalf("cannot load the session: %v", err)
	}
	if role != "" {
		sessionMgr.Put(ctx, "role", role)
	}

	return req.WithContext(ctx)
}

func TestWriteAccessMiddlewareRejectsReadOnlyMutation(t *testing.T) {
	called := false
	handler := WriteAccessMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, requestWithRole(t, "readonly", http.MethodPost, "/v2/DeleteKey"))

	if called {
		t.Fatal("the handler ran for a read-only mutation")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestWriteAccessMiddlewareAllowsReadOnlyRead(t *testing.T) {
	called := false
	handler := WriteAccessMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, requestWithRole(t, "readonly", http.MethodGet, "/buckets"))

	if !called {
		t.Fatal("the handler did not run for a read-only GET")
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", rec.Code)
	}
}

func TestWriteAccessMiddlewareAllowsAdminMutation(t *testing.T) {
	called := false
	handler := WriteAccessMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, requestWithRole(t, "admin", http.MethodPost, "/v2/DeleteKey"))

	if !called {
		t.Fatal("the handler did not run for an admin mutation")
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", rec.Code)
	}
}

func TestWriteAccessMiddlewareAllowsLegacySessionWithoutRole(t *testing.T) {
	called := false
	handler := WriteAccessMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, requestWithRole(t, "", http.MethodPost, "/v2/DeleteKey"))

	if !called {
		t.Fatal("the handler did not run for a session without a role")
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", rec.Code)
	}
}

func TestWriteAccessMiddlewareAllowsReadOnlyPresign(t *testing.T) {
	called := false
	handler := WriteAccessMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, requestWithRole(t, "readonly", http.MethodPost, "/buckets/b1/presign"))

	if !called {
		t.Fatal("the handler did not run for a read-only presign request")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
}
