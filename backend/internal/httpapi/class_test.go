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

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type classResp struct {
	ID         uuid.UUID `json:"id"`
	Title      string    `json:"title"`
	Status     string    `json:"status"`
	InRoom     int       `json:"in_room"`
	Role       string    `json:"role"`
	CohortName *string   `json:"cohort_name"`
	ICEServers []struct {
		URLs []string `json:"urls"`
	} `json:"ice_servers"`
}

func (e *env) cohortID(name string) uuid.UUID {
	e.t.Helper()
	var id uuid.UUID
	if err := e.store.Pool.QueryRow(context.Background(), `SELECT id FROM cohorts WHERE name = $1`, name).Scan(&id); err != nil {
		e.t.Fatal(err)
	}
	return id
}

func (e *env) scheduleClass(token string, body map[string]any) classResp {
	e.t.Helper()
	var c classResp
	e.expect(e.do("POST", "/v1/admin/classes", token, body), 201).json(e.t, &c)
	return c
}

// LC9–LC12: classes are validated, invite their audience by mail and calendar, are only
// visible to invitees and staff in scope, and can be cancelled.
func TestClassSchedule(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	asha := e.login(seed.StudentLogin)
	meera := e.login(seed.IndieStudentLogin)
	starts := testNow.Add(26 * time.Hour)

	f := e.expect(e.do("POST", "/v1/admin/classes", adm, map[string]any{"title": "x", "duration_minutes": 5, "audience": "nope"}), 422).errCode(t).Error.Fields
	for _, k := range []string{"title", "starts_at", "duration_minutes", "audience"} {
		if f[k] == "" {
			t.Errorf("%s not flagged: %v", k, f)
		}
	}
	e.expect(e.do("POST", "/v1/admin/classes", asha, map[string]any{"title": "Mine", "starts_at": starts, "duration_minutes": 60, "audience": "all"}), 403)

	c := e.scheduleClass(adm, map[string]any{"title": "  Git   branching  ", "description": "Bring a repo.", "starts_at": starts, "duration_minutes": 60,
		"audience": "cohort", "cohort_id": e.cohortID("ANITS Batch 1")})
	if c.Title != "Git branching" || c.Status != "scheduled" || c.CohortName == nil {
		t.Fatalf("class = %+v", c)
	}
	// Asha (in the cohort) is invited by mail and sees it on her calendar; Meera isn't.
	if m := e.mailbox(asha, "").Items[0]; m.Kind != "class" || m.Subject != "Live class Git branching" {
		t.Fatalf("invite = %+v", m)
	}
	var cal calendarResp
	e.expect(e.do("GET", "/v1/me/calendar", asha, nil), 200).json(t, &cal)
	found := false
	for _, it := range cal.Items {
		found = found || it.Kind == "class" && it.Title != nil && *it.Title == "Git branching"
	}
	if !found {
		t.Fatal("class missing from calendar")
	}
	var mine struct {
		Items []classResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/classes", meera, nil), 200).json(t, &mine)
	for _, x := range mine.Items {
		if x.ID == c.ID {
			t.Fatal("uninvited student sees the class")
		}
	}
	e.expect(e.do("GET", "/v1/classes/"+c.ID.String(), meera, nil), 404)
	var detail classResp
	e.expect(e.do("GET", "/v1/classes/"+c.ID.String(), asha, nil), 200).json(t, &detail)
	if detail.Role != "student" || len(detail.ICEServers) == 0 || len(detail.ICEServers[0].URLs) == 0 {
		t.Fatalf("student detail = %+v", detail)
	}
	e.expect(e.do("GET", "/v1/classes/"+c.ID.String(), adm, nil), 200).json(t, &detail)
	if detail.Role != "host" {
		t.Fatalf("host detail = %+v", detail)
	}

	// A college admin schedules for their college only.
	tpo := e.login(seed.CollegeAdminLogin)
	e.expectCode(e.do("POST", "/v1/admin/classes", tpo, map[string]any{"title": "Mock interviews", "starts_at": starts, "duration_minutes": 45,
		"audience": "cohort", "cohort_id": e.cohortID(seed.OpenCohortName)}), 422, "validation_failed")
	own := e.scheduleClass(tpo, map[string]any{"title": "Mock interviews", "starts_at": starts, "duration_minutes": 45, "audience": "all"})
	e.expect(e.do("GET", "/v1/classes/"+own.ID.String(), meera, nil), 404)

	// Cancelling: only before it starts; the room refuses afterwards.
	var cancelled classResp
	e.expect(e.do("POST", "/v1/admin/classes/"+own.ID.String()+"/status", tpo, map[string]any{"status": "cancelled"}), 200).json(t, &cancelled)
	if cancelled.Status != "cancelled" {
		t.Fatalf("cancel = %+v", cancelled)
	}
	e.expect(e.do("POST", "/v1/admin/classes/"+own.ID.String()+"/status", tpo, map[string]any{"status": "cancelled"}), 200) // repeating is a no-op
	e.expectCode(e.do("POST", "/v1/admin/classes/"+own.ID.String()+"/status", tpo, map[string]any{"status": "ended"}), 422, "invalid_transition")
	e.expectCode(e.do("POST", "/v1/admin/classes/"+own.ID.String()+"/status", tpo, map[string]any{"status": "live"}), 422, "validation_failed")
}

func dialClass(t *testing.T, base string, id uuid.UUID, token string) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(base, "http")+"/v1/classes/"+id.String()+"/ws",
		&websocket.DialOptions{Subprotocols: []string{wsProtocol, "bearer." + token}})
	if err != nil {
		t.Fatal(err)
	}
	return c
}

type roomFrame struct {
	Type string `json:"type"`
	You  *struct {
		Role string `json:"role"`
	} `json:"you"`
	Message *struct {
		ID   string `json:"id"`
		Body string `json:"body"`
	} `json:"message"`
	Question *struct {
		ID string `json:"id"`
	} `json:"question"`
	Code  string `json:"code"`
	Error string `json:"error"`
}

// until reads frames until one of the given type arrives.
func until(t *testing.T, c *websocket.Conn, typ string) roomFrame {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for {
		_, b, err := c.Read(ctx)
		if err != nil {
			t.Fatalf("waiting for %s: %v", typ, err)
		}
		var f roomFrame
		_ = json.Unmarshal(b, &f)
		if f.Type == typ {
			return f
		}
	}
}

func roomSend(t *testing.T, c *websocket.Conn, v map[string]any) {
	t.Helper()
	b, _ := json.Marshal(v)
	if err := c.Write(context.Background(), websocket.MessageText, b); err != nil {
		t.Fatal(err)
	}
}

// LC13–LC16: a host opening the room puts the class live; chat and questions reach everyone
// in memory; a host promotes a question to every invitee's mail; only hosts end it.
func TestClassRoom(t *testing.T) {
	e := newEnv(t)
	ts := httptest.NewServer(e.h)
	defer ts.Close()
	adm := e.login(seed.AdminLogin)
	asha := e.login(seed.StudentLogin)
	c := e.scheduleClass(adm, map[string]any{"title": "Heaps live", "starts_at": testNow.Add(10 * time.Minute), "duration_minutes": 60,
		"audience": "cohort", "cohort_id": e.cohortID("ANITS Batch 1")})

	host := dialClass(t, ts.URL, c.ID, adm)
	defer func() { _ = host.CloseNow() }()
	if w := until(t, host, "welcome"); w.You == nil || w.You.Role != "host" {
		t.Fatalf("host welcome = %+v", w)
	}
	var live classResp
	e.expect(e.do("GET", "/v1/classes/"+c.ID.String(), asha, nil), 200).json(t, &live)
	if live.Status != "live" || live.InRoom != 1 {
		t.Fatalf("after host joined = %+v", live)
	}
	stu := dialClass(t, ts.URL, c.ID, asha)
	defer func() { _ = stu.CloseNow() }()
	until(t, stu, "welcome")
	until(t, host, "peer_joined")

	roomSend(t, stu, map[string]any{"type": "chat", "body": "Hello from Asha"})
	if m := until(t, host, "chat"); m.Message == nil || m.Message.Body != "Hello from Asha" {
		t.Fatalf("chat = %+v", m)
	}
	roomSend(t, stu, map[string]any{"type": "ask", "body": "When do I use a min-heap?"})
	q := until(t, host, "question")
	roomSend(t, stu, map[string]any{"type": "promote", "id": q.Question.ID})
	if f := until(t, stu, "error"); f.Code != "forbidden" {
		t.Fatalf("student promote = %+v", f)
	}
	roomSend(t, host, map[string]any{"type": "promote", "id": q.Question.ID})
	if f := until(t, host, "promoted"); f.Code != q.Question.ID {
		t.Fatalf("promoted = %+v", f)
	}
	if m := e.mailbox(asha, "").Items[0]; m.Kind != "announcement" || m.Subject != "From the class Heaps live" {
		t.Fatalf("promoted mail = %+v", m)
	}
	// Uninvited students can't get in.
	meera := dialClass(t, ts.URL, c.ID, e.login(seed.IndieStudentLogin))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var ce websocket.CloseError
	if _, _, err := meera.Read(ctx); !errors.As(err, &ce) || ce.Code != classCloseNotFound {
		t.Fatalf("uninvited = %v", err)
	}

	roomSend(t, stu, map[string]any{"type": "end"})
	until(t, stu, "error")
	roomSend(t, host, map[string]any{"type": "end"})
	until(t, stu, "ended")
	deadline := time.Now().Add(3 * time.Second)
	for {
		e.expect(e.do("GET", "/v1/classes/"+c.ID.String(), adm, nil), 200).json(t, &live)
		if live.Status == "ended" || time.Now().After(deadline) {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if live.Status != "ended" {
		t.Fatalf("after end = %+v", live)
	}
	again := dialClass(t, ts.URL, c.ID, asha)
	if _, _, err := again.Read(ctx); !errors.As(err, &ce) || ce.Code != classCloseClosed {
		t.Fatalf("join ended class = %v", err)
	}
}
