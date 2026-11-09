package router

import (
	"encoding/json"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
)

type aliasTestBucket struct {
	ID          string
	GlobalAlias string
	KeyID       string
	LocalAlias  string
}

type fakeAliasGarage struct {
	buckets []aliasTestBucket
}

func (f *fakeAliasGarage) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	switch r.URL.Path {
	case "/v2/GetBucketInfo":
		for _, bucket := range f.buckets {
			if query.Get("id") == bucket.ID ||
				(bucket.GlobalAlias != "" && query.Get("globalAlias") == bucket.GlobalAlias) {
				f.writeBucket(w, bucket)
				return
			}
		}

		writeAliasError(w, http.StatusNotFound, "bucket not found")

	case "/v2/ListBuckets":
		result := make([]schema.GetBucketsRes, 0, len(f.buckets))
		for _, bucket := range f.buckets {
			globalAliases := []string{}
			if bucket.GlobalAlias != "" {
				globalAliases = append(globalAliases, bucket.GlobalAlias)
			}

			result = append(result, schema.GetBucketsRes{
				ID:            bucket.ID,
				GlobalAliases: globalAliases,
				LocalAliases: []schema.LocalAlias{
					{AccessKeyID: bucket.KeyID, Alias: bucket.LocalAlias},
				},
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

	case "/v2/GetKeyInfo":
		id := query.Get("id")
		for _, bucket := range f.buckets {
			if bucket.KeyID == id {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(schema.KeySecret{
					AccessKeyID:     id,
					SecretAccessKey: "secret-" + id,
				})
				return
			}
		}

		writeAliasError(w, http.StatusNotFound, "key not found")

	default:
		writeAliasError(w, http.StatusNotFound, "not found")
	}
}

func (f *fakeAliasGarage) writeBucket(w http.ResponseWriter, bucket aliasTestBucket) {
	globalAliases := []string{}
	if bucket.GlobalAlias != "" {
		globalAliases = append(globalAliases, bucket.GlobalAlias)
	}

	key := schema.KeyElement{
		AccessKeyID: bucket.KeyID,
		Name:        bucket.KeyID,
		Permissions: schema.Permissions{Read: true, Write: true},
	}
	if bucket.LocalAlias != "" {
		key.BucketLocalAliases = []string{bucket.LocalAlias}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(schema.Bucket{
		ID:            bucket.ID,
		GlobalAliases: globalAliases,
		Keys:          []schema.KeyElement{key},
	})
}

func writeAliasError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"message": message})
}

type fakeAliasS3 struct {
	mu      sync.Mutex
	buckets []string
}

func (f *fakeAliasS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	bucket := strings.TrimPrefix(r.URL.Path, "/")
	if index := strings.Index(bucket, "/"); index >= 0 {
		bucket = bucket[:index]
	}

	f.mu.Lock()
	f.buckets = append(f.buckets, bucket)
	f.mu.Unlock()

	w.Header().Set("Content-Type", "application/xml")
	xml.NewEncoder(w).Encode(listBucketResult{Name: bucket})
}

func (f *fakeAliasS3) recordedBuckets() []string {
	f.mu.Lock()
	defer f.mu.Unlock()

	return append([]string(nil), f.buckets...)
}

func newAliasTestHandler(t *testing.T, garage *fakeAliasGarage, s3 *fakeAliasS3) http.Handler {
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

func testAliasGarage() *fakeAliasGarage {
	return &fakeAliasGarage{buckets: []aliasTestBucket{
		{ID: "bucket-a", GlobalAlias: "global-a", KeyID: "key-a", LocalAlias: "local-a"},
		{ID: "bucket-b", KeyID: "key-b", LocalAlias: "local-b"},
	}}
}

func TestBrowseBucketIdentifiersResolveS3Name(t *testing.T) {
	cases := []struct {
		name       string
		identifier string
		s3Bucket   string
	}{
		{name: "global alias", identifier: "global-a", s3Bucket: "global-a"},
		{name: "bucket ID with global alias", identifier: "bucket-a", s3Bucket: "global-a"},
		{name: "local alias", identifier: "local-b", s3Bucket: "local-b"},
		{name: "bucket ID with local alias", identifier: "bucket-b", s3Bucket: "local-b"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			garage := testAliasGarage()
			s3 := &fakeAliasS3{}
			handler := newAliasTestHandler(t, garage, s3)

			req := httptest.NewRequest(http.MethodGet, "/browse/"+testCase.identifier, nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
			}

			buckets := s3.recordedBuckets()
			if len(buckets) != 1 {
				t.Fatalf("expected 1 S3 request, got %d", len(buckets))
			}
			if buckets[0] != testCase.s3Bucket {
				t.Errorf("expected S3 bucket %q, got %q", testCase.s3Bucket, buckets[0])
			}
		})
	}
}

func TestBrowseResponseReportsS3Bucket(t *testing.T) {
	garage := testAliasGarage()
	s3 := &fakeAliasS3{}
	handler := newAliasTestHandler(t, garage, s3)

	req := httptest.NewRequest(http.MethodGet, "/browse/global-a", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}
	if response["s3Bucket"] != "global-a" {
		t.Errorf("expected s3Bucket global-a, got %v", response["s3Bucket"])
	}
}
