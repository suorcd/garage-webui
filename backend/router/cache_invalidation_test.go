package router

import (
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"khairul169/garage-webui/utils"
)

type fakeCacheGarage struct {
	mu         sync.Mutex
	currentKey string
	calls      []string
}

func (f *fakeCacheGarage) setKey(key string) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.currentKey = key
}

func (f *fakeCacheGarage) record(path string) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.calls = append(f.calls, path)
}

func (f *fakeCacheGarage) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/v2/GetBucketInfo":
		f.mu.Lock()
		key := f.currentKey
		f.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"id":"bucket-1","globalAliases":["test-bucket"],"keys":[{"accessKeyId":%q,"name":%q,"permissions":{"read":true,"write":true,"owner":false},"bucketLocalAliases":[]}]}`, key, key)

	case "/v2/GetKeyInfo":
		id := r.URL.Query().Get("id")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"accessKeyId":%q,"secretAccessKey":%q}`, id, "secret-"+id)

	default:
		f.record(r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	}
}

type fakeCacheS3 struct {
	mu          sync.Mutex
	credentials []string
}

func (f *fakeCacheS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	credential := credentialFromAuthorization(r.Header.Get("Authorization"))

	f.mu.Lock()
	f.credentials = append(f.credentials, credential)
	f.mu.Unlock()

	w.Header().Set("Content-Type", "application/xml")
	xml.NewEncoder(w).Encode(listBucketResult{Name: "test-bucket"})
}

func credentialFromAuthorization(header string) string {
	const marker = "Credential="
	index := strings.Index(header, marker)
	if index < 0 {
		return ""
	}

	rest := header[index+len(marker):]
	if end := strings.Index(rest, "/"); end >= 0 {
		return rest[:end]
	}

	return rest
}

func newCacheTestHandler(t *testing.T, garage *fakeCacheGarage, s3 *fakeCacheS3) http.Handler {
	t.Helper()

	garageServer := httptest.NewServer(garage)
	t.Cleanup(garageServer.Close)

	s3Server := httptest.NewServer(s3)
	t.Cleanup(s3Server.Close)

	t.Setenv("API_BASE_URL", garageServer.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")
	t.Setenv("S3_ENDPOINT_URL", s3Server.URL)
	t.Setenv("S3_REGION", "garage")
	t.Setenv("AUTH_DISABLED", "true")
	t.Setenv("AUTH_USER_PASS", "")

	utils.InitCacheManager()
	sessionMgr := utils.InitSessionManager()

	return sessionMgr.LoadAndSave(HandleApiRouter())
}

func TestKeyMutationsClearCredentialCache(t *testing.T) {
	cases := []struct {
		name string
		path string
		body string
	}{
		{
			name: "allow",
			path: "/v2/AllowBucketKey",
			body: `{"bucketId":"bucket-1","accessKeyId":"key-a","permissions":{"read":true,"write":false,"owner":false}}`,
		},
		{
			name: "deny",
			path: "/v2/DenyBucketKey",
			body: `{"bucketId":"bucket-1","accessKeyId":"key-a","permissions":{"read":true,"write":false,"owner":false}}`,
		},
		{
			name: "delete",
			path: "/v2/DeleteKey?id=key-a",
		},
		{
			name: "update",
			path: "/v2/UpdateKey?id=key-a",
			body: `{}`,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			handler := newCacheTestHandler(t, &fakeCacheGarage{currentKey: "key-a"}, &fakeCacheS3{})

			utils.Cache.Set("key:test-bucket", "cached", time.Hour)
			utils.Cache.Set("other", "keep", time.Hour)

			var body io.Reader
			if testCase.body != "" {
				body = strings.NewReader(testCase.body)
			}

			req := httptest.NewRequest(http.MethodPost, testCase.path, body)
			req.Header.Set("X-Requested-With", "XMLHttpRequest")
			if testCase.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}

			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
			}
			if utils.Cache.Get("key:test-bucket") != nil {
				t.Error("expected the credential cache entry to be removed")
			}
			if utils.Cache.Get("other") == nil {
				t.Error("expected an unrelated cache entry to remain")
			}
		})
	}
}

func TestDenyBucketKeyRefreshesBrowsedCredentials(t *testing.T) {
	garage := &fakeCacheGarage{currentKey: "key-a"}
	s3 := &fakeCacheS3{}
	handler := newCacheTestHandler(t, garage, s3)

	browse := func() {
		t.Helper()

		req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}
	}

	browse()

	req := httptest.NewRequest(http.MethodPost, "/v2/DenyBucketKey", strings.NewReader(`{"bucketId":"bucket-1","accessKeyId":"key-a","permissions":{"read":true,"write":false,"owner":false}}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 from DenyBucketKey, got %d: %s", rec.Code, rec.Body.String())
	}

	garage.setKey("key-b")
	browse()

	s3.mu.Lock()
	credentials := append([]string(nil), s3.credentials...)
	s3.mu.Unlock()

	if len(credentials) != 2 {
		t.Fatalf("expected 2 browse requests, got %d", len(credentials))
	}
	if credentials[0] != "key-a" {
		t.Errorf("expected the first browse to use key-a, got %q", credentials[0])
	}
	if credentials[1] != "key-b" {
		t.Errorf("expected the second browse to use key-b, got %q", credentials[1])
	}
}
