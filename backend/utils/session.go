package utils

import (
	"net/http"
	"strconv"
	"time"

	"github.com/alexedwards/scs/v2"
)

type SessionManager struct {
	mgr *scs.SessionManager
}

var Session *SessionManager

func InitSessionManager() *scs.SessionManager {
	sessMgr := scs.New()
	sessMgr.Lifetime = 24 * time.Hour
	// Secure by default: the app runs behind an HTTPS ingress. Local HTTP
	// development sets SESSION_COOKIE_SECURE=false, or the browser drops
	// the cookie and login never sticks. ParseBool accepts false, False,
	// FALSE, and 0. An unparseable value stays secure.
	secure, err := strconv.ParseBool(GetEnv("SESSION_COOKIE_SECURE", "true"))
	if err != nil {
		secure = true
	}
	sessMgr.Cookie.Secure = secure
	sessMgr.Cookie.HttpOnly = true
	sessMgr.Cookie.SameSite = http.SameSiteLaxMode
	Session = &SessionManager{mgr: sessMgr}
	return sessMgr
}

func (s *SessionManager) Get(r *http.Request, key string) interface{} {
	return s.mgr.Get(r.Context(), key)
}

func (s *SessionManager) Set(r *http.Request, key string, value interface{}) {
	s.mgr.Put(r.Context(), key, value)
}

// RenewToken rotates the session token and keeps the session data. Login
// calls it so a token fixed before login cannot become authenticated.
func (s *SessionManager) RenewToken(r *http.Request) error {
	return s.mgr.RenewToken(r.Context())
}

// Destroy removes the session data and token. Logout calls it so the
// token cannot be reused after logout.
func (s *SessionManager) Destroy(r *http.Request) error {
	return s.mgr.Destroy(r.Context())
}
