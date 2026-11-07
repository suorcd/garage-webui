package router

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"khairul169/garage-webui/utils"
)

type fakeAllowKeyGarage struct {
	mu    sync.Mutex
	calls int
	path  string
	body  []byte
}

func (f *fakeAllowKeyGarage) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)

	f.mu.Lock()
	f.calls++
	f.path = r.URL.Path
	f.body = body
	f.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"id":"bucket-1"}`))
}

func newAllowKeyTestHandler(t *testing.T, garage *fakeAllowKeyGarage) http.Handler {
	t.Helper()

	server := httptest.NewServer(garage)
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")
	t.Setenv("AUTH_DISABLED", "true")
	t.Setenv("AUTH_USER_PASS", "")

	utils.InitCacheManager()
	sessionMgr := utils.InitSessionManager()
	return sessionMgr.LoadAndSave(HandleApiRouter())
}

func allowKeyRequest(t *testing.T, handler http.Handler, body string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/v2/AllowBucketKey", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	return rec
}

func TestAllowBucketKeyRejectsEmptyPayload(t *testing.T) {
	garage := &fakeAllowKeyGarage{}
	handler := newAllowKeyTestHandler(t, garage)

	rec := allowKeyRequest(t, handler, `{}`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", rec.Code, rec.Body.String())
	}

	garage.mu.Lock()
	calls := garage.calls
	garage.mu.Unlock()

	if calls != 0 {
		t.Errorf("expected no upstream request, got %d", calls)
	}
}

func TestAllowBucketKeyRejectsEmptyPermissions(t *testing.T) {
	garage := &fakeAllowKeyGarage{}
	handler := newAllowKeyTestHandler(t, garage)

	rec := allowKeyRequest(t, handler, `{"bucketId":"bucket-1","accessKeyId":"key-1","permissions":{"read":false,"write":false,"owner":false}}`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", rec.Code, rec.Body.String())
	}

	garage.mu.Lock()
	calls := garage.calls
	garage.mu.Unlock()

	if calls != 0 {
		t.Errorf("expected no upstream request, got %d", calls)
	}
}

func TestAllowBucketKeyForwardsValidPayload(t *testing.T) {
	garage := &fakeAllowKeyGarage{}
	handler := newAllowKeyTestHandler(t, garage)

	rec := allowKeyRequest(t, handler, `{"bucketId":"bucket-1","accessKeyId":"key-1","permissions":{"read":true,"write":false,"owner":false}}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	garage.mu.Lock()
	calls := garage.calls
	path := garage.path
	body := garage.body
	garage.mu.Unlock()

	if calls != 1 {
		t.Fatalf("expected 1 upstream request, got %d", calls)
	}
	if path != "/v2/AllowBucketKey" {
		t.Errorf("expected upstream path /v2/AllowBucketKey, got %q", path)
	}

	var request struct {
		BucketID    string `json:"bucketId"`
		AccessKeyID string `json:"accessKeyId"`
		Permissions struct {
			Read  bool `json:"read"`
			Write bool `json:"write"`
			Owner bool `json:"owner"`
		} `json:"permissions"`
	}
	if err := json.Unmarshal(body, &request); err != nil {
		t.Fatalf("cannot decode upstream body: %v", err)
	}
	if request.BucketID != "bucket-1" || request.AccessKeyID != "key-1" {
		t.Errorf("unexpected upstream body: %s", body)
	}
	if !request.Permissions.Read || request.Permissions.Write || request.Permissions.Owner {
		t.Errorf("unexpected upstream permissions: %s", body)
	}
}
