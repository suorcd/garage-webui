package router

import (
	"khairul169/garage-webui/middleware"
	"khairul169/garage-webui/utils"
	"net/http"
)

func HandleApiRouter() http.Handler {
	mux := http.NewServeMux()

	auth := &Auth{trustedProxies: parseTrustedProxies(utils.GetEnv("TRUSTED_PROXIES", ""))}
	mux.HandleFunc("POST /auth/login", auth.Login)

	router := http.NewServeMux()
	router.HandleFunc("POST /auth/logout", auth.Logout)
	router.HandleFunc("GET /auth/status", auth.GetStatus)

	config := &Config{}
	router.HandleFunc("GET /config", config.GetAll)

	buckets := &Buckets{}
	router.HandleFunc("GET /buckets", buckets.GetAll)
	router.HandleFunc("POST /v2/AllowBucketKey", buckets.AllowKey)
	router.HandleFunc("POST /v2/DenyBucketKey", buckets.DenyKey)

	cors := &BucketCORS{}
	router.HandleFunc("GET /buckets/{bucket}/cors", cors.Get)
	router.HandleFunc("PUT /buckets/{bucket}/cors", cors.Put)
	router.HandleFunc("DELETE /buckets/{bucket}/cors", cors.Delete)

	lifecycle := &BucketLifecycle{}
	router.HandleFunc("GET /buckets/{bucket}/lifecycle", lifecycle.Get)
	router.HandleFunc("PUT /buckets/{bucket}/lifecycle", lifecycle.Put)
	router.HandleFunc("DELETE /buckets/{bucket}/lifecycle", lifecycle.Delete)

	presign := &BucketPresign{}
	router.HandleFunc("POST /buckets/{bucket}/presign", presign.Post)

	keys := &Keys{}
	router.HandleFunc("POST /v2/DeleteKey", keys.Delete)
	router.HandleFunc("POST /v2/UpdateKey", keys.Update)

	browse := &Browse{}
	router.HandleFunc("GET /browse/{bucket}", browse.GetObjects)
	router.HandleFunc("GET /browse/{bucket}/{key...}", browse.GetOneObject)
	router.HandleFunc("PUT /browse/{bucket}/{key...}", browse.PutObject)
	router.HandleFunc("DELETE /browse/{bucket}/{key...}", browse.DeleteObject)

	// Proxy request to garage api endpoint
	router.HandleFunc("/", ProxyHandler)

	mux.Handle("/", middleware.AuthMiddleware(middleware.AuditMiddleware(router)))
	return middleware.CSRFMiddleware(mux)
}
