package domain

import (
	"crypto/rand"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Progress summarizes how far a student is.
type Progress struct {
	Released  int // tasks the student can see (not cancelled)
	Done      int
	InReview  int
	Overdue   int // open, not in review, past due
	OnTime    int // finished tasks that were on time
	Points    int
	DayNumber int
	Days      int
}

// CompletionPercent is done / released, rounded down.
func (p Progress) CompletionPercent() int {
	if p.Released == 0 {
		return 0
	}
	return p.Done * 100 / p.Released
}

// CertificateBarPercent is the suggested share of released tasks done before a certificate.
// Admins decide; the bar is shown to guide them.
const CertificateBarPercent = 70

// MeetsBar reports whether the suggested completion bar is met.
func (p Progress) MeetsBar() bool {
	return p.Released > 0 && p.CompletionPercent() >= CertificateBarPercent
}

// CertificateStatus says whether a certificate still stands.
type CertificateStatus string

const (
	CertificateValid   CertificateStatus = "valid"
	CertificateRevoked CertificateStatus = "revoked"
)

func (s CertificateStatus) Valid() bool { return s == CertificateValid || s == CertificateRevoked }

// Certificate is an issued completion certificate (a snapshot).
type Certificate struct {
	Code         string
	EnrollmentID uuid.UUID
	StudentName  string
	GitHubLogin  string
	ProgramSlug  string
	ProgramDays  int
	FlowName     *string
	StartDate    time.Time
	EndDate      time.Time
	Points       int
	TasksDone    int
	TasksTotal   int
	IssuedAt     time.Time
	RevokedAt    *time.Time
	RevokeReason *string
}

// Status is revoked once RevokedAt is set.
func (c Certificate) Status() CertificateStatus {
	if c.RevokedAt != nil {
		return CertificateRevoked
	}
	return CertificateValid
}

// codeAlphabet avoids look-alikes (0/O, 1/I/L) so codes can be typed from paper.
const codeAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

// NewCertificateCode returns a random 12-character code (about 59 bits). Bytes that would
// bias the alphabet are rejected, so every character is equally likely.
func NewCertificateCode() string {
	out := make([]byte, 0, 12)
	buf := make([]byte, 32)
	limit := 256 - 256%len(codeAlphabet)
	for len(out) < 12 {
		if _, err := rand.Read(buf); err != nil {
			panic("crypto/rand failed: " + err.Error())
		}
		for _, v := range buf {
			if int(v) < limit && len(out) < 12 {
				out = append(out, codeAlphabet[int(v)%len(codeAlphabet)])
			}
		}
	}
	return string(out)
}

// NormalizeCertificateCode uppercases a typed code and drops spaces and dashes.
func NormalizeCertificateCode(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == ' ' || r == '-':
		case r >= 'a' && r <= 'z':
			b.WriteRune(r - 'a' + 'A')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// ValidCertificateCode reports whether s looks like a code (cheap check before a lookup).
func ValidCertificateCode(s string) bool {
	if len(s) != 12 {
		return false
	}
	for i := 0; i < len(s); i++ {
		ok := false
		for j := 0; j < len(codeAlphabet); j++ {
			if s[i] == codeAlphabet[j] {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	return true
}

// ValidateRevokeReason checks why a certificate is revoked.
func ValidateRevokeReason(raw string) (string, string) {
	r := NormalizeText(raw)
	switch {
	case r == "":
		return r, "Say why it's being revoked."
	case utf8.RuneCountInString(r) > 300:
		return r, "Keep the reason under 300 characters."
	case hasBadControl(r, false):
		return r, "Reason contains characters that can't be displayed."
	}
	return r, ""
}
