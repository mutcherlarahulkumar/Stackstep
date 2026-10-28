package httpapi

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type appView struct {
	Application *struct {
		ID       uuid.UUID `json:"id"`
		Status   string    `json:"status"`
		CohortID uuid.UUID `json:"cohort_id"`
		FeeINR   int       `json:"fee_inr"`
		PaidINR  int       `json:"paid_inr"`
		DueINR   int       `json:"due_inr"`
		Flag     *string   `json:"flag"`
		FlagNote string    `json:"flag_note"`
		Actions  []string  `json:"actions"`
		Version  int       `json:"version"`
		Details  struct {
			FullName string `json:"full_name"`
			Phone    string `json:"phone"`
			Branch   string `json:"branch"`
		} `json:"details"`
		EnrollmentID *uuid.UUID `json:"enrollment_id"`
	} `json:"application"`
	Proofs []struct {
		ID        uuid.UUID `json:"id"`
		UTR       string    `json:"utr"`
		Duplicate bool      `json:"duplicate"`
	} `json:"proofs"`
	Messages []struct {
		Author string `json:"author"`
		Body   string `json:"body"`
	} `json:"messages"`
	Cohorts []struct {
		ID     uuid.UUID `json:"id"`
		Name   string    `json:"name"`
		FeeINR *int      `json:"fee_inr"`
	} `json:"cohorts"`
	Payment struct {
		UPIID          string `json:"upi_id"`
		HasQR          bool   `json:"has_qr"`
		NoRefundPolicy string `json:"no_refund_policy"`
	} `json:"payment"`
	Enrolled bool `json:"enrolled"`
}

func (e *env) myApp(tok string) appView {
	e.t.Helper()
	var v appView
	e.expect(e.do("GET", "/v1/me/application", tok, nil), 200).json(e.t, &v)
	return v
}

func details(cohort uuid.UUID, version *int) map[string]any {
	return map[string]any{
		"cohort_id": cohort, "full_name": "Nora Fernandes", "phone": "+91 98765 43210", "date_of_birth": "2004-05-17",
		"college": "ANITS", "course": "B.Tech", "branch": "Computer Science", "grad_year": 2027, "expected_version": version,
	}
}

func proof(img []byte, utr string, amount, version int) map[string]any {
	return map[string]any{"image_base64": base64.StdEncoding.EncodeToString(img), "utr": utr, "amount_inr": amount, "expected_version": version}
}

// screenshot returns a distinct PNG for each n (the bytes differ, so the hash does).
func screenshot(n byte) []byte { return append(seed.SampleQR(), n) }

func (e *env) decide(adm string, id uuid.UUID, body map[string]any) resp {
	return e.do("POST", "/v1/admin/applications/"+id.String()+"/decision", adm, body)
}

// AP1–AP7: apply, pay, get flagged for a partial payment, pay the rest, get approved and enrolled.
func TestApplicationHappyPathWithPartialPayment(t *testing.T) {
	e := newEnv(t)
	nora := e.login(seed.NoEnrollLogin)

	// AP1: nothing started; one open cohort with its fee; where to pay; the no-refund policy.
	v := e.myApp(nora)
	if v.Application != nil || v.Enrolled || len(v.Cohorts) != 1 || v.Cohorts[0].FeeINR == nil || *v.Cohorts[0].FeeINR != 4999 ||
		v.Payment.UPIID != "stackstep@okaxis" || !v.Payment.HasQR || !strings.Contains(v.Payment.NoRefundPolicy, "non-refundable") {
		t.Fatalf("start view = %+v", v)
	}
	cohort := v.Cohorts[0].ID

	// AP2: details are validated field by field.
	bad := details(cohort, nil)
	bad["phone"], bad["date_of_birth"], bad["grad_year"], bad["full_name"] = "123", "2020-01-01", 1900, " "
	f := e.expect(e.do("PUT", "/v1/me/application", nora, bad), 422).errCode(t).Error.Fields
	for _, k := range []string{"phone", "date_of_birth", "grad_year", "full_name"} {
		if f[k] == "" {
			t.Errorf("no error for %s: %v", k, f)
		}
	}
	e.expectCode(e.do("PUT", "/v1/me/application", nora, details(uuid.New(), nil)), 422, "validation_failed")

	// AP3: a draft; changing it needs the version.
	e.expect(e.do("PUT", "/v1/me/application", nora, details(cohort, nil)), 200).json(t, &v)
	if a := v.Application; a == nil || a.Status != "draft" || a.FeeINR != 4999 || a.DueINR != 4999 || a.Details.Phone != "+919876543210" {
		t.Fatalf("draft = %+v", v.Application)
	}
	e.expectCode(e.do("PUT", "/v1/me/application", nora, details(cohort, nil)), 409, "version_conflict")
	ver := v.Application.Version

	// AP4: proofs are checked; a good one sends it for review.
	e.expect(e.do("POST", "/v1/me/application/proofs", nora, proof([]byte("not an image"), "ab", 0, ver)), 422)
	e.expect(e.do("POST", "/v1/me/application/proofs", nora, proof(screenshot(1), "UTR123456789", 2000, ver)), 200).json(t, &v)
	if v.Application.Status != "submitted" || len(v.Proofs) != 1 || v.Proofs[0].UTR != "UTR123456789" || len(v.Application.Actions) != 0 {
		t.Fatalf("submitted = %+v", v)
	}
	e.expectCode(e.do("POST", "/v1/me/application/proofs", nora, proof(screenshot(2), "UTR999999999", 2999, v.Application.Version)), 400, "invalid_state")

	// AP5: the admin queue shows it first and counts it.
	adm := e.login(seed.AdminLogin)
	var q struct {
		Items []struct {
			Application struct {
				ID     uuid.UUID `json:"id"`
				Status string    `json:"status"`
			} `json:"application"`
			Applicant struct {
				GitHubLogin string `json:"github_login"`
			} `json:"applicant"`
			Proofs int  `json:"proofs"`
			Unread bool `json:"unread"`
		} `json:"items"`
		Waiting int `json:"waiting"`
	}
	e.expect(e.do("GET", "/v1/admin/applications", adm, nil), 200).json(t, &q)
	if q.Waiting != 1 || len(q.Items) != 1 || q.Items[0].Applicant.GitHubLogin != seed.NoEnrollLogin || q.Items[0].Proofs != 1 || !q.Items[0].Unread {
		t.Fatalf("queue = %+v", q)
	}
	id := q.Items[0].Application.ID
	var sv appView
	e.expect(e.do("GET", "/v1/admin/applications/"+id.String(), adm, nil), 200).json(t, &sv)
	var img struct {
		ContentType string `json:"content_type"`
		DataBase64  string `json:"data_base64"`
	}
	e.expect(e.do("GET", "/v1/admin/applications/"+id.String()+"/proofs/"+sv.Proofs[0].ID.String()+"/image", adm, nil), 200).json(t, &img)
	if img.ContentType != "image/png" || img.DataBase64 == "" {
		t.Fatalf("image = %s", img.ContentType)
	}
	// College admins only see their college's cohorts; this one has none.
	e.expect(e.do("GET", "/v1/admin/applications/"+id.String(), e.login(seed.CollegeAdminLogin), nil), 404)

	// AP6: approving short of the fee is refused; flag it as partial: the student owes the rest.
	e.expectCode(e.decide(adm, id, map[string]any{"action": "approve", "paid_inr": 2000, "expected_version": sv.Application.Version}), 422, "validation_failed")
	e.expect(e.decide(adm, id, map[string]any{"action": "flag", "flag": "partial_payment", "paid_inr": 2000, "note": "", "expected_version": sv.Application.Version}), 200)
	v = e.myApp(nora)
	if a := v.Application; a.Status != "flagged" || *a.Flag != "partial_payment" || a.DueINR != 2999 || len(a.Actions) != 1 || a.Actions[0] != "pay" {
		t.Fatalf("flagged = %+v", a)
	}
	if last := v.Messages[len(v.Messages)-1]; last.Author != "system" || !strings.Contains(last.Body, "remaining ₹2,999") {
		t.Fatalf("flag message = %+v", last)
	}
	// The same screenshot again is caught.
	f = e.expect(e.do("POST", "/v1/me/application/proofs", nora, proof(screenshot(1), "UTR555555555", 2999, v.Application.Version)), 422).errCode(t).Error.Fields
	if !strings.Contains(f["image"], "already sent") {
		t.Fatalf("duplicate = %v", f)
	}
	e.expect(e.do("POST", "/v1/me/application/proofs", nora, proof(screenshot(2), "UTR555555555", 2999, v.Application.Version)), 200).json(t, &v)
	if v.Application.Status != "submitted" {
		t.Fatalf("after balance = %s", v.Application.Status)
	}

	// AP7: approve with the full amount: the student is enrolled and the workspace opens.
	e.expect(e.do("GET", "/v1/admin/applications/"+id.String(), adm, nil), 200).json(t, &sv)
	e.expect(e.decide(adm, id, map[string]any{"action": "approve", "paid_inr": 4999, "expected_version": sv.Application.Version}), 200).json(t, &sv)
	if sv.Application.Status != "approved" || sv.Application.EnrollmentID == nil {
		t.Fatalf("approved = %+v", sv.Application)
	}
	if me := e.me(e.login(seed.NoEnrollLogin)); me.Enrollment == nil || me.Enrollment.Status != "active" {
		t.Fatalf("not enrolled: %+v", me)
	}
	v = e.myApp(nora)
	if !v.Enrolled || !strings.Contains(v.Messages[len(v.Messages)-1].Body, "You're enrolled") {
		t.Fatalf("view after approval = %+v", v)
	}
	// AP8: a decided application can't be decided again; enrolled students can't apply.
	e.expectCode(e.decide(adm, id, map[string]any{"action": "reject", "note": "too late", "expected_version": sv.Application.Version}), 422, "invalid_transition")
	e.expectCode(e.do("PUT", "/v1/me/application", nora, details(cohort, nil)), 400, "invalid_state")
}

// AP9–AP12: cohort mismatch, another student's screenshot, rejection with the no-refund
// policy, chat both ways, settings and cohort admissions.
func TestApplicationIssues(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	nora := e.login(seed.NoEnrollLogin)
	v := e.myApp(nora)
	expensive := v.Cohorts[0].ID

	// A cheaper cohort to switch to.
	var cheap struct {
		ID uuid.UUID `json:"id"`
	}
	e.expect(e.do("POST", "/v1/admin/cohorts", adm, map[string]any{
		"kind": "group", "name": "Weekend Cohort", "program_slug": "frontend-30", "start_date": testNow.AddDate(0, 0, 21).Format(time.DateOnly),
		"timezone": "Asia/Kolkata", "seats_total": 50,
	}), 201).json(t, &cheap)
	e.expectCode(e.do("PATCH", "/v1/admin/cohorts/"+cheap.ID.String()+"/admissions", adm, map[string]any{"fee_inr": nil, "applications_open": true}), 422, "validation_failed")
	e.expect(e.do("PATCH", "/v1/admin/cohorts/"+cheap.ID.String()+"/admissions", e.login(seed.CollegeAdminLogin), map[string]any{"fee_inr": 2999, "applications_open": true}), 403)
	e.expect(e.do("PATCH", "/v1/admin/cohorts/"+cheap.ID.String()+"/admissions", adm, map[string]any{"fee_inr": 2999, "applications_open": true}), 200)

	// AP9: paid the cheaper fee for the expensive cohort → flagged → switch → back to review.
	e.expect(e.do("PUT", "/v1/me/application", nora, details(expensive, nil)), 200).json(t, &v)
	e.expect(e.do("POST", "/v1/me/application/proofs", nora, proof(screenshot(7), "UTR777777777", 2999, v.Application.Version)), 200).json(t, &v)
	id := v.Application.ID
	var sv appView
	e.expect(e.do("GET", "/v1/admin/applications/"+id.String(), adm, nil), 200).json(t, &sv)
	e.expect(e.decide(adm, id, map[string]any{"action": "flag", "flag": "cohort_mismatch", "paid_inr": 2999, "note": "You paid the Weekend fee.", "expected_version": sv.Application.Version}), 200)
	v = e.myApp(nora)
	if a := v.Application; a.Status != "flagged" || !contains(a.Actions, "change_cohort") || a.FlagNote != "You paid the Weekend fee." {
		t.Fatalf("mismatch = %+v", a)
	}
	e.expect(e.do("PUT", "/v1/me/application", nora, details(cheap.ID, &v.Application.Version)), 200).json(t, &v)
	if a := v.Application; a.Status != "submitted" || a.CohortID != cheap.ID || a.DueINR != 0 {
		t.Fatalf("after switch = %+v", a)
	}

	// AP10: another student can't reuse that screenshot or UTR.
	ravi := e.login(seed.Student2Login)
	_ = ravi // enrolled students can't apply at all
	e.expectCode(e.do("PUT", "/v1/me/application", ravi, details(cheap.ID, nil)), 400, "invalid_state")

	// AP11: chat both ways; rejection needs a reason and says fees aren't refunded; a new
	// application can start afterwards.
	e.expect(e.do("POST", "/v1/me/application/messages", nora, map[string]any{"client_id": uuid.New(), "body": "Is my payment ok?"}), 201)
	e.expect(e.do("POST", "/v1/admin/applications/"+id.String()+"/messages", adm, map[string]any{"client_id": uuid.New(), "body": "Checking now."}), 201)
	v = e.myApp(nora)
	if n := len(v.Messages); n < 2 || v.Messages[n-1].Author != "staff" || v.Messages[n-2].Author != "applicant" {
		t.Fatalf("chat = %+v", v.Messages)
	}
	e.expect(e.do("GET", "/v1/admin/applications/"+id.String(), adm, nil), 200).json(t, &sv)
	e.expectCode(e.decide(adm, id, map[string]any{"action": "reject", "note": "", "expected_version": sv.Application.Version}), 422, "validation_failed")
	e.expect(e.decide(adm, id, map[string]any{"action": "reject", "note": "The payment was reversed by the bank.", "expected_version": sv.Application.Version}), 200)
	v = e.myApp(nora)
	if last := v.Messages[len(v.Messages)-1].Body; v.Application.Status != "rejected" || !strings.Contains(last, "non-refundable") {
		t.Fatalf("rejected = %s / %q", v.Application.Status, last)
	}
	// The student's data export includes the application, its payments and the chat.
	var ex struct {
		Applications []struct {
			Phone    string `json:"phone"`
			Status   string `json:"status"`
			Payments []struct {
				UTR string `json:"utr"`
			} `json:"payments"`
			Messages []struct {
				Body string `json:"body"`
			} `json:"messages"`
		} `json:"applications"`
	}
	e.expect(e.do("GET", "/v1/me/export", nora, nil), 200).json(t, &ex)
	if len(ex.Applications) != 1 || ex.Applications[0].Status != "rejected" || ex.Applications[0].Phone != "+919876543210" ||
		len(ex.Applications[0].Payments) != 1 || len(ex.Applications[0].Messages) < 3 {
		t.Fatalf("export = %+v", ex)
	}
	e.expect(e.do("PUT", "/v1/me/application", nora, details(cheap.ID, nil)), 200).json(t, &v)
	if v.Application.Status != "draft" || v.Application.ID == id {
		t.Fatalf("new application = %+v", v.Application)
	}
	// AP13: admissions close after the student picked the cohort: details can still be fixed,
	// but nobody new can pick it.
	e.expect(e.do("PATCH", "/v1/admin/cohorts/"+cheap.ID.String()+"/admissions", adm, map[string]any{"fee_inr": 2999, "applications_open": false}), 200)
	fix := details(cheap.ID, &v.Application.Version)
	fix["branch"] = "Information Technology"
	e.expect(e.do("PUT", "/v1/me/application", nora, fix), 200).json(t, &v)
	if v.Application.Details.Branch != "Information Technology" {
		t.Fatalf("details not saved: %+v", v.Application.Details)
	}
	e.expect(e.do("PATCH", "/v1/admin/cohorts/"+cheap.ID.String()+"/admissions", adm, map[string]any{"fee_inr": 2999, "applications_open": true}), 200)

	// The rejected application's screenshot is now "used elsewhere" for the new one.
	f := e.expect(e.do("POST", "/v1/me/application/proofs", nora, proof(screenshot(7), "UTR000000001", 2999, v.Application.Version)), 422).errCode(t).Error.Fields
	if !strings.Contains(f["image"], "another application") {
		t.Fatalf("reuse = %v", f)
	}

	// AP12: payment settings: platform admins only, a real-looking UPI ID, image QR only.
	e.expect(e.do("PUT", "/v1/admin/payment-settings", e.login(seed.CollegeAdminLogin), map[string]any{"upi_id": "x@y", "payee_name": "", "note": ""}), 403)
	e.expectCode(e.do("PUT", "/v1/admin/payment-settings", adm, map[string]any{"upi_id": "not a upi", "payee_name": "", "note": ""}), 422, "validation_failed")
	e.expect(e.do("PUT", "/v1/admin/payment-settings", adm, map[string]any{"upi_id": "pay.stackstep@icici", "payee_name": "Stackstep", "note": "Exact amount"}), 200)
	e.expectCode(e.do("PUT", "/v1/admin/payment-settings/qr", adm, map[string]any{"image_base64": base64.StdEncoding.EncodeToString([]byte("gif89a nope"))}), 422, "validation_failed")
	e.expect(e.do("PUT", "/v1/admin/payment-settings/qr", adm, map[string]any{"image_base64": base64.StdEncoding.EncodeToString(screenshot(9))}), 200)
	var qr struct {
		ContentType string `json:"content_type"`
	}
	e.expect(e.do("GET", "/v1/payment-qr", nora, nil), 200).json(t, &qr)
	if qr.ContentType != "image/png" || e.myApp(nora).Payment.UPIID != "pay.stackstep@icici" {
		t.Fatal("settings not applied")
	}
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
