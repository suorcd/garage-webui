package utils

import (
	"net/http"
	"net/http/httptest"
	"testing"
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
