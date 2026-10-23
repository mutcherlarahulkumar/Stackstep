package domain

import (
	"strings"
	"testing"
	"time"
)

func TestTaskPoints(t *testing.T) {
	due := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	task := Task{Type: TaskFeature, DueAt: due}
	if p := TaskPoints(task, 0, true); p != 25 {
		t.Fatalf("on-time feature = %d", p)
	}
	if p := TaskPoints(task, 0, false); p != 20 {
		t.Fatalf("late feature = %d", p)
	}
	if p := TaskPoints(Task{Type: TaskQuiz}, 70, true); p != 8 { // 10*70% = 7, +25% = 8
		t.Fatalf("quiz = %d", p)
	}
	early := due.Add(-time.Hour)
	if !OnTime(task, &early, due.Add(48*time.Hour)) {
		t.Fatal("a hand-in before the due time is on time, however late the review")
	}
	if OnTime(task, nil, due.Add(time.Minute)) {
		t.Fatal("finishing after due without a hand-in is late")
	}
	for _, typ := range AllTaskTypes {
		if typ.BasePoints() <= 0 {
			t.Fatalf("%s has no points", typ)
		}
	}
}

func TestValidateCreditGrant(t *testing.T) {
	if _, e := ValidateCreditGrant(5, "  Helped   a teammate ", 0); len(e) > 0 {
		t.Fatalf("valid grant: %v", e)
	}
	if _, e := ValidateCreditGrant(0, "x", 10); e["delta"] == "" {
		t.Fatal("zero accepted")
	}
	if _, e := ValidateCreditGrant(-11, "x", 10); e["delta"] == "" {
		t.Fatal("negative balance allowed")
	}
	if _, e := ValidateCreditGrant(3, "", 10); e["note"] == "" {
		t.Fatal("missing reason accepted")
	}
}

func TestAIQuestion(t *testing.T) {
	q, e := ValidateAIQuestion(AIQuestion{Goal: "  Render the list after filtering  ", Tried: "Used Array.filter and logged the result, it looks right.", Code: "x```y"})
	if len(e) > 0 {
		t.Fatalf("valid question: %v", e)
	}
	p := q.Prompt()
	if !strings.Contains(p, "**What I've tried**") || strings.Contains(p, "x```y") || strings.Contains(p, "What happens instead") {
		t.Fatalf("prompt = %q", p)
	}
	if _, e := ValidateAIQuestion(AIQuestion{Goal: "help", Tried: "nothing"}); e["goal"] == "" || e["tried"] == "" {
		t.Fatalf("one-liners accepted: %v", e)
	}
	long := AIQuestion{Goal: strings.Repeat("g", 200), Tried: strings.Repeat("t", 40)}
	if r := []rune(long.Title()); len(r) != AITitleMax {
		t.Fatalf("title length %d", len(r))
	}
	if _, e := ValidateAIFollowUp(AIFollowUp{Body: "Why?"}); e["tried_since"] == "" || e["body"] == "" {
		t.Fatalf("lazy follow-up accepted: %v", e)
	}
}
