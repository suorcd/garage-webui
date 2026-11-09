package middleware

import (
	"errors"
	"net/http"

	"khairul169/garage-webui/utils"
)

// WriteAccessMiddleware rejects state-changing requests from a read-only
// session. Read requests pass through. A session without a role is an
// admin session from before the role existed, so it keeps write access.
func WriteAccessMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet ||
			r.Method == http.MethodHead ||
			r.Method == http.MethodOptions {
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
