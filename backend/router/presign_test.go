package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"khairul169/garage-webui/utils"

	"github.com/aws/aws-sdk-go-v2/credentials"
)

func newPresignTestMux(t *testing.T) *http.ServeMux {
	t.Helper()

	t.Setenv("S3_ENDPOINT_URL", "http://127.0.0.1:3900")
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

	mux := http.NewServeMux()
	presign := &BucketPresign{}
	mux.HandleFunc("POST /buckets/{bucket}/presign", presign.Post)

	return mux
}

func TestPresignBucketObjectReturnsURL(t *testing.T) {
	mux := newPresignTestMux(t)

	body := `{"key":"photos/a.txt","expiresSeconds":3600}`
	req := httptest.NewRequest(http.MethodPost, "/buckets/test-bucket/presign", strings.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	response := rec.Body.String()
	for _, want := range []string{"X-Amz-Expires=3600", "photos/a.txt"} {
		if !strings.Contains(response, want) {
			t.Errorf("response does not hold %q: %s", want, response)
		}
	}
}

func TestPresignBucketObjectRejectsInvalidExpiry(t *testing.T) {
	mux := newPresignTestMux(t)

	for _, body := range []string{
		`{"key":"photos/a.txt","expiresSeconds":0}`,
		`{"key":"photos/a.txt","expiresSeconds":604801}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/buckets/test-bucket/presign", strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected status 400 for %s, got %d", body, rec.Code)
		}
	}
}
