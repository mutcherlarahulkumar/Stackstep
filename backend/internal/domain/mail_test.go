package domain

import (
	"strings"
	"testing"
)

// MA3: subjects are normalized and bounded; bodies keep their Markdown whitespace.
func TestValidateAnnouncement(t *testing.T) {
	s, b, errs := ValidateAnnouncement("  Demo   day ", "## Title\n\n    code\n")
	if len(errs) != 0 || s != "Demo day" || b != "## Title\n\n    code\n" {
		t.Fatalf("got %q %q %v", s, b, errs)
	}
	for name, tc := range map[string][2]string{
		"short subject": {"Hi", "Body"},
		"long subject":  {strings.Repeat("x", 121), "Body"},
		"blank body":    {"Hello", " \n "},
		"long body":     {"Hello", strings.Repeat("x", MailBodyMax+1)},
		"control":       {"Hello", "a\x00b"},
	} {
		if _, _, errs := ValidateAnnouncement(tc[0], tc[1]); len(errs) == 0 {
			t.Errorf("%s: no error", name)
		}
	}
	for _, k := range []MailKind{MailAnnouncement, MailWelcome, MailReview, MailCertificate, MailClass} {
		if !k.Valid() {
			t.Errorf("%s invalid", k)
		}
	}
	if MailKind("spam").Valid() || Audience("everyone").Valid() {
		t.Error("unknown values valid")
	}
}
