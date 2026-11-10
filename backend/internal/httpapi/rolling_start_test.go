package httpapi

import (
	"strings"
	"testing"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

// RS1, RS3–RS5: a cohort names a flow instead of a start date; everyone starts the day after
// they join, on the cohort's flow; the flow must fit the program and be published.
func TestRollingStart(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)

	// RS1: no start date on a cohort; the flow is optional and checked.
	c := e.mustCohort(adm, map[string]any{"kind": "group", "name": "Rolling Batch", "program_slug": "frontend-30", "seats_total": 10})
	if c.FlowID != nil {
		t.Fatalf("new cohort has a flow: %+v", c)
	}
	e.expectCode(e.do("POST", "/v1/admin/cohorts", adm, map[string]any{"kind": "group", "name": "Old style", "program_slug": "frontend-30", "seats_total": 1, "start_date": "2026-11-10"}), 400, "bad_request")

	// RS4: unknown flows are refused; college admins can't change a cohort's flow.
	if f := e.expect(e.do("PUT", "/v1/admin/cohorts/"+c.ID.String()+"/flow", adm, map[string]any{"flow_id": "00000000-0000-4000-8000-00000000dead"}), 422).errCode(t).Error.Fields; f["flow_id"] == "" {
		t.Fatalf("unknown flow: %v", f)
	}
	e.expect(e.do("PUT", "/v1/admin/cohorts/"+c.ID.String()+"/flow", e.login(seed.CollegeAdminLogin), map[string]any{"flow_id": seed.ReactFlowID}), 403)
	e.expect(e.do("PUT", "/v1/admin/cohorts/"+c.ID.String()+"/flow", adm, map[string]any{"flow_id": seed.ReactFlowID}), 200).json(t, &c)
	if c.FlowID == nil || *c.FlowID != seed.ReactFlowID {
		t.Fatalf("flow not set: %+v", c)
	}

	// RS3: enrolling with no date or flow starts tomorrow on the cohort's flow, and the lead's
	// welcome arrives now saying when.
	var r enrollResp
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "rolling-one", "cohort_id": c.ID}), 201).json(t, &r)
	if en := r.Student.Enrollment; en.StartDate != "2026-11-05" || en.EndDate != "2026-12-04" || en.Flow == nil {
		t.Fatalf("rolling enrollment = %+v", en)
	}
	stu := e.login("rolling-one")
	if me := e.me(stu); me.Enrollment == nil || me.Enrollment.DayNumber != 0 {
		t.Fatalf("day before start = %+v", me.Enrollment)
	}
	var msgs struct {
		Items []struct {
			Body string `json:"body"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/threads/00000000-0000-4000-8000-000000000001/messages", stu, nil), 200).json(t, &msgs)
	if len(msgs.Items) == 0 || !strings.Contains(msgs.Items[0].Body, "Your first working day is tomorrow, Thursday 5 November.") {
		t.Fatalf("welcome = %+v", msgs.Items)
	}

	// RS5: clearing the flow is allowed; the next student starts with no tasks yet.
	e.expect(e.do("PUT", "/v1/admin/cohorts/"+c.ID.String()+"/flow", adm, map[string]any{"flow_id": nil}), 200).json(t, &c)
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "rolling-two", "cohort_id": c.ID}), 201).json(t, &r)
	if r.Student.Enrollment.Flow != nil {
		t.Fatalf("flow after clearing = %+v", r.Student.Enrollment)
	}
}
