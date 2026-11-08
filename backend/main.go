package main

import (
	"errors"
	"fmt"
	"khairul169/garage-webui/router"
	"khairul169/garage-webui/ui"
	"khairul169/garage-webui/utils"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// validateGarageConfig checks that the Garage admin endpoint and token
// resolve from the config file or the environment. It returns an error
// that names the missing value and where it must come from.
func validateGarageConfig() error {
	endpoint := utils.Garage.GetAdminEndpoint()
	if !hasEndpointHost(endpoint) {
		return errors.New("cannot resolve the Garage admin endpoint: set API_BASE_URL or provide a config file with rpc_public_addr and admin.api_bind_addr")
	}
	if utils.Garage.GetAdminKey() == "" {
		return errors.New("cannot resolve the Garage admin token: set API_ADMIN_KEY or provide a config file with admin.admin_token")
	}
	return nil
}

// hasEndpointHost reports whether the endpoint has a host name. An
// endpoint built from an empty config is "http://:" and has none.
func hasEndpointHost(endpoint string) bool {
	u, err := url.Parse(endpoint)
	return err == nil && u.Hostname() != ""
}

func main() {
	// Initialize app
	godotenv.Load()
	utils.InitCacheManager()
	sessionMgr := utils.InitSessionManager()

	authUserPass := utils.GetEnv("AUTH_USER_PASS", "")
	authDisabled := utils.GetEnv("AUTH_DISABLED", "") == "true"
	if authUserPass == "" {
		if !authDisabled {
			log.Fatal("AUTH_USER_PASS is not set. Set AUTH_USER_PASS, or set AUTH_DISABLED=true for local development.")
		}
		log.Println("WARNING: authentication is disabled. Any client can use the admin API.")
	} else {
		parts := strings.SplitN(authUserPass, ":", 2)
		if len(parts) < 2 || parts[1] == "" {
			log.Fatal("AUTH_USER_PASS must use the format username:password_hash.")
		}
	}

	if err := utils.Garage.LoadConfig(); err != nil {
		if os.IsNotExist(err) {
			// A missing file is not fatal: an env-only deployment has no file.
			log.Println("No garage config file found; using environment variables.")
		} else {
			// A file that exists but does not parse leaves the server with
			// a partial config, so the server must not start.
			log.Fatalf("Cannot load garage config: %v", err)
		}
	}
	if err := validateGarageConfig(); err != nil {
		log.Fatal(err)
	}

	basePath := os.Getenv("BASE_PATH")
	mux := http.NewServeMux()

	// Serve API
	apiPrefix := basePath + "/api"
	mux.Handle(apiPrefix+"/", http.StripPrefix(apiPrefix, router.HandleApiRouter()))

	// Static files
	ui.ServeUI(mux)

	// Redirect to UI if BASE_PATH is set
	if basePath != "" {
		mux.Handle("/", http.RedirectHandler(basePath, http.StatusMovedPermanently))
	}

	host := utils.GetEnv("HOST", "0.0.0.0")
	port := utils.GetEnv("PORT", "3909")

	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("Starting server on http://%s", addr)

	if err := newHTTPServer(addr, sessionMgr.LoadAndSave(mux)).ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

// readHeaderTimeout and idleTimeout bound how long the server waits for
// request headers and for the next request on a keep-alive connection.
var (
	readHeaderTimeout = 10 * time.Second
	idleTimeout       = 120 * time.Second
)

// newHTTPServer builds the server with timeouts. ReadHeaderTimeout closes
// connections that send no headers. IdleTimeout closes idle keep-alive
// connections. WriteTimeout stays off: streaming downloads and ZIP
// responses run longer than any fixed write budget.
func newHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		IdleTimeout:       idleTimeout,
	}
}
