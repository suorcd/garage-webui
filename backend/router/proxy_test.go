package router

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"khairul169/garage-webui/utils"
)

func newProxyTestRouter(t *testing.T, upstreamURL string) *httptest.Server {
	t.Helper()

	t.Setenv("API_BASE_URL", upstreamURL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")
	t.Setenv("AUTH_DISABLED", "true")
	t.Setenv("AUTH_USER_PASS", "")

	utils.InitCacheManager()
	sessionMgr := utils.InitSessionManager()
	server := httptest.NewServer(sessionMgr.LoadAndSave(HandleApiRouter()))
	t.Cleanup(server.Close)

	return server
}

func TestProxyReturnsGatewayTimeoutWhenUpstreamSendsNoHeaders(t *testing.T) {
	release := make(chan struct{})
	var releaseOnce sync.Once
	releaseUpstream := func() {
		releaseOnce.Do(func() { close(release) })
	}

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
	}))
	t.Cleanup(func() {
		releaseUpstream()
		upstream.Close()
	})

	previousTransport := proxyTransport
	proxyTransport = &http.Transport{ResponseHeaderTimeout: 200 * time.Millisecond}
	t.Cleanup(func() { proxyTransport = previousTransport })

	routerServer := newProxyTestRouter(t, upstream.URL)
	client := &http.Client{Timeout: 2 * time.Second}

	res, err := client.Get(routerServer.URL + "/v2/GetClusterStatus")
	if err != nil {
		t.Fatalf("expected a 504 response, got error: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusGatewayTimeout {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 504, got %d: %s", res.StatusCode, body)
	}
}

func TestProxyStreamsResponseBodyAfterHeaders(t *testing.T) {
	release := make(chan struct{})
	var releaseOnce sync.Once
	releaseUpstream := func() {
		releaseOnce.Do(func() { close(release) })
	}

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		<-release
		io.WriteString(w, "body after headers")
	}))
	t.Cleanup(func() {
		releaseUpstream()
		upstream.Close()
	})

	previousTransport := proxyTransport
	proxyTransport = &http.Transport{ResponseHeaderTimeout: 200 * time.Millisecond}
	t.Cleanup(func() { proxyTransport = previousTransport })

	routerServer := newProxyTestRouter(t, upstream.URL)
	client := &http.Client{Timeout: 3 * time.Second}

	res, err := client.Get(routerServer.URL + "/v2/GetClusterStatus")
	if err != nil {
		t.Fatalf("expected response headers, got error: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	bodyCh := make(chan string, 1)
	go func() {
		body, _ := io.ReadAll(res.Body)
		bodyCh <- string(body)
	}()

	select {
	case body := <-bodyCh:
		t.Fatalf("body arrived before the upstream released it: %q", body)
	case <-time.After(300 * time.Millisecond):
	}

	releaseUpstream()

	select {
	case body := <-bodyCh:
		if body != "body after headers" {
			t.Fatalf("expected the full body, got %q", body)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("body did not arrive after the response headers")
	}
}
