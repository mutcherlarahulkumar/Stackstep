// Package httpapi is the Gin gateway: routing, middleware and handlers.
package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/time/rate"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/auth"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/clock"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/config"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/realtime"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

const (
	ctxRequestID = "request_id"
	ctxUser      = "user"
)

// Server wires dependencies into handlers.
type Server struct {
	cfg          config.Config
	store        *store.Store
	clock        clock.Clock
	signer       *auth.Signer
	states       *auth.StateSigner
	github       *auth.GitHub
	sessions     *app.Sessions
	workspace    *app.Workspace
	helper       *app.Helper
	hub          *realtime.Hub
	log          *slog.Logger
	signInLimit  *ipLimiter
	refreshLimit *ipLimiter
}

// Deps are the server's collaborators.
type Deps struct {
	Config    config.Config
	Store     *store.Store
	Clock     clock.Clock
	Signer    *auth.Signer
	States    *auth.StateSigner
	GitHub    *auth.GitHub
	Sessions  *app.Sessions
	Workspace *app.Workspace
	Helper    *app.Helper
	Hub       *realtime.Hub
	Log       *slog.Logger
}

// New builds a Server.
func New(d Deps) *Server {
	return &Server{
		cfg: d.Config, store: d.Store, clock: d.Clock, signer: d.Signer, states: d.States, github: d.GitHub,
		sessions: d.Sessions, workspace: d.Workspace, helper: d.Helper, hub: d.Hub, log: d.Log,
		// Sign-in is the brute-force target; refresh runs on every page load, so it gets more room.
		signInLimit:  newIPLimiter(perMinute(d.Config.AuthRatePerMinute), d.Config.AuthRatePerMinute),
		refreshLimit: newIPLimiter(perMinute(4*d.Config.AuthRatePerMinute), 4*d.Config.AuthRatePerMinute),
	}
}

// Handler returns the configured Gin engine.
func (s *Server) Handler() http.Handler {
	if s.cfg.Env == config.EnvProduction {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(gin.TestMode)
	}
	r := gin.New()
	r.HandleMethodNotAllowed = true
	r.ContextWithFallback = true
	_ = r.SetTrustedProxies(nil)
	r.Use(s.requestID, s.recoverer, s.accessLog, s.securityHeaders, s.cors, s.strictQuery)
	r.NoRoute(func(c *gin.Context) { s.fail(c, apperr.New(apperr.CodeNotFound, "Route not found.")) })
	r.NoMethod(func(c *gin.Context) {
		c.AbortWithStatusJSON(http.StatusMethodNotAllowed, errorBody{Error: errorPayload{Code: apperr.CodeBadRequest, Message: "Method not allowed."}})
	})

	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/readyz", s.ready)

	v1 := r.Group("/v1")
	a := v1.Group("/auth")
	signIn, session := s.limit(s.signInLimit), s.limit(s.refreshLimit)
	a.POST("/dev-login", signIn, s.devLogin)
	// Public certificate verification (no sign-in), rate-limited like sign-in.
	v1.GET("/certificates/:code", signIn, s.verifyCertificate)
	a.GET("/github/start", signIn, s.githubStart)
	a.GET("/github/callback", signIn, s.githubCallback)
	a.POST("/exchange", signIn, s.exchange)
	a.POST("/refresh", session, s.refresh)
	a.POST("/logout", session, s.logout)

	authed := v1.Group("", s.authenticate)
	authed.GET("/me", s.me)
	authed.GET("/me/tasks", s.myTasks)
	authed.GET("/me/threads", s.myThreads)
	authed.GET("/me/threads/:persona/messages", s.myMessages)
	authed.POST("/me/threads/:persona/messages", s.sendMessage)
	authed.POST("/me/threads/:persona/read", s.markRead)
	authed.POST("/tasks/:id/transitions", s.transition)
	authed.POST("/tasks/:id/quiz", s.submitQuiz)
	authed.GET("/me/wallet", s.myWallet)
	authed.GET("/me/progress", s.myProgress)
	authed.GET("/me/certificates", s.myCertificates)
	authed.GET("/me/ai/conversations", s.myAIConversations)
	authed.POST("/me/ai/conversations", s.askAI)
	authed.GET("/me/ai/conversations/:id", s.myAIConversation)
	authed.POST("/me/ai/conversations/:id/messages", s.followUpAI)

	admin := authed.Group("/admin", s.requireStaff)
	admin.GET("/students", s.students)
	admin.GET("/overview", s.overview)
	admin.GET("/colleges", s.listColleges)
	admin.POST("/colleges", s.createCollege)
	admin.GET("/programs", s.listPrograms)
	admin.GET("/cohorts", s.listCohorts)
	admin.POST("/cohorts", s.createCohort)
	admin.POST("/enrollments", s.enroll)
	admin.POST("/enrollments/import", s.importEnrollments)
	admin.POST("/enrollments/:id/status", s.setEnrollmentStatus)
	admin.GET("/staff", s.listStaff)
	admin.POST("/staff", s.grantStaff)
	admin.POST("/staff/:id/revoke", s.revokeStaff)
	admin.GET("/overview/export", s.overviewCSV)
	admin.GET("/enrollments/:id/tasks", s.enrollmentTasks)
	admin.POST("/enrollments/:id/tasks", s.createTask)
	admin.PUT("/enrollments/:id/flow", s.assignEnrollmentFlow)
	admin.GET("/enrollments/:id/wallet", s.staffWallet)
	admin.GET("/enrollments/:id/progress", s.staffProgress)
	admin.POST("/enrollments/:id/certificate", s.issueCertificate)
	admin.POST("/certificates/:code/revoke", s.revokeCertificate)
	admin.POST("/enrollments/:id/credits", s.grantCredits)
	admin.GET("/enrollments/:id/ai/conversations", s.staffAIConversations)
	admin.GET("/enrollments/:id/ai/conversations/:conversation", s.staffAIConversation)

	admin.GET("/personas", s.listPersonas)
	admin.POST("/personas", s.createPersona)
	admin.PATCH("/personas/:id", s.updatePersona)
	admin.GET("/task-templates", s.listTemplates)
	admin.POST("/task-templates", s.createTemplate)
	admin.PATCH("/task-templates/:id", s.updateTemplate)
	admin.GET("/flows", s.listFlows)
	admin.POST("/flows", s.createFlow)
	admin.GET("/flows/:id", s.getFlow)
	admin.PATCH("/flows/:id", s.updateFlow)
	admin.PUT("/flows/:id/draft", s.saveDraft)
	admin.POST("/flows/:id/publish", s.publishFlow)
	admin.POST("/flows/:id/duplicate", s.duplicateFlow)
	admin.POST("/flows/:id/assign", s.bulkAssign)

	admin.GET("/threads", s.staffThreads)
	admin.GET("/threads/:enrollment/:persona/messages", s.staffMessages)
	admin.POST("/threads/:enrollment/:persona/messages", s.staffSend)
	admin.POST("/threads/:enrollment/:persona/read", s.staffMarkRead)
	admin.POST("/broadcasts", s.broadcast)

	v1.GET("/ws", s.websocket)
	return r
}

func (s *Server) ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.Pool.Ping(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

// Middleware.

func (s *Server) requestID(c *gin.Context) {
	id := c.GetHeader("X-Request-Id")
	if len(id) == 0 || len(id) > 64 || strings.ContainsFunc(id, func(r rune) bool { return r < 0x21 || r > 0x7e }) {
		b := make([]byte, 8)
		_, _ = rand.Read(b)
		id = hex.EncodeToString(b)
	}
	c.Set(ctxRequestID, id)
	c.Header("X-Request-Id", id)
	c.Next()
}

func (s *Server) recoverer(c *gin.Context) {
	defer func() {
		if rec := recover(); rec != nil {
			if err, ok := rec.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(rec)
			}
			s.log.ErrorContext(c.Request.Context(), "panic", "panic", rec, "path", c.FullPath(), "request_id", c.GetString(ctxRequestID))
			s.fail(c, apperr.New(apperr.CodeInternal, "Something went wrong on our side."))
		}
	}()
	c.Next()
}

func (s *Server) accessLog(c *gin.Context) {
	start := time.Now()
	c.Next()
	s.log.InfoContext(c.Request.Context(), "request",
		"method", c.Request.Method, "route", c.FullPath(), "status", c.Writer.Status(),
		"ms", time.Since(start).Milliseconds(), "request_id", c.GetString(ctxRequestID))
}

func (s *Server) securityHeaders(c *gin.Context) {
	h := c.Writer.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Frame-Options", "DENY")
	h.Set("Cache-Control", "no-store")
	if s.cfg.CookieSecure {
		h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
	}
	c.Next()
}

func (s *Server) cors(c *gin.Context) {
	origin := c.GetHeader("Origin")
	if origin != "" && slices.Contains(s.cfg.AllowedOrigins, origin) {
		h := c.Writer.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Access-Control-Allow-Credentials", "true")
		h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Client, X-Request-Id")
		h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")
		h.Set("Access-Control-Max-Age", "600")
		h.Add("Vary", "Origin")
	}
	if c.Request.Method == http.MethodOptions {
		c.AbortWithStatus(http.StatusNoContent)
		return
	}
	c.Next()
}

// strictQuery rejects query strings that don't parse, instead of silently dropping parameters.
func (s *Server) strictQuery(c *gin.Context) {
	if len(c.Request.URL.RawQuery) > 4096 {
		s.fail(c, apperr.New(apperr.CodeBadRequest, "Query string is too long."))
		return
	}
	if _, err := url.ParseQuery(c.Request.URL.RawQuery); err != nil {
		s.fail(c, apperr.New(apperr.CodeBadRequest, "Malformed query string."))
		return
	}
	c.Next()
}

func (s *Server) limit(l *ipLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !l.allow(clientIP(c.Request, s.cfg.TrustedProxies)) {
			s.fail(c, &apperr.Error{Code: apperr.CodeRateLimited, Message: "Too many attempts. Try again in a minute.", RetryAfterSeconds: 60})
			return
		}
		c.Next()
	}
}

func perMinute(n int) rate.Limit { return rate.Limit(float64(max(n, 1)) / 60) }

func (s *Server) authenticate(c *gin.Context) {
	raw, ok := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
	if !ok || raw == "" {
		s.fail(c, apperr.New(apperr.CodeUnauthenticated, "Sign in to continue."))
		return
	}
	u, err := s.userFromToken(c.Request.Context(), raw)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.Set(ctxUser, u)
	c.Next()
}

func (s *Server) userFromToken(ctx context.Context, raw string) (domain.User, error) {
	id, err := s.signer.VerifyAccess(raw, s.clock.Now())
	if err != nil {
		return domain.User{}, apperr.New(apperr.CodeUnauthenticated, "Your session expired. Sign in again.")
	}
	// Load fresh on every request so role changes and removals apply immediately.
	u, err := store.GetUser(ctx, s.store.Pool, id)
	if errors.Is(err, store.ErrNotFound) {
		return domain.User{}, apperr.New(apperr.CodeUnauthenticated, "Your account no longer exists.")
	}
	return u, err
}

func (s *Server) requireStaff(c *gin.Context) {
	if !currentUser(c).Role.IsStaff() {
		s.fail(c, apperr.New(apperr.CodeForbidden, "Admins only."))
		return
	}
	c.Next()
}

func currentUser(c *gin.Context) domain.User {
	u, _ := c.Get(ctxUser)
	user, _ := u.(domain.User)
	return user
}

func pathUUID(c *gin.Context, key string) (uuid.UUID, error) {
	id, err := uuid.Parse(c.Param(key))
	if err != nil {
		return uuid.Nil, apperr.New(apperr.CodeNotFound, "Not found.")
	}
	return id, nil
}

// clientIP returns the caller's IP. X-Forwarded-For is honoured only when the direct peer is a
// trusted proxy, and then the right-most address that isn't itself a trusted proxy wins.
func clientIP(r *http.Request, trusted []netip.Prefix) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	isTrusted := func(raw string) bool {
		a, err := netip.ParseAddr(strings.TrimSpace(raw))
		if err != nil {
			return false
		}
		a = a.Unmap()
		for _, p := range trusted {
			if p.Contains(a) {
				return true
			}
		}
		return false
	}
	if !isTrusted(host) {
		return host
	}
	hops := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop := strings.TrimSpace(hops[i])
		if _, err := netip.ParseAddr(hop); err == nil && !isTrusted(hop) {
			return hop
		}
	}
	return host
}

// ipLimiter is a per-IP token bucket with idle eviction.
type ipLimiter struct {
	mu    sync.Mutex
	every rate.Limit
	burst int
	m     map[string]*limiterEntry
}

type limiterEntry struct {
	l    *rate.Limiter
	seen time.Time
}

func newIPLimiter(every rate.Limit, burst int) *ipLimiter {
	return &ipLimiter{every: every, burst: burst, m: map[string]*limiterEntry{}}
}

func (l *ipLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if len(l.m) > 10_000 {
		for k, e := range l.m {
			if now.Sub(e.seen) > 10*time.Minute {
				delete(l.m, k)
			}
		}
	}
	e, ok := l.m[ip]
	if !ok {
		e = &limiterEntry{l: rate.NewLimiter(l.every, l.burst)}
		l.m[ip] = e
	}
	e.seen = now
	return e.l.Allow()
}
