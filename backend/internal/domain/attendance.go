package domain

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// AttendanceStatus says how a day of the internship went.
type AttendanceStatus string

// Attendance statuses.
const (
	AttendancePresent AttendanceStatus = "present" // opened Stackstep that day
	AttendanceMissed  AttendanceStatus = "missed"  // a past day with no visit
	AttendancePending AttendanceStatus = "pending" // today, not opened yet
)

// Valid reports whether s is a known status.
func (s AttendanceStatus) Valid() bool {
	switch s {
	case AttendancePresent, AttendanceMissed, AttendancePending:
		return true
	}
	return false
}

// AttendanceMark is a stored visit: the student's local date, their seat that day, and when.
type AttendanceMark struct {
	Day       time.Time // midnight UTC of the calendar date
	Seat      int
	FirstSeen time.Time
}

// AttendanceDay is one day of the internship so far.
type AttendanceDay struct {
	Date      time.Time
	Day       int
	Status    AttendanceStatus
	Seat      int // 0 unless present
	FirstSeen *time.Time
}

// Attendance is a student's record from day 1 to today.
type Attendance struct {
	Days    []AttendanceDay
	Present int
	Missed  int
	Streak  int // present days in a row, up to today
}

// LocalDate is the calendar date of t in loc, as midnight UTC.
func LocalDate(t time.Time, loc *time.Location) time.Time {
	y, m, d := t.In(loc).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// AttendanceFor lays the marks over the internship's days up to today (in the student's zone).
// Days before the start, or after today, aren't listed.
func AttendanceFor(e Enrollment, marks []AttendanceMark, now time.Time) Attendance {
	byDay := make(map[time.Time]AttendanceMark, len(marks))
	for _, m := range marks {
		byDay[m.Day] = m
	}
	today := LocalDate(now, e.Location())
	last := e.EndDate
	if today.Before(last) {
		last = today
	}
	out := Attendance{Days: []AttendanceDay{}}
	n := 0
	for d := e.StartDate; !d.After(last); d = d.AddDate(0, 0, 1) {
		n++
		day := AttendanceDay{Date: d, Day: n}
		if m, ok := byDay[d]; ok {
			seen := m.FirstSeen
			day.Status, day.Seat, day.FirstSeen = AttendancePresent, m.Seat, &seen
			out.Present++
		} else if d.Equal(today) {
			day.Status = AttendancePending
		} else {
			day.Status = AttendanceMissed
			out.Missed++
		}
		out.Days = append(out.Days, day)
	}
	for i := len(out.Days) - 1; i >= 0; i-- {
		s := out.Days[i].Status
		if s == AttendancePending {
			continue
		}
		if s != AttendancePresent {
			break
		}
		out.Streak++
	}
	return out
}

// Staff note bounds.
const StaffNoteMax = 2000

// ValidateStaffNote trims a note and checks it.
func ValidateStaffNote(body string) (string, string) {
	t := strings.TrimSpace(body)
	switch n := utf8.RuneCountInString(t); {
	case !utf8.ValidString(body) || hasBadControl(t, true):
		return "", "The note contains characters that can't be displayed."
	case n == 0:
		return "", "Write something first."
	case n > StaffNoteMax:
		return "", fmt.Sprintf("Keep a note to %d characters.", StaffNoteMax)
	}
	return t, ""
}
