package domain

import (
	"strings"
	"testing"
	"time"
)

func enrollment() Enrollment {
	return Enrollment{
		Program:   Program{Slug: "frontend-30", Days: 30, Track: "frontend"},
		StartDate: time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC),
		Timezone:  "Asia/Kolkata",
		Status:    EnrollmentActive,
	}
}

func TestTransitionGraphIsClosed(t *testing.T) {
	allowed := map[string]bool{
		"todo>in_progress/student":              true,
		"in_progress>in_review/student":         true,
		"changes_requested>in_progress/student": true,
		"changes_requested>in_review/student":   true,
		"in_review>done/staff":                  true,
		"in_review>changes_requested/staff":     true,
		"todo>cancelled/staff":                  true,
		"in_progress>cancelled/staff":           true,
		"in_review>cancelled/staff":             true,
		"changes_requested>cancelled/staff":     true,
	}
	for _, from := range AllTaskStatuses {
		for _, to := range AllTaskStatuses {
			for _, by := range []Actor{ActorStudent, ActorStaff} {
				key := string(from) + ">" + string(to) + "/" + string(by)
				if got := CanTransition(from, to, by, ReviewManual); got != allowed[key] {
					t.Errorf("CanTransition(%s) = %v, want %v", key, got, allowed[key])
				}
			}
		}
	}
	for _, s := range []TaskStatus{StatusDone, StatusCancelled} {
		for _, to := range AllTaskStatuses {
			if CanTransition(s, to, ActorStaff, ReviewSelf) || CanTransition(s, to, ActorStudent, ReviewSelf) {
				t.Errorf("terminal status %s must not move to %s", s, to)
			}
		}
	}
}

func TestValidateNewTask(t *testing.T) {
	e := enrollment()
	opens, closes := e.Window()
	now := opens.Add(2 * time.Hour)
	at := func(d time.Duration) *time.Time { v := now.Add(d); return &v }
	ok := NewTaskInput{Type: TaskFeature, Title: "Add filtering", DueAt: now.Add(time.Hour)}

	cases := []struct {
		name  string
		mod   func(*NewTaskInput)
		field string
	}{
		{"valid", func(*NewTaskInput) {}, ""},
		{"unknown type", func(i *NewTaskInput) { i.Type = "homework" }, "type"},
		{"empty title", func(i *NewTaskInput) { i.Title = "   " }, "title"},
		{"short title", func(i *NewTaskInput) { i.Title = "ab" }, "title"},
		{"title at max", func(i *NewTaskInput) { i.Title = strings.Repeat("é", 120) }, ""},
		{"title over max", func(i *NewTaskInput) { i.Title = strings.Repeat("a", 121) }, "title"},
		{"title control char", func(i *NewTaskInput) { i.Title = "Fix \x00 bug" }, "title"},
		{"title invalid utf8", func(i *NewTaskInput) { i.Title = "abc\xff" }, "title"},
		{"brief at max", func(i *NewTaskInput) { i.Brief = strings.Repeat("b", 8000) }, ""},
		{"brief over max", func(i *NewTaskInput) { i.Brief = strings.Repeat("b", 8001) }, "brief"},
		{"brief newlines ok", func(i *NewTaskInput) { i.Brief = "line1\nline2\ttab" }, ""},
		{"backdated within grace", func(i *NewTaskInput) { i.ScheduledFor = at(-4 * time.Minute) }, ""},
		{"backdated beyond grace", func(i *NewTaskInput) { i.ScheduledFor = at(-6 * time.Minute) }, "scheduled_for"},
		{"after window", func(i *NewTaskInput) { v := closes; i.ScheduledFor = &v; i.DueAt = closes.Add(time.Hour) }, "scheduled_for"},
		{"due missing", func(i *NewTaskInput) { i.DueAt = time.Time{} }, "due_at"},
		{"due 14m after start", func(i *NewTaskInput) { i.DueAt = now.Add(14 * time.Minute) }, "due_at"},
		{"due exactly 15m", func(i *NewTaskInput) { i.DueAt = now.Add(15 * time.Minute) }, ""},
		{"due at window close", func(i *NewTaskInput) { i.DueAt = closes }, ""},
		{"due after window", func(i *NewTaskInput) { i.DueAt = closes.Add(time.Second) }, "due_at"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := ok
			tc.mod(&in)
			_, errs := ValidateNewTask(in, e, now)
			if tc.field == "" && len(errs) != 0 {
				t.Fatalf("unexpected errors: %v", errs)
			}
			if tc.field != "" {
				if _, found := errs[tc.field]; !found {
					t.Fatalf("expected error on %s, got %v", tc.field, errs)
				}
			}
		})
	}
}

func TestValidateNewTaskBeforeStart(t *testing.T) {
	e := enrollment()
	opens, _ := e.Window()
	now := opens.Add(-48 * time.Hour)
	before := opens.Add(-time.Hour)
	_, errs := ValidateNewTask(NewTaskInput{Type: TaskDSA, Title: "Two sum", ScheduledFor: &before, DueAt: opens.Add(time.Hour)}, e, now)
	if _, ok := errs["scheduled_for"]; !ok {
		t.Fatalf("expected scheduled_for error, got %v", errs)
	}
	// Default start snaps to the opening instant.
	v, errs := ValidateNewTask(NewTaskInput{Type: TaskDSA, Title: "Two sum", DueAt: opens.Add(time.Hour)}, e, now)
	if len(errs) != 0 || !v.ScheduledFor.Equal(opens) {
		t.Fatalf("got %v %v, want start %v", v.ScheduledFor, errs, opens)
	}
}

func TestWindowUsesEnrollmentTimezone(t *testing.T) {
	opens, closes := enrollment().Window()
	if want := time.Date(2026, 11, 1, 18, 30, 0, 0, time.UTC); !opens.Equal(want) {
		t.Fatalf("opens = %v, want %v", opens, want)
	}
	if want := time.Date(2026, 12, 1, 18, 30, 0, 0, time.UTC); !closes.Equal(want) {
		t.Fatalf("closes = %v, want %v", closes, want)
	}
}

func TestDayNumber(t *testing.T) {
	e := enrollment()
	opens, closes := e.Window()
	cases := map[string]struct {
		at   time.Time
		want int
	}{
		"before start":  {opens.Add(-time.Second), 0},
		"first instant": {opens, 1},
		"day two":       {opens.Add(25 * time.Hour), 2},
		"last instant":  {closes.Add(-time.Second), 30},
		"after end":     {closes.Add(72 * time.Hour), 30},
	}
	for name, tc := range cases {
		if got := e.DayNumber(tc.at); got != tc.want {
			t.Errorf("%s: DayNumber = %d, want %d", name, got, tc.want)
		}
	}
}

func TestValidateMessageAndNote(t *testing.T) {
	if _, msg := ValidateMessage("  \n "); msg == "" {
		t.Error("blank message accepted")
	}
	if _, msg := ValidateMessage(strings.Repeat("x", 4000)); msg != "" {
		t.Error("4000-char message rejected")
	}
	if _, msg := ValidateMessage(strings.Repeat("x", 4001)); msg == "" {
		t.Error("4001-char message accepted")
	}
	if b, msg := ValidateMessage("  hi\nthere  "); msg != "" || b != "hi\nthere" {
		t.Errorf("got %q %q", b, msg)
	}
	if _, msg := ValidateNote("", StatusChangesRequested); msg == "" {
		t.Error("empty note accepted for changes_requested")
	}
	if _, msg := ValidateNote("", StatusDone); msg != "" {
		t.Error("empty note rejected for done")
	}
	if _, msg := ValidateNote(strings.Repeat("n", 2001), StatusDone); msg == "" {
		t.Error("2001-char note accepted")
	}
}
