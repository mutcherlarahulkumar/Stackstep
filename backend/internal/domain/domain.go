// Package domain holds the workspace's types and pure business rules. It has no I/O.
package domain

import (
	"time"

	"github.com/google/uuid"
)

// Role is a user's platform role.
type Role string

const (
	RoleStudent      Role = "student"
	RoleCollegeAdmin Role = "college_admin"
	RoleAdmin        Role = "admin"
)

// Valid reports whether r is a known role.
func (r Role) Valid() bool {
	switch r {
	case RoleStudent, RoleCollegeAdmin, RoleAdmin:
		return true
	}
	return false
}

// IsStaff is true for roles that may allocate and review tasks.
func (r Role) IsStaff() bool { return r == RoleAdmin || r == RoleCollegeAdmin }

// User is an authenticated person.
type User struct {
	ID          uuid.UUID
	GitHubID    *int64
	GitHubLogin string
	Name        string
	Email       *string
	AvatarURL   *string
	Role        Role
	CollegeID   *uuid.UUID
}

// EnrollmentStatus is the lifecycle state of an internship.
type EnrollmentStatus string

const (
	EnrollmentActive    EnrollmentStatus = "active"
	EnrollmentPaused    EnrollmentStatus = "paused"
	EnrollmentCompleted EnrollmentStatus = "completed"
	EnrollmentCancelled EnrollmentStatus = "cancelled"
)

// Valid reports whether s is a known enrollment status.
func (s EnrollmentStatus) Valid() bool {
	switch s {
	case EnrollmentActive, EnrollmentPaused, EnrollmentCompleted, EnrollmentCancelled:
		return true
	}
	return false
}

// Program is a versioned internship template.
type Program struct {
	Slug  string
	Days  int
	Track string
}

// Enrollment is one student's internship.
type Enrollment struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	CollegeID *uuid.UUID // college of the enrollment's cohort, if any
	Program   Program
	StartDate time.Time // midnight UTC of the calendar date
	EndDate   time.Time // midnight UTC of the calendar date (inclusive last day)
	Timezone  string
	Status    EnrollmentStatus
}

// Location returns the enrollment's time zone, falling back to UTC.
func (e Enrollment) Location() *time.Location {
	loc, err := time.LoadLocation(e.Timezone)
	if err != nil {
		return time.UTC
	}
	return loc
}

// Window returns the instant the internship opens and the instant it closes (exclusive),
// both in the enrollment's local time zone.
func (e Enrollment) Window() (opens, closes time.Time) {
	loc := e.Location()
	y, m, d := e.StartDate.Date()
	opens = time.Date(y, m, d, 0, 0, 0, 0, loc)
	y, m, d = e.EndDate.Date()
	closes = time.Date(y, m, d, 0, 0, 0, 0, loc).AddDate(0, 0, 1)
	return opens.UTC(), closes.UTC()
}

// DayNumber is the 1-based internship day at t, or 0 before the start and Program.Days after the end.
func (e Enrollment) DayNumber(t time.Time) int {
	opens, closes := e.Window()
	switch {
	case t.Before(opens):
		return 0
	case !t.Before(closes):
		return e.Program.Days
	}
	local := t.In(e.Location())
	y, m, d := local.Date()
	sy, sm, sd := e.StartDate.Date()
	days := int(time.Date(y, m, d, 0, 0, 0, 0, time.UTC).Sub(time.Date(sy, sm, sd, 0, 0, 0, 0, time.UTC)).Hours()/24) + 1
	return min(max(days, 1), e.Program.Days)
}
