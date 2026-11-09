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

type fakeCorsS3 struct {
	putBody string
	deleted bool
}

func (f *fakeCorsS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	switch {
	case r.Method == http.MethodGet && query.Has("cors"):
		w.Header().Set("Content-Type", "application/xml")
		io.WriteString(w, `<CORSConfiguration><CORSRule><AllowedOrigin>https://example.com</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedHeader>*</AllowedHeader><MaxAgeSeconds>300</MaxAgeSeconds></CORSRule></CORSConfiguration>`)
	case r.Method == http.MethodPut && query.Has("cors"):
		body, _ := io.ReadAll(r.Body)
		f.putBody = string(body)
		w.WriteHeader(http.StatusOK)
	case r.Method == http.MethodDelete && query.Has("cors"):
		f.deleted = true
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func newCorsTestMux(t *testing.T, fake *fakeCorsS3) *http.ServeMux {
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
	cors := &BucketCORS{}
	mux.HandleFunc("GET /buckets/{bucket}/cors", cors.Get)
	mux.HandleFunc("PUT /buckets/{bucket}/cors", cors.Put)
	mux.HandleFunc("DELETE /buckets/{bucket}/cors", cors.Delete)

	return mux
}

func TestGetBucketCORSReturnsRules(t *testing.T) {
	mux := newCorsTestMux(t, &fakeCorsS3{})

	req := httptest.NewRequest(http.MethodGet, "/buckets/test-bucket/cors", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		`"allowedOrigins":["https://example.com"]`,
		`"allowedMethods":["GET"]`,
		`"maxAgeSeconds":300`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("response does not hold %q: %s", want, body)
		}
	}
}

func TestPutBucketCORSWritesRules(t *testing.T) {
	fake := &fakeCorsS3{}
	mux := newCorsTestMux(t, fake)

	body := `{"rules":[{"allowedOrigins":["https://example.com"],"allowedMethods":["GET"],"allowedHeaders":["*"]}]}`
	req := httptest.NewRequest(http.MethodPut, "/buckets/test-bucket/cors", strings.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(fake.putBody, "<CORSRule>") {
		t.Fatalf("the S3 request does not hold a CORS rule: %s", fake.putBody)
	}
}

func TestDeleteBucketCORSRemovesRules(t *testing.T) {
	fake := &fakeCorsS3{}
	mux := newCorsTestMux(t, fake)

	req := httptest.NewRequest(http.MethodDelete, "/buckets/test-bucket/cors", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !fake.deleted {
		t.Fatal("the S3 request did not delete the CORS rules")
	}
}
