package domain

import "time"

// WeekStart is the Monday 00:00 UTC of the week containing t.
func WeekStart(t time.Time) time.Time {
	t = t.UTC()
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	offset := (int(d.Weekday()) + 6) % 7 // Monday = 0
	return d.AddDate(0, 0, -offset)
}

// OnTimePercent is on-time / done, rounded down; 0 when nothing was done.
func OnTimePercent(onTime, done int) int {
	if done == 0 {
		return 0
	}
	return onTime * 100 / done
}

// ReportMaxWeeksBack limits how far back a weekly report can go.
const ReportMaxWeeksBack = 52
