//go:build prod
// +build prod

package ui

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"
)

//go:embed dist
var embeddedFs embed.FS

// normalizeBasePath strips trailing slashes from a base path and maps
// "/" to "". It mirrors the frontend normalisation in src/lib/consts.ts.
func normalizeBasePath(basePath string) string {
	trimmed := strings.TrimRight(basePath, "/")
	if trimmed == "" || !strings.HasPrefix(trimmed, "/") {
		return ""
	}

	return trimmed
}

// bakedBasePath reads the base path the frontend build baked into
// index.html: the entry script reference holds it. A root build
// references /assets/..., a subpath build references /sub/assets/....
// It returns "" when the file holds no such reference.
func bakedBasePath(distFs fs.FS) string {
	index, err := fs.ReadFile(distFs, "index.html")
	if err != nil {
		return ""
	}

	html := string(index)
	start := strings.Index(html, `src="`)
	if start < 0 {
		return ""
	}

	rest := html[start+len(`src="`):]
	end := strings.Index(rest, "/assets/")
	if end < 0 {
		return ""
	}

	return rest[:end]
}

func ServeUI(mux *http.ServeMux) {
	distFs, _ := fs.Sub(embeddedFs, "dist")
	fileServer := http.FileServer(http.FS(distFs))
	basePath := normalizeBasePath(os.Getenv("BASE_PATH"))
	bakedBase := bakedBasePath(distFs)

	mux.Handle(basePath+"/", http.StripPrefix(basePath, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_path := path.Clean(r.URL.Path)[1:]

		// Rewrite non-existing paths to index.html
		if _, err := fs.Stat(distFs, _path); err != nil {
			index, _ := fs.ReadFile(distFs, "index.html")
			html := string(index)

			// Set base path for the UI
			html = strings.ReplaceAll(html, "%BASE_PATH%", basePath)
			html = addBasePath(html, basePath)

			w.Header().Add("Content-Type", "text/html")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(html))
			return
		}

		// Prefix the asset paths in built JS, but only for a root build
		// served under a base path, and only the two shapes Vite emits:
		// an absolute "/assets/..." asset URL and a bare "assets/..."
		// preload entry. A blind replace of "assets/" would also
		// rewrite that text inside other string constants. A build
		// that already bakes the base path passes through untouched:
		// its preload helper already prefixes the bare entries.
		if len(basePath) > 0 && bakedBase == "" && strings.HasSuffix(_path, ".js") {
			data, _ := fs.ReadFile(distFs, _path)
			html := string(data)
			html = strings.ReplaceAll(html, `"/assets/`, `"/`+basePath[1:]+`/assets/`)
			html = strings.ReplaceAll(html, `"assets/`, `"`+basePath[1:]+`/assets/`)

			w.Header().Add("Content-Type", "text/javascript")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(html))
			return
		}

		fileServer.ServeHTTP(w, r)
	})))
}

func addBasePath(html string, basePath string) string {
	if basePath == "" {
		return html
	}

	re := regexp.MustCompile(`(href|src)=["'](/[^"'>]+)["']`)
	return re.ReplaceAllStringFunc(html, func(match string) string {
		// Skip a reference that already holds the base path, so a
		// build that bakes the base path is not prefixed twice.
		if strings.Contains(match, `"`+basePath+`/`) || strings.Contains(match, `'`+basePath+`/`) {
			return match
		}

		return re.ReplaceAllString(match, `$1="`+basePath+`$2"`)
	})
}
