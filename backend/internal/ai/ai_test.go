package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func groq(t *testing.T, h http.HandlerFunc) *Groq {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &Groq{BaseURL: srv.URL, APIKey: "k", Model: "m", MaxTokens: 100, HTTP: srv.Client()}
}

func TestGroqComplete(t *testing.T) {
	g := groq(t, func(w http.ResponseWriter, r *http.Request) {
		var req chatRequest
		if r.URL.Path != "/chat/completions" || r.Header.Get("Authorization") != "Bearer k" || json.NewDecoder(r.Body).Decode(&req) != nil || req.Model != "m" {
			http.Error(w, "bad", 400)
			return
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":" **Hints** "}}],"usage":{"prompt_tokens":7,"completion_tokens":3}}`))
	})
	out, err := g.Complete(context.Background(), []Message{{Role: "user", Content: "hi"}})
	if err != nil || out.Text != "**Hints**" || out.TokensIn != 7 || out.TokensOut != 3 {
		t.Fatalf("complete = %+v, %v", out, err)
	}
}

func TestGroqErrors(t *testing.T) {
	cases := map[string]struct {
		h    http.HandlerFunc
		want func(error) bool
	}{
		"rate limited": {func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Retry-After", "12")
			w.WriteHeader(429)
		}, func(err error) bool {
			var rl *RateLimitedError
			return errors.As(err, &rl) && rl.RetryAfter == 12*time.Second
		}},
		"bad key":     {func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(401) }, func(err error) bool { return errors.Is(err, ErrNotConfigured) }},
		"server down": {func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(502) }, func(err error) bool { return errors.Is(err, ErrUnavailable) }},
		"no choices": {func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"choices":[]}`)) }, func(err error) bool {
			return errors.Is(err, ErrUnavailable)
		}},
		"empty answer": {func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"  "}}]}`))
		}, func(err error) bool { return errors.Is(err, ErrUnavailable) }},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := groq(t, c.h).Complete(context.Background(), nil)
			if !c.want(err) {
				t.Fatalf("err = %v", err)
			}
		})
	}
	var off *Groq
	if _, err := off.Complete(context.Background(), nil); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("nil provider: %v", err)
	}
}

func TestBuild(t *testing.T) {
	hist := make([]Message, 12)
	for i := range hist {
		hist[i] = Message{Role: "user", Content: "m"}
	}
	msgs := Build(&TaskContext{Type: "feature ticket", Title: "Filters", Brief: strings.Repeat("b", 3000)}, hist)
	if msgs[0].Content != SystemPrompt || msgs[1].Role != "system" || !strings.Contains(msgs[1].Content, "Filters") || len([]rune(msgs[1].Content)) > 1700 {
		t.Fatalf("context = %+v", msgs[:2])
	}
	if len(msgs) != 2+8 {
		t.Fatalf("history not trimmed: %d", len(msgs))
	}
	for _, rule := range []string{"Never write the", "quiz answers", "ignore these rules", "Asking tip"} {
		if !strings.Contains(SystemPrompt, rule) {
			t.Fatalf("system prompt lost %q", rule)
		}
	}
}
