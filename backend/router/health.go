package router

import (
	"encoding/json"
	"khairul169/garage-webui/utils"
	"net/http"
	"time"
)

// healthProbeTimeout bounds the Garage admin API probe in Readyz. Five
// seconds is long enough for a healthy node on the local network, and
// short enough that a probe never blocks the caller. Tests set it short
// to prove a hung node fails fast.
var healthProbeTimeout = 5 * time.Second

type healthStatus struct {
	Status string `json:"status"`
}

func writeHealthStatus(w http.ResponseWriter, status string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(healthStatus{Status: status})
}

// Healthz answers whether the process is up. It never contacts Garage,
// so it stays 200 while Garage is down.
func Healthz(w http.ResponseWriter, r *http.Request) {
	writeHealthStatus(w, "ok", http.StatusOK)
}

// Readyz answers whether the process can reach the Garage admin API. It
// probes GetClusterStatus, the cheapest admin call this UI already uses.
// It returns 503 while Garage is unreachable and 200 after recovery. The
// response holds only a status string, never the admin token.
func Readyz(w http.ResponseWriter, r *http.Request) {
	_, err := utils.Garage.FetchContext(r.Context(), "/v2/GetClusterStatus", &utils.FetchOptions{Timeout: healthProbeTimeout})
	if err != nil {
		writeHealthStatus(w, "not ready", http.StatusServiceUnavailable)
		return
	}
	writeHealthStatus(w, "ok", http.StatusOK)
}
