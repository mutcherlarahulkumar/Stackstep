package httpapi

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/ai"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/config"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/ghpr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

// fakePRs stands in for GitHub when review drafts read a pull request.
type fakePRs struct {
	mu   sync.Mutex
	pr   *ghpr.PR
	fail error
	refs []ghpr.Ref
}

func (f *fakePRs) Get(_ context.Context, ref ghpr.Ref) (ghpr.PR, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.refs = append(f.refs, ref)
	if f.fail != nil {
		return ghpr.PR{}, f.fail
	}
	if f.pr == nil {
		return ghpr.PR{}, ghpr.ErrNotReadable
	}
	return *f.pr, nil
}

func withTeamLead(c *config.Config) {
	c.AI = config.AIConfig{GroqAPIKey: "test-key", Timeout: 5 * time.Second, DailyQuestions: 8, QuestionCooldown: 2 * time.Minute,
		FollowUpCooldown: 5 * time.Minute, MaxFollowUps: 3, GlobalPerMinute: 1000, TeamLead: true, ReviewDrafts: true, DraftsPerStaffDay: 60}
}

type chatPage struct {
	Items []struct {
		Author    string `json:"author"`
		Body      string `json:"body"`
		Automated bool   `json:"automated"`
	} `json:"items"`
}

func (e *env) leadChat(tok string) chatPage {
	e.t.Helper()
	var p chatPage
	e.expect(e.do("GET", leadThread, tok, nil), 200).json(e.t, &p)
	return p
}

// AL1–AL5: the AI team lead answers auto-reply personas in their voice, with the board and the
// conversation as context, labelled automatic; any model problem falls back to the scripted lead.
func TestAITeamLead(t *testing.T) {
	e := newEnv(t, withTeamLead)
	stu := e.login(seed.StudentLogin)
	e.ai.text = "Sam Rivera: Start by logging the status value on each render, then tell me what you see."

	// AL1: the reply arrives after the persona delay, cleaned of a name prefix, and is automated.
	e.expect(send(e, stu, uuid.New(), "my filter doesn't update when I pick a status"), 201)
	if p := e.leadChat(stu); p.Items[0].Author != "student" || p.Items[0].Automated {
		t.Fatalf("reply visible before the delay, or student message automated: %+v", p.Items[0])
	}
	e.clock.Advance(31 * time.Second)
	p := e.leadChat(stu)
	if got := p.Items[0]; got.Author != "persona" || !got.Automated || got.Body != "Start by logging the status value on each render, then tell me what you see." {
		t.Fatalf("AI reply = %+v", got)
	}

	// AL2: the prompt holds the rules, the board as context, then the student's words as a user turn.
	msgs := e.ai.last()
	if msgs[0].Role != "system" || !strings.Contains(msgs[0].Content, "Never promise or decide approvals") {
		t.Fatalf("system prompt = %q", msgs[0].Content)
	}
	if msgs[1].Role != "system" || !strings.Contains(msgs[1].Content, "Intern: Asha.") {
		t.Fatalf("context = %q", msgs[1].Content)
	}
	if last := msgs[len(msgs)-1]; last.Role != "user" || last.Content != "my filter doesn't update when I pick a status" {
		t.Fatalf("last turn = %+v", last)
	}

	// AL3: a follow-up carries the earlier turns as history.
	e.expect(send(e, stu, uuid.New(), "it logs the old value"), 201)
	msgs = e.ai.last()
	var sawAssistant bool
	for _, m := range msgs {
		if m.Role == "assistant" && strings.Contains(m.Content, "Start by logging") {
			sawAssistant = true
		}
	}
	if !sawAssistant {
		t.Fatalf("history missing the lead's earlier reply: %+v", msgs)
	}

	// AL4: a model failure or an unusable answer falls back to the scripted lead.
	e.clock.Advance(31 * time.Second)
	e.ai.fail = ai.ErrUnavailable
	e.expect(send(e, stu, uuid.New(), "thanks!"), 201)
	e.clock.Advance(31 * time.Second)
	if got := e.leadChat(stu).Items[0]; !got.Automated || !strings.Contains(got.Body, "Anytime") {
		t.Fatalf("fallback reply = %+v", got)
	}
	e.ai.fail = nil
	e.ai.text = strings.Repeat("word ", 400)
	e.expect(send(e, stu, uuid.New(), "thanks again"), 201)
	e.clock.Advance(31 * time.Second)
	if got := e.leadChat(stu).Items[0]; !strings.Contains(got.Body, "Anytime") {
		t.Fatalf("over-long reply not replaced: %q", got.Body)
	}

	// AL5: an admin's reply as the persona is never marked automated.
	adm := e.login(seed.AdminLogin)
	path := "/v1/admin/threads/" + e.enrollmentOf(seed.StudentLogin).String() + "/" + domain.DefaultPersonaID.String() + "/messages"
	e.expect(e.do("POST", path, adm, map[string]any{"client_id": uuid.New(), "body": "Mentor here, nice progress."}), 201)
	if got := e.leadChat(stu).Items[0]; got.Body != "Mentor here, nice progress." || got.Automated {
		t.Fatalf("admin reply = %+v", got)
	}
}

// AL6: without the AI team lead the scripted lead answers, and the model is never called.
func TestScriptedLeadWhenAIOff(t *testing.T) {
	e := newEnv(t)
	stu := e.login(seed.StudentLogin)
	e.expect(send(e, stu, uuid.New(), "thanks!"), 201)
	e.clock.Advance(31 * time.Second)
	if got := e.leadChat(stu).Items[0]; !got.Automated || !strings.Contains(got.Body, "Anytime") {
		t.Fatalf("scripted reply = %+v", got)
	}
	if n := e.ai.count(); n != 0 {
		t.Fatalf("model called %d times with the AI team lead off", n)
	}
}

type draftResp struct {
	Decision string `json:"decision"`
	Summary  string `json:"summary"`
	Note     string `json:"note"`
	Rubric   []bool `json:"rubric"`
	ReadPR   bool   `json:"read_pr"`
}

// handedIn creates a task with a rubric for the student and hands it in with url.
func (e *env) handedIn(login, url string) uuid.UUID {
	e.t.Helper()
	adm := e.login(seed.AdminLogin)
	var task taskResp
	body := validTask(e.clock.Now())
	body["title"], body["brief"] = "Filter tasks by status", "Add a status filter to the task list."
	body["content"] = map[string]any{"resources": []any{}, "quiz": nil, "rubric": []string{"Filter updates without a reload", "Has a test"}}
	e.expect(e.createTask(adm, e.enrollmentOf(login), body), 201).json(e.t, &task)
	tok := e.login(login)
	e.expect(e.move(tok, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.do("POST", "/v1/tasks/"+task.ID.String()+"/transitions", tok, map[string]any{
		"to": "in_review", "expected_version": task.Version + 1, "submission": map[string]any{"url": url, "note": "Used useMemo."},
	}), 200)
	return task.ID
}

// expectCode checks the status and the error code.
func (e *env) expectCode(r resp, status int, code string) resp {
	e.t.Helper()
	e.expect(r, status)
	if got := r.errCode(e.t).Error.Code; got != code {
		e.t.Fatalf("code = %q, want %q (%s)", got, code, r.Body)
	}
	return r
}

func draftPath(id uuid.UUID) string { return "/v1/admin/tasks/" + id.String() + "/review-draft" }

// RD1–RD8: AI review drafts for admins.
func TestReviewDraft(t *testing.T) {
	e := newEnv(t)
	id := e.handedIn(seed.StudentLogin, "https://github.com/asha-dev/todo/pull/7")
	adm := e.login(seed.AdminLogin)
	e.prs.pr = &ghpr.PR{Title: "Add status filter", State: "open", Additions: 12, Deletions: 2, ChangedFiles: 2,
		Diff: "diff --git a/list.tsx b/list.tsx\n+const shown = useMemo(() => tasks.filter(byStatus), [tasks, status])"}
	e.ai.text = "```json\n" + `{"decision":"request_changes","summary":"Adds a memoised filter; no test.","note":"Nice use of useMemo.\n\n- Add a test for the filter.","rubric":[true,false]}` + "\n```"

	// RD1: the queue says drafts are on; a draft reads the PR and returns decision, note and ticks.
	var q struct {
		AIDrafts bool `json:"ai_drafts"`
	}
	e.expect(e.do("GET", "/v1/admin/reviews", adm, nil), 200).json(t, &q)
	if !q.AIDrafts {
		t.Fatal("ai_drafts = false with drafts on")
	}
	var d draftResp
	e.expect(e.do("POST", draftPath(id), adm, nil), 200).json(t, &d)
	if d.Decision != "request_changes" || !d.ReadPR || len(d.Rubric) != 2 || !d.Rubric[0] || d.Rubric[1] ||
		!strings.Contains(d.Note, "Add a test") || d.Summary == "" {
		t.Fatalf("draft = %+v", d)
	}
	if refs := e.prs.refs; len(refs) != 1 || refs[0] != (ghpr.Ref{Owner: "asha-dev", Repo: "todo", Number: 7}) {
		t.Fatalf("PR refs = %+v", refs)
	}
	prompt := e.ai.last()[1].Content
	for _, want := range []string{"Filter tasks by status", "1. Filter updates without a reload", "Used useMemo.", "useMemo(() => tasks.filter"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt missing %q", want)
		}
	}

	// RD2: the draft changes nothing: the task is still waiting for review.
	if got := e.studentTask(e.login(seed.StudentLogin), id); got.Status != "in_review" {
		t.Fatalf("status after draft = %s", got.Status)
	}

	// RD3: an unreadable PR still drafts, without the diff; wrong rubric length drops the ticks.
	e.prs.pr = nil
	e.ai.text = `{"decision":"approve","summary":"Looks fine.","note":"Good work.","rubric":[true]}`
	d = draftResp{}
	e.expect(e.do("POST", draftPath(id), adm, nil), 200).json(t, &d)
	if d.Decision != "approve" || d.ReadPR || d.Rubric != nil {
		t.Fatalf("draft without PR = %+v", d)
	}
	if !strings.Contains(e.ai.last()[1].Content, "PULL REQUEST: not available") {
		t.Fatal("prompt doesn't say the PR was unavailable")
	}

	// RD4: an unusable model answer or a model error is ai_unavailable; a rate limit is rate_limited.
	e.ai.text = "I think it's fine"
	e.expectCode(e.do("POST", draftPath(id), adm, nil), 503, "ai_unavailable")
	e.ai.fail = &ai.RateLimitedError{RetryAfter: 20 * time.Second}
	e.expectCode(e.do("POST", draftPath(id), adm, nil), 429, "rate_limited")
	e.ai.fail = nil

	// RD5: students can't ask; tasks not waiting for review can't be drafted; unknown ids are 404.
	e.expect(e.do("POST", draftPath(id), e.login(seed.StudentLogin), nil), 403)
	other := e.mustCreateTask(adm, e.enrollmentOf(seed.StudentLogin))
	e.expectCode(e.do("POST", draftPath(other.ID), adm, nil), 400, "invalid_state")
	e.expect(e.do("POST", draftPath(uuid.New()), adm, nil), 404)
}

// RD6: the per-day limit.
func TestReviewDraftDailyLimit(t *testing.T) {
	e := newEnv(t, func(c *config.Config) {
		withTeamLead(c)
		c.AI.DraftsPerStaffDay = 1
	})
	id := e.handedIn(seed.StudentLogin, "https://example.com/post")
	adm := e.login(seed.AdminLogin)
	e.ai.text = `{"decision":"approve","summary":"ok","note":"Good.","rubric":[true,true]}`
	e.expect(e.do("POST", draftPath(id), adm, nil), 200)
	r := e.expectCode(e.do("POST", draftPath(id), adm, nil), 429, "rate_limited")
	if r.Header.Get("Retry-After") == "" {
		t.Fatal("no Retry-After")
	}
	if len(e.prs.refs) != 0 {
		t.Fatal("non-GitHub link was fetched")
	}
}

// RD7: drafts off: the queue says so and the endpoint is not_configured.
func TestReviewDraftOff(t *testing.T) {
	e := newEnv(t, func(c *config.Config) {
		c.AI = config.AIConfig{Timeout: 5 * time.Second, DailyQuestions: 8, GlobalPerMinute: 1000, ReviewDrafts: true, DraftsPerStaffDay: 5}
	})
	id := e.handedIn(seed.StudentLogin, "https://github.com/asha-dev/todo/pull/7")
	adm := e.login(seed.AdminLogin)
	var q struct {
		AIDrafts bool `json:"ai_drafts"`
	}
	e.expect(e.do("GET", "/v1/admin/reviews", adm, nil), 200).json(t, &q)
	if q.AIDrafts {
		t.Fatal("ai_drafts = true without a key")
	}
	e.expectCode(e.do("POST", draftPath(id), adm, nil), 503, "not_configured")
}
