package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"khairul169/garage-webui/schema"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/pelletier/go-toml/v2"
)

type garage struct {
	Config schema.Config
}

var Garage = &garage{}

func (g *garage) LoadConfig() error {
	path := GetEnv("CONFIG_PATH", "/etc/garage.toml")
	data, err := os.ReadFile(path)

	if err != nil {
		return err
	}

	var cfg schema.Config
	err = toml.Unmarshal(data, &cfg)
	if err != nil {
		log.Fatal(err)
	}

	g.Config = cfg

	return nil
}

func trimEndpoint(endpoint string) string {
	return strings.TrimRight(endpoint, "/")
}

func (g *garage) GetAdminEndpoint() string {
	endpoint := os.Getenv("API_BASE_URL")
	if len(endpoint) > 0 {
		return trimEndpoint(endpoint)
	}

	host := strings.Split(g.Config.RPCPublicAddr, ":")[0]
	port := LastString(strings.Split(g.Config.Admin.APIBindAddr, ":"))

	endpoint = fmt.Sprintf("%s:%s", host, port)
	if !strings.HasPrefix(endpoint, "http") {
		endpoint = fmt.Sprintf("http://%s", endpoint)
	}

	return trimEndpoint(endpoint)
}

func (g *garage) GetS3Endpoint() string {
	endpoint := os.Getenv("S3_ENDPOINT_URL")
	if len(endpoint) > 0 {
		return trimEndpoint(endpoint)
	}

	host := strings.Split(g.Config.RPCPublicAddr, ":")[0]
	port := LastString(strings.Split(g.Config.S3API.APIBindAddr, ":"))

	endpoint = fmt.Sprintf("%s:%s", host, port)
	if !strings.HasPrefix(endpoint, "http") {
		endpoint = fmt.Sprintf("http://%s", endpoint)
	}

	return trimEndpoint(endpoint)
}

func (g *garage) GetS3Region() string {
	endpoint := os.Getenv("S3_REGION")
	if len(endpoint) > 0 {
		return endpoint
	}
	if len(g.Config.S3API.S3Region) == 0 {
		return "garage"
	}
	return g.Config.S3API.S3Region
}

func (g *garage) GetAdminKey() string {
	key := os.Getenv("API_ADMIN_KEY")
	if len(key) > 0 {
		return key
	}
	return g.Config.Admin.AdminToken
}

type FetchOptions struct {
	Method  string
	Params  map[string]string
	Body    interface{}
	Headers map[string]string
}

// maxErrorBodyBytes caps the error body read in Fetch. Error pages can be
// large, and only a snippet belongs in the returned error.
const maxErrorBodyBytes = 4096

func (g *garage) Fetch(url string, options *FetchOptions) ([]byte, error) {
	var reqBody io.Reader
	reqUrl := fmt.Sprintf("%s%s", g.GetAdminEndpoint(), url)
	method := http.MethodGet

	if len(options.Method) > 0 {
		method = options.Method
	}

	if options.Body != nil {
		body, err := json.Marshal(options.Body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewBuffer(body)
	}

	req, err := http.NewRequest(method, reqUrl, reqBody)
	if err != nil {
		return nil, err
	}

	if options.Params != nil {
		q := req.URL.Query()
		for k, v := range options.Params {
			q.Add(k, v)
		}
		req.URL.RawQuery = q.Encode()
	}

	// Add auth token
	req.Header.Add("Authorization", fmt.Sprintf("Bearer %s", g.GetAdminKey()))

	if options.Headers != nil {
		for k, v := range options.Headers {
			req.Header.Add(k, v)
		}
	}

	// The body is always JSON, so the JSON type wins over a caller header.
	// Set runs after the caller headers so a caller Content-Type cannot
	// leave the request with two values.
	if options.Body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if res.Body != nil {
		defer res.Body.Close()
	}

	if res.StatusCode < http.StatusOK || res.StatusCode >= http.StatusMultipleChoices {
		body, err := io.ReadAll(io.LimitReader(res.Body, maxErrorBodyBytes))
		if err != nil {
			return nil, err
		}

		var data map[string]interface{}
		if err := json.Unmarshal(body, &data); err == nil && data["message"] != nil {
			return nil, fmt.Errorf("garage request failed with status %d: %v", res.StatusCode, data["message"])
		}

		snippet := strings.TrimSpace(string(body))
		if snippet == "" {
			return nil, fmt.Errorf("garage request failed with status %d", res.StatusCode)
		}
		return nil, fmt.Errorf("garage request failed with status %d: %s", res.StatusCode, snippet)
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	return body, nil
}
