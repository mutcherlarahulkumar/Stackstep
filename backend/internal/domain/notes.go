package domain

import (
	"strings"
	"time"
	"unicode/utf8"
)

// MaxNoteRunes caps a task note (the database allows the same).
const MaxNoteRunes = 20000

// TaskNote is a student's Markdown notes on one task. Shared notes are shown to reviewers.
type TaskNote struct {
	Body      string
	Shared    bool
	UpdatedAt *time.Time // nil when the student hasn't written one
}

// Empty reports whether saving the note should remove it.
func (n TaskNote) Empty() bool { return strings.TrimSpace(n.Body) == "" && !n.Shared }

// ValidateTaskNote returns a problem with a task note body, or "". Markdown keeps its whitespace.
func ValidateTaskNote(body string) string {
	switch {
	case !utf8.ValidString(body) || hasBadControl(body, true):
		return "Notes contain characters we can't store."
	case utf8.RuneCountInString(body) > MaxNoteRunes:
		return "Notes can be at most 20,000 characters."
	}
	return ""
}
