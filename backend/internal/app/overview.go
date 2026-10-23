package app

import (
	"context"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// OverviewRow is one student in the placement overview.
type OverviewRow struct {
	Student  store.StudentRow
	Stats    store.EnrollmentStats
	Progress domain.Progress
	Inactive bool
}

// OverviewSummary totals the cohort.
type OverviewSummary struct {
	Students, Active, Inactive, Certificates, OverdueTasks int
	AvgCompletion                                          int
}

// Overview is the cohort table for staff.
type Overview struct {
	Rows      []OverviewRow
	Summary   OverviewSummary
	Truncated bool
}

// Overview lists every student the staff member manages with placement numbers. College
// admins see only their college. At most domain.OverviewMax rows are returned.
func (w *Workspace) Overview(ctx context.Context, u domain.User, search string) (Overview, error) {
	students, next, err := w.Students(ctx, u, search, nil, domain.OverviewMax)
	if err != nil {
		return Overview{}, err
	}
	ids := make([]uuid.UUID, len(students))
	for i, s := range students {
		ids[i] = s.Enrollment.ID
	}
	now := w.Clock.Now()
	stats, err := store.OverviewStats(ctx, w.Store.Pool, ids, now)
	if err != nil {
		return Overview{}, err
	}
	out := Overview{Rows: make([]OverviewRow, len(students)), Truncated: next != ""}
	totalPct := 0
	for i, s := range students {
		st := stats[s.Enrollment.ID]
		p := domain.Progress{Released: st.Released, Done: st.Done, InReview: st.InReview, Overdue: st.Overdue, Points: st.Points,
			DayNumber: s.Enrollment.DayNumber(now), Days: s.Enrollment.Program.Days}
		// Certified students have finished; never flag them for a nudge.
		certified := st.CertificateCode != nil && !st.CertificateRevoked
		row := OverviewRow{Student: s, Stats: st, Progress: p, Inactive: !certified && domain.Inactive(s.Enrollment, st.LastActiveAt, now)}
		out.Rows[i] = row
		out.Summary.Students++
		if s.Enrollment.Status == domain.EnrollmentActive {
			out.Summary.Active++
		}
		if row.Inactive {
			out.Summary.Inactive++
		}
		if st.CertificateCode != nil && !st.CertificateRevoked {
			out.Summary.Certificates++
		}
		out.Summary.OverdueTasks += st.Overdue
		totalPct += p.CompletionPercent()
	}
	if len(students) > 0 {
		out.Summary.AvgCompletion = totalPct / len(students)
	}
	return out, nil
}
