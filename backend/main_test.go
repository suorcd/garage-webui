package main

import (
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
)

func setGarageConfig(t *testing.T, cfg schema.Config) {
	t.Helper()

	old := utils.Garage.Config
	utils.Garage.Config = cfg
	t.Cleanup(func() { utils.Garage.Config = old })
}

func TestValidateGarageConfigAcceptsEnvOnlySetup(t *testing.T) {
	t.Setenv("API_BASE_URL", "http://127.0.0.1:3903")
	t.Setenv("API_ADMIN_KEY", "test-token")
	setGarageConfig(t, schema.Config{})

	if err := validateGarageConfig(); err != nil {
		t.Errorf("expected an env-only setup to pass validation, got %v", err)
	}
}

func TestValidateGarageConfigAcceptsConfigFile(t *testing.T) {
	t.Setenv("API_BASE_URL", "")
	t.Setenv("API_ADMIN_KEY", "")
	setGarageConfig(t, schema.Config{
		RPCPublicAddr: "127.0.0.1:3903",
		Admin: schema.Admin{
			APIBindAddr: "127.0.0.1:3903",
			AdminToken:  "test-token",
		},
	})

	if err := validateGarageConfig(); err != nil {
		t.Errorf("expected a config file setup to pass validation, got %v", err)
	}
}

func TestValidateGarageConfigRejectsEmptyEndpoint(t *testing.T) {
	t.Setenv("API_BASE_URL", "")
	t.Setenv("API_ADMIN_KEY", "test-token")
	setGarageConfig(t, schema.Config{})

	err := validateGarageConfig()
	if err == nil {
		t.Fatal("expected an error for an unresolvable endpoint, got none")
	}
	if !strings.Contains(err.Error(), "endpoint") {
		t.Errorf("expected the error to name the endpoint, got %q", err.Error())
	}
}

func TestValidateGarageConfigRejectsEndpointWithoutHost(t *testing.T) {
	t.Setenv("API_BASE_URL", "")
	t.Setenv("API_ADMIN_KEY", "test-token")
	setGarageConfig(t, schema.Config{
		Admin: schema.Admin{APIBindAddr: "127.0.0.1:3903"},
	})

	err := validateGarageConfig()
	if err == nil {
		t.Fatal("expected an error for an endpoint without a host, got none")
	}
	if !strings.Contains(err.Error(), "endpoint") {
		t.Errorf("expected the error to name the endpoint, got %q", err.Error())
	}
}

func TestValidateGarageConfigRejectsEmptyToken(t *testing.T) {
	t.Setenv("API_BASE_URL", "http://127.0.0.1:3903")
	t.Setenv("API_ADMIN_KEY", "")
	setGarageConfig(t, schema.Config{})

	err := validateGarageConfig()
	if err == nil {
		t.Fatal("expected an error for an empty admin token, got none")
	}
	if !strings.Contains(err.Error(), "token") {
		t.Errorf("expected the error to name the token, got %q", err.Error())
	}
}

func TestNewHTTPServerSetsTimeouts(t *testing.T) {
	server := newHTTPServer(":3909", http.NewServeMux())
	if server.ReadHeaderTimeout <= 0 {
		t.Error("expected a ReadHeaderTimeout")
	}
	if server.IdleTimeout <= 0 {
		t.Error("expected an IdleTimeout")
	}
	if server.WriteTimeout != 0 {
		t.Errorf("expected no WriteTimeout so streaming downloads stay open, got %v", server.WriteTimeout)
	}
}

func TestNewHTTPServerClosesHeaderlessConnection(t *testing.T) {
	oldTimeout := readHeaderTimeout
	readHeaderTimeout = 100 * time.Millisecond
	t.Cleanup(func() { readHeaderTimeout = oldTimeout })

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("cannot listen: %v", err)
	}
	server := newHTTPServer(listener.Addr().String(), http.NewServeMux())
	go server.Serve(listener)
	t.Cleanup(func() { server.Close() })

	conn, err := net.Dial("tcp", listener.Addr().String())
	if err != nil {
		t.Fatalf("cannot dial: %v", err)
	}
	defer conn.Close()

	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("cannot set a read deadline: %v", err)
	}
	buf := make([]byte, 1)
	_, err = conn.Read(buf)
	if err == nil {
		t.Fatal("expected the server to close a connection that sends no headers")
	}
	if errors.Is(err, io.EOF) {
		return
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		t.Errorf("expected the server to close the connection, got a read timeout: %v", err)
	}
	// Any other error (for example, a reset on a loaded runner) still
	// shows that the server closed the connection.
}

func TestRunHealthcheckReturnsZeroOnOK(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" {
			t.Errorf("expected a /healthz request, got %s", r.URL.Path)
		}
		w.Write([]byte(`{"status":"ok"}`))
	}))
	t.Cleanup(server.Close)

	addr := strings.TrimPrefix(server.URL, "http://")
	if got := runHealthcheck(addr); got != 0 {
		t.Errorf("expected exit 0 on a 200 response, got %d", got)
	}
}

func TestRunHealthcheckReturnsNonZeroOnFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	t.Cleanup(server.Close)

	addr := strings.TrimPrefix(server.URL, "http://")
	if got := runHealthcheck(addr); got == 0 {
		t.Error("expected a non-zero exit on a 503 response")
	}
}

func TestRunHealthcheckReturnsNonZeroWhenUnreachable(t *testing.T) {
	if got := runHealthcheck("127.0.0.1:1"); got == 0 {
		t.Error("expected a non-zero exit when the server is unreachable")
	}
}
