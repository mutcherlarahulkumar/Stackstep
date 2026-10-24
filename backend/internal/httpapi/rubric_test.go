package httpapi

import (
	"strings"
	"testing"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

// TestRubricReview covers RB3–RB5: rubric on the task, ticks on review, the student sees them.
func TestRubricReview(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	body := validTask(e.clock.Now())
	body["content"] = map[string]any{"resources": []any{}, "quiz": nil, "rubric": []string{"Tests pass", "README explains setup", "Small commits"}}
	var task taskResp
	e.expect(e.createTask(adm, enr, body), 201).json(t, &task)

	handIn := func(version int) {
		t.Helper()
		e.expect(e.do("POST", "/v1/tasks/"+task.ID.String()+"/transitions", stu, map[string]any{
			"to": "in_review", "expected_version": version, "note": "", "submission": map[string]any{"url": "https://github.com/asha-dev/x/pull/1", "note": ""},
		}), 200)
	}
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	handIn(task.Version + 1)

	review := func(to string, version int, rubric any, note string) resp {
		return e.do("POST", "/v1/tasks/"+task.ID.String()+"/transitions", adm, map[string]any{"to": to, "expected_version": version, "note": note, "rubric": rubric})
	}
	// RB3: ticks are required and must match the criteria; students can't send them.
	if f := e.expect(review("changes_requested", task.Version+2, nil, "Add tests"), 422).errCode(t).Error.Fields; !strings.Contains(f["rubric"], "3 rubric criteria") {
		t.Fatalf("fields = %v", f)
	}
	e.expect(review("changes_requested", task.Version+2, []bool{true}, "Add tests"), 422)
	e.expect(review("changes_requested", task.Version+2, []bool{false, true, true}, "Add tests"), 200)

	// RB4: the student sees the ticks on that hand-in, and the chat says how many were met.
	type sub struct {
		Submission *struct {
			Attempt    int     `json:"attempt"`
			Rubric     []bool  `json:"rubric"`
			ReviewedAt *string `json:"reviewed_at"`
		} `json:"submission"`
		Content struct {
			Rubric []string `json:"rubric"`
		} `json:"content"`
	}
	var mine struct {
		Items []sub `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", stu, nil), 200).json(t, &mine)
	got := mine.Items[0]
	if len(got.Content.Rubric) != 3 || got.Submission == nil || len(got.Submission.Rubric) != 3 || got.Submission.Rubric[0] || got.Submission.ReviewedAt == nil {
		t.Fatalf("student view = %+v", got)
	}
	var msgs struct {
		Items []struct {
			Body string `json:"body"`
		} `json:"items"`
	}
	e.expect(e.do("GET", leadThread, stu, nil), 200).json(t, &msgs)
	found := false
	for _, m := range msgs.Items {
		found = found || strings.Contains(m.Body, "2 of 3 criteria met")
	}
	if !found {
		t.Fatal("rubric summary not in chat")
	}
	e.expect(e.do("POST", "/v1/tasks/"+task.ID.String()+"/transitions", stu, map[string]any{
		"to": "in_progress", "expected_version": task.Version + 3, "note": "", "rubric": []bool{true, true, true},
	}), 422)

	// RB5: a new hand-in starts unreviewed; approving with all ticked records them.
	e.expect(e.move(stu, task.ID, "in_progress", task.Version+3, ""), 200)
	handIn(task.Version + 4)
	e.expect(e.do("GET", "/v1/me/tasks", stu, nil), 200).json(t, &mine)
	if s := mine.Items[0].Submission; s.Attempt != 2 || s.Rubric != nil || s.ReviewedAt != nil {
		t.Fatalf("new hand-in = %+v", s)
	}
	e.expect(review("done", task.Version+5, []bool{true, true, true}, ""), 200)

	// A task without a rubric refuses ticks.
	plain := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, plain.ID, "in_progress", plain.Version, ""), 200)
	e.expect(e.do("POST", "/v1/tasks/"+plain.ID.String()+"/transitions", stu, map[string]any{
		"to": "in_review", "expected_version": plain.Version + 1, "note": "", "submission": map[string]any{"url": "https://github.com/asha-dev/y/pull/2", "note": ""},
	}), 200)
	e.expect(e.do("POST", "/v1/tasks/"+plain.ID.String()+"/transitions", adm, map[string]any{"to": "done", "expected_version": plain.Version + 2, "note": "", "rubric": []bool{true}}), 422)
}
