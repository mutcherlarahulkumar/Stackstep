package domain

import (
	"time"

	"github.com/google/uuid"
)

// CalendarKind is what a calendar entry stands for.
type CalendarKind string

const (
	// CalendarTask is a task, released or scheduled ahead with its title and time.
	CalendarTask CalendarKind = "task"
	// CalendarSurprise is a task from a surprise window that hasn't landed yet: only its day is
	// shown, never its title or time.
	CalendarSurprise CalendarKind = "surprise"
	// CalendarClass is a live class the student is invited to.
	CalendarClass CalendarKind = "class"
)

// Valid reports whether k is a known kind.
func (k CalendarKind) Valid() bool {
	switch k {
	case CalendarTask, CalendarSurprise, CalendarClass:
		return true
	}
	return false
}

// CalendarTaskRow is one task as the calendar reads it.
type CalendarTaskRow struct {
	ID           uuid.UUID
	Type         TaskType
	Title        string
	Status       TaskStatus
	PersonaID    uuid.UUID
	ScheduledFor time.Time
	DueAt        time.Time
	Surprise     bool // came from a flow item with a release window
}

// CalendarEntry is one thing on a student's calendar. Unreleased entries carry no task ID, so
// nothing can be opened or handed in early.
type CalendarEntry struct {
	Kind      CalendarKind
	Date      time.Time // calendar date in the student's zone
	Day       int       // internship day, 0 outside the window
	At        *time.Time
	DueAt     *time.Time
	Released  bool
	TaskID    *uuid.UUID
	Title     *string
	TaskType  *TaskType
	Status    *TaskStatus
	PersonaID *uuid.UUID
	ClassID   *uuid.UUID
}

// CalendarFor turns an internship's tasks into calendar entries, oldest first. Released tasks
// show everything; tasks scheduled ahead show their title and time but can't be opened;
// surprise tasks that haven't landed show only their day.
func CalendarFor(e Enrollment, rows []CalendarTaskRow, now time.Time) []CalendarEntry {
	loc := e.Location()
	out := make([]CalendarEntry, 0, len(rows))
	for _, r := range rows {
		if r.Status == StatusCancelled {
			continue
		}
		at := r.ScheduledFor
		y, m, d := at.In(loc).Date()
		entry := CalendarEntry{Kind: CalendarTask, Date: time.Date(y, m, d, 0, 0, 0, 0, time.UTC), Day: e.DayNumber(at)}
		released := !at.After(now)
		if !released && r.Surprise {
			entry.Kind = CalendarSurprise
			out = append(out, entry)
			continue
		}
		due, title, typ, persona := r.DueAt, r.Title, r.Type, r.PersonaID
		entry.At, entry.DueAt, entry.Title, entry.TaskType, entry.PersonaID, entry.Released = &at, &due, &title, &typ, &persona, released
		if released {
			id, status := r.ID, r.Status
			entry.TaskID, entry.Status = &id, &status
		}
		out = append(out, entry)
	}
	return out
}
