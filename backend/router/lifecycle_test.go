package router

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"khairul169/garage-webui/utils"

	"github.com/aws/aws-sdk-go-v2/credentials"
)

type fakeLifecycleS3 struct {
	putBody string
	deleted bool
}

func (f *fakeLifecycleS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	switch {
	case r.Method == http.MethodGet && query.Has("lifecycle"):
		w.Header().Set("Content-Type", "application/xml")
		io.WriteString(w, `<LifecycleConfiguration><Rule><ID>rule-1</ID><Status>Enabled</Status><Filter><Prefix>logs/</Prefix></Filter><Expiration><Days>30</Days></Expiration></Rule></LifecycleConfiguration>`)
	case r.Method == http.MethodPut && query.Has("lifecycle"):
		body, _ := io.ReadAll(r.Body)
		f.putBody = string(body)
		w.WriteHeader(http.StatusOK)
	case r.Method == http.MethodDelete && query.Has("lifecycle"):
		f.deleted = true
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func newLifecycleTestMux(t *testing.T, fake *fakeLifecycleS3) *http.ServeMux {
	t.Helper()

	server := httptest.NewServer(fake)
	t.Cleanup(server.Close)

	t.Setenv("S3_ENDPOINT_URL", server.URL)
	t.Setenv("S3_REGION", "garage")

	utils.InitCacheManager()
	utils.Cache.Set("key:test-bucket:read", &bucketAccess{
		S3Bucket: "test-bucket",
		Credentials: credentials.NewStaticCredentialsProvider(
			"test-access-key",
			"test-secret-key",
			"",
		),
	}, time.Hour)
	utils.Cache.Set("key:test-bucket:write", &bucketAccess{
		S3Bucket: "test-bucket",
		Credentials: credentials.NewStaticCredentialsProvider(
			"test-access-key",
			"test-secret-key",
			"",
		),
	}, time.Hour)

	mux := http.NewServeMux()
	lifecycle := &BucketLifecycle{}
	mux.HandleFunc("GET /buckets/{bucket}/lifecycle", lifecycle.Get)
	mux.HandleFunc("PUT /buckets/{bucket}/lifecycle", lifecycle.Put)
	mux.HandleFunc("DELETE /buckets/{bucket}/lifecycle", lifecycle.Delete)

	return mux
}

func TestGetBucketLifecycleReturnsRules(t *testing.T) {
	mux := newLifecycleTestMux(t, &fakeLifecycleS3{})

	req := httptest.NewRequest(http.MethodGet, "/buckets/test-bucket/lifecycle", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		`"id":"rule-1"`,
		`"status":"Enabled"`,
		`"prefix":"logs/"`,
		`"days":30`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("response does not hold %q: %s", want, body)
		}
	}
}

func TestPutBucketLifecycleWritesRules(t *testing.T) {
	fake := &fakeLifecycleS3{}
	mux := newLifecycleTestMux(t, fake)

	body := `{"rules":[{"status":"Enabled","filter":{"prefix":"logs/"},"expiration":{"days":30}}]}`
	req := httptest.NewRequest(http.MethodPut, "/buckets/test-bucket/lifecycle", strings.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	for _, want := range []string{"<LifecycleConfiguration", "<Days>30</Days>"} {
		if !strings.Contains(fake.putBody, want) {
			t.Errorf("the S3 request does not hold %q: %s", want, fake.putBody)
		}
	}
}

func TestDeleteBucketLifecycleRemovesRules(t *testing.T) {
	fake := &fakeLifecycleS3{}
	mux := newLifecycleTestMux(t, fake)

	req := httptest.NewRequest(http.MethodDelete, "/buckets/test-bucket/lifecycle", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !fake.deleted {
		t.Fatal("the S3 request did not delete the lifecycle rules")
	}
}

func TestPutBucketLifecycleRejectsRuleWithoutAction(t *testing.T) {
	mux := newLifecycleTestMux(t, &fakeLifecycleS3{})

	body := `{"rules":[{"status":"Enabled","filter":{"prefix":"logs/"}}]}`
	req := httptest.NewRequest(http.MethodPut, "/buckets/test-bucket/lifecycle", strings.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for a rule without an action, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPutBucketLifecycleRejectsNonPositiveDays(t *testing.T) {
	mux := newLifecycleTestMux(t, &fakeLifecycleS3{})

	for _, body := range []string{
		`{"rules":[{"status":"Enabled","expiration":{"days":0}}]}`,
		`{"rules":[{"status":"Enabled","abortIncompleteMultipartUpload":{"daysAfterInitiation":0}}]}`,
	} {
		req := httptest.NewRequest(http.MethodPut, "/buckets/test-bucket/lifecycle", strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected status 400 for %s, got %d: %s", body, rec.Code, rec.Body.String())
		}
	}
}
