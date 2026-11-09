package schema

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBucketJSONHasNoSecretAccessKey(t *testing.T) {
	bucket := Bucket{
		ID:   "bucket-1",
		Keys: []KeyElement{{AccessKeyID: "key-1", Name: "test-key"}},
	}

	data, err := json.Marshal(bucket)
	if err != nil {
		t.Fatalf("cannot encode bucket: %v", err)
	}

	if strings.Contains(string(data), "secretAccessKey") {
		t.Fatalf("bucket JSON contains a secret field: %s", data)
	}
}

func TestConfigJSONHasNoSecrets(t *testing.T) {
	config := Config{
		RPCSecret: "test-rpc-secret",
		Admin: Admin{
			AdminToken:   "test-admin-token",
			MetricsToken: "test-metrics-token",
		},
	}

	data, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("cannot encode config: %v", err)
	}

	for _, secret := range []string{
		"rpc_secret",
		"admin_token",
		"metrics_token",
		"test-rpc-secret",
		"test-admin-token",
		"test-metrics-token",
	} {
		if strings.Contains(string(data), secret) {
			t.Errorf("config JSON contains secret field or value %q: %s", secret, data)
		}
	}
}
