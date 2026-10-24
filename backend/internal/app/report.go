package app

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// ReportGroup is one cohort (or the independent students) in a weekly report.
type ReportGroup struct {
	Cohort        string
	College       *string
	Students      int
	Active        int
	Done          int
	OnTime        int
	Points        int
	HandIns       int
	Issued        int
	Inactive      int
	AvgCompletion int
}

// ReportStudent is a student named in the report's highlight lists.
type ReportStudent struct {
	Student store.StudentRow
	Cohort  string
	Week    store.WeekStats
	Overdue int
	Reason  string // why they need attention ("" for top students)
}

// WeeklyReport is a printable week summary for colleges and admins.
type WeeklyReport struct {
	WeekStart, WeekEnd time.Time // end is exclusive
	Groups             []ReportGroup
	Totals             ReportGroup
	Top                []ReportStudent
	Attention          []ReportStudent
	Truncated          bool
}

// Independent labels students without a cohort.
const Independent = "Independent students"

// WeeklyReport summarizes the week containing day for the students the caller manages.
func (w *Workspace) WeeklyReport(ctx context.Context, u domain.User, day *time.Time) (WeeklyReport, error) {
	now := w.Clock.Now()
	start := domain.WeekStart(now)
	if day != nil {
		start = domain.WeekStart(*day)
	}
	if start.After(domain.WeekStart(now)) || start.Before(domain.WeekStart(now).AddDate(0, 0, -7*domain.ReportMaxWeeksBack)) {
		return WeeklyReport{}, apperr.Validation(map[string]string{"week": "Pick a week from the last year, up to this week."})
	}
	end := start.AddDate(0, 0, 7)
	students, next, err := w.Students(ctx, u, "", nil, domain.OverviewMax)
	if err != nil {
		return WeeklyReport{}, err
	}
	ids := make([]uuid.UUID, len(students))
	for i, s := range students {
		ids[i] = s.Enrollment.ID
	}
	overall, err := store.OverviewStats(ctx, w.Store.Pool, ids, now)
	if err != nil {
		return WeeklyReport{}, err
	}
	week, err := store.WeeklyStats(ctx, w.Store.Pool, ids, start, end)
	if err != nil {
		return WeeklyReport{}, err
	}

	out := WeeklyReport{WeekStart: start, WeekEnd: end, Truncated: next != ""}
	groups := map[string]*ReportGroup{}
	pct := map[string]int{}
	var all []ReportStudent
	for _, s := range students {
		ov, wk := overall[s.Enrollment.ID], week[s.Enrollment.ID]
		name := Independent
		if wk.Cohort != nil {
			name = *wk.Cohort
		}
		g := groups[name]
		if g == nil {
			g = &ReportGroup{Cohort: name, College: wk.College}
			groups[name] = g
		}
		p := domain.Progress{Released: ov.Released, Done: ov.Done}
		certified := ov.CertificateCode != nil && !ov.CertificateRevoked
		inactive := !certified && domain.Inactive(s.Enrollment, ov.LastActiveAt, now)
		for _, t := range []*ReportGroup{g, &out.Totals} {
			t.Students++
			if s.Enrollment.Status == domain.EnrollmentActive {
				t.Active++
			}
			t.Done += wk.Done
			t.OnTime += wk.OnTime
			t.Points += wk.Points
			t.HandIns += wk.HandIns
			if wk.Issued {
				t.Issued++
			}
			if inactive {
				t.Inactive++
			}
		}
		pct[name] += p.CompletionPercent()
		pct[""] += p.CompletionPercent()
		r := ReportStudent{Student: s, Cohort: name, Week: wk, Overdue: ov.Overdue}
		switch {
		case s.Enrollment.Status != domain.EnrollmentActive:
		case inactive:
			r.Reason = "No activity for two days"
		case ov.Overdue >= 2:
			r.Reason = "Several tasks overdue"
		case wk.Done == 0 && wk.HandIns == 0 && !start.Equal(domain.WeekStart(now)):
			r.Reason = "Nothing finished this week"
		}
		all = append(all, r)
	}
	for name, g := range groups {
		if g.Students > 0 {
			g.AvgCompletion = pct[name] / g.Students
		}
		out.Groups = append(out.Groups, *g)
	}
	if out.Totals.Students > 0 {
		out.Totals.AvgCompletion = pct[""] / out.Totals.Students
	}
	sort.Slice(out.Groups, func(i, j int) bool {
		a, b := out.Groups[i], out.Groups[j]
		if (a.Cohort == Independent) != (b.Cohort == Independent) {
			return b.Cohort == Independent
		}
		return a.Cohort < b.Cohort
	})
	top := append([]ReportStudent(nil), all...)
	sort.SliceStable(top, func(i, j int) bool { return top[i].Week.Points > top[j].Week.Points })
	for _, r := range top {
		if len(out.Top) == 5 || r.Week.Points == 0 {
			break
		}
		out.Top = append(out.Top, r)
	}
	for _, r := range all {
		if r.Reason != "" && len(out.Attention) < 20 {
			out.Attention = append(out.Attention, r)
		}
	}
	return out, nil
}
