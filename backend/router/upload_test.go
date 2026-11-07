package router

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"khairul169/garage-webui/utils"

	"github.com/aws/aws-sdk-go-v2/credentials"
)

type fakeUploadS3 struct {
	mu              sync.Mutex
	putCalls        int
	createCalls     int
	uploadPartCalls int
	completeCalls   int
	abortCalls      int
	uploadedBytes   int64
	contentType     string
}

type uploadStats struct {
	putCalls        int
	createCalls     int
	uploadPartCalls int
	completeCalls   int
	abortCalls      int
	uploadedBytes   int64
}

func (f *fakeUploadS3) stats() uploadStats {
	f.mu.Lock()
	defer f.mu.Unlock()

	return uploadStats{
		putCalls:        f.putCalls,
		createCalls:     f.createCalls,
		uploadPartCalls: f.uploadPartCalls,
		completeCalls:   f.completeCalls,
		abortCalls:      f.abortCalls,
		uploadedBytes:   f.uploadedBytes,
	}
}

func (f *fakeUploadS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	switch {
	case r.Method == http.MethodPost && query.Has("uploads"):
		f.mu.Lock()
		f.createCalls++
		f.mu.Unlock()

		w.Header().Set("Content-Type", "application/xml")
		io.WriteString(w, `<InitiateMultipartUploadResult><Bucket>test-bucket</Bucket><Key>object</Key><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>`)

	case r.Method == http.MethodPut && query.Has("uploadId"):
		n, err := io.Copy(io.Discard, r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		f.mu.Lock()
		f.uploadPartCalls++
		f.uploadedBytes += n
		f.mu.Unlock()

		w.Header().Set("ETag", `"etag-`+query.Get("partNumber")+`"`)
		w.WriteHeader(http.StatusOK)

	case r.Method == http.MethodPost && query.Has("uploadId"):
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		f.mu.Lock()
		f.completeCalls++
		f.mu.Unlock()

		w.Header().Set("Content-Type", "application/xml")
		io.WriteString(w, `<CompleteMultipartUploadResult><Location>http://example.com</Location><Bucket>test-bucket</Bucket><Key>object</Key><ETag>"etag"</ETag></CompleteMultipartUploadResult>`)

	case r.Method == http.MethodDelete && query.Has("uploadId"):
		f.mu.Lock()
		f.abortCalls++
		f.mu.Unlock()

		w.WriteHeader(http.StatusNoContent)

	case r.Method == http.MethodPut:
		n, err := io.Copy(io.Discard, r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		f.mu.Lock()
		f.putCalls++
		f.uploadedBytes += n
		f.contentType = r.Header.Get("Content-Type")
		f.mu.Unlock()

		w.Header().Set("ETag", `"etag"`)
		w.WriteHeader(http.StatusOK)

	default:
		http.Error(w, "unexpected request", http.StatusBadRequest)
	}
}

func newUploadS3Server(t *testing.T, fake *fakeUploadS3) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(fake)
	t.Cleanup(server.Close)

	t.Setenv("S3_ENDPOINT_URL", server.URL)
	t.Setenv("S3_REGION", "garage")

	utils.InitCacheManager()
	utils.Cache.Set("key:test-bucket:write", &bucketAccess{
		S3Bucket: "test-bucket",
		Credentials: credentials.NewStaticCredentialsProvider(
			"test-access-key",
			"test-secret-key",
			"",
		),
	}, time.Hour)

	return server
}

func testUploadMux() *http.ServeMux {
	mux := http.NewServeMux()
	browse := &Browse{}
	mux.HandleFunc("PUT /browse/{bucket}/{key...}", browse.PutObject)
	return mux
}

type uploadBody struct {
	*bytes.Buffer
	contentType string
}

func newUploadBody(t *testing.T, filename string, data []byte) *uploadBody {
	t.Helper()

	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("cannot create form file: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("cannot write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("cannot close form writer: %v", err)
	}

	return &uploadBody{Buffer: &buffer, contentType: writer.FormDataContentType()}
}

func TestPutObjectStreamsUploadLargerThan32MiBWithoutTempFiles(t *testing.T) {
	fake := &fakeUploadS3{}
	newUploadS3Server(t, fake)

	// The scratch image has no /tmp. The upload must not use a temporary file.
	t.Setenv("TMPDIR", filepath.Join(t.TempDir(), "missing"))
	t.Setenv("MAX_UPLOAD_SIZE", strconv.Itoa(64<<20))

	const size = 33 << 20
	body := newUploadBody(t, "large.bin", bytes.Repeat([]byte("a"), size))

	req := httptest.NewRequest(http.MethodPut, "/browse/test-bucket/large.bin", body)
	req.Header.Set("Content-Type", body.contentType)
	rec := httptest.NewRecorder()
	testUploadMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	stats := fake.stats()
	if stats.putCalls != 0 {
		t.Errorf("expected no single PUT request, got %d", stats.putCalls)
	}
	if stats.createCalls != 1 {
		t.Errorf("expected 1 multipart create call, got %d", stats.createCalls)
	}
	if stats.completeCalls != 1 {
		t.Errorf("expected 1 multipart complete call, got %d", stats.completeCalls)
	}
	if stats.abortCalls != 0 {
		t.Errorf("expected no multipart abort call, got %d", stats.abortCalls)
	}
	if stats.uploadedBytes != size {
		t.Errorf("expected %d uploaded bytes, got %d", size, stats.uploadedBytes)
	}
}

func TestPutObjectAbortsMultipartUploadWhenSizeLimitIsExceeded(t *testing.T) {
	fake := &fakeUploadS3{}
	newUploadS3Server(t, fake)

	t.Setenv("MAX_UPLOAD_SIZE", strconv.Itoa(6<<20))

	const size = 7 << 20
	body := newUploadBody(t, "large.bin", bytes.Repeat([]byte("b"), size))

	req := httptest.NewRequest(http.MethodPut, "/browse/test-bucket/large.bin", body)
	req.Header.Set("Content-Type", body.contentType)
	rec := httptest.NewRecorder()
	testUploadMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected status 413, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "limit") {
		t.Errorf("expected a size limit message, got %q", rec.Body.String())
	}

	stats := fake.stats()
	if stats.createCalls != 1 {
		t.Errorf("expected 1 multipart create call, got %d", stats.createCalls)
	}
	if stats.abortCalls != 1 {
		t.Errorf("expected 1 multipart abort call, got %d", stats.abortCalls)
	}
	if stats.completeCalls != 0 {
		t.Errorf("expected no multipart complete call, got %d", stats.completeCalls)
	}
	if stats.uploadedBytes != 5<<20 {
		t.Errorf("expected the first 5 MiB part, got %d uploaded bytes", stats.uploadedBytes)
	}
}

func TestPutObjectUploadsSmallFileInOneRequest(t *testing.T) {
	fake := &fakeUploadS3{}
	newUploadS3Server(t, fake)

	body := newUploadBody(t, "small.txt", []byte("hello"))

	req := httptest.NewRequest(http.MethodPut, "/browse/test-bucket/small.txt", body)
	req.Header.Set("Content-Type", body.contentType)
	rec := httptest.NewRecorder()
	testUploadMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	stats := fake.stats()
	if stats.putCalls != 1 {
		t.Errorf("expected 1 single PUT request, got %d", stats.putCalls)
	}
	if stats.createCalls != 0 {
		t.Errorf("expected no multipart create call, got %d", stats.createCalls)
	}
	if stats.uploadedBytes != 5 {
		t.Errorf("expected 5 uploaded bytes, got %d", stats.uploadedBytes)
	}
}

func TestPutObjectCreatesEmptyDirectoryMarker(t *testing.T) {
	fake := &fakeUploadS3{}
	newUploadS3Server(t, fake)

	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	if err := writer.Close(); err != nil {
		t.Fatalf("cannot close form writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPut, "/browse/test-bucket/new-dir/", &buffer)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	testUploadMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	stats := fake.stats()
	if stats.putCalls != 1 {
		t.Errorf("expected 1 single PUT request, got %d", stats.putCalls)
	}
	if stats.uploadedBytes != 0 {
		t.Errorf("expected 0 uploaded bytes, got %d", stats.uploadedBytes)
	}
}
