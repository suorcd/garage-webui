package utils

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestGetAdminEndpointTrimsTrailingSlashes(t *testing.T) {
	g := &garage{}

	t.Setenv("API_BASE_URL", "https://garage.example.com/")
	if got := g.GetAdminEndpoint(); got != "https://garage.example.com" {
		t.Errorf("expected the trailing slash to be removed, got %q", got)
	}

	t.Setenv("API_BASE_URL", "https://garage.example.com///")
	if got := g.GetAdminEndpoint(); got != "https://garage.example.com" {
		t.Errorf("expected every trailing slash to be removed, got %q", got)
	}

	t.Setenv("API_BASE_URL", "https://garage.example.com")
	if got := g.GetAdminEndpoint(); got != "https://garage.example.com" {
		t.Errorf("expected an unchanged endpoint, got %q", got)
	}
}

func TestGetS3EndpointTrimsTrailingSlashes(t *testing.T) {
	g := &garage{}

	t.Setenv("S3_ENDPOINT_URL", "https://s3.example.com/")
	if got := g.GetS3Endpoint(); got != "https://s3.example.com" {
		t.Errorf("expected the trailing slash to be removed, got %q", got)
	}

	t.Setenv("S3_ENDPOINT_URL", "https://s3.example.com")
	if got := g.GetS3Endpoint(); got != "https://s3.example.com" {
		t.Errorf("expected an unchanged endpoint, got %q", got)
	}
}

func TestFetchUsesTrimmedAdminEndpoint(t *testing.T) {
	var requestPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL+"/")
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	if _, err := g.Fetch("/v2/ListBuckets", &FetchOptions{}); err != nil {
		t.Fatalf("expected a successful request, got %v", err)
	}

	if requestPath != "/v2/ListBuckets" {
		t.Errorf("expected path /v2/ListBuckets, got %q", requestPath)
	}
}

func TestFetchReturnsStatusAndSnippetForNonJSONError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte("<html><body>Bad Gateway</body></html>"))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	_, err := g.Fetch("/v2/ListBuckets", &FetchOptions{})
	if err == nil {
		t.Fatal("expected an error for a 502 response, got none")
	}
	if !strings.Contains(err.Error(), "502") {
		t.Errorf("expected the error to name the status 502, got %q", err.Error())
	}
	if !strings.Contains(err.Error(), "Bad Gateway") {
		t.Errorf("expected the error to include the body snippet, got %q", err.Error())
	}
}

func TestFetchAcceptsNon200SuccessStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	body, err := g.Fetch("/v2/ListBuckets", &FetchOptions{})
	if err != nil {
		t.Fatalf("expected no error for a 204 response, got %v", err)
	}
	if len(body) != 0 {
		t.Errorf("expected an empty body for a 204 response, got %q", string(body))
	}
}

func TestFetchTruncatesLongErrorBody(t *testing.T) {
	marker := "MARKER-NEAR-THE-END"
	body := strings.Repeat("x", 5000) + marker

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	_, err := g.Fetch("/v2/ListBuckets", &FetchOptions{})
	if err == nil {
		t.Fatal("expected an error for a 500 response, got none")
	}
	if strings.Contains(err.Error(), marker) {
		t.Errorf("expected the error body to be truncated before the marker, got a %d-byte error", len(err.Error()))
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("expected the error to name the status 500, got %q", err.Error())
	}
}

func TestFetchSendsJSONContentType(t *testing.T) {
	var contentType string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contentType = r.Header.Get("Content-Type")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	if _, err := g.Fetch("/v2/CreateBucket", &FetchOptions{
		Method: http.MethodPost,
		Body:   map[string]string{"globalAlias": "test"},
	}); err != nil {
		t.Fatalf("expected a successful request, got %v", err)
	}

	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", contentType)
	}
}

func TestFetchKeepsOneContentTypeWhenCallerSetsIt(t *testing.T) {
	var contentTypes []string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contentTypes = r.Header.Values("Content-Type")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	if _, err := g.Fetch("/v2/CreateBucket", &FetchOptions{
		Method:  http.MethodPost,
		Body:    map[string]string{"globalAlias": "test"},
		Headers: map[string]string{"Content-Type": "text/plain"},
	}); err != nil {
		t.Fatalf("expected a successful request, got %v", err)
	}

	if len(contentTypes) != 1 || contentTypes[0] != "application/json" {
		t.Errorf("expected one Content-Type application/json, got %q", contentTypes)
	}
}

func TestFetchKeepsCallerContentTypeWithoutBody(t *testing.T) {
	var contentTypes []string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contentTypes = r.Header.Values("Content-Type")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	if _, err := g.Fetch("/v2/ListBuckets", &FetchOptions{
		Headers: map[string]string{"Content-Type": "text/plain"},
	}); err != nil {
		t.Fatalf("expected a successful request, got %v", err)
	}

	if len(contentTypes) != 1 || contentTypes[0] != "text/plain" {
		t.Errorf("expected one Content-Type text/plain, got %q", contentTypes)
	}
}

func TestFetchSurfacesJSONErrorMessage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"message": "boom"}`))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	_, err := g.Fetch("/v2/ListBuckets", &FetchOptions{})
	if err == nil {
		t.Fatal("expected an error for a 500 response, got none")
	}
	if !strings.Contains(err.Error(), "500") || !strings.Contains(err.Error(), "boom") {
		t.Errorf("expected the error to name the status and the message, got %q", err.Error())
	}
}

func TestFetchTimesOutOnHungServer(t *testing.T) {
	oldTimeout := FetchTimeout
	FetchTimeout = 50 * time.Millisecond
	t.Cleanup(func() { FetchTimeout = oldTimeout })

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	start := time.Now()
	_, err := g.Fetch("/v2/ListBuckets", &FetchOptions{})
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("expected a timeout error, got none")
	}
	if elapsed > 400*time.Millisecond {
		t.Errorf("expected Fetch to fail fast on a hung server, took %v", elapsed)
	}
}

func TestFetchContextCancelsOnDisconnect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	start := time.Now()
	_, err := g.FetchContext(ctx, "/v2/ListBuckets", &FetchOptions{})
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("expected a context error, got none")
	}
	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected a context.Canceled error, got %v", err)
	}
	if elapsed > 400*time.Millisecond {
		t.Errorf("expected FetchContext to fail fast on a cancelled context, took %v", elapsed)
	}
}

func TestFetchHonorsPerRequestTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	_, err := g.Fetch("/v2/ListBuckets", &FetchOptions{Timeout: 50 * time.Millisecond})
	if err == nil {
		t.Fatal("expected a timeout error, got none")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("expected a context.DeadlineExceeded error, got %v", err)
	}
}

func TestFetchPerRequestTimeoutExceedsDefault(t *testing.T) {
	oldTimeout := FetchTimeout
	FetchTimeout = 50 * time.Millisecond
	t.Cleanup(func() { FetchTimeout = oldTimeout })

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	g := &garage{}
	if _, err := g.Fetch("/v2/ListBuckets", &FetchOptions{Timeout: 500 * time.Millisecond}); err != nil {
		t.Fatalf("expected a successful request, got %v", err)
	}
}
