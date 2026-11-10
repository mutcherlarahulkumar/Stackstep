package domain

import (
	"testing"
	"time"
)

func TestAttendanceFor(t *testing.T) {
	ist, _ := time.LoadLocation("Asia/Kolkata")
	start := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	e := Enrollment{StartDate: start, EndDate: start.AddDate(0, 0, 29), Timezone: "Asia/Kolkata", Program: Program{Days: 30}}
	day := func(n int) time.Time { return start.AddDate(0, 0, n-1) }
	seen := time.Date(2026, 11, 2, 4, 0, 0, 0, time.UTC)
	marks := []AttendanceMark{{Day: day(1), Seat: 3, FirstSeen: seen}, {Day: day(3), Seat: 1, FirstSeen: seen}, {Day: day(4), Seat: 7, FirstSeen: seen}}
	// AT1: day 5 morning in India, not opened yet today.
	now := time.Date(2026, 11, 6, 9, 0, 0, 0, ist)
	a := AttendanceFor(e, marks, now)
	if len(a.Days) != 5 || a.Present != 3 || a.Missed != 1 || a.Streak != 2 {
		t.Fatalf("got %d days, present %d, missed %d, streak %d", len(a.Days), a.Present, a.Missed, a.Streak)
	}
	want := []AttendanceStatus{AttendancePresent, AttendanceMissed, AttendancePresent, AttendancePresent, AttendancePending}
	for i, d := range a.Days {
		if d.Status != want[i] || d.Day != i+1 {
			t.Fatalf("day %d = %+v, want %s", i+1, d, want[i])
		}
	}
	if a.Days[0].Seat != 3 || a.Days[1].Seat != 0 {
		t.Fatalf("seats %d %d", a.Days[0].Seat, a.Days[1].Seat)
	}
	// AT2: before the start nothing is listed; after the end the list stops on the last day.
	if got := AttendanceFor(e, nil, start.Add(-48*time.Hour)); len(got.Days) != 0 {
		t.Fatalf("before start: %d days", len(got.Days))
	}
	if got := AttendanceFor(e, nil, start.AddDate(0, 2, 0)); len(got.Days) != 30 || got.Missed != 30 || got.Streak != 0 {
		t.Fatalf("after end: %+v", got)
	}
}

func TestValidateStaffNote(t *testing.T) {
	if _, msg := ValidateStaffNote("   "); msg == "" {
		t.Fatal("blank note accepted")
	}
	if got, msg := ValidateStaffNote("  Call about the late tasks  "); msg != "" || got != "Call about the late tasks" {
		t.Fatalf("got %q %q", got, msg)
	}
}
