package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/realtime"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type flowDetailResp struct {
	Flow struct {
		ID      uuid.UUID `json:"id"`
		Days    int       `json:"days"`
		Version int       `json:"version"`
	} `json:"flow"`
	Draft *struct {
		Revision int `json:"revision"`
		Number   int `json:"number"`
		Items    []struct {
			Day   int    `json:"day"`
			Title string `json:"title"`
		} `json:"items"`
	} `json:"draft"`
	Published *struct {
		Number int `json:"number"`
		Items  []struct {
			Title string `json:"title"`
		} `json:"items"`
	} `json:"published"`
}

func item(day int, title string, persona uuid.UUID, review string, release string, due int) map[string]any {
	return map[string]any{"day": day, "type": "dsa", "title": title, "brief": "", "persona_id": persona,
		"review_mode": review, "release_time": release, "due_minutes": due}
}

func (e *env) newFlow(adm, name string) flowDetailResp {
	e.t.Helper()
	var d flowDetailResp
	e.expect(e.do("POST", "/v1/admin/flows", adm, map[string]any{"name": name, "stream": "Go", "days": 30}), 201).json(e.t, &d)
	return d
}

func (e *env) saveDraft(adm string, flow uuid.UUID, rev int, items []map[string]any) resp {
	return e.do("PUT", "/v1/admin/flows/"+flow.String()+"/draft", adm, map[string]any{"expected_revision": rev, "items": items})
}

func (e *env) publish(adm string, flow uuid.UUID, rev int) resp {
	return e.do("POST", "/v1/admin/flows/"+flow.String()+"/publish", adm, map[string]any{"expected_revision": rev})
}

// ---- Personas & catalog permissions (P1–P3) ----

func TestPersonas(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	var p personaDTO
	e.expect(e.do("POST", "/v1/admin/personas", adm, map[string]any{"name": "Kabir Rao", "title": "Mobile Lead", "color": "cyan"}), 201).json(t, &p)

	r := e.expect(e.do("POST", "/v1/admin/personas", adm, map[string]any{"name": "kabir rao", "title": "Dup", "color": "cyan"}), 422)
	if r.errCode(t).Error.Fields["name"] == "" {
		t.Fatalf("duplicate name: %s", r.Body)
	}
	r = e.expect(e.do("POST", "/v1/admin/personas", adm, map[string]any{"name": "K", "title": strings.Repeat("t", 61), "color": "pink"}), 422)
	for _, f := range []string{"name", "title", "color"} {
		if r.errCode(t).Error.Fields[f] == "" {
			t.Errorf("missing %s error: %s", f, r.Body)
		}
	}

	// Archive, then it can't post tasks or messages.
	e.expect(e.do("PATCH", "/v1/admin/personas/"+p.ID.String(), adm, map[string]any{
		"name": p.Name, "title": p.Title, "color": "cyan", "archived": true, "expected_version": p.Version}), 200)
	e.expect(e.do("PATCH", "/v1/admin/personas/"+p.ID.String(), adm, map[string]any{
		"name": p.Name, "title": p.Title, "color": "cyan", "archived": false, "expected_version": p.Version}), 409) // stale
	body := validTask(e.clock.Now())
	body["persona_id"] = p.ID
	r = e.expect(e.createTask(adm, e.enrollmentOf(seed.StudentLogin), body), 422)
	if r.errCode(t).Error.Fields["persona_id"] == "" {
		t.Fatalf("archived persona accepted: %s", r.Body)
	}
	e.expect(e.do("POST", "/v1/me/threads/"+p.ID.String()+"/messages", e.login(seed.StudentLogin),
		map[string]any{"client_id": uuid.New(), "body": "hi"}), 404)

	// The default team lead can't be archived.
	e.expect(e.do("PATCH", "/v1/admin/personas/"+domain.DefaultPersonaID.String(), adm, map[string]any{
		"name": "Sam Rivera", "title": "Team Lead", "color": "violet", "auto_reply": true, "archived": true, "expected_version": 1}), 422)
}

func TestCatalogIsAdminOnly(t *testing.T) {
	e := newEnv(t)
	tpo := e.login(seed.CollegeAdminLogin)
	e.expect(e.do("GET", "/v1/admin/personas", tpo, nil), 200)
	e.expect(e.do("GET", "/v1/admin/flows", tpo, nil), 200)
	e.expect(e.do("GET", "/v1/admin/task-templates", tpo, nil), 200)
	e.expect(e.do("POST", "/v1/admin/personas", tpo, map[string]any{"name": "Nope", "title": "Nope", "color": "blue"}), 403)
	e.expect(e.do("POST", "/v1/admin/flows", tpo, map[string]any{"name": "Nope flow", "stream": "Go", "days": 30}), 403)
	tpl := item(1, "Nope", domain.DefaultPersonaID, "manual", "10:00", 60)
	delete(tpl, "day")
	e.expect(e.do("POST", "/v1/admin/task-templates", tpo, tpl), 403)
	e.expect(e.do("GET", "/v1/admin/flows", e.login(seed.StudentLogin), nil), 403)
}

// ---- Library (L1–L2) ----

func TestTemplates(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	ok := map[string]any{"type": "blog", "title": "Write about closures", "brief": "", "persona_id": seed.ContentLeadID,
		"review_mode": "manual", "release_time": "15:00", "due_minutes": 1440}
	var tpl templateDTO
	e.expect(e.do("POST", "/v1/admin/task-templates", adm, ok), 201).json(t, &tpl)
	if tpl.ReleaseTime != "15:00" || tpl.Type != "blog" {
		t.Fatalf("template = %+v", tpl)
	}
	bad := map[string]map[string]any{
		"type":         {"type": "essay"},
		"review_mode":  {"review_mode": "ai"},
		"release_time": {"release_time": "7pm"},
		"due_minutes":  {"due_minutes": 14},
		"title":        {"title": "ab"},
		"persona_id":   {"persona_id": uuid.New()},
	}
	for field, mod := range bad {
		body := map[string]any{}
		for k, v := range ok {
			body[k] = v
		}
		for k, v := range mod {
			body[k] = v
		}
		r := e.expect(e.do("POST", "/v1/admin/task-templates", adm, body), 422)
		if r.errCode(t).Error.Fields[field] == "" {
			t.Errorf("%s: %s", field, r.Body)
		}
	}
	var list struct {
		Items []templateDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/task-templates?q=closures", adm, nil), 200).json(t, &list)
	if len(list.Items) != 1 {
		t.Fatalf("search = %d", len(list.Items))
	}
	e.expect(e.do("GET", "/v1/admin/task-templates?type=blog&limit=2", adm, nil), 200).json(t, &list)
	for _, it := range list.Items {
		if it.Type != "blog" {
			t.Fatalf("type filter leaked %s", it.Type)
		}
	}
	e.expect(e.do("GET", "/v1/admin/task-templates?type=essay", adm, nil), 422)
}

// ---- Flows (F1–F6) ----

func TestFlows(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	d := e.newFlow(adm, "Go Backend · 30 days")
	if d.Draft == nil || d.Draft.Revision != 1 || d.Published != nil {
		t.Fatalf("new flow = %+v", d)
	}
	e.expect(e.do("POST", "/v1/admin/flows", adm, map[string]any{"name": "go backend · 30 DAYS", "stream": "Go", "days": 30}), 422)
	r := e.expect(e.do("POST", "/v1/admin/flows", adm, map[string]any{"name": "ab", "stream": "G", "days": 45}), 422)
	for _, f := range []string{"name", "stream", "days"} {
		if r.errCode(t).Error.Fields[f] == "" {
			t.Errorf("missing %s: %s", f, r.Body)
		}
	}
	var list struct {
		Items []flowSummaryDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/flows", adm, nil), 200).json(t, &list)
	if len(list.Items) != 2 { // seeded React + this one
		t.Fatalf("flows = %d", len(list.Items))
	}
}

func TestFlowDraftBounds(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	d := e.newFlow(adm, "Bounds flow")
	r := e.expect(e.saveDraft(adm, d.Flow.ID, 1, []map[string]any{
		item(0, "Day zero", seed.EngineeringManagerID, "manual", "10:00", 60),
		item(31, "Past the end", seed.EngineeringManagerID, "manual", "10:00", 60),
	}), 422)
	f := r.errCode(t).Error.Fields
	if f["items[0].day"] == "" || f["items[1].day"] == "" {
		t.Fatalf("day bounds: %s", r.Body)
	}
	many := make([]map[string]any, 11)
	for i := range many {
		many[i] = item(3, "Crowded day", seed.EngineeringManagerID, "manual", "10:00", 60)
	}
	if r := e.expect(e.saveDraft(adm, d.Flow.ID, 1, many), 422); r.errCode(t).Error.Fields["items[10].day"] == "" {
		t.Fatalf("per-day cap: %s", r.Body)
	}
	e.expect(e.do("PUT", "/v1/admin/flows/"+d.Flow.ID.String()+"/draft", adm, map[string]any{"expected_revision": 1}), 422) // items missing

	var saved flowDetailResp
	e.expect(e.saveDraft(adm, d.Flow.ID, 1, []map[string]any{item(1, "Two sum", seed.EngineeringManagerID, "manual", "10:00", 60)}), 200).json(t, &saved)
	if saved.Draft.Revision != 2 || len(saved.Draft.Items) != 1 {
		t.Fatalf("saved = %+v", saved.Draft)
	}
	r = e.expect(e.saveDraft(adm, d.Flow.ID, 1, []map[string]any{}), 409) // stale revision
	if r.errCode(t).Error.Code != "version_conflict" {
		t.Fatalf("body %s", r.Body)
	}
}

func TestFlowPublish(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	d := e.newFlow(adm, "Publish flow")
	r := e.expect(e.publish(adm, d.Flow.ID, 1), 422) // empty
	if r.errCode(t).Error.Fields["items"] == "" {
		t.Fatalf("empty publish: %s", r.Body)
	}
	e.expect(e.saveDraft(adm, d.Flow.ID, 1, []map[string]any{item(1, "Task one", seed.EngineeringManagerID, "manual", "10:00", 60)}), 200)
	e.expect(e.publish(adm, d.Flow.ID, 1), 409) // stale
	var pub flowDetailResp
	e.expect(e.publish(adm, d.Flow.ID, 2), 200).json(t, &pub)
	if pub.Draft != nil || pub.Published == nil || pub.Published.Number != 1 {
		t.Fatalf("after publish = %+v", pub)
	}
	e.expect(e.publish(adm, d.Flow.ID, 2), 422) // nothing to publish

	// Editing after publish starts a new draft (revision 0 = "from published"); v1 is untouched.
	var edited flowDetailResp
	e.expect(e.saveDraft(adm, d.Flow.ID, 0, []map[string]any{
		item(1, "Task one", seed.EngineeringManagerID, "manual", "10:00", 60),
		item(2, "Task two", seed.DeliveryManagerID, "self", "11:00", 120),
	}), 200).json(t, &edited)
	if edited.Draft == nil || edited.Draft.Number != 2 || len(edited.Published.Items) != 1 || len(edited.Draft.Items) != 2 {
		t.Fatalf("edit after publish = %+v", edited)
	}

	// Length can't change after publishing.
	e.expect(e.do("PATCH", "/v1/admin/flows/"+d.Flow.ID.String(), adm, map[string]any{
		"name": "Publish flow", "stream": "Go", "days": 60, "expected_version": pub.Flow.Version}), 422)
}

func TestFlowDuplicate(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	var dup flowDetailResp
	e.expect(e.do("POST", "/v1/admin/flows/"+seed.ReactFlowID.String()+"/duplicate", adm,
		map[string]any{"name": "Angular Frontend · 30 days", "stream": "Angular"}), 201).json(t, &dup)
	if dup.Draft == nil || len(dup.Draft.Items) != 10 || dup.Published != nil {
		t.Fatalf("duplicate = %+v", dup)
	}
	// Changing the copy leaves the source alone.
	e.expect(e.saveDraft(adm, dup.Flow.ID, dup.Draft.Revision, []map[string]any{}), 200)
	var src flowDetailResp
	e.expect(e.do("GET", "/v1/admin/flows/"+seed.ReactFlowID.String(), adm, nil), 200).json(t, &src)
	if len(src.Published.Items) != 10 {
		t.Fatalf("source changed: %d items", len(src.Published.Items))
	}
	e.expect(e.do("POST", "/v1/admin/flows/"+seed.ReactFlowID.String()+"/duplicate", adm,
		map[string]any{"name": "React Frontend · 30 days", "stream": "React"}), 422) // name taken
}

// ---- Assignment (G1–G5, R1) ----

func publishedFlow(e *env, adm, name string, days int, items []map[string]any) uuid.UUID {
	e.t.Helper()
	var d flowDetailResp
	e.expect(e.do("POST", "/v1/admin/flows", adm, map[string]any{"name": name, "stream": "Go", "days": days}), 201).json(e.t, &d)
	e.expect(e.saveDraft(adm, d.Flow.ID, 1, items), 200)
	e.expect(e.publish(adm, d.Flow.ID, 2), 200)
	return d.Flow.ID
}

func TestAssignFlow(t *testing.T) {
	e := newEnv(t) // now = day 3, 10:00 IST
	adm := e.login(seed.AdminLogin)
	flow := publishedFlow(e, adm, "Assign flow", 30, []map[string]any{
		item(1, "Past day task", seed.EngineeringManagerID, "manual", "10:00", 60),
		item(3, "Earlier today", seed.EngineeringManagerID, "manual", "09:00", 120),
		item(3, "Later today", seed.DeliveryManagerID, "self", "15:00", 60),
		item(4, "Tomorrow", seed.ContentLeadID, "manual", "10:00", 60),
	})
	enr := e.enrollmentOf(seed.StudentLogin)

	var res assignResultDTO
	e.expect(e.do("PUT", "/v1/admin/enrollments/"+enr.String()+"/flow", adm, map[string]any{"flow_id": flow}), 200).json(t, &res)
	if res.Generated != 3 || res.Skipped != 1 || res.Cancelled != 0 {
		t.Fatalf("assign = %+v", res)
	}
	stu := e.login(seed.StudentLogin)
	var board struct {
		Items []taskDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", stu, nil), 200).json(t, &board)
	if len(board.Items) != 1 || board.Items[0].Title != "Earlier today" || !board.Items[0].FromFlow {
		t.Fatalf("visible now = %+v", board.Items)
	}

	// The engineering manager announced it in their own conversation.
	var threads struct {
		Items []threadDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/threads", stu, nil), 200).json(t, &threads)
	found := false
	for _, th := range threads.Items {
		if th.Persona.ID == seed.EngineeringManagerID && th.LastMessage != nil && strings.Contains(th.LastMessage.Body, "Earlier today") && th.Unread == 1 {
			found = true
		}
	}
	if !found {
		t.Fatalf("no announcement from the engineering manager: %+v", threads.Items)
	}

	// The admin inbox hides conversations that only hold announcements still scheduled
	// (the content lead posts tomorrow).
	var inbox struct {
		Items []staffThreadDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/threads?persona_id="+seed.ContentLeadID.String(), adm, nil), 200).json(t, &inbox)
	for _, th := range inbox.Items {
		if th.EnrollmentID == enr {
			t.Fatalf("scheduled-only thread listed: %+v", th)
		}
	}

	// Self-review task: the student finishes it without a reviewer.
	e.clock.Advance(5 * time.Hour) // 15:00 IST
	stu = e.login(seed.StudentLogin)
	e.expect(e.do("GET", "/v1/me/tasks", stu, nil), 200).json(t, &board)
	var self taskDTO
	for _, it := range board.Items {
		if it.Title == "Later today" {
			self = it
		}
	}
	if self.ReviewMode != "self" {
		t.Fatalf("later-today task = %+v", self)
	}
	e.expect(e.move(stu, self.ID, "in_progress", self.Version, ""), 200)
	e.expect(e.move(stu, self.ID, "done", self.Version+1, ""), 200)
	manual := board.Items[0]
	e.expect(e.move(stu, manual.ID, "in_progress", manual.Version, ""), 200)
	e.expect(e.move(stu, manual.ID, "done", manual.Version+1, ""), 422) // manual review can't be skipped

	// G1
	adm = e.login(seed.AdminLogin)
	e.expect(e.do("PUT", "/v1/admin/enrollments/"+e.enrollmentOf(seed.PausedLogin).String()+"/flow", adm, map[string]any{"flow_id": flow}), 422)
	long := publishedFlow(e, adm, "Long flow", 60, []map[string]any{item(1, "Long", seed.EngineeringManagerID, "manual", "10:00", 60)})
	if r := e.expect(e.do("PUT", "/v1/admin/enrollments/"+enr.String()+"/flow", adm, map[string]any{"flow_id": long}), 422); r.errCode(t).Error.Fields["flow_id"] == "" {
		t.Fatalf("days mismatch: %s", r.Body)
	}
	var unpub flowDetailResp
	e.expect(e.do("POST", "/v1/admin/flows", adm, map[string]any{"name": "Unpublished flow", "stream": "Go", "days": 30}), 201).json(t, &unpub)
	e.expect(e.do("PUT", "/v1/admin/enrollments/"+enr.String()+"/flow", adm, map[string]any{"flow_id": unpub.Flow.ID}), 422)
}

func TestReassignFlow(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	first := publishedFlow(e, adm, "First flow", 30, []map[string]any{
		item(3, "First now", seed.EngineeringManagerID, "manual", "09:00", 120),
		item(5, "First later", seed.EngineeringManagerID, "manual", "10:00", 60),
	})
	second := publishedFlow(e, adm, "Second flow", 30, []map[string]any{item(6, "Second later", seed.DeliveryManagerID, "manual", "10:00", 60)})
	enr := e.enrollmentOf(seed.StudentLogin)
	e.expect(e.do("PUT", "/v1/admin/enrollments/"+enr.String()+"/flow", adm, map[string]any{"flow_id": first}), 200)
	var res assignResultDTO
	e.expect(e.do("PUT", "/v1/admin/enrollments/"+enr.String()+"/flow", adm, map[string]any{"flow_id": second}), 200).json(t, &res)
	if res.Cancelled != 1 || res.Generated != 1 {
		t.Fatalf("reassign = %+v", res)
	}
	var pending int
	if err := e.store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_messages m JOIN tasks t ON t.id = m.task_id
		WHERE t.title = 'First later' AND m.delivered_at IS NULL`).Scan(&pending); err != nil || pending != 0 {
		t.Fatalf("cancelled task's announcement still pending: %d %v", pending, err)
	}
	var tasks struct {
		Enrollment struct {
			Flow *enrollmentFlowDTO `json:"flow"`
		} `json:"enrollment"`
		Items []taskDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/enrollments/"+enr.String()+"/tasks", adm, nil), 200).json(t, &tasks)
	statuses := map[string]string{}
	for _, it := range tasks.Items {
		statuses[it.Title] = string(it.Status)
	}
	if statuses["First now"] != "todo" || statuses["First later"] != "cancelled" || statuses["Second later"] != "todo" {
		t.Fatalf("statuses = %v", statuses)
	}
	if tasks.Enrollment.Flow == nil || tasks.Enrollment.Flow.Name != "Second flow" {
		t.Fatalf("enrollment flow = %+v", tasks.Enrollment.Flow)
	}
}

func TestBulkAssign(t *testing.T) {
	e := newEnv(t)
	tpo := e.login(seed.CollegeAdminLogin)
	ids := []uuid.UUID{e.enrollmentOf(seed.StudentLogin), e.enrollmentOf(seed.Student2Login), e.enrollmentOf(seed.IndieStudentLogin), e.enrollmentOf(seed.PausedLogin)}
	var out struct {
		Items []assignResultDTO `json:"items"`
	}
	e.expect(e.do("POST", "/v1/admin/flows/"+seed.ReactFlowID.String()+"/assign", tpo, map[string]any{"enrollment_ids": ids}), 200).json(t, &out)
	codes := []string{}
	for _, r := range out.Items {
		if r.Error == nil {
			codes = append(codes, "ok")
		} else {
			codes = append(codes, string(r.Error.Code))
		}
	}
	// Asha and Ravi succeed; Meera is outside the college; Kiran is paused.
	if strings.Join(codes, ",") != "ok,ok,not_found,enrollment_not_active" {
		t.Fatalf("bulk = %v", codes)
	}
	e.expect(e.do("POST", "/v1/admin/flows/"+seed.ReactFlowID.String()+"/assign", tpo, map[string]any{"enrollment_ids": []uuid.UUID{}}), 422)
	e.expect(e.do("POST", "/v1/admin/flows/"+seed.ReactFlowID.String()+"/assign", tpo, map[string]any{"enrollment_ids": []uuid.UUID{ids[0], ids[0]}}), 422)
}

// ---- Threads (C1–C5) ----

func TestThreads(t *testing.T) {
	e := newEnv(t)
	var adm string
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	pm := seed.EngineeringManagerID.String()

	// Student can start a conversation with an active persona; no auto reply from a human persona.
	e.expect(e.do("POST", "/v1/me/threads/"+pm+"/messages", stu, map[string]any{"client_id": uuid.New(), "body": "When is the DSA review?"}), 201)
	e.clock.Advance(time.Hour)
	stu, adm = e.login(seed.StudentLogin), e.login(seed.AdminLogin)
	var page struct {
		Items []messageDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/threads/"+pm+"/messages", stu, nil), 200).json(t, &page)
	if len(page.Items) != 1 {
		t.Fatalf("human persona auto-replied: %+v", page.Items)
	}
	e.expect(e.do("GET", "/v1/me/threads/"+uuid.NewString()+"/messages", stu, nil), 404)

	// Admin inbox shows it unread; replying as the persona clears it and the student sees 1 unread.
	var inbox struct {
		Items []staffThreadDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/threads?unread=true", adm, nil), 200).json(t, &inbox)
	if len(inbox.Items) != 1 || inbox.Items[0].Unread != 1 || inbox.Items[0].Student.GitHubLogin != seed.StudentLogin {
		t.Fatalf("inbox = %+v", inbox.Items)
	}
	e.expect(e.do("POST", "/v1/admin/threads/"+enr.String()+"/"+pm+"/messages", adm, map[string]any{"client_id": uuid.New(), "body": "Friday, 4 PM."}), 201)
	e.expect(e.do("GET", "/v1/admin/threads?unread=true", adm, nil), 200).json(t, &inbox)
	if len(inbox.Items) != 0 {
		t.Fatalf("still unread after reply: %+v", inbox.Items)
	}
	var threads struct {
		Items []threadDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/threads", stu, nil), 200).json(t, &threads)
	unread := map[uuid.UUID]int{}
	for _, th := range threads.Items {
		unread[th.Persona.ID] = th.Unread
	}
	if unread[seed.EngineeringManagerID] != 1 {
		t.Fatalf("student unread = %v", unread)
	}
	e.expect(e.do("POST", "/v1/me/threads/"+pm+"/read", stu, nil), 204)
	e.expect(e.do("GET", "/v1/me/threads", stu, nil), 200).json(t, &threads)
	for _, th := range threads.Items {
		if th.Persona.ID == seed.EngineeringManagerID && th.Unread != 0 {
			t.Fatal("read didn't clear unread")
		}
	}

	// C2: a delayed auto-reply isn't counted until it's delivered.
	e.expect(e.do("POST", leadThread, stu, map[string]any{"client_id": uuid.New(), "body": "PR ready for review"}), 201)
	e.expect(e.do("GET", "/v1/me/threads", stu, nil), 200).json(t, &threads)
	for _, th := range threads.Items {
		if th.Persona.ID == domain.DefaultPersonaID && th.Unread != 0 {
			t.Fatalf("undelivered reply counted: %d", th.Unread)
		}
	}
}

func TestThreadScope(t *testing.T) {
	e := newEnv(t)
	tpo := e.login(seed.CollegeAdminLogin)
	indie := e.enrollmentOf(seed.IndieStudentLogin)
	e.expect(e.do("POST", "/v1/admin/threads/"+indie.String()+"/"+seed.DeliveryManagerID.String()+"/messages", tpo,
		map[string]any{"client_id": uuid.New(), "body": "hello"}), 404)
	e.expect(e.do("GET", "/v1/admin/threads/"+indie.String()+"/"+seed.DeliveryManagerID.String()+"/messages", tpo, nil), 404)
	var inbox struct {
		Items []staffThreadDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/threads", tpo, nil), 200).json(t, &inbox)
	for _, th := range inbox.Items {
		if th.Student.GitHubLogin == seed.IndieStudentLogin {
			t.Fatal("college admin sees a student outside the college")
		}
	}
}

func TestBroadcast(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	ids := []uuid.UUID{e.enrollmentOf(seed.StudentLogin), e.enrollmentOf(seed.Student2Login)}
	cid := uuid.New()
	body := map[string]any{"persona_id": seed.ContentLeadID, "client_id": cid, "enrollment_ids": ids, "body": "Blog drafts are due Friday."}
	var out struct {
		Sent int `json:"sent"`
	}
	e.expect(e.do("POST", "/v1/admin/broadcasts", adm, body), 200).json(t, &out)
	if out.Sent != 2 {
		t.Fatalf("sent = %d", out.Sent)
	}
	e.expect(e.do("POST", "/v1/admin/broadcasts", adm, body), 200) // retry: no duplicates
	var n int
	if err := e.store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_messages WHERE body = 'Blog drafts are due Friday.'`).Scan(&n); err != nil || n != 2 {
		t.Fatalf("messages = %d %v", n, err)
	}
	for name, mod := range map[string]map[string]any{
		"empty":     {"enrollment_ids": []uuid.UUID{}},
		"dupes":     {"enrollment_ids": []uuid.UUID{ids[0], ids[0]}},
		"long body": {"body": strings.Repeat("x", 4001)},
		"persona":   {"persona_id": uuid.New()},
	} {
		b := map[string]any{}
		for k, v := range body {
			b[k] = v
		}
		for k, v := range mod {
			b[k] = v
		}
		b["client_id"] = uuid.New()
		if r := e.do("POST", "/v1/admin/broadcasts", adm, b); r.Code != 422 {
			t.Errorf("%s: %d %s", name, r.Code, r.Body)
		}
	}
	too := make([]uuid.UUID, domain.MaxBroadcastUsers+1)
	for i := range too {
		too[i] = uuid.New()
	}
	body["enrollment_ids"] = too
	e.expect(e.do("POST", "/v1/admin/broadcasts", adm, body), 422)
}

func TestStaffSocket(t *testing.T) {
	e := newEnv(t)
	ts := httptest.NewServer(e.h)
	defer ts.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go realtime.Listen(ctx, e.store.Pool, e.srv.hub, e.srv.EncodeEvent, e.srv.log)

	tpo, err := dialWS(t, ts.URL, wsProtocol, "bearer."+e.login(seed.CollegeAdminLogin))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tpo.CloseNow() }()
	if f := readFrame(t, tpo); f.Type != frameReady {
		t.Fatalf("first frame = %+v", f)
	}
	time.Sleep(100 * time.Millisecond)

	// A student outside the college writes first: the college admin must not see it.
	e.expect(e.do("POST", "/v1/me/threads/"+seed.DeliveryManagerID.String()+"/messages", e.login(seed.IndieStudentLogin),
		map[string]any{"client_id": uuid.New(), "body": "outside"}), 201)
	e.expect(e.do("POST", "/v1/me/threads/"+seed.DeliveryManagerID.String()+"/messages", e.login(seed.StudentLogin),
		map[string]any{"client_id": uuid.New(), "body": "inside"}), 201)
	f := readFrame(t, tpo)
	if f.Type != frameMessage || f.Message.Body != "inside" {
		t.Fatalf("staff frame = %+v", f)
	}
	rctx, rcancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer rcancel()
	if _, b, err := tpo.Read(rctx); err == nil {
		var extra frame
		_ = json.Unmarshal(b, &extra)
		t.Fatalf("unexpected extra frame: %+v", extra)
	} else if !errors.Is(err, context.DeadlineExceeded) && websocket.CloseStatus(err) == -1 && !strings.Contains(err.Error(), "deadline") {
		t.Fatalf("read: %v", err)
	}
}
