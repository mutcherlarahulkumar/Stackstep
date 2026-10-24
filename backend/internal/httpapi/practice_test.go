package httpapi

import (
	"testing"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

// TestPracticeContent: admins attach example tests to a DSA task; the student receives them (DP2, DP3).
func TestPracticeContent(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	body := validTask(e.clock.Now())
	body["type"] = "dsa"
	body["content"] = map[string]any{"resources": []any{}, "quiz": nil, "practice": map[string]any{
		"function_name": "add", "starter": "function add(a, b) {}\n",
		"tests": []any{map[string]any{"args": []any{1, 2}, "expected": 3}},
	}}
	e.expect(e.createTask(adm, enr, body), 201)

	var mine struct {
		Items []struct {
			Content struct {
				Practice *struct {
					FunctionName string `json:"function_name"`
					Tests        []struct {
						Args     []int `json:"args"`
						Expected int   `json:"expected"`
					} `json:"tests"`
				} `json:"practice"`
			} `json:"content"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", e.login(seed.StudentLogin), nil), 200).json(t, &mine)
	if len(mine.Items) != 1 || mine.Items[0].Content.Practice == nil || mine.Items[0].Content.Practice.FunctionName != "add" ||
		mine.Items[0].Content.Practice.Tests[0].Expected != 3 {
		t.Fatalf("tasks = %+v", mine.Items)
	}

	// DP3: a practice pad on a feature task is refused.
	body["type"] = "feature"
	if f := e.expect(e.createTask(adm, enr, body), 422).errCode(t).Error.Fields; f["content.practice"] == "" && f["practice"] == "" {
		t.Fatalf("fields = %v", f)
	}
}
