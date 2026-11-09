//go:build prod
// +build prod

package ui

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"
)

//go:embed dist
var embeddedFs embed.FS

// basePathPattern matches a root-relative asset reference in index.html.
// Compile it once: the pattern is used on every index request.
var basePathPattern = regexp.MustCompile(`(href|src)=["'](/[^"'>]+)["']`)

// normalizeBasePath strips trailing slashes from a base path and maps
// "/" to "". It mirrors the frontend normalisation in src/lib/consts.ts.
func normalizeBasePath(basePath string) string {
	trimmed := strings.TrimRight(basePath, "/")
	if trimmed == "" || !strings.HasPrefix(trimmed, "/") {
		return ""
	}

	return trimmed
}

func ServeUI(mux *http.ServeMux) {
	distFs, err := fs.Sub(embeddedFs, "dist")
	if err != nil {
		log.Fatalf("cannot open the embedded UI: %v", err)
	}

	fileServer := http.FileServer(http.FS(distFs))
	basePath := normalizeBasePath(os.Getenv("BASE_PATH"))

	mux.Handle(basePath+"/", http.StripPrefix(basePath, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_path := path.Clean(r.URL.Path)[1:]

		// A missing asset is a broken build. Return 404 instead of the
		// index document, so the network tab shows the real failure.
		if _, err := fs.Stat(distFs, _path); err != nil {
			if strings.HasPrefix(_path, "assets/") {
				http.NotFound(w, r)
				return
			}

			index, err := fs.ReadFile(distFs, "index.html")
			if err != nil {
				log.Printf("cannot read the embedded index.html: %v", err)
				http.Error(w, "UI is unavailable", http.StatusInternalServerError)
				return
			}

			html := string(index)
			html = strings.ReplaceAll(html, "%BASE_PATH%", basePath)
			html = addBasePath(html, basePath)

			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			w.WriteHeader(http.StatusOK)
			if _, err := w.Write([]byte(html)); err != nil {
				log.Printf("cannot write index.html: %v", err)
			}
			return
		}

		// Vite gives every asset a content hash. Cache it forever.
		if strings.HasPrefix(_path, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else if _path == "" || _path == "index.html" {
			w.Header().Set("Cache-Control", "no-cache")
		}

		fileServer.ServeHTTP(w, r)
	})))
}

func addBasePath(html string, basePath string) string {
	if basePath == "" {
		return html
	}

	return basePathPattern.ReplaceAllStringFunc(html, func(match string) string {
		// Skip a reference that already holds the base path, so a
		// build that bakes the base path is not prefixed twice.
		if strings.Contains(match, `"`+basePath+`/`) || strings.Contains(match, `'`+basePath+`/`) {
			return match
		}

		return basePathPattern.ReplaceAllString(match, `$1="`+basePath+`$2"`)
	})
}
