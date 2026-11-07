package utils

import (
	"net/http"
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
	// the cookie and login never sticks.
	sessMgr.Cookie.Secure = GetEnv("SESSION_COOKIE_SECURE", "true") != "false"
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

func (s *SessionManager) Clear(r *http.Request) error {
	return s.mgr.Clear(r.Context())
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
