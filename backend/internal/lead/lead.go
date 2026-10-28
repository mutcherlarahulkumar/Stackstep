// Package lead is the team lead persona's automatic replies. LLM answers with a language model
// (feature 8); Scripted is the deterministic lead it falls back to, and the lead without AI.
package lead

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// Input is everything the lead may see when replying. It never includes other students' data.
type Input struct {
	StudentName  string
	PersonaName  string
	PersonaTitle string
	Message      string
	DayNumber    int
	ProgramDays  int
	OpenTasks    []domain.Task // visible, non-terminal tasks, earliest due first
	History      []Turn        // earlier messages in this conversation, oldest first
}

// Turn is one earlier message in the conversation.
type Turn struct {
	FromLead bool
	Body     string
}

// Reply is what the lead will say, and after how long.
type Reply struct {
	Body  string
	Delay time.Duration
}

// Agent produces the lead's reply to a student message.
type Agent interface {
	Reply(ctx context.Context, in Input) (Reply, error)
}

// Scripted is a rule-based lead with a fixed reply delay.
type Scripted struct{ Delay time.Duration }

type intent int

const (
	intentGreeting intent = iota + 1
	intentSubmitted
	intentStuck
	intentBlocked
	intentThanks
	intentOther
)

func classify(msg string) intent {
	m := strings.ToLower(msg)
	has := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(m, w) {
				return true
			}
		}
		return false
	}
	switch {
	case has("pr ready", "ready for review", "check my pr", "pushed", "opened the pr", "opened a pr", "done with"):
		return intentSubmitted
	case has("blocked", "blocker", "can't install", "cannot install", "error:", "doesn't run", "won't run"):
		return intentBlocked
	case has("stuck", "help", "how do i", "how to", "confused", "don't understand", "dont understand"):
		return intentStuck
	case has("thank", "thanks", "thx"):
		return intentThanks
	case isGreeting(m):
		return intentGreeting
	}
	return intentOther
}

// isGreeting matches on the first word only, so "this" or "which" never reads as "hi".
func isGreeting(m string) bool {
	words := strings.FieldsFunc(m, func(r rune) bool { return !unicode.IsLetter(r) })
	if len(words) == 0 {
		return false
	}
	switch words[0] {
	case "hi", "hello", "hey", "morning", "gm", "namaste":
		return true
	case "good":
		return len(words) > 1 && (words[1] == "morning" || words[1] == "afternoon" || words[1] == "evening")
	}
	return false
}

// Reply implements Agent.
func (s Scripted) Reply(_ context.Context, in Input) (Reply, error) {
	first := firstName(in.StudentName)
	var focus string
	if len(in.OpenTasks) > 0 {
		t := in.OpenTasks[0]
		focus = fmt.Sprintf("“%s”", t.Title)
	}

	var body string
	switch classify(in.Message) {
	case intentSubmitted:
		body = "Thanks, " + first + ". I'll review it shortly. While you wait, read through your own diff once more and check the PR description says what changed and why."
	case intentBlocked:
		body = "Let's unblock you. Paste the exact command you ran and the full error output, and tell me your OS. Don't trim the error — the useful line is often near the top."
	case intentStuck:
		if focus != "" {
			body = "Good question. For " + focus + ", break it into the smallest step you can test. What have you tried so far, and what did you expect to happen?"
		} else {
			body = "Good question. What have you tried so far, and what did you expect to happen? Share the snippet you're working on."
		}
	case intentThanks:
		body = "Anytime. Keep the momentum going."
	case intentGreeting:
		switch {
		case focus != "":
			body = fmt.Sprintf("Hi %s. Quick standup: what did you finish yesterday, and anything blocking %s today?", first, focus)
		default:
			body = fmt.Sprintf("Hi %s. Nothing on your board right now — I'll drop the next ticket in here as soon as it's ready.", first)
		}
	default:
		switch {
		case focus != "":
			body = "Noted. Your top priority is " + focus + ". Ping me with “PR ready for review” when it's up."
		default:
			body = "Noted. I'll post your next ticket here when it's ready."
		}
	}
	return Reply{Body: body, Delay: s.Delay}, nil
}

func firstName(name string) string {
	f := strings.Fields(name)
	if len(f) == 0 {
		return "there"
	}
	return f[0]
}

// AnnounceTask is the lead's chat message when a task lands on the board.
func AnnounceTask(t domain.Task, loc *time.Location) string {
	due := t.DueAt.In(loc).Format("Mon 2 Jan, 3:04 PM")
	return fmt.Sprintf("New %s on your board: “%s”. Due %s. Read the brief on the card before you start.", t.Type.Label(), t.Title, due)
}

// AnnounceTransition is the lead's chat message after a reviewer acts, or "" for no message.
func AnnounceTransition(t domain.Task, to domain.TaskStatus, note string) string {
	switch to {
	case domain.StatusDone:
		return fmt.Sprintf("Approved: “%s”. Nice work — merge it and move on to the next card.", t.Title)
	case domain.StatusChangesRequested:
		return fmt.Sprintf("Changes requested on “%s”:\n\n%s\n\nPush fixes to the same branch and move the card back to review.", t.Title, note)
	case domain.StatusCancelled:
		return fmt.Sprintf("I've taken “%s” off your board. No action needed.", t.Title)
	default: // student-driven moves need no announcement
		return ""
	}
}

// ReplyDelay is how long the scripted lead waits before replying.
func (s Scripted) ReplyDelay() time.Duration { return s.Delay }

// Delayer is implemented by agents with a fixed reply delay.
type Delayer interface{ ReplyDelay() time.Duration }

// HandInMessage is the student's note in the assigner's chat when they move a task, so the
// hand-in and the conversation about it live in one place. "" means no message.
func HandInMessage(t domain.Task, from, to domain.TaskStatus, sub *domain.Submission, quizScore *int) string {
	var head string
	switch {
	case quizScore != nil:
		return fmt.Sprintf("Finished the quiz “%s”: %d%%.", t.Title, *quizScore)
	case to == domain.StatusInReview && from == domain.StatusChangesRequested:
		head = fmt.Sprintf("Pushed the fixes and resubmitted “%s” for review.", t.Title)
	case to == domain.StatusInReview:
		head = fmt.Sprintf("Sent “%s” for review.", t.Title)
	case to == domain.StatusDone:
		head = fmt.Sprintf("Done with “%s”.", t.Title)
	default:
		return ""
	}
	if sub != nil && sub.URL != "" {
		head += "\n" + sub.URL
	}
	if sub != nil && sub.Note != "" {
		head += "\n\n" + sub.Note
	}
	return head
}

// reflection questions keep finished work from being a dead end; one is picked per task so
// a retry never changes it.
var reflection = []string{
	"Quick one: what was the trickiest part?",
	"What would you do differently if you started it again?",
	"What's one thing you learned that you'd tell a teammate?",
	"How long did it take compared to what you expected?",
	"Anything you'd still improve if you had another hour?",
}

func pick(t domain.Task, n int) int {
	h := 0
	for _, b := range t.ID {
		h = (h*31 + int(b)) % 1_000_003
	}
	return h % n
}

// Acknowledge is the assigner's short reply to a hand-in: an "ok" for reviews, and a nudge
// plus one reflection question for finished work. "" means no reply.
func Acknowledge(t domain.Task, to domain.TaskStatus, studentName string, quizScore *int) string {
	first := firstName(studentName)
	switch {
	case quizScore != nil && *quizScore >= 80:
		return fmt.Sprintf("Solid, %s — %d%% on “%s”. %s", first, *quizScore, t.Title, reflection[pick(t, len(reflection))])
	case quizScore != nil:
		return fmt.Sprintf("Thanks for finishing “%s”, %s. Open the card to see the answer key, and ask here about anything that still doesn't click.", t.Title, first)
	case to == domain.StatusInReview:
		return fmt.Sprintf("Got it, %s 👍 I'll review “%s” and reply right here. Meanwhile, pick up your next card.", first, t.Title)
	case to == domain.StatusDone:
		return fmt.Sprintf("Nice work on “%s”, %s! 🎉 %s", t.Title, first, reflection[pick(t, len(reflection))])
	}
	return ""
}
