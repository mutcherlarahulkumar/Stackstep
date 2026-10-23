package httpapi

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

type overviewCertDTO struct {
	Code   string                   `json:"code"`
	Status domain.CertificateStatus `json:"status"`
}

type overviewRowDTO struct {
	Student           studentDTO       `json:"student"`
	Released          int              `json:"released"`
	Done              int              `json:"done"`
	InReview          int              `json:"in_review"`
	Overdue           int              `json:"overdue"`
	CompletionPercent int              `json:"completion_percent"`
	Points            int              `json:"points"`
	Credits           int              `json:"credits"`
	LastActiveAt      *time.Time       `json:"last_active_at"`
	Inactive          bool             `json:"inactive"`
	Certificate       *overviewCertDTO `json:"certificate"`
}

type overviewSummaryDTO struct {
	Students      int `json:"students"`
	Active        int `json:"active"`
	Inactive      int `json:"inactive"`
	Certificates  int `json:"certificates"`
	OverdueTasks  int `json:"overdue_tasks"`
	AvgCompletion int `json:"avg_completion"`
}

type overviewDTO struct {
	Items              []overviewRowDTO   `json:"items"`
	Summary            overviewSummaryDTO `json:"summary"`
	Truncated          bool               `json:"truncated"`
	InactiveAfterHours int                `json:"inactive_after_hours"`
	GeneratedAt        time.Time          `json:"generated_at"`
}

func toOverviewRow(r app.OverviewRow, now time.Time) overviewRowDTO {
	d := overviewRowDTO{
		Student:  studentDTO{User: toUser(r.Student.User), Enrollment: toEnrollment(r.Student.Enrollment, now), OpenTasks: r.Student.OpenTasks, InReview: r.Student.InReview},
		Released: r.Progress.Released, Done: r.Progress.Done, InReview: r.Progress.InReview, Overdue: r.Progress.Overdue,
		CompletionPercent: r.Progress.CompletionPercent(), Points: r.Stats.Points, Credits: r.Stats.Credits, Inactive: r.Inactive,
	}
	if r.Stats.LastActiveAt != nil {
		t := r.Stats.LastActiveAt.UTC()
		d.LastActiveAt = &t
	}
	if r.Stats.CertificateCode != nil {
		st := domain.CertificateValid
		if r.Stats.CertificateRevoked {
			st = domain.CertificateRevoked
		}
		d.Certificate = &overviewCertDTO{Code: *r.Stats.CertificateCode, Status: st}
	}
	return d
}

func (s *Server) overview(c *gin.Context) {
	o, err := s.workspace.Overview(c.Request.Context(), currentUser(c), c.Query("q"))
	if err != nil {
		s.fail(c, err)
		return
	}
	now := s.clock.Now()
	items := make([]overviewRowDTO, len(o.Rows))
	for i, r := range o.Rows {
		items[i] = toOverviewRow(r, now)
	}
	sm := o.Summary
	c.JSON(http.StatusOK, overviewDTO{
		Items: items, Truncated: o.Truncated, InactiveAfterHours: int(domain.InactiveAfter.Hours()), GeneratedAt: now.UTC(),
		Summary: overviewSummaryDTO{Students: sm.Students, Active: sm.Active, Inactive: sm.Inactive, Certificates: sm.Certificates, OverdueTasks: sm.OverdueTasks, AvgCompletion: sm.AvgCompletion},
	})
}

var csvHeader = []string{
	"name", "github_login", "email", "program", "status", "day", "flow", "released", "done", "in_review", "overdue",
	"completion_percent", "points", "credits", "last_active_at", "inactive", "certificate_code", "certificate_status",
}

// overviewCSV exports the same rows as a spreadsheet.
func (s *Server) overviewCSV(c *gin.Context) {
	o, err := s.workspace.Overview(c.Request.Context(), currentUser(c), c.Query("q"))
	if err != nil {
		s.fail(c, err)
		return
	}
	now := s.clock.Now()
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="stackstep-cohort-%s.csv"`, now.UTC().Format(time.DateOnly)))
	c.Header("Cache-Control", "no-store")
	c.Status(http.StatusOK)
	w := csv.NewWriter(c.Writer)
	_ = w.Write(csvHeader)
	for _, r := range o.Rows {
		d := toOverviewRow(r, now)
		e := r.Student.Enrollment
		flow, last, code, certStatus, email := "", "", "", "", ""
		if e.Flow != nil {
			flow = e.Flow.Name
		}
		if d.LastActiveAt != nil {
			last = d.LastActiveAt.Format(time.RFC3339)
		}
		if d.Certificate != nil {
			code, certStatus = d.Certificate.Code, string(d.Certificate.Status)
		}
		if r.Student.User.Email != nil {
			email = *r.Student.User.Email
		}
		_ = w.Write(csvSafe([]string{
			r.Student.User.Name, r.Student.User.GitHubLogin, email, e.Program.Slug, string(e.Status), strconv.Itoa(d.Student.Enrollment.DayNumber), flow,
			strconv.Itoa(d.Released), strconv.Itoa(d.Done), strconv.Itoa(d.InReview), strconv.Itoa(d.Overdue), strconv.Itoa(d.CompletionPercent),
			strconv.Itoa(d.Points), strconv.Itoa(d.Credits), last, strconv.FormatBool(d.Inactive), code, certStatus,
		}))
	}
	w.Flush()
}

// csvSafe stops spreadsheet apps from running a cell as a formula (CSV injection).
func csvSafe(cells []string) []string {
	for i, v := range cells {
		if v != "" && strings.ContainsRune("=+-@\t\r", rune(v[0])) {
			cells[i] = "'" + v
		}
	}
	return cells
}
