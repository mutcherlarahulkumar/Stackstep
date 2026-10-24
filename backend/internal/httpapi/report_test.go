package httpapi

import (
	"testing"
	"time"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type reportResp struct {
	WeekStart string `json:"week_start"`
	WeekEnd   string `json:"week_end"`
	Groups    []struct {
		Cohort        string `json:"cohort"`
		Students      int    `json:"students"`
		Done          int    `json:"done"`
		OnTimePercent int    `json:"on_time_percent"`
		HandIns       int    `json:"hand_ins"`
		Certificates  int    `json:"certificates"`
	} `json:"groups"`
	Totals struct {
		Students int `json:"students"`
		Done     int `json:"done"`
		Points   int `json:"points"`
	} `json:"totals"`
	Top []struct {
		GitHubLogin string `json:"github_login"`
		Points      int    `json:"points"`
	} `json:"top"`
	Attention []struct {
		GitHubLogin string  `json:"github_login"`
		Reason      *string `json:"reason"`
	} `json:"attention"`
}

func TestWeeklyReport(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	task := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.move(stu, task.ID, "in_review", task.Version+1, ""), 200)
	e.expect(e.move(adm, task.ID, "done", task.Version+2, ""), 200)

	// WR5: the student's own recap counts the same week.
	var prog struct {
		ThisWeek struct {
			Done   int `json:"done"`
			Points int `json:"points"`
		} `json:"this_week"`
	}
	e.expect(e.do("GET", "/v1/me/progress", stu, nil), 200).json(t, &prog)
	if prog.ThisWeek.Done != 1 || prog.ThisWeek.Points != 25 {
		t.Fatalf("this week = %+v", prog.ThisWeek)
	}

	// WR1: this week's numbers, grouped by cohort, independents last; Asha tops the list.
	var r reportResp
	e.expect(e.do("GET", "/v1/admin/reports/weekly", adm, nil), 200).json(t, &r)
	ws := domain.WeekStart(e.clock.Now())
	if r.WeekStart != ws.Format(time.DateOnly) || r.WeekEnd != ws.AddDate(0, 0, 6).Format(time.DateOnly) {
		t.Fatalf("week = %s..%s", r.WeekStart, r.WeekEnd)
	}
	if len(r.Groups) < 2 || r.Groups[len(r.Groups)-1].Cohort != "Independent students" || r.Totals.Done != 1 || r.Totals.Points != 25 {
		t.Fatalf("report = %+v", r)
	}
	if len(r.Top) != 1 || r.Top[0].GitHubLogin != seed.StudentLogin {
		t.Fatalf("top = %+v", r.Top)
	}
	for _, g := range r.Groups {
		if g.Done == 1 && (g.OnTimePercent != 100 || g.Students < 1) {
			t.Fatalf("group = %+v", g)
		}
	}

	// WR2: last week is empty; future weeks and bad dates are refused.
	last := ws.AddDate(0, 0, -3).Format(time.DateOnly)
	e.expect(e.do("GET", "/v1/admin/reports/weekly?week="+last, adm, nil), 200).json(t, &r)
	if r.Totals.Done != 0 || r.WeekStart != ws.AddDate(0, 0, -7).Format(time.DateOnly) {
		t.Fatalf("last week = %+v", r)
	}
	e.expect(e.do("GET", "/v1/admin/reports/weekly?week="+ws.AddDate(0, 0, 8).Format(time.DateOnly), adm, nil), 422)
	e.expect(e.do("GET", "/v1/admin/reports/weekly?week=2026-13-01", adm, nil), 422)
	e.expect(e.do("GET", "/v1/admin/reports/weekly?week=2020-01-01", adm, nil), 422)

	// WR3: college admins see only their college; students are refused.
	e.expect(e.do("GET", "/v1/admin/reports/weekly", e.login(seed.CollegeAdminLogin), nil), 200).json(t, &r)
	for _, g := range r.Groups {
		if g.Cohort == "Independent students" {
			t.Fatal("college admin sees independent students")
		}
	}
	e.expect(e.do("GET", "/v1/admin/reports/weekly", stu, nil), 403)

	// WR4: quiet students are listed for attention.
	e.clock.Advance(domain.InactiveAfter + time.Hour)
	e.expect(e.do("GET", "/v1/admin/reports/weekly", e.login(seed.AdminLogin), nil), 200).json(t, &r)
	found := false
	for _, a := range r.Attention {
		found = found || (a.GitHubLogin == seed.Student2Login && a.Reason != nil)
	}
	if !found {
		t.Fatalf("attention = %+v", r.Attention)
	}
}
