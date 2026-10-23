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
