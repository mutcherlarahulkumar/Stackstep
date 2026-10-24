package httpapi

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type noteResp struct {
	Body      string     `json:"body"`
	Shared    bool       `json:"shared"`
	UpdatedAt *time.Time `json:"updated_at"`
}

func TestTaskNotes(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	task := e.mustCreateTask(adm, enr)
	path := "/v1/tasks/" + task.ID.String() + "/note"

	// TN1: no note yet reads as empty.
	var n noteResp
	e.expect(e.do("GET", path, stu, nil), 200).json(t, &n)
	if n.Body != "" || n.Shared || n.UpdatedAt != nil {
		t.Fatalf("empty note = %+v", n)
	}

	// TN2: a private note is saved and Markdown whitespace is kept; staff don't see it.
	body := "## Plan\n\n- read the brief\n  - nested\n"
	e.expect(e.do("PUT", path, stu, map[string]any{"body": body, "shared": false}), 200).json(t, &n)
	if n.Body != body || n.Shared || n.UpdatedAt == nil {
		t.Fatalf("saved = %+v", n)
	}
	staffNote := func() *noteResp {
		t.Helper()
		var list struct {
			Items []struct {
				ID         string    `json:"id"`
				SharedNote *noteResp `json:"shared_note"`
			} `json:"items"`
		}
		e.expect(e.do("GET", "/v1/admin/enrollments/"+enr.String()+"/tasks", adm, nil), 200).json(t, &list)
		for _, it := range list.Items {
			if it.ID == task.ID.String() {
				return it.SharedNote
			}
		}
		t.Fatal("task missing")
		return nil
	}
	if staffNote() != nil {
		t.Fatal("private note leaked to staff")
	}

	// TN3: sharing shows it to staff (task list and review queue); the student's own task list never carries it.
	e.expect(e.do("PUT", path, stu, map[string]any{"body": body, "shared": true}), 200)
	if s := staffNote(); s == nil || s.Body != body {
		t.Fatalf("shared note = %+v", s)
	}
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.do("POST", "/v1/tasks/"+task.ID.String()+"/transitions", stu, map[string]any{
		"to": "in_review", "expected_version": task.Version + 1, "note": "", "submission": map[string]any{"url": "https://github.com/asha-dev/todo/pull/9", "note": ""},
	}), 200)
	var q struct {
		Items []struct {
			Task struct {
				SharedNote *noteResp `json:"shared_note"`
			} `json:"task"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/reviews", adm, nil), 200).json(t, &q)
	if len(q.Items) != 1 || q.Items[0].Task.SharedNote == nil {
		t.Fatalf("review queue = %+v", q)
	}
	var mine struct {
		Items []map[string]json.RawMessage `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", stu, nil), 200).json(t, &mine)
	if len(mine.Items) == 0 || string(mine.Items[0]["shared_note"]) != "null" {
		t.Fatalf("student task list carries a note: %s", mine.Items[0]["shared_note"])
	}

	// TN4: clearing and unsharing removes it.
	e.expect(e.do("PUT", path, stu, map[string]any{"body": "  ", "shared": false}), 200).json(t, &n)
	if n.UpdatedAt != nil {
		t.Fatalf("cleared = %+v", n)
	}
	if staffNote() != nil {
		t.Fatal("cleared note still visible")
	}

	// TN5: validation, size cap, missing fields.
	e.expect(e.do("PUT", path, stu, map[string]any{"body": strings.Repeat("a", 20001), "shared": false}), 422)
	e.expect(e.do("PUT", path, stu, map[string]any{"body": "bell\a", "shared": false}), 422)
	e.expect(e.do("PUT", path, stu, map[string]any{"body": "x"}), 422)
	e.expect(e.do("PUT", path, stu, map[string]any{"body": strings.Repeat("é", 20000), "shared": false}), 200)

	// TN6: other students, future tasks and staff can't read or write it.
	e.expect(e.do("GET", path, e.login(seed.Student2Login), nil), 404)
	e.expect(e.do("PUT", path, e.login(seed.Student2Login), map[string]any{"body": "x", "shared": true}), 404)
	e.expect(e.do("GET", path, adm, nil), 403)
	future := validTask(e.clock.Now())
	future["scheduled_for"] = e.clock.Now().Add(48 * time.Hour)
	future["due_at"] = e.clock.Now().Add(52 * time.Hour)
	var ft taskResp
	e.expect(e.createTask(adm, enr, future), 201).json(t, &ft)
	e.expect(e.do("GET", "/v1/tasks/"+ft.ID.String()+"/note", stu, nil), 404)
}
