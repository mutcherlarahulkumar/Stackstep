package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ApplicationStatus is where a student's application to a cohort stands.
type ApplicationStatus string

const (
	// AppDraft: details saved, no payment proof yet.
	AppDraft ApplicationStatus = "draft"
	// AppSubmitted: proof uploaded, waiting for an admin to confirm the payment.
	AppSubmitted ApplicationStatus = "submitted"
	// AppFlagged: an admin raised an issue the student must act on.
	AppFlagged ApplicationStatus = "flagged"
	// AppApproved: payment confirmed and the student enrolled.
	AppApproved ApplicationStatus = "approved"
	// AppRejected: closed by an admin. Fees are not refunded.
	AppRejected ApplicationStatus = "rejected"
)

// Valid reports whether s is a known status.
func (s ApplicationStatus) Valid() bool {
	switch s {
	case AppDraft, AppSubmitted, AppFlagged, AppApproved, AppRejected:
		return true
	}
	return false
}

// Open reports whether the application is still in progress.
func (s ApplicationStatus) Open() bool { return s == AppDraft || s == AppSubmitted || s == AppFlagged }

// ApplicationFlag is the issue an admin raised on an application.
type ApplicationFlag string

const (
	FlagPartialPayment  ApplicationFlag = "partial_payment"   // less than the fee arrived
	FlagCohortMismatch  ApplicationFlag = "cohort_mismatch"   // the amount fits a different cohort
	FlagCohortFull      ApplicationFlag = "cohort_full"       // no seats left in the chosen cohort
	FlagUnclearProof    ApplicationFlag = "unclear_proof"     // the screenshot can't be read
	FlagPaymentNotFound ApplicationFlag = "payment_not_found" // no matching payment arrived
	FlagDuplicateProof  ApplicationFlag = "duplicate_proof"   // the screenshot or UTR was used before
	FlagDetailsWrong    ApplicationFlag = "details_incorrect" // the details need fixing
	FlagOther           ApplicationFlag = "other"
)

// Valid reports whether f is a known flag.
func (f ApplicationFlag) Valid() bool {
	switch f {
	case FlagPartialPayment, FlagCohortMismatch, FlagCohortFull, FlagUnclearProof, FlagPaymentNotFound, FlagDuplicateProof, FlagDetailsWrong, FlagOther:
		return true
	}
	return false
}

// ApplicantAction is what a flagged applicant can do to move forward.
type ApplicantAction string

const (
	ActionPay          ApplicantAction = "pay"           // upload a payment proof
	ActionChangeCohort ApplicantAction = "change_cohort" // pick another open cohort
	ActionEditDetails  ApplicantAction = "edit_details"  // fix the details
	ActionResubmit     ApplicantAction = "resubmit"      // send it back for review as it is
)

// Actions lists what the applicant may do in this state (chat is always open).
func (s ApplicationStatus) Actions(f *ApplicationFlag) []ApplicantAction {
	switch s {
	case AppDraft:
		return []ApplicantAction{ActionEditDetails, ActionChangeCohort, ActionPay}
	case AppFlagged:
		if f == nil {
			return []ApplicantAction{ActionPay}
		}
		switch *f {
		case FlagPartialPayment, FlagUnclearProof, FlagPaymentNotFound, FlagDuplicateProof:
			return []ApplicantAction{ActionPay}
		case FlagCohortMismatch, FlagCohortFull:
			return []ApplicantAction{ActionChangeCohort, ActionPay}
		case FlagDetailsWrong:
			return []ApplicantAction{ActionEditDetails, ActionResubmit}
		case FlagOther:
			return []ApplicantAction{ActionEditDetails, ActionChangeCohort, ActionPay, ActionResubmit}
		}
	case AppSubmitted, AppApproved, AppRejected:
	}
	return []ApplicantAction{}
}

// Allows reports whether the action is open in this state.
func (s ApplicationStatus) Allows(f *ApplicationFlag, a ApplicantAction) bool {
	for _, x := range s.Actions(f) {
		if x == a {
			return true
		}
	}
	return false
}

// ApplicationAuthor is who wrote an application message.
type ApplicationAuthor string

const (
	AuthorApplicant ApplicationAuthor = "applicant"
	AuthorStaff     ApplicationAuthor = "staff"
	AuthorSystem    ApplicationAuthor = "system" // status changes, written by Stackstep
)

// Valid reports whether a is a known author.
func (a ApplicationAuthor) Valid() bool {
	return a == AuthorApplicant || a == AuthorStaff || a == AuthorSystem
}

// Application is a student's application to join a cohort.
type Application struct {
	ID           uuid.UUID
	UserID       uuid.UUID
	CohortID     uuid.UUID
	Status       ApplicationStatus
	Details      ApplicantDetails
	FeeINR       int
	PaidINR      int
	Flag         *ApplicationFlag
	FlagNote     string
	DecidedAt    *time.Time
	EnrollmentID *uuid.UUID
	Version      int
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// DueINR is what is still owed.
func (a Application) DueINR() int { return max(a.FeeINR-a.PaidINR, 0) }

// ApplicantDetails is the first step of the form.
type ApplicantDetails struct {
	FullName    string
	Phone       string
	DateOfBirth time.Time
	College     string
	Course      string
	Branch      string
	GradYear    int
}

// Bounds for application input.
const (
	ApplicantTextMax  = 120
	ProofMaxBytes     = 4 << 20 // 4 MB screenshot
	QRMaxBytes        = 2 << 20
	FeeMaxINR         = 10_000_000
	FlagNoteMax       = 1000
	ApplicationMsgMax = 4000
)

var (
	phonePattern = regexp.MustCompile(`^\+?[0-9]{10,15}$`)
	// UPI transaction references (UTR / RRN) are 12 digits; other apps show up to ~35
	// letters and digits. Accept that range, nothing else.
	utrPattern = regexp.MustCompile(`^[A-Za-z0-9]{6,35}$`)
)

// ValidateDetails cleans the details and returns field errors keyed by API field name.
func ValidateDetails(d ApplicantDetails, now time.Time) (ApplicantDetails, map[string]string) {
	errs := map[string]string{}
	text := func(field, label, v string, min int) string {
		v = NormalizeText(v)
		switch n := len([]rune(v)); {
		case n < min:
			errs[field] = fmt.Sprintf("Enter your %s.", label)
		case n > ApplicantTextMax:
			errs[field] = fmt.Sprintf("Keep it under %d characters.", ApplicantTextMax)
		}
		return v
	}
	d.FullName = text("full_name", "full name", d.FullName, 2)
	d.College = text("college", "college", d.College, 2)
	d.Course = text("course", "course (e.g. B.Tech)", d.Course, 2)
	d.Branch = text("branch", "branch (e.g. Computer Science)", d.Branch, 2)
	d.Phone = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").Replace(strings.TrimSpace(d.Phone))
	if !phonePattern.MatchString(d.Phone) {
		errs["phone"] = "Enter a phone number with 10 to 15 digits."
	}
	y := now.UTC().Year()
	switch age := now.UTC().Sub(d.DateOfBirth).Hours() / 24 / 365.25; {
	case d.DateOfBirth.IsZero():
		errs["date_of_birth"] = "Enter your date of birth."
	case age < 15:
		errs["date_of_birth"] = "You need to be at least 15."
	case age > 80:
		errs["date_of_birth"] = "Check the year of your date of birth."
	}
	if d.GradYear < y-30 || d.GradYear > y+8 {
		errs["grad_year"] = fmt.Sprintf("Pick a year between %d and %d.", y-30, y+8)
	}
	return d, errs
}

// Proof is a validated payment screenshot.
type Proof struct {
	Image  []byte
	Type   string // image/png, image/jpeg or image/webp
	SHA256 string
	UTR    string
	Amount int
}

// ValidateProof checks the screenshot, the transaction reference and the amount.
func ValidateProof(image []byte, utr string, amount int) (Proof, map[string]string) {
	errs := map[string]string{}
	p := Proof{Image: image, UTR: strings.ToUpper(strings.TrimSpace(utr)), Amount: amount}
	switch {
	case len(image) == 0:
		errs["image"] = "Attach a screenshot of the payment."
	case len(image) > ProofMaxBytes:
		errs["image"] = "The screenshot must be under 4 MB."
	default:
		p.Type = ImageType(image)
		if p.Type == "" {
			errs["image"] = "Use a PNG, JPG or WebP screenshot."
		}
		sum := sha256.Sum256(image)
		p.SHA256 = hex.EncodeToString(sum[:])
	}
	if !utrPattern.MatchString(p.UTR) {
		errs["utr"] = "Enter the UPI transaction ID (UTR) from the payment: 6 to 35 letters and digits."
	}
	if amount < 1 || amount > FeeMaxINR {
		errs["amount_inr"] = "Enter the amount you paid, in rupees."
	}
	return p, errs
}

// ImageType sniffs PNG, JPEG or WebP from the bytes; anything else is "".
func ImageType(b []byte) string {
	switch t := http.DetectContentType(b); t {
	case "image/png", "image/jpeg", "image/webp":
		return t
	}
	return ""
}

// ValidateFlag checks an admin's flag.
func ValidateFlag(f ApplicationFlag, note string) (string, map[string]string) {
	errs := map[string]string{}
	if !f.Valid() {
		errs["flag"] = "Pick what's wrong."
	}
	note = NormalizeText(note)
	switch {
	case f == FlagOther && len([]rune(note)) < 5:
		errs["note"] = "Tell the student what's wrong."
	case len([]rune(note)) > FlagNoteMax:
		errs["note"] = fmt.Sprintf("Keep the note under %d characters.", FlagNoteMax)
	}
	return note, errs
}

// FlagMessage is the line Stackstep posts in the application chat when an admin flags it.
func FlagMessage(f ApplicationFlag, a Application, note string) string {
	var head string
	switch f {
	case FlagPartialPayment:
		head = fmt.Sprintf("We received ₹%d of ₹%d. Please pay the remaining ₹%d and upload the screenshot.", a.PaidINR, a.FeeINR, a.DueINR())
	case FlagCohortMismatch:
		head = "Your payment doesn't match the fee of the cohort you picked. Switch to the cohort you paid for, or pay the difference."
	case FlagCohortFull:
		head = "The cohort you picked is full. Pick another open cohort; anything you've paid carries over."
	case FlagUnclearProof:
		head = "We couldn't read your payment screenshot. Please upload a clearer one showing the amount, date and UTR."
	case FlagPaymentNotFound:
		head = "We couldn't find this payment in our account. Check the UTR and upload the correct screenshot, or message us here."
	case FlagDuplicateProof:
		head = "This screenshot or UTR was already used for another payment. Upload the proof for this payment."
	case FlagDetailsWrong:
		head = "Some of your details need fixing. Update them and send the application back."
	case FlagOther:
		head = "There's an issue with your application."
	}
	if note != "" {
		head += "\n\n" + note
	}
	return head
}

// NoRefundPolicy is shown on the payment step and in the terms.
const NoRefundPolicy = "Fees are non-refundable under any circumstances."

// ApplicationDecision is what a reviewer does with an application.
type ApplicationDecision string

const (
	DecideApprove ApplicationDecision = "approve"
	DecideFlag    ApplicationDecision = "flag"
	DecideReject  ApplicationDecision = "reject"
)

// Valid reports whether d is a known decision.
func (d ApplicationDecision) Valid() bool {
	return d == DecideApprove || d == DecideFlag || d == DecideReject
}
