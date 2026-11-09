package middleware

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"khairul169/garage-webui/utils"
)

func TestAuditMiddlewareLogsStateChanges(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "alice:test-hash")
	t.Setenv("AUTH_DISABLED", "")
	sessionMgr := utils.InitSessionManager()

	var output bytes.Buffer
	previous := log.Writer()
	log.SetOutput(&output)
	t.Cleanup(func() { log.SetOutput(previous) })

	handler := sessionMgr.LoadAndSave(AuditMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/v2/DeleteKey", nil))

	line := strings.TrimSpace(output.String())
	start := strings.Index(line, "{")
	if start < 0 {
		t.Fatalf("expected a JSON audit line, got %q", line)
	}

	var event struct {
		User   string `json:"user"`
		Method string `json:"method"`
		Path   string `json:"path"`
		Status int    `json:"status"`
		Time   string `json:"time"`
	}
	if err := json.Unmarshal([]byte(line[start:]), &event); err != nil {
		t.Fatalf("cannot decode the audit line: %v", err)
	}

	if event.User != "alice" {
		t.Errorf("expected user alice, got %q", event.User)
	}
	if event.Method != http.MethodPost {
		t.Errorf("expected method POST, got %q", event.Method)
	}
	if event.Path != "/v2/DeleteKey" {
		t.Errorf("expected path /v2/DeleteKey, got %q", event.Path)
	}
	if event.Status != http.StatusNoContent {
		t.Errorf("expected status 204, got %d", event.Status)
	}
	if event.Time == "" {
		t.Error("expected a timestamp")
	}
}

func TestAuditMiddlewareUsesSessionUsername(t *testing.T) {
	t.Setenv("AUTH_USER_PASS", "admin:test-hash")
	t.Setenv("AUTH_DISABLED", "")

	var output bytes.Buffer
	previous := log.Writer()
	log.SetOutput(&output)
	t.Cleanup(func() { log.SetOutput(previous) })

	sessionMgr := utils.InitSessionManager()
	req := httptest.NewRequest(http.MethodPost, "/v2/DeleteKey", nil)
	ctx, err := sessionMgr.Load(req.Context(), "")
	if err != nil {
		t.Fatalf("cannot load the session: %v", err)
	}
	sessionMgr.Put(ctx, "username", "viewer")
	req = req.WithContext(ctx)

	handler := AuditMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	line := strings.TrimSpace(output.String())
	start := strings.Index(line, "{")
	if start < 0 {
		t.Fatalf("expected a JSON audit line, got %q", line)
	}
	if !strings.Contains(line[start:], `"user":"viewer"`) {
		t.Fatalf("expected the session username in the audit line, got %s", line[start:])
	}
}
