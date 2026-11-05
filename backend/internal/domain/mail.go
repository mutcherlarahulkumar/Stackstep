package domain

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// MailKind says why a letter arrived.
type MailKind string

const (
	MailAnnouncement MailKind = "announcement"
	MailWelcome      MailKind = "welcome"
	MailReview       MailKind = "review"
	MailCertificate  MailKind = "certificate"
	MailClass        MailKind = "class"
)

// Valid reports whether k is a known kind.
func (k MailKind) Valid() bool {
	switch k {
	case MailAnnouncement, MailWelcome, MailReview, MailCertificate, MailClass:
		return true
	}
	return false
}

// Audience is who an announcement goes to.
type Audience string

const (
	AudienceAll    Audience = "all"    // every student with an open internship (in the sender's scope)
	AudienceFlow   Audience = "flow"   // students on one flow
	AudienceCohort Audience = "cohort" // students in one cohort
	AudienceClass  Audience = "class"  // students invited to a live class
)

// Valid reports whether a is a known audience.
func (a Audience) Valid() bool {
	switch a {
	case AudienceAll, AudienceFlow, AudienceCohort, AudienceClass:
		return true
	}
	return false
}

// Bounds for announcements (mirrored in clients).
const (
	AnnouncementSubjectMin = 3
	AnnouncementSubjectMax = 120
	MailBodyMax            = 20000
)

// ValidateAnnouncement normalizes the subject and checks the Markdown body. The body's
// whitespace is kept: it is Markdown.
func ValidateAnnouncement(subject, body string) (string, string, map[string]string) {
	errs := map[string]string{}
	s := NormalizeText(subject)
	switch n := utf8.RuneCountInString(s); {
	case hasBadControl(subject, true) || hasBadControl(s, false):
		errs["subject"] = "The subject contains characters that can't be displayed."
	case n < AnnouncementSubjectMin:
		errs["subject"] = fmt.Sprintf("Write a subject of at least %d characters.", AnnouncementSubjectMin)
	case n > AnnouncementSubjectMax:
		errs["subject"] = fmt.Sprintf("Keep the subject to %d characters.", AnnouncementSubjectMax)
	}
	switch {
	case !utf8.ValidString(body) || hasBadControl(body, true):
		errs["body"] = "The message contains characters that can't be displayed."
	case strings.TrimSpace(body) == "":
		errs["body"] = "Write the announcement."
	case utf8.RuneCountInString(body) > MailBodyMax:
		errs["body"] = fmt.Sprintf("Keep the announcement to %d characters.", MailBodyMax)
	}
	return s, body, errs
}
