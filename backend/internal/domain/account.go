package domain

import "time"

// TermsVersion is the current privacy notice and terms. Bump it when they change materially;
// everyone is asked to accept again on their next visit.
const TermsVersion = 2

// Account holds per-user settings that aren't part of the profile.
type Account struct {
	ConsentVersion int
	ConsentAt      *time.Time
	OnboardedAt    *time.Time
}

// NeedsConsent reports whether the user must accept the current terms.
func (a Account) NeedsConsent() bool { return a.ConsentVersion < TermsVersion }
