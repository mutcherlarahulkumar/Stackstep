package domain

import (
	"fmt"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// CohortKind says whether a cohort belongs to a college or is an independent group.
type CohortKind string

const (
	CohortGroup   CohortKind = "group"
	CohortCollege CohortKind = "college"
)

// Valid reports whether k is a known cohort kind.
func (k CohortKind) Valid() bool { return k == CohortGroup || k == CohortCollege }

// People limits.
const (
	MaxImportRows    = 500
	MaxSeats         = 100000
	EnrollPastDays   = 30  // an internship may start at most this many days ago
	EnrollFutureDays = 365 // and at most this many days ahead
	DefaultTimezone  = "Asia/Kolkata"
)

// College is a partner institution.
type College struct {
	ID        uuid.UUID
	Name      string
	CreatedAt time.Time
}

// Cohort is a batch of students on one program.
type Cohort struct {
	ID         uuid.UUID
	Kind       CohortKind
	Name       string
	CollegeID  *uuid.UUID
	Program    Program
	StartDate  time.Time
	SeatsTotal int
	CreatedAt  time.Time
	// FeeINR and ApplicationsOpen let students apply and pay for the cohort (feature 15).
	FeeINR           *int
	ApplicationsOpen bool
}

// ValidGitHubLogin follows GitHub's rules: 1–39 letters, digits or single hyphens, not
// starting or ending with a hyphen.
func ValidGitHubLogin(s string) bool {
	if s == "" || len(s) > 39 || s[0] == '-' || s[len(s)-1] == '-' || strings.Contains(s, "--") {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && (c < '0' || c > '9') && c != '-' {
			return false
		}
	}
	return true
}

// NormalizeLogin trims whitespace and a leading "@".
func NormalizeLogin(s string) string { return strings.TrimPrefix(strings.TrimSpace(s), "@") }

// PersonInput is a student or staff member identified by their GitHub login.
type PersonInput struct {
	GitHubLogin string
	Name        string // optional; defaults to the login until they sign in
	Email       string // optional
}

// ValidatePerson cleans a person and returns field errors keyed by API field name.
func ValidatePerson(in PersonInput) (PersonInput, map[string]string) {
	errs := map[string]string{}
	out := PersonInput{GitHubLogin: NormalizeLogin(in.GitHubLogin), Name: NormalizeText(in.Name), Email: strings.TrimSpace(in.Email)}
	if !ValidGitHubLogin(out.GitHubLogin) {
		errs["github_login"] = "Enter a GitHub username: letters, digits and single hyphens, up to 39 characters."
	}
	switch {
	case utf8.RuneCountInString(out.Name) > 200:
		errs["name"] = "Keep the name under 200 characters."
	case hasBadControl(out.Name, false):
		errs["name"] = "Name contains characters that can't be displayed."
	}
	if out.Email != "" {
		a, err := mail.ParseAddress(out.Email)
		if err != nil || a.Address != out.Email || len(out.Email) > 320 {
			errs["email"] = "Enter a valid email address, or leave it empty."
		}
	}
	if out.Name == "" {
		out.Name = out.GitHubLogin
	}
	return out, errs
}

// ValidateName checks a college or cohort name.
func ValidateName(raw, what string) (string, string) {
	n := NormalizeText(raw)
	switch {
	case utf8.RuneCountInString(n) < 2:
		return n, fmt.Sprintf("Give the %s a name (at least 2 characters).", what)
	case utf8.RuneCountInString(n) > 200:
		return n, "Keep the name under 200 characters."
	case hasBadControl(n, false):
		return n, "Name contains characters that can't be displayed."
	}
	return n, ""
}

// ValidateStartDate keeps internships within a sensible window around today (in loc).
func ValidateStartDate(d time.Time, loc *time.Location, now time.Time) string {
	y, m, day := now.In(loc).Date()
	today := time.Date(y, m, day, 0, 0, 0, 0, time.UTC)
	start := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
	switch {
	case start.Before(today.AddDate(0, 0, -EnrollPastDays)):
		return fmt.Sprintf("The start date can be at most %d days ago.", EnrollPastDays)
	case start.After(today.AddDate(0, 0, EnrollFutureDays)):
		return "The start date can be at most a year ahead."
	}
	return ""
}

// LoadTimezone returns the IANA zone, or an error message.
func LoadTimezone(name string) (*time.Location, string) {
	if name == "" {
		name = DefaultTimezone
	}
	if name == "Local" {
		return nil, "Pick a named time zone, like Asia/Kolkata."
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, "Pick a valid time zone, like Asia/Kolkata."
	}
	return loc, ""
}

// EndDate is the last day of an internship that starts on start.
func EndDate(start time.Time, days int) time.Time { return start.AddDate(0, 0, days-1) }

// CanMoveTo says which status changes staff may make. Completed and cancelled are final.
func (s EnrollmentStatus) CanMoveTo(to EnrollmentStatus) bool {
	switch s {
	case EnrollmentActive:
		return to == EnrollmentPaused || to == EnrollmentCompleted || to == EnrollmentCancelled
	case EnrollmentPaused:
		return to == EnrollmentActive || to == EnrollmentCompleted || to == EnrollmentCancelled
	case EnrollmentCompleted, EnrollmentCancelled:
		return false
	}
	return false
}
