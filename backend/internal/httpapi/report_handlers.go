package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

type reportGroupDTO struct {
	Cohort        string  `json:"cohort"`
	College       *string `json:"college"`
	Students      int     `json:"students"`
	Active        int     `json:"active"`
	Done          int     `json:"done"`
	OnTimePercent int     `json:"on_time_percent"`
	Points        int     `json:"points"`
	HandIns       int     `json:"hand_ins"`
	Certificates  int     `json:"certificates"`
	Inactive      int     `json:"inactive"`
	AvgCompletion int     `json:"avg_completion"`
}

type reportStudentDTO struct {
	Name        string  `json:"name"`
	GitHubLogin string  `json:"github_login"`
	Cohort      string  `json:"cohort"`
	Done        int     `json:"done"`
	Points      int     `json:"points"`
	HandIns     int     `json:"hand_ins"`
	Overdue     int     `json:"overdue"`
	Reason      *string `json:"reason"`
}

type weeklyReportDTO struct {
	WeekStart   string             `json:"week_start"`
	WeekEnd     string             `json:"week_end"` // last day, inclusive
	Groups      []reportGroupDTO   `json:"groups"`
	Totals      reportGroupDTO     `json:"totals"`
	Top         []reportStudentDTO `json:"top"`
	Attention   []reportStudentDTO `json:"attention"`
	Truncated   bool               `json:"truncated"`
	GeneratedAt time.Time          `json:"generated_at"`
}

func toReportGroup(g app.ReportGroup) reportGroupDTO {
	return reportGroupDTO{Cohort: g.Cohort, College: g.College, Students: g.Students, Active: g.Active, Done: g.Done,
		OnTimePercent: domain.OnTimePercent(g.OnTime, g.Done), Points: g.Points, HandIns: g.HandIns, Certificates: g.Issued,
		Inactive: g.Inactive, AvgCompletion: g.AvgCompletion}
}

func toReportStudents(rs []app.ReportStudent) []reportStudentDTO {
	out := make([]reportStudentDTO, len(rs))
	for i, r := range rs {
		out[i] = reportStudentDTO{Name: r.Student.User.Name, GitHubLogin: r.Student.User.GitHubLogin, Cohort: r.Cohort,
			Done: r.Week.Done, Points: r.Week.Points, HandIns: r.Week.HandIns, Overdue: r.Overdue}
		if r.Reason != "" {
			reason := r.Reason
			out[i].Reason = &reason
		}
	}
	return out
}

// weeklyReport is the week summary for staff; ?week=YYYY-MM-DD picks any day in the week.
func (s *Server) weeklyReport(c *gin.Context) {
	var day *time.Time
	if raw := c.Query("week"); raw != "" {
		d, err := time.Parse(time.DateOnly, raw)
		if err != nil {
			s.fail(c, apperr.Validation(map[string]string{"week": "Use a date like 2026-11-02."}))
			return
		}
		day = &d
	}
	r, err := s.workspace.WeeklyReport(c.Request.Context(), currentUser(c), day)
	if err != nil {
		s.fail(c, err)
		return
	}
	groups := make([]reportGroupDTO, len(r.Groups))
	for i, g := range r.Groups {
		groups[i] = toReportGroup(g)
	}
	c.JSON(http.StatusOK, weeklyReportDTO{
		WeekStart: r.WeekStart.Format(time.DateOnly), WeekEnd: r.WeekEnd.AddDate(0, 0, -1).Format(time.DateOnly),
		Groups: groups, Totals: toReportGroup(r.Totals), Top: toReportStudents(r.Top), Attention: toReportStudents(r.Attention),
		Truncated: r.Truncated, GeneratedAt: s.clock.Now().UTC(),
	})
}
