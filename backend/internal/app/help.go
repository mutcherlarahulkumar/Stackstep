package app

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/ai"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/help"
)

// Help bot bounds.
const (
	HelpQuestionMax = 500
	HelpTurnMax     = 1500
	HelpHistoryMax  = 6
)

// HelpAnswer is the help bot's reply and the guide topics it used.
type HelpAnswer struct {
	Answer string
	AI     bool // false when the guide's own words are returned
	Topics []help.Section
}

// AskHelp answers a question about using Stackstep from the student guide. With the AI
// configured the model writes the answer from the matching topics; otherwise (or if the model
// is busy) the best topic is returned as written. It never needs an account.
func (h *Helper) AskHelp(ctx context.Context, question string, history []ai.Message) (HelpAnswer, error) {
	q := strings.TrimSpace(question)
	switch n := utf8.RuneCountInString(q); {
	case !utf8.ValidString(question) || n == 0:
		return HelpAnswer{}, apperr.Validation(map[string]string{"question": "Ask a question first."})
	case n > HelpQuestionMax:
		return HelpAnswer{}, apperr.Validation(map[string]string{"question": "Keep your question under 500 characters."})
	}
	if len(history) > HelpHistoryMax {
		history = history[len(history)-HelpHistoryMax:]
	}
	clean := make([]ai.Message, 0, len(history))
	for _, m := range history {
		if (m.Role != "user" && m.Role != "assistant") || utf8.RuneCountInString(m.Content) > HelpTurnMax || strings.TrimSpace(m.Content) == "" {
			return HelpAnswer{}, apperr.Validation(map[string]string{"history": "The conversation couldn't be read. Start a new one."})
		}
		clean = append(clean, ai.Message{Role: m.Role, Content: m.Content})
	}
	// Follow-ups like "and on iPhone?" lean on the previous question for context.
	lookup := q
	for i := len(clean) - 1; i >= 0; i-- {
		if clean[i].Role == "user" {
			lookup = clean[i].Content + " " + q
			break
		}
	}
	topics := help.Search(q, 4)
	if len(topics) == 0 {
		topics = help.Search(lookup, 4)
	}
	out := HelpAnswer{Answer: help.Fallback(topics), Topics: topics}
	if !h.Limits.Enabled() || h.AI == nil || !h.limiter().Allow() {
		return out, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	c, err := h.AI.Complete(ctx, help.Messages(q, clean, topics))
	if err != nil || strings.TrimSpace(c.Text) == "" {
		if err != nil {
			h.Log.Warn("help bot", "err", err)
		}
		return out, nil
	}
	out.Answer, out.AI = strings.TrimSpace(c.Text), true
	return out, nil
}
