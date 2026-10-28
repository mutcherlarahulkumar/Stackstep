package httpapi

import (
	"strings"
	"testing"
	"time"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

// TestHandInFollowUps: moving a task posts the hand-in in the assigner's chat, and the
// assigner replies after the usual delay (HF1–HF3).
func TestHandInFollowUps(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	task := e.mustCreateTask(adm, enr) // posted by the team lead persona
	thread := "/v1/me/threads/" + domain.DefaultPersonaID.String() + "/messages"
	bodies := func() []string {
		t.Helper()
		var page struct {
			Items []struct {
				Body   string `json:"body"`
				Author string `json:"author"`
			} `json:"items"`
		}
		e.expect(e.do("GET", thread, stu, nil), 200).json(t, &page)
		out := make([]string, len(page.Items))
		for i, m := range page.Items {
			out[i] = m.Author + ": " + m.Body
		}
		return out
	}
	has := func(list []string, prefix string) bool {
		for _, b := range list {
			if strings.HasPrefix(b, prefix) {
				return true
			}
		}
		return false
	}

	// HF1: starting is silent; sending for review posts the student's note with the PR link.
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	if has(bodies(), "student: ") {
		t.Fatal("starting a task should not post in chat")
	}
	e.expect(e.move(stu, task.ID, "in_review", task.Version+1, ""), 200)
	list := bodies()
	if !has(list, "student: Sent “Add filtering to the task list” for review.\nhttps://") {
		t.Fatalf("no hand-in message: %q", list)
	}
	// HF2: the assigner's "ok" arrives after the reply delay, not instantly.
	if has(list, "persona: Got it") {
		t.Fatal("ack should wait for the reply delay")
	}
	e.clock.Advance(31 * time.Second)
	stu = e.login(seed.StudentLogin)
	if !has(bodies(), "persona: Got it, Asha 👍") {
		t.Fatalf("no ack after the delay: %q", bodies())
	}

	// HF3: approval is announced as before; the admin inbox shows the student's hand-in.
	adm = e.login(seed.AdminLogin)
	e.expect(e.move(adm, task.ID, "done", task.Version+2, ""), 200)
	if !has(bodies(), "persona: Approved “") {
		t.Fatalf("approval not announced: %q", bodies())
	}
}
