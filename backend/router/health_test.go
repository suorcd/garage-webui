package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testHealthMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", Healthz)
	mux.HandleFunc("GET /readyz", Readyz)
	return mux
}

func getHealth(t *testing.T, target string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()
	testHealthMux().ServeHTTP(rec, req)
	return rec
}

func TestHealthzReturnsOK(t *testing.T) {
	rec := getHealth(t, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body healthStatus
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("expected a JSON body, got %q: %v", rec.Body.String(), err)
	}
	if body.Status != "ok" {
		t.Errorf("expected status ok, got %q", body.Status)
	}
}

func TestHealthzStaysOKWhenGarageIsDown(t *testing.T) {
	// A closed admin server: Garage is unreachable, but /healthz never
	// contacts Garage, so it stays 200.
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{}`))
	}))
	admin.Close()
	t.Setenv("API_BASE_URL", admin.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	rec := getHealth(t, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 while Garage is down, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestHealthzResponseHoldsNoSecret(t *testing.T) {
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	rec := getHealth(t, "/healthz")
	if strings.Contains(rec.Body.String(), "test-admin-key") {
		t.Errorf("response contains the admin token: %s", rec.Body.String())
	}
}

func TestReadyzReturnsOKWhenGarageIsUp(t *testing.T) {
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/GetClusterStatus" {
			t.Errorf("expected a GetClusterStatus probe, got %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"layoutVersion":1,"nodes":[]}`))
	}))
	t.Cleanup(admin.Close)
	t.Setenv("API_BASE_URL", admin.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	rec := getHealth(t, "/readyz")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body healthStatus
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("expected a JSON body, got %q: %v", rec.Body.String(), err)
	}
	if body.Status != "ok" {
		t.Errorf("expected status ok, got %q", body.Status)
	}
}

func TestReadyzReturnsServiceUnavailableWhenGarageIsDown(t *testing.T) {
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{}`))
	}))
	admin.Close()
	t.Setenv("API_BASE_URL", admin.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	rec := getHealth(t, "/readyz")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503 while Garage is down, got %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "test-admin-key") {
		t.Errorf("response contains the admin token: %s", rec.Body.String())
	}
}

func TestReadyzReturnsOKAfterRecovery(t *testing.T) {
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"layoutVersion":1,"nodes":[]}`))
	}))
	t.Cleanup(admin.Close)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	// Garage is down first: nothing listens on port 1.
	t.Setenv("API_BASE_URL", "http://127.0.0.1:1")
	rec := getHealth(t, "/readyz")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503 while Garage is down, got %d: %s", rec.Code, rec.Body.String())
	}

	// Garage recovers: the same process answers 200 without a restart.
	t.Setenv("API_BASE_URL", admin.URL)
	rec = getHealth(t, "/readyz")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 after recovery, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestReadyzProbeTimeoutBoundsAHungGarage(t *testing.T) {
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(admin.Close)
	t.Setenv("API_BASE_URL", admin.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")

	oldTimeout := healthProbeTimeout
	healthProbeTimeout = 100 * time.Millisecond
	t.Cleanup(func() { healthProbeTimeout = oldTimeout })

	// The probe times out at 100 ms, before the hung server answers at
	// 500 ms. Without the short probe timeout the call would succeed.
	rec := getHealth(t, "/readyz")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503 when the probe times out, got %d: %s", rec.Code, rec.Body.String())
	}
}
