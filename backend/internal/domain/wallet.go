package domain

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// BasePoints is what finishing a task of each type is worth.
func (t TaskType) BasePoints() int {
	switch t {
	case TaskFeature:
		return 20
	case TaskBugFix, TaskDSA, TaskBlog:
		return 15
	case TaskCodeReview, TaskQuiz:
		return 10
	case TaskGitChore, TaskDocReading:
		return 5
	case TaskStandup:
		return 2
	}
	return 0
}

// OnTimeBonusPercent is added when the work was handed in (or finished) by the due time.
const OnTimeBonusPercent = 25

// TaskPoints is the award for a finished task. Quizzes scale with the best score.
func TaskPoints(t Task, quizBest int, onTime bool) int {
	p := t.Type.BasePoints()
	if t.Type == TaskQuiz {
		p = p * max(0, min(100, quizBest)) / 100
	}
	if onTime {
		p += p * OnTimeBonusPercent / 100
	}
	return p
}

// OnTime: the first hand-in (or, without one, the finish) happened by the due time.
func OnTime(t Task, firstSubmittedAt *time.Time, finishedAt time.Time) bool {
	at := finishedAt
	if firstSubmittedAt != nil {
		at = *firstSubmittedAt
	}
	return !at.After(t.DueAt)
}

// CreditReason explains a credit ledger row.
type CreditReason string

const (
	CreditWelcome     CreditReason = "welcome"
	CreditTaskDone    CreditReason = "task_done"
	CreditAdminGrant  CreditReason = "admin_grant"
	CreditAdminRevoke CreditReason = "admin_revoke"
	CreditAIQuestion  CreditReason = "ai_question"
	CreditAIRefund    CreditReason = "ai_refund"
)

// AllCreditReasons lists every reason.
var AllCreditReasons = []CreditReason{CreditWelcome, CreditTaskDone, CreditAdminGrant, CreditAdminRevoke, CreditAIQuestion, CreditAIRefund}

// Valid reports whether r is a known reason.
func (r CreditReason) Valid() bool {
	for _, k := range AllCreditReasons {
		if k == r {
			return true
		}
	}
	return false
}

// Credit rules (mirrored in clients).
const (
	WelcomeCredits     = 20
	CreditsPerTaskDone = 1
	CreditsPerQuestion = 1
	MaxCreditGrant     = 100
	CreditNoteMax      = 300
)

// ValidateCreditGrant checks an admin's manual change to a student's credits.
func ValidateCreditGrant(delta int, note string, balance int) (string, map[string]string) {
	errs := map[string]string{}
	n := NormalizeText(note)
	switch {
	case delta == 0 || delta > MaxCreditGrant || delta < -MaxCreditGrant:
		errs["delta"] = fmt.Sprintf("Change credits by 1 to %d (or -1 to -%d).", MaxCreditGrant, MaxCreditGrant)
	case delta < 0 && balance+delta < 0:
		errs["delta"] = fmt.Sprintf("They only have %d credits.", balance)
	}
	switch {
	case n == "":
		errs["note"] = "Say why, so the student understands the change."
	case utf8.RuneCountInString(n) > CreditNoteMax:
		errs["note"] = fmt.Sprintf("Keep the reason under %d characters.", CreditNoteMax)
	case hasBadControl(n, false):
		errs["note"] = "Reason contains characters that can't be displayed."
	}
	return n, errs
}

// AIQuestion is a student's first message: the whole problem, explained in one go.
type AIQuestion struct {
	Goal  string // what they're trying to do
	Tried string // what they've tried so far
	Error string // what happens instead (error, output) — optional
	Code  string // the relevant code — optional
}

// AIFollowUp is a later message in the same conversation.
type AIFollowUp struct {
	TriedSince string // what they tried after the last answer
	Body       string // the follow-up question
}

// Bounds for AI help (mirrored in clients).
const (
	AIGoalMin       = 20
	AIGoalMax       = 1000
	AITriedMin      = 30
	AITriedMax      = 2000
	AIErrorMax      = 2000
	AICodeMax       = 4000
	AIFollowUpMin   = 10
	AIFollowUpMax   = 1500
	AITriedSinceMin = 20
	AITitleMax      = 80
)

func multiline(s string, label string, minLen, maxLen int, key string, errs map[string]string) string {
	v := strings.TrimSpace(s)
	n := utf8.RuneCountInString(v)
	switch {
	case minLen > 0 && n < minLen:
		errs[key] = fmt.Sprintf("%s needs at least %d characters.", label, minLen)
	case n > maxLen:
		errs[key] = fmt.Sprintf("%s can be at most %d characters.", label, maxLen)
	case hasBadControl(v, true):
		errs[key] = label + " contains characters that can't be displayed."
	}
	return v
}

// ValidateAIQuestion checks the structured question. The minimums push students to
// explain the problem fully up front instead of firing off one-line prompts.
func ValidateAIQuestion(q AIQuestion) (AIQuestion, map[string]string) {
	errs := map[string]string{}
	out := AIQuestion{
		Goal:  multiline(q.Goal, "What you're trying to do", AIGoalMin, AIGoalMax, "goal", errs),
		Tried: multiline(q.Tried, "What you've tried", AITriedMin, AITriedMax, "tried", errs),
		Error: multiline(q.Error, "What happens", 0, AIErrorMax, "error", errs),
		Code:  multiline(q.Code, "Code", 0, AICodeMax, "code", errs),
	}
	return out, errs
}

// ValidateAIFollowUp checks a follow-up: it must say what was tried since the last answer.
func ValidateAIFollowUp(f AIFollowUp) (AIFollowUp, map[string]string) {
	errs := map[string]string{}
	out := AIFollowUp{
		TriedSince: multiline(f.TriedSince, "What you tried since", AITriedSinceMin, AITriedMax, "tried_since", errs),
		Body:       multiline(f.Body, "Your question", AIFollowUpMin, AIFollowUpMax, "body", errs),
	}
	return out, errs
}

// Prompt renders the question as the message the model reads (and the student sees).
func (q AIQuestion) Prompt() string {
	var b strings.Builder
	b.WriteString("**What I'm trying to do**\n" + q.Goal + "\n\n**What I've tried**\n" + q.Tried)
	if q.Error != "" {
		b.WriteString("\n\n**What happens instead**\n" + q.Error)
	}
	if q.Code != "" {
		b.WriteString("\n\n**Code**\n```\n" + strings.ReplaceAll(q.Code, "```", "'''") + "\n```")
	}
	return b.String()
}

// Prompt renders a follow-up.
func (f AIFollowUp) Prompt() string {
	return "**What I tried since your last answer**\n" + f.TriedSince + "\n\n**My follow-up question**\n" + f.Body
}

// Title is the conversation's name in the list.
func (q AIQuestion) Title() string {
	t := NormalizeText(q.Goal)
	if utf8.RuneCountInString(t) <= AITitleMax {
		return t
	}
	return string([]rune(t)[:AITitleMax-1]) + "…"
}
