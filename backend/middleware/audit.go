package middleware

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"khairul169/garage-webui/utils"
)

type auditEvent struct {
	Time   string `json:"time"`
	User   string `json:"user"`
	Method string `json:"method"`
	Path   string `json:"path"`
	Status int    `json:"status"`
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(body)
}

// auditUser returns the login name from the session. An auth-disabled
// server logs anonymous. A session from before the username existed
// falls back to the configured admin login.
func auditUser(r *http.Request) string {
	if name, ok := utils.Session.Get(r, "username").(string); ok && name != "" {
		return name
	}

	if utils.GetEnv("AUTH_DISABLED", "") == "true" {
		return "anonymous"
	}

	login := utils.GetEnv("AUTH_USER_PASS", "")
	user, _, found := strings.Cut(login, ":")
	if !found || user == "" {
		return "unknown"
	}

	return user
}

// AuditMiddleware writes one JSON line for each state-changing request.
// A read-only request is not an audit event.
func AuditMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isReadOnlyRequest(r) {
			next.ServeHTTP(w, r)
			return
		}

		recorder := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(recorder, r)

		status := recorder.status
		if status == 0 {
			status = http.StatusOK
		}

		event := auditEvent{
			Time:   time.Now().UTC().Format(time.RFC3339),
			User:   auditUser(r),
			Method: r.Method,
			Path:   r.URL.Path,
			Status: status,
		}
		data, err := json.Marshal(event)
		if err != nil {
			log.Printf("cannot write the audit event: %v", err)
			return
		}

		log.Println(string(data))
	})
}
