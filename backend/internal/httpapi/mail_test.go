package httpapi

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type mailItem struct {
	ID       uuid.UUID  `json:"id"`
	Kind     string     `json:"kind"`
	Subject  string     `json:"subject"`
	Preview  string     `json:"preview"`
	Body     *string    `json:"body"`
	FromName string     `json:"from_name"`
	TaskID   *uuid.UUID `json:"task_id"`
	Read     bool       `json:"read"`
}

type mailPage struct {
	Items  []mailItem `json:"items"`
	Next   *string    `json:"next_cursor"`
	Unread int        `json:"unread"`
}

func (e *env) mailbox(token, query string) mailPage {
	e.t.Helper()
	var p mailPage
	e.expect(e.do("GET", "/v1/me/mail"+query, token, nil), 200).json(e.t, &p)
	return p
}

// MA1–MA2: joining sends a welcome letter; opening a letter shows its body and marks it read;
// nobody can open someone else's mail.
func TestMailWelcomeAndReading(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "mail-new", "program_slug": "frontend-30"}), 201)
	stu := e.login("mail-new")
	box := e.mailbox(stu, "")
	if box.Unread != 1 || len(box.Items) != 1 {
		t.Fatalf("mailbox = %+v", box)
	}
	w := box.Items[0]
	if w.Kind != "welcome" || w.Subject != "Your first working day is tomorrow" || w.Read || w.Body != nil || !strings.Contains(w.Preview, "Welcome to Stackstep") {
		t.Fatalf("welcome = %+v", w)
	}
	var open mailItem
	e.expect(e.do("GET", "/v1/me/mail/"+w.ID.String(), stu, nil), 200).json(t, &open)
	if open.Body == nil || !strings.Contains(*open.Body, "**Day 1** is tomorrow, Thursday 5 November.") || !open.Read {
		t.Fatalf("opened = %+v", open)
	}
	if e.mailbox(stu, "").Unread != 0 {
		t.Fatal("still unread after opening")
	}
	e.expect(e.do("GET", "/v1/me/mail/"+w.ID.String(), e.login(seed.StudentLogin), nil), 404)
	e.expect(e.do("GET", "/v1/me/mail/"+uuid.NewString(), stu, nil), 404)
}

// MA3–MA6: announcements are validated, reach only their audience, stay within a college
// admin's college and report reads; students can't send them; mailboxes page.
func TestAnnouncements(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	asha := e.login(seed.StudentLogin)       // ANITS Batch 1
	meera := e.login(seed.IndieStudentLogin) // no cohort, React flow

	f := e.expect(e.do("POST", "/v1/admin/announcements", adm, map[string]any{"subject": " a ", "body": "  ", "audience": "nope"}), 422).errCode(t).Error.Fields
	for _, k := range []string{"subject", "body", "audience"} {
		if f[k] == "" {
			t.Errorf("%s not flagged: %v", k, f)
		}
	}
	e.expect(e.do("POST", "/v1/admin/announcements", asha, map[string]any{"subject": "Hello all", "body": "Hi", "audience": "all"}), 403)

	// To a cohort: Asha gets it, Meera doesn't.
	var cohorts struct {
		Items []struct {
			ID   uuid.UUID `json:"id"`
			Name string    `json:"name"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/cohorts", adm, nil), 200).json(t, &cohorts)
	var anits, open uuid.UUID
	for _, c := range cohorts.Items {
		switch c.Name {
		case "ANITS Batch 1":
			anits = c.ID
		case seed.OpenCohortName:
			open = c.ID
		}
	}
	body := "## Demo day\n\nShow **one thing** you built this week.\n\n- 5 minutes\n- Friday 4 PM"
	var a struct {
		ID         uuid.UUID `json:"id"`
		Recipients int       `json:"recipients"`
		Reads      int       `json:"reads"`
		CohortName *string   `json:"cohort_name"`
	}
	e.expect(e.do("POST", "/v1/admin/announcements", adm, map[string]any{"subject": "  Demo   day on Friday ", "body": body, "audience": "cohort", "cohort_id": anits}), 201).json(t, &a)
	if a.Recipients < 1 || a.CohortName == nil || *a.CohortName != "ANITS Batch 1" {
		t.Fatalf("announcement = %+v", a)
	}
	got := e.mailbox(asha, "")
	if got.Items[0].Kind != "announcement" || got.Items[0].Subject != "Demo day on Friday" || got.Items[0].FromName == "" {
		t.Fatalf("asha's mail = %+v", got.Items)
	}
	for _, m := range e.mailbox(meera, "").Items {
		if m.Subject == "Demo day on Friday" {
			t.Fatal("announcement leaked outside the cohort")
		}
	}
	var opened mailItem
	e.expect(e.do("GET", "/v1/me/mail/"+got.Items[0].ID.String(), asha, nil), 200).json(t, &opened)
	if opened.Body == nil || *opened.Body != body {
		t.Fatalf("body changed: %q", *opened.Body)
	}
	var list struct {
		Items []struct {
			Subject string `json:"subject"`
			Reads   int    `json:"reads"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/announcements", adm, nil), 200).json(t, &list)
	if len(list.Items) == 0 || list.Items[0].Subject != "Demo day on Friday" || list.Items[0].Reads != 1 {
		t.Fatalf("sent list = %+v", list.Items)
	}

	// An empty audience is refused; a flow reaches the students on it.
	e.expectCode(e.do("POST", "/v1/admin/announcements", adm, map[string]any{"subject": "Anyone?", "body": "Hello", "audience": "cohort", "cohort_id": open}), 422, "validation_failed")
	e.expect(e.do("POST", "/v1/admin/announcements", adm, map[string]any{"subject": "React folks", "body": "Hi", "audience": "flow", "flow_id": seed.ReactFlowID}), 201)
	if e.mailbox(meera, "").Items[0].Subject != "React folks" {
		t.Fatal("flow announcement missing")
	}

	// A college admin can't reach a cohort outside their college; "all" stays in their college.
	tpo := e.login(seed.CollegeAdminLogin)
	e.expect(e.do("POST", "/v1/admin/announcements", tpo, map[string]any{"subject": "Placement talk", "body": "Hall B", "audience": "all"}), 201)
	for _, m := range e.mailbox(meera, "").Items {
		if m.Subject == "Placement talk" {
			t.Fatal("college admin reached an independent student")
		}
	}
	if e.mailbox(asha, "").Items[0].Subject != "Placement talk" {
		t.Fatal("college admin's own student missed it")
	}

	// Pages.
	p1 := e.mailbox(asha, "?limit=1")
	if len(p1.Items) != 1 || p1.Next == nil {
		t.Fatalf("page 1 = %+v", p1)
	}
	if p2 := e.mailbox(asha, "?limit=1&cursor="+*p1.Next); len(p2.Items) != 1 || p2.Items[0].ID == p1.Items[0].ID {
		t.Fatalf("page 2 = %+v", p2)
	}
}

// MA7: review decisions and certificates arrive as mail too.
func TestSystemMail(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	task := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.move(stu, task.ID, "in_review", task.Version+1, ""), 200)
	e.expect(e.move(adm, task.ID, "changes_requested", task.Version+2, "Add an empty state."), 200)
	m := e.mailbox(stu, "").Items[0]
	if m.Kind != "review" || m.Subject != "Changes requested on “Add filtering to the task list”" || m.TaskID == nil || *m.TaskID != task.ID {
		t.Fatalf("changes mail = %+v", m)
	}
	var open mailItem
	e.expect(e.do("GET", "/v1/me/mail/"+m.ID.String(), stu, nil), 200).json(t, &open)
	if !strings.Contains(*open.Body, "> Add an empty state.") {
		t.Fatalf("note missing: %q", *open.Body)
	}
	e.expect(e.move(stu, task.ID, "in_review", task.Version+3, ""), 200)
	e.expect(e.move(adm, task.ID, "done", task.Version+4, ""), 200)
	if m := e.mailbox(stu, "").Items[0]; m.Subject != "“Add filtering to the task list” is approved" {
		t.Fatalf("approved mail = %+v", m)
	}
	e.expect(e.do("POST", "/v1/admin/enrollments/"+enr.String()+"/certificate", adm, nil), 201)
	if m := e.mailbox(stu, "").Items[0]; m.Kind != "certificate" || m.Subject != "Your certificate is ready" {
		t.Fatalf("certificate mail = %+v", m)
	}
}

func TestMailPreview(t *testing.T) {
	if got := preview("## Hello\n\nThis is **bold** and `code`.\n\n- one\n> [!TIP]\n> two"); got != "Hello This is bold and code. one two" {
		t.Fatalf("preview = %q", got)
	}
	if got := preview(strings.Repeat("a", 200)); len([]rune(got)) != mailPreview+1 || !strings.HasSuffix(got, "…") {
		t.Fatalf("long preview = %q", got)
	}
}
