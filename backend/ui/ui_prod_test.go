//go:build prod
// +build prod

package ui

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// entryJSName finds the built entry chunk in dist/assets.
func entryJSName(t *testing.T) string {
	t.Helper()

	matches, err := filepath.Glob("dist/assets/index-*.js")
	if err != nil || len(matches) != 1 {
		t.Fatalf("expected one entry chunk, found %v (err %v)", matches, err)
	}

	return filepath.Base(matches[0])
}

// bakedBase reads the base path the build baked into index.html: the
// entry script reference holds it. A root build references /assets/...,
// a subpath build references /sub/assets/....
func bakedBase(t *testing.T) string {
	t.Helper()

	index, err := os.ReadFile(filepath.Join("dist", "index.html"))
	if err != nil {
		t.Fatalf("read dist index.html: %v", err)
	}

	html := string(index)
	start := strings.Index(html, `src="`)
	if start < 0 {
		t.Fatalf("dist index.html holds no entry script reference")
	}

	rest := html[start+len(`src="`):]
	end := strings.Index(rest, "/assets/")
	if end < 0 {
		t.Fatalf("dist index.html holds no asset reference")
	}

	return rest[:end]
}

func get(t *testing.T, mux http.Handler, path string) (int, string, http.Header) {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	body, err := io.ReadAll(rec.Result().Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	return rec.Code, string(body), rec.Header()
}

func TestServeUIAddsBasePathToIndex(t *testing.T) {
	t.Setenv("BASE_PATH", "/sub")

	mux := http.NewServeMux()
	ServeUI(mux)

	code, body, header := get(t, mux, "/sub/")
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}
	if !strings.Contains(header.Get("Content-Type"), "text/html") {
		t.Fatalf("expected text/html, got %q", header.Get("Content-Type"))
	}
	if !strings.Contains(body, `window.__BASE_PATH = "/sub"`) {
		t.Fatalf("index does not set __BASE_PATH to /sub")
	}
	if strings.Contains(body, "%BASE_PATH%") {
		t.Fatalf("index still holds the %%BASE_PATH%% placeholder")
	}
	if strings.Contains(body, `src="/assets/`) || strings.Contains(body, `href="/assets/`) {
		t.Fatalf("index still holds an asset reference without the base path")
	}
	if strings.Contains(body, "/sub/sub/") {
		t.Fatalf("index holds a doubled base path")
	}
}

func TestServeUIJSAssetPaths(t *testing.T) {
	t.Setenv("BASE_PATH", "/sub")

	mux := http.NewServeMux()
	ServeUI(mux)

	name := entryJSName(t)
	want, err := os.ReadFile(filepath.Join("dist", "assets", name))
	if err != nil {
		t.Fatalf("read dist entry chunk: %v", err)
	}

	code, body, header := get(t, mux, "/sub/assets/"+name)
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}
	if !strings.Contains(header.Get("Content-Type"), "text/javascript") {
		t.Fatalf("expected text/javascript, got %q", header.Get("Content-Type"))
	}

	// A build that already bakes the base path passes through
	// untouched. A root build gets exactly the two asset-path shapes
	// prefixed once: the absolute logo URL and the bare preload entries.
	if bakedBase(t) == "/sub" {
		if body != string(want) {
			t.Fatalf("served JS differs from the built file")
		}

		return
	}

	if !strings.Contains(body, `"/sub/assets/garage-logo-`) {
		t.Fatalf("served JS does not prefix the logo URL")
	}
	if strings.Contains(body, `"/assets/garage-logo-`) {
		t.Fatalf("served JS still holds the unprefixed logo URL")
	}
	if strings.Contains(body, `"assets/`) {
		t.Fatalf("served JS still holds a bare preload entry")
	}

	// Each prefix adds len("/sub") bytes: "/assets/" becomes
	// "/sub/assets/", and "assets/" becomes "sub/assets/".
	rewrites := strings.Count(string(want), `"/assets/`) + strings.Count(string(want), `"assets/`)
	if len(body) != len(want)+len("/sub")*rewrites {
		t.Fatalf("served JS changed by more than the asset prefix")
	}
}

func TestServeUIFallsBackToIndexForDeepPaths(t *testing.T) {
	t.Setenv("BASE_PATH", "/sub")

	mux := http.NewServeMux()
	ServeUI(mux)

	code, body, _ := get(t, mux, "/sub/buckets/abc")
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}
	if !strings.Contains(body, `window.__BASE_PATH = "/sub"`) {
		t.Fatalf("fallback index does not set __BASE_PATH to /sub")
	}
}

func TestServeUIAtRoot(t *testing.T) {
	if bakedBase(t) != "" {
		t.Skip("dist is a subpath build, so the root case does not apply")
	}

	t.Setenv("BASE_PATH", "")

	mux := http.NewServeMux()
	ServeUI(mux)

	code, body, _ := get(t, mux, "/")
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}
	if !strings.Contains(body, `window.__BASE_PATH = ""`) {
		t.Fatalf("index does not set __BASE_PATH to an empty string")
	}
	if !strings.Contains(body, `src="/assets/`) {
		t.Fatalf("index does not reference the entry chunk at the root")
	}
}
