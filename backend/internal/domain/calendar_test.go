package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

// CA1–CA3: released tasks show everything, scheduled ones show title and time but can't be
// opened, surprise ones show only their day, cancelled ones are gone.
func TestCalendarFor(t *testing.T) {
	e := Enrollment{ID: uuid.New(), Program: Program{Days: 30}, Timezone: "Asia/Kolkata",
		StartDate: time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 12, 3, 0, 0, 0, 0, time.UTC)}
	now := time.Date(2026, 11, 5, 6, 0, 0, 0, time.UTC) // 11:30 IST on day 2
	at := func(d, h, m int) time.Time { return time.Date(2026, 11, d, h, m, 0, 0, time.UTC) }
	rows := []CalendarTaskRow{
		{ID: uuid.New(), Type: TaskStandup, Title: "Standup", Status: StatusDone, ScheduledFor: at(4, 4, 0), DueAt: at(4, 7, 0)},
		{ID: uuid.New(), Type: TaskFeature, Title: "Hero", Status: StatusTodo, ScheduledFor: at(6, 4, 30), DueAt: at(7, 4, 30)},
		{ID: uuid.New(), Type: TaskQuiz, Title: "Pop quiz", Status: StatusTodo, ScheduledFor: at(5, 9, 0), DueAt: at(5, 10, 0), Surprise: true},
		{ID: uuid.New(), Type: TaskQuiz, Title: "Old quiz", Status: StatusDone, ScheduledFor: at(4, 9, 0), DueAt: at(4, 10, 0), Surprise: true},
		{ID: uuid.New(), Type: TaskBlog, Title: "Gone", Status: StatusCancelled, ScheduledFor: at(8, 4, 0), DueAt: at(9, 4, 0)},
	}
	got := CalendarFor(e, rows, now)
	if len(got) != 4 {
		t.Fatalf("entries = %d, want 4 (cancelled dropped)", len(got))
	}
	if r := got[0]; r.Kind != CalendarTask || !r.Released || r.TaskID == nil || r.Status == nil || r.Day != 1 || r.Date.Format(time.DateOnly) != "2026-11-04" {
		t.Errorf("released = %+v", r)
	}
	if r := got[1]; r.Kind != CalendarTask || r.Released || r.TaskID != nil || r.Status != nil || r.Title == nil || *r.Title != "Hero" || r.At == nil || r.Day != 3 {
		t.Errorf("scheduled = %+v", r)
	}
	if r := got[2]; r.Kind != CalendarSurprise || r.Title != nil || r.At != nil || r.TaskID != nil || r.Day != 2 {
		t.Errorf("surprise = %+v", r)
	}
	// A surprise that already landed is an ordinary released task.
	if r := got[3]; r.Kind != CalendarTask || r.Title == nil || *r.Title != "Old quiz" || r.TaskID == nil {
		t.Errorf("landed surprise = %+v", r)
	}
	// Dates follow the student's zone: 20:00 UTC on 5 Nov is already 6 Nov in India.
	late := CalendarFor(e, []CalendarTaskRow{{ID: uuid.New(), Type: TaskDSA, Title: "Late", Status: StatusTodo, ScheduledFor: at(5, 20, 0), DueAt: at(6, 2, 0)}}, now)
	if late[0].Date.Format(time.DateOnly) != "2026-11-06" || late[0].Day != 3 {
		t.Errorf("zone = %+v", late[0])
	}
	for _, k := range []CalendarKind{CalendarTask, CalendarSurprise, CalendarClass} {
		if !k.Valid() {
			t.Errorf("%s invalid", k)
		}
	}
	if CalendarKind("x").Valid() {
		t.Error("unknown kind valid")
	}
}
