package middleware

import (
	"errors"
	"khairul169/garage-webui/utils"
	"net/http"
)

func AuthMiddleware(next http.Handler) http.Handler {
	authData := utils.GetEnv("AUTH_USER_PASS", "")
	authDisabled := utils.GetEnv("AUTH_DISABLED", "") == "true"

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if authData == "" {
			if authDisabled {
				next.ServeHTTP(w, r)
				return
			}

			utils.ResponseErrorStatus(w, errors.New("authentication is not configured"), http.StatusUnauthorized)
			return
		}

		auth := utils.Session.Get(r, "authenticated")
		if auth == nil || !auth.(bool) {
			utils.ResponseErrorStatus(w, errors.New("unauthorized"), http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
