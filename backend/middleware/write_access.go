package middleware

import (
	"errors"
	"net/http"
	"strings"

	"khairul169/garage-webui/utils"
)

// isReadOnlyRequest reports whether r only reads state. Presign uses POST
// to carry the key and expiry, but it only signs a GetObject URL.
func isReadOnlyRequest(r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	case http.MethodPost:
		return strings.HasPrefix(r.URL.Path, "/buckets/") &&
			strings.HasSuffix(r.URL.Path, "/presign") &&
			strings.Count(r.URL.Path, "/") == 3
	default:
		return false
	}
}

// WriteAccessMiddleware rejects state-changing requests from a read-only
// session. Read requests pass through. A session without a role is an
// admin session from before the role existed, so it keeps write access.
func WriteAccessMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isReadOnlyRequest(r) {
			next.ServeHTTP(w, r)
			return
		}

		if utils.GetEnv("AUTH_DISABLED", "") == "true" {
			next.ServeHTTP(w, r)
			return
		}

		role, _ := utils.Session.Get(r, "role").(string)
		if role == "readonly" {
			utils.ResponseErrorStatus(w, errors.New("read-only user"), http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
