package lead

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

func TestScriptedReplies(t *testing.T) {
	task := domain.Task{Title: "Add filtering", Type: domain.TaskFeature}
	cases := []struct {
		msg   string
		tasks []domain.Task
		want  string
	}{
		{"PR ready for review", nil, "review it shortly"},
		{"I'm blocked, npm error: EACCES", nil, "unblock"},
		{"how do i use useEffect?", []domain.Task{task}, "Add filtering"},
		{"how do i use useEffect?", nil, "What have you tried"},
		{"good morning!", []domain.Task{task}, "standup"},
		{"hello", nil, "Nothing on your board"},
		{"thanks!", nil, "Anytime"},
		{"random words", []domain.Task{task}, "top priority"},
		{"random words", nil, "next ticket"},
		{"this is which thing", nil, "next ticket"},
		{"Good evening", nil, "Nothing on your board"},
	}
	s := Scripted{Delay: 3 * time.Second}
	for _, tc := range cases {
		r, err := s.Reply(context.Background(), Input{StudentName: "Asha Rao", Message: tc.msg, OpenTasks: tc.tasks})
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(r.Body, tc.want) {
			t.Errorf("%q → %q, want it to contain %q", tc.msg, r.Body, tc.want)
		}
		if r.Delay != 3*time.Second {
			t.Errorf("delay = %v", r.Delay)
		}
		if len([]rune(r.Body)) > domain.MessageMaxLen {
			t.Errorf("reply too long")
		}
	}
}

func TestFirstName(t *testing.T) {
	if firstName("  ") != "there" || firstName("Asha Rao") != "Asha" {
		t.Fatal("firstName")
	}
}

func TestHandInAndAcknowledge(t *testing.T) {
	task := domain.Task{ID: [16]byte{1, 2, 3}, Title: "Build the navbar"}
	sub := &domain.Submission{URL: "https://github.com/a/b/pull/1", Note: "Kept it accessible."}
	if got := HandInMessage(task, domain.StatusInProgress, domain.StatusInReview, sub, nil); got != "Sent “Build the navbar” for review.\nhttps://github.com/a/b/pull/1\n\nKept it accessible." {
		t.Fatalf("review hand-in = %q", got)
	}
	if got := HandInMessage(task, domain.StatusChangesRequested, domain.StatusInReview, nil, nil); !strings.HasPrefix(got, "Pushed the fixes") {
		t.Fatalf("resubmit = %q", got)
	}
	if got := HandInMessage(task, domain.StatusTodo, domain.StatusInProgress, nil, nil); got != "" {
		t.Fatalf("starting a task should be silent, got %q", got)
	}
	score := 90
	if got := HandInMessage(task, domain.StatusInProgress, domain.StatusDone, nil, &score); got != "Finished the quiz “Build the navbar” with 90%." {
		t.Fatalf("quiz = %q", got)
	}
	done := Acknowledge(task, domain.StatusDone, "Asha Rao", nil)
	if !strings.Contains(done, "Nice work") || !strings.Contains(done, "Asha") || done != Acknowledge(task, domain.StatusDone, "Asha Rao", nil) {
		t.Fatalf("done ack = %q (must be stable)", done)
	}
	if got := Acknowledge(task, domain.StatusInReview, "Asha Rao", nil); !strings.Contains(got, "I'll review") {
		t.Fatalf("review ack = %q", got)
	}
	low := 40
	if got := Acknowledge(task, domain.StatusDone, "Asha", &low); !strings.Contains(got, "answer key") {
		t.Fatalf("low quiz ack = %q", got)
	}
}
