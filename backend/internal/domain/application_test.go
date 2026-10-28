package domain

import (
	"strings"
	"testing"
	"time"
)

func TestValidateDetails(t *testing.T) {
	now := time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC)
	ok := ApplicantDetails{FullName: " Nora  F ", Phone: "+91 98765-43210", DateOfBirth: time.Date(2004, 5, 1, 0, 0, 0, 0, time.UTC),
		College: "ANITS", Course: "B.Tech", Branch: "CSE", GradYear: 2027}
	d, errs := ValidateDetails(ok, now)
	if len(errs) != 0 || d.FullName != "Nora F" || d.Phone != "+919876543210" {
		t.Fatalf("got %+v %v", d, errs)
	}
	bad := ok
	bad.Phone, bad.DateOfBirth, bad.GradYear, bad.Branch = "12345", now.AddDate(-10, 0, 0), 2050, strings.Repeat("x", 121)
	_, errs = ValidateDetails(bad, now)
	for _, k := range []string{"phone", "date_of_birth", "grad_year", "branch"} {
		if errs[k] == "" {
			t.Errorf("missing %s: %v", k, errs)
		}
	}
}

func TestValidateProof(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\n0000")
	p, errs := ValidateProof(png, " utr12345678 ", 4999)
	if len(errs) != 0 || p.Type != "image/png" || p.UTR != "UTR12345678" || len(p.SHA256) != 64 {
		t.Fatalf("got %+v %v", p, errs)
	}
	_, errs = ValidateProof([]byte("GIF89a...."), "12 34", 0)
	if errs["image"] == "" || errs["utr"] == "" || errs["amount_inr"] == "" {
		t.Fatalf("errs = %v", errs)
	}
	_, errs = ValidateProof(make([]byte, ProofMaxBytes+1), "UTR123456", 10)
	if !strings.Contains(errs["image"], "4 MB") {
		t.Fatalf("size = %v", errs)
	}
}

func TestActionsPerFlag(t *testing.T) {
	cases := map[ApplicationFlag][]ApplicantAction{
		FlagPartialPayment: {ActionPay},
		FlagCohortMismatch: {ActionChangeCohort, ActionPay},
		FlagCohortFull:     {ActionChangeCohort, ActionPay},
		FlagUnclearProof:   {ActionPay},
		FlagDetailsWrong:   {ActionEditDetails, ActionResubmit},
	}
	for f, want := range cases {
		got := AppFlagged.Actions(&f)
		if len(got) != len(want) {
			t.Fatalf("%s: %v", f, got)
		}
	}
	if len(AppSubmitted.Actions(nil)) != 0 || len(AppApproved.Actions(nil)) != 0 || AppSubmitted.Allows(nil, ActionPay) {
		t.Fatal("closed or waiting applications must offer nothing")
	}
	if _, errs := ValidateFlag(FlagOther, "x"); errs["note"] == "" {
		t.Fatal("other needs a note")
	}
}
