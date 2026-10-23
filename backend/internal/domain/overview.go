package domain

import "time"

// InactiveAfter is how long an active student can go without doing anything before the
// placement overview flags them for a nudge.
const InactiveAfter = 48 * time.Hour

// OverviewMax caps one overview response (and its CSV export).
const OverviewMax = 1000

// Inactive reports whether an active student has been quiet for InactiveAfter, counting
// from the later of their last activity and the internship's first day. Paused or finished
// internships, and ones that haven't started, are never inactive.
func Inactive(e Enrollment, lastActive *time.Time, now time.Time) bool {
	if e.Status != EnrollmentActive {
		return false
	}
	opens, closes := e.Window()
	if now.Before(opens) || !now.Before(closes) {
		return false
	}
	ref := opens
	if lastActive != nil && lastActive.After(ref) {
		ref = *lastActive
	}
	return now.Sub(ref) >= InactiveAfter
}
