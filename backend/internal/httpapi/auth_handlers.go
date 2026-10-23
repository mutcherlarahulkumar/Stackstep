package httpapi

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/auth"
)

const (
	headerClient    = "X-Client"
	oauthNonceName  = "ss_oauth_nonce"
	refreshCookie   = "ss_refresh"
	hostPrefixedRef = "__Host-ss_refresh"
)

func (s *Server) refreshCookieName() string {
	if s.cfg.CookieSecure {
		return hostPrefixedRef
	}
	return refreshCookie
}

func requestClient(c *gin.Context) (auth.Client, error) {
	cl := auth.Client(c.GetHeader(headerClient))
	if !cl.Valid() {
		return "", apperr.New(apperr.CodeBadRequest, "X-Client header must be web or mobile.")
	}
	return cl, nil
}

// writeTokens returns tokens in the shape each client expects:
// web gets the refresh token only as an HttpOnly cookie, mobile gets it in the body.
func (s *Server) writeTokens(c *gin.Context, client auth.Client, t app.Tokens) {
	out := tokensDTO{AccessToken: t.AccessToken, AccessExpiresAt: t.AccessExpiresAt.UTC()}
	switch client {
	case auth.ClientWeb:
		s.setRefreshCookie(c, t.RefreshToken, t.RefreshExpiresAt)
	case auth.ClientMobile:
		exp := t.RefreshExpiresAt.UTC()
		out.RefreshToken, out.RefreshExpiresAt = &t.RefreshToken, &exp
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) setRefreshCookie(c *gin.Context, value string, expires time.Time) {
	maxAge := int(time.Until(expires).Seconds())
	if value == "" {
		maxAge = -1
	}
	s.setCookie(c, s.refreshCookieName(), value, maxAge)
}

// setCookie writes an HttpOnly, SameSite=Lax cookie. Secure follows WEB_BASE_URL's scheme,
// and config.Load refuses a non-https WEB_BASE_URL in production.
func (s *Server) setCookie(c *gin.Context, name, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{ //nolint:gosec // Secure is s.cfg.CookieSecure, true for every https deployment
		Name: name, Value: value, Path: "/", MaxAge: maxAge,
		HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) devLogin(c *gin.Context) {
	if !s.cfg.DevLoginEnabled() {
		s.fail(c, apperr.New(apperr.CodeNotFound, "Route not found."))
		return
	}
	client, err := requestClient(c)
	if err != nil {
		s.fail(c, err)
		return
	}
	var req devLoginReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	t, err := s.sessions.DevLogin(c.Request.Context(), req.GitHubLogin)
	if err != nil {
		s.fail(c, err)
		return
	}
	s.writeTokens(c, client, t)
}

func randomNonce() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// githubStart redirects to GitHub. Mobile must send a PKCE S256 code_challenge.
func (s *Server) githubStart(c *gin.Context) {
	if !s.cfg.GitHubEnabled() {
		s.fail(c, apperr.New(apperr.CodeNotConfigured, "GitHub sign-in isn't configured on this server."))
		return
	}
	client := auth.Client(c.Query("client"))
	if !client.Valid() {
		s.fail(c, apperr.Validation(map[string]string{"client": "Must be web or mobile."}))
		return
	}
	st := auth.State{Client: client, Nonce: randomNonce(), IssuedAt: s.clock.Now().Unix()}
	if client == auth.ClientMobile {
		st.CodeChallenge = c.Query("code_challenge")
		if c.Query("code_challenge_method") != "S256" || !auth.ValidCodeChallenge(st.CodeChallenge) {
			s.fail(c, apperr.Validation(map[string]string{"code_challenge": "A PKCE S256 challenge is required."}))
			return
		}
	}
	raw, err := s.states.Sign(st)
	if err != nil {
		s.fail(c, err)
		return
	}
	if client == auth.ClientWeb {
		// Binds the callback to this browser (login CSRF protection).
		s.setCookie(c, oauthNonceName, st.Nonce, int(auth.StateTTL.Seconds()))
	}
	c.Redirect(http.StatusFound, s.github.AuthorizeURL(raw))
}

func (s *Server) githubCallback(c *gin.Context) {
	st, err := s.states.Verify(c.Query("state"), s.clock.Now())
	if err != nil {
		s.fail(c, apperr.New(apperr.CodeInvalidState, "This sign-in link is invalid or expired."))
		return
	}
	fail := func(code apperr.Code) {
		var target *url.URL
		switch st.Client {
		case auth.ClientWeb:
			target = s.cfg.WebBaseURL.JoinPath("/login")
		case auth.ClientMobile:
			u := *s.cfg.MobileRedirectURL
			target = &u
		}
		q := target.Query()
		q.Set("error", string(code))
		target.RawQuery = q.Encode()
		c.Redirect(http.StatusFound, target.String())
	}

	if st.Client == auth.ClientWeb {
		nonce, err := c.Cookie(oauthNonceName)
		s.setCookie(c, oauthNonceName, "", -1)
		if err != nil || subtle.ConstantTimeCompare([]byte(nonce), []byte(st.Nonce)) != 1 {
			fail(apperr.CodeInvalidState)
			return
		}
	}
	if c.Query("error") != "" { // user pressed Cancel on GitHub
		fail(apperr.CodeUnauthenticated)
		return
	}
	code := c.Query("code")
	if code == "" || len(code) > 256 {
		fail(apperr.CodeInvalidCode)
		return
	}
	profile, err := s.github.Exchange(c.Request.Context(), code)
	if err != nil {
		s.log.WarnContext(c.Request.Context(), "github exchange failed", "err", err)
		fail(apperr.CodeInvalidCode)
		return
	}
	user, err := s.sessions.SignInGitHub(c.Request.Context(), profile)
	if err != nil {
		s.log.ErrorContext(c.Request.Context(), "github sign-in failed", "err", err)
		fail(apperr.CodeInternal)
		return
	}

	switch st.Client {
	case auth.ClientWeb:
		t, err := s.sessions.Issue(c.Request.Context(), s.store.Pool, user.ID)
		if err != nil {
			fail(apperr.CodeInternal)
			return
		}
		s.setRefreshCookie(c, t.RefreshToken, t.RefreshExpiresAt)
		c.Redirect(http.StatusFound, s.cfg.WebBaseURL.JoinPath("/auth/complete").String())
	case auth.ClientMobile:
		loginCode, err := s.sessions.IssueLoginCode(c.Request.Context(), user.ID, st.CodeChallenge)
		if err != nil {
			fail(apperr.CodeInternal)
			return
		}
		u := *s.cfg.MobileRedirectURL
		q := u.Query()
		q.Set("code", loginCode)
		u.RawQuery = q.Encode()
		c.Redirect(http.StatusFound, u.String())
	}
}

func (s *Server) exchange(c *gin.Context) {
	var req exchangeReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	t, err := s.sessions.ExchangeLoginCode(c.Request.Context(), req.Code, req.CodeVerifier)
	if err != nil {
		s.fail(c, err)
		return
	}
	s.writeTokens(c, auth.ClientMobile, t)
}

func (s *Server) refreshTokenFrom(c *gin.Context, client auth.Client) (string, error) {
	switch client {
	case auth.ClientWeb:
		v, err := c.Cookie(s.refreshCookieName())
		if err != nil {
			return "", nil
		}
		return v, nil
	case auth.ClientMobile:
		var req refreshReq
		if err := decode(c, &req); err != nil {
			return "", err
		}
		return req.RefreshToken, nil
	}
	return "", nil
}

func (s *Server) refresh(c *gin.Context) {
	client, err := requestClient(c)
	if err != nil {
		s.fail(c, err)
		return
	}
	raw, err := s.refreshTokenFrom(c, client)
	if err != nil {
		s.fail(c, err)
		return
	}
	t, err := s.sessions.Refresh(c.Request.Context(), raw)
	if err != nil {
		if client == auth.ClientWeb {
			s.setRefreshCookie(c, "", time.Time{})
		}
		s.fail(c, err)
		return
	}
	s.writeTokens(c, client, t)
}

func (s *Server) logout(c *gin.Context) {
	client, err := requestClient(c)
	if err != nil {
		s.fail(c, err)
		return
	}
	raw, err := s.refreshTokenFrom(c, client)
	if err != nil {
		s.fail(c, err)
		return
	}
	if err := s.sessions.Logout(c.Request.Context(), raw); err != nil {
		s.fail(c, err)
		return
	}
	if client == auth.ClientWeb {
		s.setRefreshCookie(c, "", time.Time{})
	}
	c.Status(http.StatusNoContent)
}
