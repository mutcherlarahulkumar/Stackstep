package app

import (
	"context"
	"fmt"
	"time"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// FirstDay says when a new internship starts: the first day's date and, when the flow has
// tasks, the moment the first one arrives (both in the student's time zone).
type FirstDay struct {
	Date        time.Time  // day 1, a calendar date
	FirstTaskAt *time.Time // nil before a flow is assigned
}

// LoadFirstDay reads the start of an internship.
func LoadFirstDay(ctx context.Context, q store.Q, e domain.Enrollment) (FirstDay, error) {
	at, err := store.FirstTaskAt(ctx, q, e.ID)
	return FirstDay{Date: e.StartDate, FirstTaskAt: at}, err
}

// Sentence is the line a student reads when they join, e.g. "Your first working day is
// tomorrow, Friday 6 November. Your first task arrives at 9:30 AM IST."
func (f FirstDay) Sentence(e domain.Enrollment, now time.Time) string {
	loc := e.Location()
	y, m, d := now.In(loc).Date()
	today := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	date := f.Date.Format("Monday 2 January")
	var when string
	switch int(f.Date.Sub(today).Hours() / 24) {
	case 1:
		when = "tomorrow, " + date
	case 0:
		when = "today, " + date
	default:
		when = date
	}
	s := fmt.Sprintf("Your first working day is %s.", when)
	if f.FirstTaskAt != nil {
		s += fmt.Sprintf(" Your first task arrives at %s.", f.FirstTaskAt.In(loc).Format("3:04 PM MST"))
	}
	return s
}

// FirstDayNote is LoadFirstDay followed by Sentence.
func FirstDayNote(ctx context.Context, q store.Q, e domain.Enrollment, now time.Time) (string, error) {
	f, err := LoadFirstDay(ctx, q, e)
	if err != nil {
		return "", err
	}
	return f.Sentence(e, now), nil
}
