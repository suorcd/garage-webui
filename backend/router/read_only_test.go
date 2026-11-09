package router

import (
	"encoding/json"
	"encoding/xml"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
)

type fakeCapabilityGarage struct {
	keys []schema.KeyElement
}

func (f *fakeCapabilityGarage) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/v2/GetBucketInfo":
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(schema.Bucket{
			ID:            "bucket-1",
			GlobalAliases: []string{"test-bucket"},
			Keys:          f.keys,
		})

	case "/v2/GetKeyInfo":
		id := r.URL.Query().Get("id")
		for _, key := range f.keys {
			if key.AccessKeyID == id {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(schema.KeySecret{
					AccessKeyID:     id,
					SecretAccessKey: "secret-" + id,
				})
				return
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"message":"key not found"}`))

	default:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"message":"not found"}`))
	}
}

type fakeCapabilityS3 struct {
	mu          sync.Mutex
	credentials []string
}

func (f *fakeCapabilityS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	credential := credentialFromAuthorization(r.Header.Get("Authorization"))

	f.mu.Lock()
	f.credentials = append(f.credentials, credential)
	f.mu.Unlock()

	switch {
	case r.Method == http.MethodGet && r.URL.Query().Get("list-type") == "2":
		w.Header().Set("Content-Type", "application/xml")
		xml.NewEncoder(w).Encode(listBucketResult{Name: "test-bucket"})

	case r.Method == http.MethodPut:
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("ETag", `"etag"`)
		w.WriteHeader(http.StatusOK)

	default:
		http.Error(w, "unexpected request", http.StatusBadRequest)
	}
}

func (f *fakeCapabilityS3) recordedCredentials() []string {
	f.mu.Lock()
	defer f.mu.Unlock()

	return append([]string(nil), f.credentials...)
}

func newCapabilityTestHandler(t *testing.T, garage *fakeCapabilityGarage, s3 *fakeCapabilityS3) http.Handler {
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

func TestBrowseBucketWithReadOnlyKey(t *testing.T) {
	garage := &fakeCapabilityGarage{keys: []schema.KeyElement{
		{
			AccessKeyID: "key-read",
			Permissions: schema.Permissions{Read: true},
		},
	}}
	s3 := &fakeCapabilityS3{}
	handler := newCapabilityTestHandler(t, garage, s3)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	credentials := s3.recordedCredentials()
	if len(credentials) != 1 || credentials[0] != "key-read" {
		t.Errorf("expected the read key, got %v", credentials)
	}
}

func TestBrowseBucketWithNoKeysReturnsClearError(t *testing.T) {
	garage := &fakeCapabilityGarage{}
	handler := newCapabilityTestHandler(t, garage, &fakeCapabilityS3{})

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "no key with read access") {
		t.Errorf("expected a read access message, got %q", rec.Body.String())
	}
}

func TestUploadUsesWriteKeyWhenReadKeyIsReadOnly(t *testing.T) {
	garage := &fakeCapabilityGarage{keys: []schema.KeyElement{
		{
			AccessKeyID: "key-read",
			Permissions: schema.Permissions{Read: true},
		},
		{
			AccessKeyID: "key-write",
			Permissions: schema.Permissions{Write: true},
		},
	}}
	s3 := &fakeCapabilityS3{}
	handler := newCapabilityTestHandler(t, garage, s3)

	browseReq := httptest.NewRequest(http.MethodGet, "/browse/test-bucket", nil)
	browseRec := httptest.NewRecorder()
	handler.ServeHTTP(browseRec, browseReq)

	if browseRec.Code != http.StatusOK {
		t.Fatalf("expected browse status 200, got %d: %s", browseRec.Code, browseRec.Body.String())
	}

	body := newUploadBody(t, "file.txt", []byte("hello"))
	uploadReq := httptest.NewRequest(http.MethodPut, "/browse/test-bucket/file.txt", body)
	uploadReq.Header.Set("Content-Type", body.contentType)
	uploadReq.Header.Set("X-Requested-With", "XMLHttpRequest")
	uploadRec := httptest.NewRecorder()
	handler.ServeHTTP(uploadRec, uploadReq)

	if uploadRec.Code != http.StatusOK {
		t.Fatalf("expected upload status 200, got %d: %s", uploadRec.Code, uploadRec.Body.String())
	}

	credentials := s3.recordedCredentials()
	if len(credentials) != 2 {
		t.Fatalf("expected 2 S3 requests, got %d: %v", len(credentials), credentials)
	}
	if credentials[0] != "key-read" {
		t.Errorf("expected browse to use key-read, got %q", credentials[0])
	}
	if credentials[1] != "key-write" {
		t.Errorf("expected upload to use key-write, got %q", credentials[1])
	}
}

func TestUploadWithReadOnlyKeyReturnsClearError(t *testing.T) {
	garage := &fakeCapabilityGarage{keys: []schema.KeyElement{
		{
			AccessKeyID: "key-read",
			Permissions: schema.Permissions{Read: true},
		},
	}}
	handler := newCapabilityTestHandler(t, garage, &fakeCapabilityS3{})

	body := newUploadBody(t, "file.txt", []byte("hello"))
	req := httptest.NewRequest(http.MethodPut, "/browse/test-bucket/file.txt", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "no key with write or owner access") {
		t.Errorf("expected a write access message, got %q", rec.Body.String())
	}
}
