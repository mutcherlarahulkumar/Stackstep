package httpapi

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type reviewsResp struct {
	Items []struct {
		Task struct {
			ID         uuid.UUID `json:"id"`
			Submission *struct {
				URL    *string `json:"url"`
				Checks []struct {
					Code string `json:"code"`
				} `json:"checks"`
			} `json:"submission"`
		} `json:"task"`
		Student struct {
			GitHubLogin string `json:"github_login"`
		} `json:"student"`
		WaitingHours int  `json:"waiting_hours"`
		Overdue      bool `json:"overdue"`
	} `json:"items"`
	Overdue  int `json:"overdue"`
	SLAHours int `json:"sla_hours"`
}

func codes(cs []struct {
	Code string `json:"code"`
}) map[string]bool {
	out := map[string]bool{}
	for _, c := range cs {
		out[c.Code] = true
	}
	return out
}

func TestReviewQueue(t *testing.T) {
	e := newEnv(t)
	submit := func(login string, url string) uuid.UUID {
		t.Helper()
		token := e.login(login) // the fake clock moves past token lifetimes between steps
		task := e.mustCreateTask(e.login(seed.AdminLogin), e.enrollmentOf(login))
		e.expect(e.move(token, task.ID, "in_progress", task.Version, ""), 200)
		e.expect(e.do("POST", "/v1/tasks/"+task.ID.String()+"/transitions", token, map[string]any{
			"to": "in_review", "expected_version": task.Version + 1, "note": "", "submission": map[string]any{"url": url, "note": ""},
		}), 200)
		return task.ID
	}

	// RQ1: oldest first; the student's own link is fine, reuse and someone else's repo are flagged.
	first := submit(seed.StudentLogin, "https://github.com/asha-dev/todo/pull/1")
	e.clock.Advance(time.Hour)
	submit(seed.StudentLogin, "https://github.com/asha-dev/notes/pull/2")
	e.clock.Advance(time.Hour)
	copied := submit(seed.Student2Login, "https://github.com/asha-dev/todo/pull/1")
	adm := e.login(seed.AdminLogin)

	var q reviewsResp
	e.expect(e.do("GET", "/v1/admin/reviews", adm, nil), 200).json(t, &q)
	if len(q.Items) != 3 || q.Items[0].Task.ID != first || q.Items[2].Task.ID != copied || q.SLAHours != 24 {
		t.Fatalf("queue = %+v", q)
	}
	if c := codes(q.Items[0].Task.Submission.Checks); !c["reused_link"] || c["foreign_repo"] {
		t.Fatalf("first checks = %v", c)
	}
	if c := codes(q.Items[1].Task.Submission.Checks); len(c) != 0 {
		t.Fatalf("clean hand-in flagged: %v", c)
	}
	if c := codes(q.Items[2].Task.Submission.Checks); !c["reused_link"] || !c["foreign_repo"] {
		t.Fatalf("copied checks = %v", c)
	}
	if q.Items[0].WaitingHours != 2 || q.Overdue != 0 {
		t.Fatalf("ages = %+v", q)
	}

	// RQ2: after a day the oldest is overdue; students never see checks.
	e.clock.Advance(23 * time.Hour)
	adm = e.login(seed.AdminLogin)
	e.expect(e.do("GET", "/v1/admin/reviews", adm, nil), 200).json(t, &q)
	if !q.Items[0].Overdue || q.Overdue != 2 {
		t.Fatalf("overdue = %+v", q)
	}
	ravi := e.login(seed.Student2Login)
	var mine struct {
		Items []struct {
			ID         uuid.UUID `json:"id"`
			Submission *struct {
				Checks []any `json:"checks"`
			} `json:"submission"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", ravi, nil), 200).json(t, &mine)
	for _, it := range mine.Items {
		if it.ID == copied && (it.Submission == nil || len(it.Submission.Checks) != 0) {
			t.Fatalf("student sees checks: %+v", it.Submission)
		}
	}

	// RQ3: scope and access.
	e.expect(e.do("GET", "/v1/admin/reviews", e.login(seed.CollegeAdminLogin), nil), 200).json(t, &q)
	if len(q.Items) != 3 {
		t.Fatalf("college admin sees %d (asha and ravi are ANITS)", len(q.Items))
	}
	e.expect(e.do("GET", "/v1/admin/reviews", ravi, nil), 403)
	e.expect(e.do("GET", "/v1/admin/reviews?persona_id=nope", adm, nil), 422)
	e.expect(e.do("GET", "/v1/admin/reviews?persona_id="+uuid.NewString(), e.login(seed.AdminLogin), nil), 200).json(t, &q)
	if len(q.Items) != 0 {
		t.Fatalf("persona filter = %d", len(q.Items))
	}
}
