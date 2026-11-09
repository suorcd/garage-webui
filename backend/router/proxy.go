package router

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"khairul169/garage-webui/utils"
)

// proxyResponseHeaderTimeout bounds the wait for the Garage response
// headers. After the headers arrive, the response body streams without a
// total limit, so large downloads still work.
const proxyResponseHeaderTimeout = 30 * time.Second

// proxyTransport is a package variable so tests can supply a short
// response header timeout.
var proxyTransport http.RoundTripper = newProxyTransport(proxyResponseHeaderTimeout)

func newProxyTransport(responseHeaderTimeout time.Duration) *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext
	transport.TLSHandshakeTimeout = 10 * time.Second
	transport.ResponseHeaderTimeout = responseHeaderTimeout

	return transport
}

func proxyErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	var netErr net.Error
	if errors.Is(err, context.DeadlineExceeded) ||
		(errors.As(err, &netErr) && netErr.Timeout()) {
		log.Printf("garage proxy timeout for %s %s: %v", r.Method, r.URL.Path, err)
		http.Error(w, "Garage admin API timed out", http.StatusGatewayTimeout)
		return
	}

	log.Printf("garage proxy error for %s %s: %v", r.Method, r.URL.Path, err)
	http.Error(w, "Garage admin API is unavailable", http.StatusBadGateway)
}

func ProxyHandler(w http.ResponseWriter, r *http.Request) {
	target, err := url.Parse(utils.Garage.GetAdminEndpoint())
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	proxy := &httputil.ReverseProxy{
		Transport:    proxyTransport,
		ErrorHandler: proxyErrorHandler,
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.URL.Path = strings.TrimPrefix(r.In.URL.Path, "/api")
			r.Out.Header.Set("Authorization", fmt.Sprintf("Bearer %s", utils.Garage.GetAdminKey()))
		},
	}

	proxy.ServeHTTP(w, r)
}
