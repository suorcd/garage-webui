package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
)

func TestConfigResponseDoesNotExposeSecrets(t *testing.T) {
	utils.Garage.Config = schema.Config{
		RPCSecret: "test-rpc-secret",
		Admin: schema.Admin{
			AdminToken:   "test-admin-token",
			MetricsToken: "test-metrics-token",
		},
		S3Web: schema.S3Web{
			BindAddr:   "[::]:3902",
			RootDomain: ".web.example.com",
			Index:      "index.html",
		},
	}

	mux := http.NewServeMux()
	config := &Config{}
	mux.HandleFunc("GET /config", config.GetAll)

	req := httptest.NewRequest(http.MethodGet, "/config", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	body := rec.Body.String()
	for _, secret := range []string{
		"test-admin-token",
		"test-rpc-secret",
		"test-metrics-token",
		"admin_token",
		"rpc_secret",
		"metrics_token",
	} {
		if strings.Contains(body, secret) {
			t.Errorf("response contains secret field or value %q: %s", secret, body)
		}
	}

	var response struct {
		S3Web struct {
			BindAddr   string `json:"bind_addr"`
			RootDomain string `json:"root_domain"`
		} `json:"s3_web"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}

	if response.S3Web.BindAddr != "[::]:3902" {
		t.Errorf("expected s3_web.bind_addr [::]:3902, got %q", response.S3Web.BindAddr)
	}
	if response.S3Web.RootDomain != ".web.example.com" {
		t.Errorf("expected s3_web.root_domain .web.example.com, got %q", response.S3Web.RootDomain)
	}
}
