package main

import (
	"fmt"
	"khairul169/garage-webui/router"
	"khairul169/garage-webui/ui"
	"khairul169/garage-webui/utils"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

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
		log.Println("Cannot load garage config!", err)
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

	if err := http.ListenAndServe(addr, sessionMgr.LoadAndSave(mux)); err != nil {
		log.Fatal(err)
	}
}
