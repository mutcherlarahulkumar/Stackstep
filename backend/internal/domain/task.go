package domain

import (
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
)

// TaskType is the kind of work a task asks for.
type TaskType string

const (
	TaskFeature    TaskType = "feature"
	TaskBugFix     TaskType = "bug_fix"
	TaskDSA        TaskType = "dsa"
	TaskDocReading TaskType = "doc_reading"
	TaskQuiz       TaskType = "quiz"
	TaskGitChore   TaskType = "git_chore"
	TaskCodeReview TaskType = "code_review"
	TaskStandup    TaskType = "standup"
)

// AllTaskTypes lists every task type in display order.
var AllTaskTypes = []TaskType{TaskFeature, TaskBugFix, TaskDSA, TaskDocReading, TaskQuiz, TaskGitChore, TaskCodeReview, TaskStandup}

// Valid reports whether t is a known task type.
func (t TaskType) Valid() bool {
	for _, k := range AllTaskTypes {
		if k == t {
			return true
		}
	}
	return false
}

// Label is the human name used in chat copy.
func (t TaskType) Label() string {
	switch t {
	case TaskFeature:
		return "feature ticket"
	case TaskBugFix:
		return "bug fix"
	case TaskDSA:
		return "DSA problem"
	case TaskDocReading:
		return "doc reading"
	case TaskQuiz:
		return "quiz"
	case TaskGitChore:
		return "Git chore"
	case TaskCodeReview:
		return "code review"
	case TaskStandup:
		return "standup"
	}
	return "task"
}

// TaskStatus is a task's position on the board.
type TaskStatus string

const (
	StatusTodo             TaskStatus = "todo"
	StatusInProgress       TaskStatus = "in_progress"
	StatusInReview         TaskStatus = "in_review"
	StatusChangesRequested TaskStatus = "changes_requested"
	StatusDone             TaskStatus = "done"
	StatusCancelled        TaskStatus = "cancelled"
)

// AllTaskStatuses lists every status.
var AllTaskStatuses = []TaskStatus{StatusTodo, StatusInProgress, StatusInReview, StatusChangesRequested, StatusDone, StatusCancelled}

// Valid reports whether s is a known status.
func (s TaskStatus) Valid() bool {
	for _, k := range AllTaskStatuses {
		if k == s {
			return true
		}
	}
	return false
}

// Terminal is true for statuses that can never change again.
func (s TaskStatus) Terminal() bool { return s == StatusDone || s == StatusCancelled }

// Task is one unit of assigned work.
type Task struct {
	ID           uuid.UUID
	EnrollmentID uuid.UUID
	Type         TaskType
	Title        string
	Brief        string
	Status       TaskStatus
	ScheduledFor time.Time
	DueAt        time.Time
	CreatedBy    uuid.UUID
	Version      int
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Actor is who is attempting a transition, from the task's point of view.
type Actor string

const (
	ActorStudent Actor = "student"
	ActorStaff   Actor = "staff"
)

type edge struct {
	from, to TaskStatus
	by       Actor
}

// transitions is the complete, closed task graph. Anything not listed is rejected.
var transitions = map[edge]struct{}{
	{StatusTodo, StatusInProgress, ActorStudent}:             {},
	{StatusInProgress, StatusInReview, ActorStudent}:         {},
	{StatusChangesRequested, StatusInProgress, ActorStudent}: {},
	{StatusChangesRequested, StatusInReview, ActorStudent}:   {},
	{StatusInReview, StatusDone, ActorStaff}:                 {},
	{StatusInReview, StatusChangesRequested, ActorStaff}:     {},
	{StatusTodo, StatusCancelled, ActorStaff}:                {},
	{StatusInProgress, StatusCancelled, ActorStaff}:          {},
	{StatusInReview, StatusCancelled, ActorStaff}:            {},
	{StatusChangesRequested, StatusCancelled, ActorStaff}:    {},
}

// CanTransition reports whether actor may move a task from one status to another.
func CanTransition(from, to TaskStatus, by Actor) bool {
	_, ok := transitions[edge{from, to, by}]
	return ok
}

// NoteRequired is true when a transition must carry an explanatory note.
func NoteRequired(to TaskStatus) bool { return to == StatusChangesRequested }

// Bounds shared with clients (mirrored in web and mobile validators).
const (
	TitleMinLen           = 3
	TitleMaxLen           = 120
	BriefMaxLen           = 8000
	NoteMaxLen            = 2000
	MessageMaxLen         = 4000
	MaxStudentMsgsPerDay  = 200
	ScheduleBackdateGrace = 5 * time.Minute
	MinTaskDuration       = 15 * time.Minute
	SearchQueryMaxLen     = 100
)

// NewTaskInput is an admin's request to assign a task, before validation.
type NewTaskInput struct {
	Type         TaskType
	Title        string
	Brief        string
	ScheduledFor *time.Time
	DueAt        time.Time
}

// ValidatedTask is a NewTaskInput that passed every rule, with normalized values.
type ValidatedTask struct {
	Type         TaskType
	Title        string
	Brief        string
	ScheduledFor time.Time
	DueAt        time.Time
}

// ValidateNewTask checks a new task against the enrollment window and field bounds.
// It returns field → message for every failure, so clients can show all errors at once.
func ValidateNewTask(in NewTaskInput, e Enrollment, now time.Time) (ValidatedTask, map[string]string) {
	errs := map[string]string{}
	out := ValidatedTask{Type: in.Type, Title: NormalizeText(in.Title), Brief: strings.TrimSpace(in.Brief)}

	if !in.Type.Valid() {
		errs["type"] = "Choose a task type."
	}
	if msg := checkLine(out.Title, TitleMinLen, TitleMaxLen, "Title"); msg != "" {
		errs["title"] = msg
	}
	if utf8.RuneCountInString(out.Brief) > BriefMaxLen {
		errs["brief"] = "Brief can be at most 8000 characters."
	} else if hasBadControl(out.Brief, true) {
		errs["brief"] = "Brief contains characters that can't be displayed."
	}

	opens, closes := e.Window()
	if in.ScheduledFor == nil {
		out.ScheduledFor = maxTime(now, opens)
	} else {
		out.ScheduledFor = in.ScheduledFor.UTC()
	}
	switch {
	case out.ScheduledFor.Before(now.Add(-ScheduleBackdateGrace)):
		errs["scheduled_for"] = "Start time can't be in the past."
	case out.ScheduledFor.Before(opens):
		errs["scheduled_for"] = "Start time is before this internship begins."
	case !out.ScheduledFor.Before(closes):
		errs["scheduled_for"] = "Start time is after this internship ends."
	}

	out.DueAt = in.DueAt.UTC()
	switch {
	case in.DueAt.IsZero():
		errs["due_at"] = "Pick a due time."
	case out.DueAt.Before(out.ScheduledFor.Add(MinTaskDuration)):
		errs["due_at"] = "Due time must be at least 15 minutes after the start."
	case out.DueAt.After(closes):
		errs["due_at"] = "Due time is after this internship ends."
	}
	return out, errs
}

// ValidateNote checks a transition note.
func ValidateNote(note string, to TaskStatus) (string, string) {
	n := strings.TrimSpace(note)
	switch {
	case NoteRequired(to) && n == "":
		return n, "Tell the student what to change."
	case utf8.RuneCountInString(n) > NoteMaxLen:
		return n, "Note can be at most 2000 characters."
	case hasBadControl(n, true):
		return n, "Note contains characters that can't be displayed."
	}
	return n, ""
}

// ValidateMessage checks and normalizes a chat message body.
func ValidateMessage(body string) (string, string) {
	b := strings.TrimSpace(body)
	switch {
	case b == "":
		return b, "Write a message first."
	case utf8.RuneCountInString(b) > MessageMaxLen:
		return b, "Messages can be at most 4000 characters."
	case hasBadControl(b, true):
		return b, "Message contains characters that can't be displayed."
	}
	return b, ""
}

// NormalizeText trims and collapses internal whitespace runs to single spaces.
func NormalizeText(s string) string { return strings.Join(strings.Fields(s), " ") }

func checkLine(s string, minLen, maxLen int, label string) string {
	n := utf8.RuneCountInString(s)
	switch {
	case !utf8.ValidString(s):
		return label + " has invalid characters."
	case n == 0:
		return label + " is required."
	case n < minLen:
		return label + " must be at least 3 characters."
	case n > maxLen:
		return label + " can be at most 120 characters."
	case hasBadControl(s, false):
		return label + " contains characters that can't be displayed."
	}
	return ""
}

// hasBadControl reports control characters; newlines and tabs are allowed when multiline.
func hasBadControl(s string, multiline bool) bool {
	if !utf8.ValidString(s) {
		return true
	}
	for _, r := range s {
		if multiline && (r == '\n' || r == '\t' || r == '\r') {
			continue
		}
		if unicode.IsControl(r) || r == ' ' || r == ' ' {
			return true
		}
	}
	return false
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
