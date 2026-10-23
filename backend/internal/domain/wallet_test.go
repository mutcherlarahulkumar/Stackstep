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

func TestCertificateCode(t *testing.T) {
	seen := map[string]bool{}
	for range 2000 {
		c := NewCertificateCode()
		if !ValidCertificateCode(c) || seen[c] {
			t.Fatalf("bad or repeated code %q", c)
		}
		seen[c] = true
	}
	for _, bad := range []string{"", "ABC", "ABCDEFGHJKM0", "abcdefghjkmn", "ABCDEFGHJKMNP"} {
		if ValidCertificateCode(bad) {
			t.Fatalf("%q accepted", bad)
		}
	}
	p := Progress{Released: 10, Done: 7}
	if p.CompletionPercent() != 70 || !p.MeetsBar() || (Progress{}).MeetsBar() {
		t.Fatalf("bar = %+v", p)
	}
}

func TestNormalizeCertificateCode(t *testing.T) {
	for in, want := range map[string]string{"abcd-efgh-jk23": "ABCDEFGHJK23", " 2345 6789 abcd ": "23456789ABCD", "ABCDEFGHJK23": "ABCDEFGHJK23"} {
		if got := NormalizeCertificateCode(in); got != want {
			t.Errorf("NormalizeCertificateCode(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestInactive(t *testing.T) {
	start := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	e := Enrollment{Status: EnrollmentActive, Timezone: "UTC", StartDate: start, EndDate: start.AddDate(0, 0, 29), Program: Program{Days: 30}}
	day := func(d, h int) time.Time { return start.AddDate(0, 0, d).Add(time.Duration(h) * time.Hour) }
	last := day(3, 9)
	cases := []struct {
		name string
		e    Enrollment
		last *time.Time
		now  time.Time
		want bool
	}{
		{"before start", e, nil, start.Add(-time.Hour), false},
		{"first day, no activity yet", e, nil, day(1, 0), false},
		{"two days in, never active", e, nil, day(2, 1), true},
		{"active recently", e, &last, day(4, 0), false},
		{"quiet for two days", e, &last, day(5, 9), true},
		{"after the end", e, nil, day(31, 0), false},
		{"paused", Enrollment{Status: EnrollmentPaused, Timezone: "UTC", StartDate: start, EndDate: start.AddDate(0, 0, 29)}, nil, day(10, 0), false},
	}
	for _, c := range cases {
		if got := Inactive(c.e, c.last, c.now); got != c.want {
			t.Errorf("%s: Inactive = %v, want %v", c.name, got, c.want)
		}
	}
}
