// Command api runs the Stackstep HTTP + WebSocket gateway.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // enrollment time zones work in minimal images

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/ai"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/auth"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/clock"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/config"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/db"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/httpapi"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/lead"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/realtime"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// version is set at build time with -ldflags "-X main.version=v1.2.3".
var version = "dev"

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}

	srv, hub, st, clk, err := build(cfg, pool, log)
	if err != nil {
		return err
	}
	go realtime.Listen(ctx, pool, hub, srv.EncodeEvent, log)
	go realtime.Deliver(ctx, st, clk, cfg.DeliveryInterval, log)

	httpSrv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.HTTPAddr, "env", cfg.Env, "version", version)
		errCh <- httpSrv.ListenAndServe()
	}()
	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return httpSrv.Shutdown(shutdownCtx)
}

func build(cfg config.Config, pool *pgxpool.Pool, log *slog.Logger) (*httpapi.Server, *realtime.Hub, *store.Store, clock.Clock, error) {
	signer, err := auth.NewSigner(cfg.JWTSecret)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	states, err := auth.NewStateSigner(cfg.StateSecret)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	clk := clock.System{}
	st := store.New(pool)
	hub := realtime.NewHub()
	gh := &auth.GitHub{
		ClientID: cfg.GitHubClientID, ClientSecret: cfg.GitHubClientSecret, RedirectURL: cfg.GitHubRedirectURL,
		OAuthBaseURL: cfg.GitHubOAuthBaseURL, APIBaseURL: cfg.GitHubAPIBaseURL,
		HTTP: &http.Client{Timeout: 10 * time.Second},
	}
	ws := &app.Workspace{Store: st, Clock: clk, Lead: lead.Scripted{Delay: cfg.LeadReplyDelay}, Log: log}
	groq := &ai.Groq{BaseURL: cfg.AI.GroqBaseURL, APIKey: cfg.AI.GroqAPIKey, Model: cfg.AI.GroqModel, MaxTokens: 700,
		HTTP: &http.Client{Timeout: cfg.AI.Timeout + 5*time.Second}}
	srv := httpapi.New(httpapi.Deps{
		Config: cfg, Store: st, Clock: clk, Signer: signer, States: states, GitHub: gh,
		Sessions:  &app.Sessions{Store: st, Clock: clk, Signer: signer, BootstrapAdmins: cfg.BootstrapAdminLogins},
		Workspace: ws, Helper: app.NewHelper(ws, groq, cfg.AI),
		Hub: hub, Log: log,
	})
	return srv, hub, st, clk, nil
}
