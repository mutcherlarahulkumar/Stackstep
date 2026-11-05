// Package config loads and validates process configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Env is the deployment environment.
type Env string

const (
	EnvDevelopment Env = "development"
	EnvTest        Env = "test"
	EnvProduction  Env = "production"
)

// Valid reports whether e is a known environment.
func (e Env) Valid() bool {
	switch e {
	case EnvDevelopment, EnvTest, EnvProduction:
		return true
	}
	return false
}

// Config is the fully validated process configuration.
type Config struct {
	Env               Env
	HTTPAddr          string
	DatabaseURL       string
	JWTSecret         []byte
	StateSecret       []byte
	WebBaseURL        *url.URL
	MobileRedirectURL *url.URL
	AllowedOrigins    []string
	TrustedProxies    []netip.Prefix
	// ProxySecret lets the web app's server-side proxy pass the visitor's IP (X-Client-IP)
	// for rate limiting. Empty disables it.
	ProxySecret          string
	CookieSecure         bool
	GitHubClientID       string
	GitHubClientSecret   string
	GitHubRedirectURL    string
	GitHubOAuthBaseURL   string
	GitHubAPIBaseURL     string
	BootstrapAdminLogins map[string]struct{}
	LeadReplyDelay       time.Duration
	AuthRatePerMinute    int
	DeliveryInterval     time.Duration
	AI                   AIConfig
}

// AIConfig is the student AI helper (Groq). Empty GroqAPIKey turns the helper off.
type AIConfig struct {
	GroqAPIKey       string
	GroqModel        string
	GroqBaseURL      string
	Timeout          time.Duration
	DailyQuestions   int           // per student per local day
	QuestionCooldown time.Duration // between new questions
	FollowUpCooldown time.Duration // time to try it yourself before a follow-up
	MaxFollowUps     int           // per conversation
	GlobalPerMinute  int           // all students together, to stay inside the provider's limits

	TeamLead          bool   // AI_TEAM_LEAD: auto-reply personas answer with the AI team lead
	ReviewDrafts      bool   // AI_REVIEW_DRAFTS: admins can ask for an AI review draft
	LeadPerMinute     int    // AI team lead replies per minute, all students together
	DraftsPerStaffDay int    // AI review drafts per staff member per UTC day
	GitHubToken       string // optional; raises GitHub's rate limit when review drafts read PR diffs
}

// Enabled reports whether the AI helper can answer.
func (a AIConfig) Enabled() bool { return a.GroqAPIKey != "" }

// TeamLeadEnabled reports whether auto-reply personas answer with the AI team lead.
func (a AIConfig) TeamLeadEnabled() bool { return a.Enabled() && a.TeamLead }

// ReviewDraftsEnabled reports whether admins can ask for AI review drafts.
func (a AIConfig) ReviewDraftsEnabled() bool { return a.Enabled() && a.ReviewDrafts }

// DevLoginEnabled is true only outside production.
func (c Config) DevLoginEnabled() bool { return c.Env != EnvProduction }

// GitHubEnabled is true when OAuth credentials are configured.
func (c Config) GitHubEnabled() bool { return c.GitHubClientID != "" && c.GitHubClientSecret != "" }

// Load reads configuration from the environment and fails on any invalid or missing value.
func Load() (Config, error) {
	var errs []error
	get := func(key, def string) string {
		if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
		return def
	}
	require := func(key string) string {
		v := get(key, "")
		if v == "" {
			errs = append(errs, fmt.Errorf("%s is required", key))
		}
		return v
	}
	parseURL := func(key, raw string) *url.URL {
		u, err := url.Parse(raw)
		if err != nil || u.Scheme == "" || u.Host == "" && u.Scheme != "stackstep" {
			errs = append(errs, fmt.Errorf("%s must be an absolute URL", key))
			return &url.URL{}
		}
		return u
	}
	parseDuration := func(key, def string, lo, hi time.Duration) time.Duration {
		d, err := time.ParseDuration(get(key, def))
		if err != nil || d < lo || d > hi {
			errs = append(errs, fmt.Errorf("%s must be a duration between %s and %s", key, lo, hi))
		}
		return d
	}

	cfg := Config{
		Env:                Env(get("APP_ENV", string(EnvDevelopment))),
		HTTPAddr:           get("HTTP_ADDR", ":8080"),
		DatabaseURL:        require("DATABASE_URL"),
		GitHubClientID:     get("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: get("GITHUB_CLIENT_SECRET", ""),
		GitHubRedirectURL:  get("GITHUB_REDIRECT_URL", "http://localhost:3000/api/v1/auth/github/callback"),
		GitHubOAuthBaseURL: get("GITHUB_OAUTH_BASE_URL", "https://github.com"),
		GitHubAPIBaseURL:   get("GITHUB_API_BASE_URL", "https://api.github.com"),
	}
	if !cfg.Env.Valid() {
		errs = append(errs, fmt.Errorf("APP_ENV must be development, test or production"))
	}

	secret := func(key string) []byte {
		v := get(key, "")
		if v == "" && cfg.Env != EnvProduction {
			v = "dev-only-" + strings.ToLower(key) + "-change-me-0123456789"
		}
		if len(v) < 32 {
			errs = append(errs, fmt.Errorf("%s must be at least 32 bytes", key))
		}
		return []byte(v)
	}
	cfg.JWTSecret = secret("JWT_SECRET")
	cfg.StateSecret = secret("OAUTH_STATE_SECRET")

	cfg.WebBaseURL = parseURL("WEB_BASE_URL", get("WEB_BASE_URL", "http://localhost:3000"))
	cfg.MobileRedirectURL = parseURL("MOBILE_REDIRECT_URL", get("MOBILE_REDIRECT_URL", "stackstep://auth"))
	cfg.CookieSecure = cfg.WebBaseURL.Scheme == "https"

	for _, o := range strings.Split(get("ALLOWED_ORIGINS", cfg.WebBaseURL.Scheme+"://"+cfg.WebBaseURL.Host), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}

	for _, raw := range strings.Split(get("TRUSTED_PROXIES", "127.0.0.1/32,::1/128"), ",") {
		if raw = strings.TrimSpace(raw); raw == "" {
			continue
		}
		pfx, err := netip.ParsePrefix(raw)
		if err != nil {
			errs = append(errs, fmt.Errorf("TRUSTED_PROXIES: %q is not a CIDR", raw))
			continue
		}
		cfg.TrustedProxies = append(cfg.TrustedProxies, pfx.Masked())
	}

	cfg.ProxySecret = get("PROXY_SHARED_SECRET", "")
	if cfg.ProxySecret != "" && len(cfg.ProxySecret) < 32 {
		errs = append(errs, errors.New("PROXY_SHARED_SECRET must be at least 32 bytes"))
	}

	cfg.BootstrapAdminLogins = map[string]struct{}{}
	for _, l := range strings.Split(get("BOOTSTRAP_ADMIN_GITHUB_LOGINS", ""), ",") {
		if l = strings.ToLower(strings.TrimSpace(l)); l != "" {
			cfg.BootstrapAdminLogins[l] = struct{}{}
		}
	}

	if n, err := strconv.Atoi(get("AUTH_RATE_PER_MINUTE", "30")); err != nil || n < 1 || n > 100000 {
		errs = append(errs, errors.New("AUTH_RATE_PER_MINUTE must be 1-100000"))
	} else {
		cfg.AuthRatePerMinute = n
	}

	cfg.LeadReplyDelay = parseDuration("LEAD_REPLY_DELAY", "45s", 0, 2*time.Hour)

	onOff := func(key, def string) bool {
		switch strings.ToLower(get(key, def)) {
		case "on", "true", "1", "yes":
			return true
		case "off", "false", "0", "no":
			return false
		}
		errs = append(errs, fmt.Errorf("%s must be on or off", key))
		return false
	}
	intIn := func(key, def string, lo, hi int) int {
		n, err := strconv.Atoi(get(key, def))
		if err != nil || n < lo || n > hi {
			errs = append(errs, fmt.Errorf("%s must be %d-%d", key, lo, hi))
		}
		return n
	}
	cfg.AI = AIConfig{
		GroqAPIKey:       get("GROQ_API_KEY", ""),
		GroqModel:        get("GROQ_MODEL", "llama-3.3-70b-versatile"),
		GroqBaseURL:      get("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
		Timeout:          parseDuration("AI_TIMEOUT", "25s", time.Second, time.Minute),
		DailyQuestions:   intIn("AI_DAILY_QUESTIONS", "8", 1, 200),
		QuestionCooldown: parseDuration("AI_QUESTION_COOLDOWN", "2m", 0, time.Hour),
		FollowUpCooldown: parseDuration("AI_FOLLOWUP_COOLDOWN", "5m", 0, 2*time.Hour),
		MaxFollowUps:     intIn("AI_MAX_FOLLOWUPS", "3", 0, 20),
		GlobalPerMinute:  intIn("AI_GLOBAL_PER_MINUTE", "30", 1, 10000),

		TeamLead:          onOff("AI_TEAM_LEAD", "on"),
		ReviewDrafts:      onOff("AI_REVIEW_DRAFTS", "on"),
		LeadPerMinute:     intIn("AI_LEAD_PER_MINUTE", "20", 1, 10000),
		DraftsPerStaffDay: intIn("AI_REVIEW_DRAFTS_PER_DAY", "60", 1, 10000),
		GitHubToken:       get("GITHUB_TOKEN", ""),
	}
	if u := parseURL("GROQ_BASE_URL", cfg.AI.GroqBaseURL); cfg.Env == EnvProduction && u.Scheme != "https" {
		errs = append(errs, errors.New("GROQ_BASE_URL must use https in production"))
	}
	cfg.DeliveryInterval = parseDuration("DELIVERY_INTERVAL", "1s", 100*time.Millisecond, time.Minute)

	if cfg.Env == EnvProduction && !cfg.GitHubEnabled() {
		errs = append(errs, errors.New("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required in production"))
	}
	if cfg.Env == EnvProduction && !cfg.CookieSecure {
		errs = append(errs, errors.New("WEB_BASE_URL must use https in production"))
	}
	if _, port, err := net.SplitHostPort(cfg.HTTPAddr); err != nil {
		errs = append(errs, errors.New("HTTP_ADDR must look like host:port or :port"))
	} else if p, err := strconv.Atoi(port); err != nil || p < 1 || p > 65535 {
		errs = append(errs, errors.New("HTTP_ADDR port must be 1-65535"))
	}
	return cfg, errors.Join(errs...)
}
