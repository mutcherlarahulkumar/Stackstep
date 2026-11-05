package httpapi

import (
	"encoding/base64"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Uploads travel as base64 in JSON: a 4 MB image is ~5.4 MB encoded.
const uploadBodyMax = 6 << 20

type applicantDetailsDTO struct {
	FullName    string `json:"full_name"`
	Phone       string `json:"phone"`
	DateOfBirth string `json:"date_of_birth"`
	College     string `json:"college"`
	Course      string `json:"course"`
	Branch      string `json:"branch"`
	GradYear    int    `json:"grad_year"`
}

type applicationDTO struct {
	ID           uuid.UUID                `json:"id"`
	Status       domain.ApplicationStatus `json:"status"`
	CohortID     uuid.UUID                `json:"cohort_id"`
	Details      applicantDetailsDTO      `json:"details"`
	FeeINR       int                      `json:"fee_inr"`
	PaidINR      int                      `json:"paid_inr"`
	DueINR       int                      `json:"due_inr"`
	Flag         *domain.ApplicationFlag  `json:"flag"`
	FlagNote     string                   `json:"flag_note"`
	Actions      []domain.ApplicantAction `json:"actions"`
	DecidedAt    *time.Time               `json:"decided_at"`
	EnrollmentID *uuid.UUID               `json:"enrollment_id"`
	Version      int                      `json:"version"`
	CreatedAt    time.Time                `json:"created_at"`
	UpdatedAt    time.Time                `json:"updated_at"`
}

func toApplication(a domain.Application) applicationDTO {
	d := a.Details
	var decided *time.Time
	if a.DecidedAt != nil {
		t := a.DecidedAt.UTC()
		decided = &t
	}
	return applicationDTO{
		ID: a.ID, Status: a.Status, CohortID: a.CohortID,
		Details: applicantDetailsDTO{FullName: d.FullName, Phone: d.Phone, DateOfBirth: d.DateOfBirth.Format(time.DateOnly), College: d.College,
			Course: d.Course, Branch: d.Branch, GradYear: d.GradYear},
		FeeINR: a.FeeINR, PaidINR: a.PaidINR, DueINR: a.DueINR(), Flag: a.Flag, FlagNote: a.FlagNote, Actions: a.Status.Actions(a.Flag),
		DecidedAt: decided, EnrollmentID: a.EnrollmentID, Version: a.Version, CreatedAt: a.CreatedAt.UTC(), UpdatedAt: a.UpdatedAt.UTC(),
	}
}

type proofDTO struct {
	ID         uuid.UUID `json:"id"`
	UTR        string    `json:"utr"`
	AmountINR  int       `json:"amount_inr"`
	UploadedAt time.Time `json:"uploaded_at"`
	Duplicate  bool      `json:"duplicate"` // staff only; always false for applicants
}

type appMessageDTO struct {
	ID        uuid.UUID                `json:"id"`
	Author    domain.ApplicationAuthor `json:"author"`
	Body      string                   `json:"body"`
	ClientID  *uuid.UUID               `json:"client_id"`
	CreatedAt time.Time                `json:"created_at"`
}

func toAppMessage(m store.AppMessage) appMessageDTO {
	return appMessageDTO{ID: m.ID, Author: m.Author, Body: m.Body, ClientID: m.ClientID, CreatedAt: m.CreatedAt.UTC()}
}

type paymentInfoDTO struct {
	UPIID          string    `json:"upi_id"`
	PayeeName      string    `json:"payee_name"`
	Note           string    `json:"note"`
	HasQR          bool      `json:"has_qr"`
	NoRefundPolicy string    `json:"no_refund_policy"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func toPaymentInfo(p store.PaymentSettings) paymentInfoDTO {
	return paymentInfoDTO{UPIID: p.UPIID, PayeeName: p.PayeeName, Note: p.Note, HasQR: p.HasQR, NoRefundPolicy: domain.NoRefundPolicy, UpdatedAt: p.UpdatedAt.UTC()}
}

type applicantViewDTO struct {
	Application *applicationDTO `json:"application"`
	Cohort      *cohortDTO      `json:"cohort"`
	Proofs      []proofDTO      `json:"proofs"`
	Messages    []appMessageDTO `json:"messages"`
	Cohorts     []cohortDTO     `json:"cohorts"`
	Payment     paymentInfoDTO  `json:"payment"`
	Enrolled    bool            `json:"enrolled"`
}

func toApplicantView(v app.ApplicantView, staff bool) applicantViewDTO {
	out := applicantViewDTO{Proofs: []proofDTO{}, Messages: []appMessageDTO{}, Cohorts: []cohortDTO{}, Payment: toPaymentInfo(v.Payment), Enrolled: v.Enrolled}
	if v.App != nil {
		a := toApplication(*v.App)
		out.Application = &a
	}
	if v.Cohort != nil {
		c := toCohort(*v.Cohort)
		out.Cohort = &c
	}
	for _, p := range v.Proofs {
		out.Proofs = append(out.Proofs, proofDTO{ID: p.ID, UTR: p.UTR, AmountINR: p.AmountINR, UploadedAt: p.UploadedAt.UTC(), Duplicate: staff && p.Duplicate})
	}
	for _, m := range v.Messages {
		out.Messages = append(out.Messages, toAppMessage(m))
	}
	for _, c := range v.Cohorts {
		out.Cohorts = append(out.Cohorts, toCohort(c))
	}
	return out
}

type imageDTO struct {
	ContentType string `json:"content_type"`
	DataBase64  string `json:"data_base64"`
}

func sendImage(c *gin.Context, img []byte, typ string) {
	c.Header("Cache-Control", "private, max-age=300")
	c.JSON(http.StatusOK, imageDTO{ContentType: typ, DataBase64: base64.StdEncoding.EncodeToString(img)})
}

func decodeImage(raw string) ([]byte, error) {
	if i := strings.Index(raw, ","); strings.HasPrefix(raw, "data:") && i > 0 {
		raw = raw[i+1:] // tolerate a data URL
	}
	b, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, apperr.Validation(map[string]string{"image": "The image didn't upload correctly. Try again."})
	}
	return b, nil
}

// ---- Student ----

func (s *Server) myApplication(c *gin.Context) {
	v, err := s.admissions.Mine(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toApplicantView(v, false))
}

type saveApplicationReq struct {
	CohortID        uuid.UUID `json:"cohort_id"`
	FullName        string    `json:"full_name"`
	Phone           string    `json:"phone"`
	DateOfBirth     string    `json:"date_of_birth"`
	College         string    `json:"college"`
	Course          string    `json:"course"`
	Branch          string    `json:"branch"`
	GradYear        int       `json:"grad_year"`
	ExpectedVersion *int      `json:"expected_version"`
}

func (s *Server) saveApplication(c *gin.Context) {
	var req saveApplicationReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	dob, err := time.Parse(time.DateOnly, req.DateOfBirth)
	if err != nil && req.DateOfBirth != "" {
		s.fail(c, apperr.Validation(map[string]string{"date_of_birth": "Enter your date of birth."}))
		return
	}
	v, err := s.admissions.Save(c.Request.Context(), currentUser(c), app.ApplicationInput{
		CohortID: req.CohortID, ExpectedVersion: req.ExpectedVersion,
		Details: domain.ApplicantDetails{FullName: req.FullName, Phone: req.Phone, DateOfBirth: dob, College: req.College, Course: req.Course,
			Branch: req.Branch, GradYear: req.GradYear},
	})
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toApplicantView(v, false))
}

type uploadProofReq struct {
	ImageBase64     string `json:"image_base64"`
	UTR             string `json:"utr"`
	AmountINR       int    `json:"amount_inr"`
	ExpectedVersion int    `json:"expected_version"`
}

func (s *Server) uploadProof(c *gin.Context) {
	var req uploadProofReq
	if err := decodeLimit(c, &req, uploadBodyMax); err != nil {
		s.fail(c, err)
		return
	}
	img, err := decodeImage(req.ImageBase64)
	if err != nil {
		s.fail(c, err)
		return
	}
	v, err := s.admissions.UploadProof(c.Request.Context(), currentUser(c), app.ProofInput{Image: img, UTR: req.UTR, AmountINR: req.AmountINR, ExpectedVersion: req.ExpectedVersion})
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toApplicantView(v, false))
}

type versionReq struct {
	ExpectedVersion int `json:"expected_version"`
}

func (s *Server) resubmitApplication(c *gin.Context) {
	var req versionReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	v, err := s.admissions.Resubmit(c.Request.Context(), currentUser(c), req.ExpectedVersion)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toApplicantView(v, false))
}

type appMessageReq struct {
	ClientID uuid.UUID `json:"client_id"`
	Body     string    `json:"body"`
}

func (s *Server) sendApplicantMessage(c *gin.Context) {
	var req appMessageReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	m, err := s.admissions.SendAsApplicant(c.Request.Context(), currentUser(c), req.ClientID, req.Body)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toAppMessage(m))
}

func (s *Server) myProofImage(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	img, typ, err := s.admissions.MyProofImage(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	sendImage(c, img, typ)
}

func (s *Server) paymentQR(c *gin.Context) {
	img, typ, err := s.admissions.PaymentQR(c.Request.Context())
	if err != nil {
		s.fail(c, err)
		return
	}
	sendImage(c, img, typ)
}

// ---- Staff ----

type applicationRowDTO struct {
	Application applicationDTO `json:"application"`
	Applicant   userDTO        `json:"applicant"`
	CohortName  string         `json:"cohort_name"`
	CollegeName *string        `json:"college_name"`
	Proofs      int            `json:"proofs"`
	Unread      bool           `json:"unread"`
}

func (s *Server) listApplications(c *gin.Context) {
	var status *domain.ApplicationStatus
	if raw := c.Query("status"); raw != "" {
		st := domain.ApplicationStatus(raw)
		if !st.Valid() {
			s.fail(c, apperr.Validation(map[string]string{"status": "Unknown status."}))
			return
		}
		status = &st
	}
	rows, waiting, err := s.admissions.Applications(c.Request.Context(), currentUser(c), status)
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]applicationRowDTO, len(rows))
	for i, r := range rows {
		items[i] = applicationRowDTO{Application: toApplication(r.App), Applicant: toUser(r.Applicant), CohortName: r.CohortName, CollegeName: r.CollegeName,
			Proofs: r.Proofs, Unread: r.UnreadStaff}
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "waiting": waiting})
}

type staffApplicationDTO struct {
	applicantViewDTO
	Applicant userDTO `json:"applicant"`
}

func (s *Server) getApplication(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	v, err := s.admissions.Application(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, staffApplicationDTO{applicantViewDTO: toApplicantView(v.ApplicantView, true), Applicant: toUser(v.Applicant)})
}

type decisionReq struct {
	Action          domain.ApplicationDecision `json:"action"`
	Flag            *domain.ApplicationFlag    `json:"flag"`
	Note            string                     `json:"note"`
	PaidINR         *int                       `json:"paid_inr"`
	FlowID          *uuid.UUID                 `json:"flow_id"`
	ExpectedVersion int                        `json:"expected_version"`
}

func (s *Server) decideApplication(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req decisionReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	if !req.Action.Valid() {
		s.fail(c, apperr.Validation(map[string]string{"action": "Pick approve, flag or reject."}))
		return
	}
	d := app.Decision{Action: req.Action, Note: req.Note, PaidINR: req.PaidINR, FlowID: req.FlowID, ExpectedVersion: req.ExpectedVersion}
	if req.Flag != nil {
		d.Flag = *req.Flag
	}
	v, err := s.admissions.Decide(c.Request.Context(), currentUser(c), id, d)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, staffApplicationDTO{applicantViewDTO: toApplicantView(v.ApplicantView, true), Applicant: toUser(v.Applicant)})
}

func (s *Server) sendStaffApplicationMessage(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req appMessageReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	m, err := s.admissions.SendAsStaff(c.Request.Context(), currentUser(c), id, req.ClientID, req.Body)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toAppMessage(m))
}

func (s *Server) staffProofImage(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	proof, err := pathUUID(c, "proof")
	if err != nil {
		s.fail(c, err)
		return
	}
	img, typ, err := s.admissions.StaffProofImage(c.Request.Context(), currentUser(c), id, proof)
	if err != nil {
		s.fail(c, err)
		return
	}
	sendImage(c, img, typ)
}

func (s *Server) getPaymentSettings(c *gin.Context) {
	p, err := s.admissions.PaymentSettings(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toPaymentInfo(p))
}

type paymentSettingsReq struct {
	UPIID     string `json:"upi_id"`
	PayeeName string `json:"payee_name"`
	Note      string `json:"note"`
}

func (s *Server) putPaymentSettings(c *gin.Context) {
	var req paymentSettingsReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	p, err := s.admissions.SetPaymentDetails(c.Request.Context(), currentUser(c), req.UPIID, req.PayeeName, req.Note)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toPaymentInfo(p))
}

type qrReq struct {
	ImageBase64 string `json:"image_base64"`
}

func (s *Server) putPaymentQR(c *gin.Context) {
	var req qrReq
	if err := decodeLimit(c, &req, uploadBodyMax); err != nil {
		s.fail(c, err)
		return
	}
	img, err := decodeImage(req.ImageBase64)
	if err != nil {
		s.fail(c, err)
		return
	}
	p, err := s.admissions.SetPaymentQR(c.Request.Context(), currentUser(c), img)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toPaymentInfo(p))
}

type cohortAdmissionsReq struct {
	FeeINR           *int `json:"fee_inr"`
	ApplicationsOpen bool `json:"applications_open"`
}

func (s *Server) setCohortAdmissions(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req cohortAdmissionsReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	row, err := s.admissions.SetCohortAdmissions(c.Request.Context(), currentUser(c), id, req.FeeINR, req.ApplicationsOpen)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toCohort(row))
}
