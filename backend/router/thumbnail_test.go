package router

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"khairul169/garage-webui/utils"

	"github.com/aws/aws-sdk-go-v2/credentials"
)

type fakeThumbnailS3 struct {
	mu          sync.Mutex
	data        []byte
	contentType string
	headSize    int64
	headCalls   int
	getCalls    int
}

func (f *fakeThumbnailS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodHead:
		f.mu.Lock()
		f.headCalls++
		size := f.headSize
		if size == 0 {
			size = int64(len(f.data))
		}
		contentType := f.contentType
		f.mu.Unlock()

		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
		w.Header().Set("ETag", `"etag-1"`)
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(http.StatusOK)

	case http.MethodGet:
		f.mu.Lock()
		f.getCalls++
		data := append([]byte(nil), f.data...)
		contentType := f.contentType
		f.mu.Unlock()

		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		w.Header().Set("ETag", `"etag-1"`)
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(http.StatusOK)
		w.Write(data)

	default:
		http.Error(w, "unexpected request", http.StatusBadRequest)
	}
}

func (f *fakeThumbnailS3) calls() (headCalls, getCalls int) {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.headCalls, f.getCalls
}

func newThumbnailTestHandler(t *testing.T, fake *fakeThumbnailS3) http.Handler {
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

	mux := http.NewServeMux()
	browse := &Browse{}
	mux.HandleFunc("GET /browse/{bucket}/{key...}", browse.GetOneObject)

	return mux
}

func testThumbnailPNG(t *testing.T) []byte {
	t.Helper()

	const size = 200
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			img.Set(x, y, color.RGBA{uint8(x), uint8(y), uint8(x ^ y), 255})
		}
	}

	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatalf("cannot encode test image: %v", err)
	}
	if buffer.Len() <= 1024 {
		t.Fatalf("test image is too small: %d bytes", buffer.Len())
	}

	return buffer.Bytes()
}

func thumbnailRequest(handler http.Handler) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket/image.png?thumb=1", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestThumbnailSkipsLargeObjectWithoutReading(t *testing.T) {
	fake := &fakeThumbnailS3{
		data:        []byte("not an image"),
		contentType: "image/png",
		headSize:    200 << 20,
	}
	handler := newThumbnailTestHandler(t, fake)

	rec := thumbnailRequest(handler)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "image/svg+xml" {
		t.Errorf("expected the placeholder content type, got %q", rec.Header().Get("Content-Type"))
	}
	if !strings.Contains(rec.Body.String(), "<svg") {
		t.Errorf("expected the placeholder body, got %q", rec.Body.String())
	}

	headCalls, getCalls := fake.calls()
	if headCalls != 1 {
		t.Errorf("expected 1 head request, got %d", headCalls)
	}
	if getCalls != 0 {
		t.Errorf("expected no get request, got %d", getCalls)
	}
}

func TestThumbnailSkipsObjectOverSizeLimit(t *testing.T) {
	t.Setenv("MAX_THUMBNAIL_SIZE", "1024")

	fake := &fakeThumbnailS3{
		data:        testThumbnailPNG(t),
		contentType: "image/png",
	}
	handler := newThumbnailTestHandler(t, fake)

	rec := thumbnailRequest(handler)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "image/svg+xml" {
		t.Errorf("expected the placeholder content type, got %q", rec.Header().Get("Content-Type"))
	}

	headCalls, getCalls := fake.calls()
	if headCalls != 1 {
		t.Errorf("expected 1 head request, got %d", headCalls)
	}
	if getCalls != 0 {
		t.Errorf("expected no get request, got %d", getCalls)
	}
}

func TestThumbnailCachesGeneratedImage(t *testing.T) {
	fake := &fakeThumbnailS3{
		data:        testThumbnailPNG(t),
		contentType: "image/png",
	}
	handler := newThumbnailTestHandler(t, fake)

	first := thumbnailRequest(handler)
	if first.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", first.Code, first.Body.String())
	}
	if first.Header().Get("Content-Type") != "image/jpeg" {
		t.Errorf("expected image/jpeg, got %q", first.Header().Get("Content-Type"))
	}

	second := thumbnailRequest(handler)
	if second.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", second.Code, second.Body.String())
	}
	if !bytes.Equal(first.Body.Bytes(), second.Body.Bytes()) {
		t.Error("expected the cached thumbnail on the second request")
	}

	headCalls, getCalls := fake.calls()
	if headCalls != 2 {
		t.Errorf("expected 2 head requests, got %d", headCalls)
	}
	if getCalls != 1 {
		t.Errorf("expected 1 get request, got %d", getCalls)
	}
}

func TestThumbnailReturnsPlaceholderForUnsupportedImage(t *testing.T) {
	fake := &fakeThumbnailS3{
		data:        []byte("not an image"),
		contentType: "image/png",
	}
	handler := newThumbnailTestHandler(t, fake)

	rec := thumbnailRequest(handler)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "image/svg+xml" {
		t.Errorf("expected the placeholder content type, got %q", rec.Header().Get("Content-Type"))
	}

	_, getCalls := fake.calls()
	if getCalls != 1 {
		t.Errorf("expected 1 get request, got %d", getCalls)
	}
}

func TestThumbnailGeneratesImage(t *testing.T) {
	fake := &fakeThumbnailS3{
		data:        testThumbnailPNG(t),
		contentType: "image/png",
	}
	handler := newThumbnailTestHandler(t, fake)

	rec := thumbnailRequest(handler)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "image/jpeg" {
		t.Errorf("expected image/jpeg, got %q", rec.Header().Get("Content-Type"))
	}

	config, err := jpeg.DecodeConfig(bytes.NewReader(rec.Body.Bytes()))
	if err != nil {
		t.Fatalf("cannot decode thumbnail: %v", err)
	}
	if config.Width != 64 || config.Height != 64 {
		t.Errorf("expected a 64x64 thumbnail, got %dx%d", config.Width, config.Height)
	}
}
