package domain

import (
	"testing"
	"time"
)

func TestValidGitHubLogin(t *testing.T) {
	for _, ok := range []string{"a", "asha-dev", "A1", "x123456789012345678901234567890123456789"[:39]} {
		if !ValidGitHubLogin(ok) {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "-asha", "asha-", "as--ha", "asha_dev", "asha dev", "x1234567890123456789012345678901234567890"} {
		if ValidGitHubLogin(bad) {
			t.Errorf("%q should be invalid", bad)
		}
	}
}

func TestValidatePerson(t *testing.T) {
	p, errs := ValidatePerson(PersonInput{GitHubLogin: " @Asha-Dev ", Name: "  Asha   Rao ", Email: "asha@example.com"})
	if len(errs) != 0 || p.GitHubLogin != "Asha-Dev" || p.Name != "Asha Rao" {
		t.Fatalf("got %+v %v", p, errs)
	}
	p, _ = ValidatePerson(PersonInput{GitHubLogin: "nora"})
	if p.Name != "nora" {
		t.Fatalf("name should default to login, got %q", p.Name)
	}
	_, errs = ValidatePerson(PersonInput{GitHubLogin: "bad login", Email: "not-an-email"})
	if errs["github_login"] == "" || errs["email"] == "" {
		t.Fatalf("errs = %v", errs)
	}
	_, errs = ValidatePerson(PersonInput{GitHubLogin: "ok", Email: "Asha <asha@example.com>"})
	if errs["email"] == "" {
		t.Fatal("display-name emails are refused")
	}
}

func TestStartDateAndTimezone(t *testing.T) {
	now := time.Date(2026, 11, 4, 20, 0, 0, 0, time.UTC) // 01:30 on Nov 5 in Kolkata
	loc, msg := LoadTimezone("")
	if msg != "" || loc.String() != DefaultTimezone {
		t.Fatalf("default zone: %v %q", loc, msg)
	}
	if _, msg := LoadTimezone("Mars/Base"); msg == "" {
		t.Fatal("unknown zone accepted")
	}
	if _, msg := LoadTimezone("Local"); msg == "" {
		t.Fatal("Local accepted")
	}
	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.UTC) }
	if ValidateStartDate(day(2026, 10, 6), loc, now) != "" { // 30 days before Nov 5 (Kolkata)
		t.Fatal("30 days ago should be allowed")
	}
	if ValidateStartDate(day(2026, 10, 5), loc, now) == "" {
		t.Fatal("31 days ago should be refused")
	}
	if ValidateStartDate(day(2027, 11, 6), loc, now) == "" {
		t.Fatal("more than a year ahead should be refused")
	}
	if got := EndDate(day(2026, 11, 2), 30); !got.Equal(day(2026, 12, 1)) {
		t.Fatalf("end = %v", got)
	}
}

func TestEnrollmentStatusMoves(t *testing.T) {
	ok := [][2]EnrollmentStatus{
		{EnrollmentActive, EnrollmentPaused}, {EnrollmentPaused, EnrollmentActive}, {EnrollmentActive, EnrollmentCompleted},
		{EnrollmentPaused, EnrollmentCancelled}, {EnrollmentActive, EnrollmentCancelled},
	}
	for _, m := range ok {
		if !m[0].CanMoveTo(m[1]) {
			t.Errorf("%s → %s should be allowed", m[0], m[1])
		}
	}
	bad := [][2]EnrollmentStatus{
		{EnrollmentActive, EnrollmentActive}, {EnrollmentCompleted, EnrollmentActive}, {EnrollmentCancelled, EnrollmentPaused}, {EnrollmentPaused, EnrollmentPaused},
	}
	for _, m := range bad {
		if m[0].CanMoveTo(m[1]) {
			t.Errorf("%s → %s should be refused", m[0], m[1])
		}
	}
}

func TestValidateName(t *testing.T) {
	if n, msg := ValidateName("  ANITS   Batch 2 ", "cohort"); msg != "" || n != "ANITS Batch 2" {
		t.Fatalf("%q %q", n, msg)
	}
	if _, msg := ValidateName("x", "college"); msg == "" {
		t.Fatal("1 char accepted")
	}
}
