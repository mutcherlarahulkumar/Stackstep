package httpapi

import (
	"testing"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type reactedMsg struct {
	ID        uuid.UUID `json:"id"`
	Reactions []struct {
		Emoji string `json:"emoji"`
		By    string `json:"by"`
	} `json:"reactions"`
}

// CH1–CH3: both sides react; reactions toggle and repeat safely; nobody reacts outside their
// scope; unknown emoji are refused.
func TestReactions(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	asha := e.login(seed.StudentLogin)
	lead := domain.DefaultPersonaID.String()
	var page struct {
		Items []reactedMsg `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/threads/"+lead+"/messages", asha, nil), 200).json(t, &page)
	if len(page.Items) == 0 {
		t.Fatal("no messages to react to")
	}
	msg := page.Items[0].ID
	var m reactedMsg
	e.expect(e.do("POST", "/v1/me/messages/"+msg.String()+"/reactions", asha, map[string]any{"emoji": "heart", "on": true}), 200)
	e.expect(e.do("POST", "/v1/me/messages/"+msg.String()+"/reactions", asha, map[string]any{"emoji": "heart", "on": true}), 200)
	e.expect(e.do("POST", "/v1/admin/messages/"+msg.String()+"/reactions", adm, map[string]any{"emoji": "party", "on": true}), 200).json(t, &m)
	if len(m.Reactions) != 2 || m.Reactions[0].Emoji != "heart" || m.Reactions[0].By != "student" || m.Reactions[1].By != "persona" {
		t.Fatalf("reactions = %+v", m.Reactions)
	}
	e.expect(e.do("GET", "/v1/me/threads/"+lead+"/messages", asha, nil), 200).json(t, &page)
	if len(page.Items[0].Reactions) != 2 {
		t.Fatalf("listed reactions = %+v", page.Items[0].Reactions)
	}
	e.expect(e.do("POST", "/v1/me/messages/"+msg.String()+"/reactions", asha, map[string]any{"emoji": "heart", "on": false}), 200).json(t, &m)
	if len(m.Reactions) != 1 || m.Reactions[0].Emoji != "party" {
		t.Fatalf("after toggling off = %+v", m.Reactions)
	}
	e.expectCode(e.do("POST", "/v1/me/messages/"+msg.String()+"/reactions", asha, map[string]any{"emoji": "fire", "on": true}), 422, "validation_failed")
	// Another student, an unknown message and a college admin outside the student's college.
	e.expect(e.do("POST", "/v1/me/messages/"+msg.String()+"/reactions", e.login(seed.IndieStudentLogin), map[string]any{"emoji": "eyes", "on": true}), 404)
	e.expect(e.do("POST", "/v1/me/messages/"+uuid.NewString()+"/reactions", asha, map[string]any{"emoji": "eyes", "on": true}), 404)
	var meera struct {
		Items []struct {
			LastMessage *reactedMsg `json:"last_message"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/threads", e.login(seed.IndieStudentLogin), nil), 200).json(t, &meera)
	if len(meera.Items) == 0 || meera.Items[0].LastMessage == nil {
		t.Fatalf("meera has no conversation: %+v", meera)
	}
	e.expect(e.do("POST", "/v1/admin/messages/"+meera.Items[0].LastMessage.ID.String()+"/reactions", e.login(seed.CollegeAdminLogin), map[string]any{"emoji": "eyes", "on": true}), 404)
}

type inboxStudentsResp struct {
	Items []struct {
		Student struct {
			GitHubLogin string `json:"github_login"`
		} `json:"student"`
		EnrollmentID uuid.UUID `json:"enrollment_id"`
		Unread       int       `json:"unread"`
		Threads      int       `json:"threads"`
		DayNumber    int       `json:"day_number"`
		FlowName     *string   `json:"flow_name"`
	} `json:"items"`
	NextOffset *int `json:"next_offset"`
}

// CH4–CH6: the inbox lists every student in scope, by flow, cohort or name, unread first; one
// student's conversations come from the thread list.
func TestInboxStudents(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	var all inboxStudentsResp
	e.expect(e.do("GET", "/v1/admin/inbox/students", adm, nil), 200).json(t, &all)
	if len(all.Items) < 4 || all.NextOffset != nil {
		t.Fatalf("all = %+v", all)
	}
	// A student writes: they move to the top with an unread count.
	ravi := e.login(seed.Student2Login)
	e.expect(e.do("POST", "/v1/me/threads/"+domain.DefaultPersonaID.String()+"/messages", ravi, map[string]any{"client_id": uuid.New(), "body": "Can I ask about the brief?"}), 201)
	e.expect(e.do("GET", "/v1/admin/inbox/students", adm, nil), 200).json(t, &all)
	if top := all.Items[0]; top.Student.GitHubLogin != seed.Student2Login || top.Unread < 1 || top.Threads < 1 || top.DayNumber != 3 {
		t.Fatalf("top = %+v", top)
	}
	var byFlow inboxStudentsResp
	e.expect(e.do("GET", "/v1/admin/inbox/students?flow_id="+seed.ReactFlowID.String(), adm, nil), 200).json(t, &byFlow)
	if len(byFlow.Items) != 1 || byFlow.Items[0].Student.GitHubLogin != seed.IndieStudentLogin || byFlow.Items[0].FlowName == nil {
		t.Fatalf("by flow = %+v", byFlow)
	}
	var byName inboxStudentsResp
	e.expect(e.do("GET", "/v1/admin/inbox/students?q=asha", adm, nil), 200).json(t, &byName)
	if len(byName.Items) != 1 {
		t.Fatalf("by name = %+v", byName)
	}
	// A college admin only sees their college; one student's threads.
	var tpo inboxStudentsResp
	e.expect(e.do("GET", "/v1/admin/inbox/students", e.login(seed.CollegeAdminLogin), nil), 200).json(t, &tpo)
	for _, s := range tpo.Items {
		if s.Student.GitHubLogin == seed.IndieStudentLogin {
			t.Fatal("college admin sees an independent student")
		}
	}
	var threads struct {
		Items []struct {
			EnrollmentID uuid.UUID `json:"enrollment_id"`
		} `json:"items"`
	}
	ra := e.enrollmentOf(seed.Student2Login)
	e.expect(e.do("GET", "/v1/admin/threads?enrollment_id="+ra.String(), adm, nil), 200).json(t, &threads)
	if len(threads.Items) == 0 {
		t.Fatal("no threads for the student")
	}
	for _, th := range threads.Items {
		if th.EnrollmentID != ra {
			t.Fatalf("thread from someone else: %+v", th)
		}
	}
	e.expectCode(e.do("GET", "/v1/admin/inbox/students?offset=-1", adm, nil), 422, "validation_failed")
	e.expect(e.do("GET", "/v1/admin/inbox/students", ravi, nil), 403)
}
