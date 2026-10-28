// Package ai talks to the language model behind the students' AI helper, the AI team lead and
// admins' review drafts. Reviews are still decided by an admin; a draft is only a suggestion.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Message is one chat turn sent to the model.
type Message struct {
	Role    string `json:"role"` // system, user or assistant
	Content string `json:"content"`
}

// Completion is the model's answer.
type Completion struct {
	Text      string
	TokensIn  int
	TokensOut int
}

// Provider answers a conversation.
type Provider interface {
	Complete(ctx context.Context, msgs []Message) (Completion, error)
}

var (
	// ErrNotConfigured means no API key is set; the helper is off.
	ErrNotConfigured = errors.New("ai: not configured")
	// ErrUnavailable covers timeouts, 5xx and malformed responses.
	ErrUnavailable = errors.New("ai: unavailable")
)

// RateLimitedError is the provider asking us to slow down.
type RateLimitedError struct{ RetryAfter time.Duration }

func (e *RateLimitedError) Error() string {
	return "ai: rate limited, retry after " + e.RetryAfter.String()
}

// Groq calls Groq's OpenAI-compatible chat completions API.
type Groq struct {
	BaseURL   string // e.g. https://api.groq.com/openai/v1
	APIKey    string
	Model     string // e.g. llama-3.3-70b-versatile
	MaxTokens int
	HTTP      *http.Client
}

type chatRequest struct {
	Model          string          `json:"model"`
	Messages       []Message       `json:"messages"`
	MaxTokens      int             `json:"max_tokens"`
	Temperature    float64         `json:"temperature"`
	ResponseFormat *responseFormat `json:"response_format,omitempty"`
}

type responseFormat struct {
	Type string `json:"type"`
}

// JSONProvider can ask the model for a single JSON object.
type JSONProvider interface {
	CompleteJSON(ctx context.Context, msgs []Message) (Completion, error)
}

// CompleteJSON asks for a JSON object answer (Groq's JSON mode). The caller still validates it.
func (g *Groq) CompleteJSON(ctx context.Context, msgs []Message) (Completion, error) {
	return g.complete(ctx, msgs, &responseFormat{Type: "json_object"})
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

// Complete sends the conversation and returns the first choice.
func (g *Groq) Complete(ctx context.Context, msgs []Message) (Completion, error) {
	return g.complete(ctx, msgs, nil)
}

func (g *Groq) complete(ctx context.Context, msgs []Message, format *responseFormat) (Completion, error) {
	if g == nil || g.APIKey == "" {
		return Completion{}, ErrNotConfigured
	}
	body, err := json.Marshal(chatRequest{Model: g.Model, Messages: msgs, MaxTokens: g.MaxTokens, Temperature: 0.3, ResponseFormat: format})
	if err != nil {
		return Completion{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(g.BaseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return Completion{}, err
	}
	req.Header.Set("Authorization", "Bearer "+g.APIKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := g.HTTP.Do(req)
	if err != nil {
		return Completion{}, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return Completion{}, fmt.Errorf("%w: read: %w", ErrUnavailable, err)
	}
	switch {
	case res.StatusCode == http.StatusTooManyRequests:
		retry := 30 * time.Second
		if s, err := strconv.Atoi(res.Header.Get("Retry-After")); err == nil && s > 0 && s < 3600 {
			retry = time.Duration(s) * time.Second
		}
		return Completion{}, &RateLimitedError{RetryAfter: retry}
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		return Completion{}, fmt.Errorf("%w: provider rejected the API key (%d)", ErrNotConfigured, res.StatusCode)
	case res.StatusCode != http.StatusOK:
		return Completion{}, fmt.Errorf("%w: status %d", ErrUnavailable, res.StatusCode)
	}
	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil || len(out.Choices) == 0 {
		return Completion{}, fmt.Errorf("%w: bad response", ErrUnavailable)
	}
	text := strings.TrimSpace(out.Choices[0].Message.Content)
	if text == "" {
		return Completion{}, fmt.Errorf("%w: empty answer", ErrUnavailable)
	}
	return Completion{Text: text, TokensIn: out.Usage.PromptTokens, TokensOut: out.Usage.CompletionTokens}, nil
}
