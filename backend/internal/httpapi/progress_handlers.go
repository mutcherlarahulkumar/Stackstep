package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

type progressDTO struct {
	Released          int             `json:"released"`
	Done              int             `json:"done"`
	InReview          int             `json:"in_review"`
	Overdue           int             `json:"overdue"`
	OnTime            int             `json:"on_time"`
	Points            int             `json:"points"`
	DayNumber         int             `json:"day_number"`
	Days              int             `json:"days"`
	CompletionPercent int             `json:"completion_percent"`
	BarPercent        int             `json:"bar_percent"`
	MeetsBar          bool            `json:"meets_bar"`
	Certificate       *certificateDTO `json:"certificate"`
}

type certificateDTO struct {
	Code         string                   `json:"code"`
	StudentName  string                   `json:"student_name"`
	GitHubLogin  string                   `json:"github_login"`
	ProgramSlug  string                   `json:"program_slug"`
	ProgramDays  int                      `json:"program_days"`
	FlowName     *string                  `json:"flow_name"`
	StartDate    string                   `json:"start_date"`
	EndDate      string                   `json:"end_date"`
	Points       int                      `json:"points"`
	TasksDone    int                      `json:"tasks_done"`
	TasksTotal   int                      `json:"tasks_total"`
	IssuedAt     time.Time                `json:"issued_at"`
	Status       domain.CertificateStatus `json:"status"`
	RevokedAt    *time.Time               `json:"revoked_at"`
	RevokeReason *string                  `json:"revoke_reason"`
}

func toCertificate(c domain.Certificate) certificateDTO {
	d := certificateDTO{Code: c.Code, StudentName: c.StudentName, GitHubLogin: c.GitHubLogin, ProgramSlug: c.ProgramSlug, ProgramDays: c.ProgramDays,
		FlowName: c.FlowName, StartDate: c.StartDate.Format(time.DateOnly), EndDate: c.EndDate.Format(time.DateOnly), Points: c.Points,
		TasksDone: c.TasksDone, TasksTotal: c.TasksTotal, IssuedAt: c.IssuedAt.UTC(), Status: c.Status(), RevokeReason: c.RevokeReason}
	if c.RevokedAt != nil {
		t := c.RevokedAt.UTC()
		d.RevokedAt = &t
	}
	return d
}

func toProgress(v app.ProgressView) progressDTO {
	p := v.Progress
	d := progressDTO{Released: p.Released, Done: p.Done, InReview: p.InReview, Overdue: p.Overdue, OnTime: p.OnTime, Points: p.Points,
		DayNumber: p.DayNumber, Days: p.Days, CompletionPercent: p.CompletionPercent(), BarPercent: domain.CertificateBarPercent, MeetsBar: p.MeetsBar()}
	if v.Certificate != nil {
		c := toCertificate(*v.Certificate)
		d.Certificate = &c
	}
	return d
}

func (s *Server) myProgress(c *gin.Context) {
	v, err := s.workspace.MyProgress(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toProgress(v))
}

func (s *Server) myCertificates(c *gin.Context) {
	rows, err := s.workspace.MyCertificates(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]certificateDTO, len(rows))
	for i, r := range rows {
		items[i] = toCertificate(r)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) staffProgress(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	v, err := s.workspace.StaffProgress(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toProgress(v))
}

func (s *Server) issueCertificate(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	cert, err := s.workspace.IssueCertificate(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toCertificate(cert))
}

type revokeReq struct {
	Reason string `json:"reason"`
}

func (s *Server) revokeCertificate(c *gin.Context) {
	var req revokeReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	cert, err := s.workspace.RevokeCertificate(c.Request.Context(), currentUser(c), c.Param("code"), req.Reason)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toCertificate(cert))
}

// verifyCertificate is public: anyone with the code can check it.
func (s *Server) verifyCertificate(c *gin.Context) {
	cert, err := s.workspace.VerifyCertificate(c.Request.Context(), c.Param("code"))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, toCertificate(cert))
}
