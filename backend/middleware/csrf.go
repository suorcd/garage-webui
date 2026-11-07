package middleware

import (
	"errors"
	"khairul169/garage-webui/utils"
	"net/http"
)

const csrfHeader = "X-Requested-With"

// CSRFMiddleware rejects a state-changing request that does not have the CSRF header.
// A browser cannot send this header in a cross-origin request without a CORS preflight.
func CSRFMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}

		if r.Header.Get(csrfHeader) != "XMLHttpRequest" {
			utils.ResponseErrorStatus(w, errors.New("missing CSRF header"), http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
