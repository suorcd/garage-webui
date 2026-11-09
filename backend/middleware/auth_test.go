package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"khairul169/garage-webui/utils"
)

func TestAuthMiddlewareRejectsNonBoolSessionValue(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "user:hash")
	t.Setenv("AUTH_DISABLED", "")

	sessionMgr := utils.InitSessionManager()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx, err := sessionMgr.Load(req.Context(), "")
	if err != nil {
		t.Fatalf("cannot load the session: %v", err)
	}
	sessionMgr.Put(ctx, "authenticated", "yes")
	req = req.WithContext(ctx)

	called := false
	handler := AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if called {
		t.Fatal("the handler ran for a non-bool session value")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}
}
