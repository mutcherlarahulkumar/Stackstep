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
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

// fakeAI stands in for Groq: it records what was sent and answers (or fails) on cue.
type fakeAI struct {
	mu    sync.Mutex
	calls [][]ai.Message
	fail  error
	// text, when set, is the answer instead of the helper's canned one.
	text string
}

func (f *fakeAI) Complete(_ context.Context, msgs []ai.Message) (ai.Completion, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, msgs)
	if f.fail != nil {
		return ai.Completion{}, f.fail
	}
	if f.text != "" {
		return ai.Completion{Text: f.text, TokensIn: 50, TokensOut: 20}, nil
	}
	return ai.Completion{Text: "**What's going on**\nYou're close.\n\n**Hints**\n1. Check the loop bounds.\n\n**Try this next**\nPrint i.\n\n**Asking tip**\nClear question.", TokensIn: 120, TokensOut: 40}, nil
}

func (f *fakeAI) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

func (f *fakeAI) last() []ai.Message {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls[len(f.calls)-1]
}

type walletResp struct {
	Points struct {
		Total    int `json:"total"`
		Finished int `json:"finished"`
		OnTime   int `json:"on_time"`
	} `json:"points"`
	Credits struct {
		Balance int `json:"balance"`
		History []struct {
			Delta  int    `json:"delta"`
			Reason string `json:"reason"`
			Note   string `json:"note"`
		} `json:"history"`
	} `json:"credits"`
	AI struct {
		Enabled        bool       `json:"enabled"`
		UsedToday      int        `json:"used_today"`
		NextQuestionAt *time.Time `json:"next_question_at"`
	} `json:"ai"`
}

func (e *env) wallet(token string) walletResp {
	e.t.Helper()
	var w walletResp
	e.expect(e.do("GET", "/v1/me/wallet", token, nil), 200).json(e.t, &w)
	return w
}

func TestPoints(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	if w := e.wallet(stu); w.Credits.Balance != 20 || w.Points.Total != 0 {
		t.Fatalf("welcome wallet = %+v", w)
	}

	// On time: 20 base + 25%.
	task := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.move(stu, task.ID, "in_review", task.Version+1, ""), 200)
	e.expect(e.move(adm, task.ID, "done", task.Version+2, ""), 200)

	// Late (handed in after the due time): no bonus, even though approval comes later still.
	late := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, late.ID, "in_progress", late.Version, ""), 200)
	e.clock.Advance(5 * time.Hour)
	stu = e.login(seed.StudentLogin)
	adm = e.login(seed.AdminLogin)
	e.expect(e.move(stu, late.ID, "in_review", late.Version+1, ""), 200)
	e.expect(e.move(adm, late.ID, "done", late.Version+2, ""), 200)

	w := e.wallet(stu)
	if w.Points.Total != 25+20 || w.Points.Finished != 2 || w.Points.OnTime != 1 {
		t.Fatalf("points = %+v", w.Points)
	}
	if w.Credits.Balance != 22 || w.Credits.History[0].Reason != "task_done" {
		t.Fatalf("credits = %+v", w.Credits)
	}
	// Re-reading never awards twice.
	if again := e.wallet(stu); again.Points.Total != w.Points.Total || again.Credits.Balance != 22 {
		t.Fatalf("awarded twice: %+v", again)
	}
}

func TestCredits(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	path := "/v1/admin/enrollments/" + enr.String() + "/credits"

	wantField(t, e.expect(e.do("POST", path, adm, map[string]any{"delta": 5, "note": ""}), 422), "note")
	wantField(t, e.expect(e.do("POST", path, adm, map[string]any{"delta": 101, "note": "Too many"}), 422), "delta")
	wantField(t, e.expect(e.do("POST", path, adm, map[string]any{"delta": -21, "note": "Too few"}), 422), "delta")
	var w walletResp
	e.expect(e.do("POST", path, adm, map[string]any{"delta": 5, "note": "Helped a teammate debug"}), 200).json(t, &w)
	if w.Credits.Balance != 25 || w.Credits.History[0].Reason != "admin_grant" || w.Credits.History[0].Note != "Helped a teammate debug" {
		t.Fatalf("grant = %+v", w.Credits)
	}
	e.expect(e.do("POST", path, adm, map[string]any{"delta": -3, "note": "Shared answers"}), 200).json(t, &w)
	if w.Credits.Balance != 22 || w.Credits.History[0].Reason != "admin_revoke" {
		t.Fatalf("revoke = %+v", w.Credits)
	}
	stu := e.login(seed.StudentLogin)
	e.expect(e.do("POST", path, stu, map[string]any{"delta": 5, "note": "x"}), 403)
	// College admins only reach their own college's students.
	tpo := e.login(seed.CollegeAdminLogin)
	meera := e.enrollmentOf(seed.IndieStudentLogin)
	e.expect(e.do("POST", "/v1/admin/enrollments/"+meera.String()+"/credits", tpo, map[string]any{"delta": 1, "note": "x"}), 404)
	e.expect(e.do("GET", "/v1/admin/enrollments/"+enr.String()+"/wallet", tpo, nil), 200)
}

type aiDetailResp struct {
	Conversation struct {
		ID        uuid.UUID `json:"id"`
		Title     string    `json:"title"`
		FollowUps int       `json:"follow_ups"`
	} `json:"conversation"`
	Messages []struct {
		Role   string `json:"role"`
		Status string `json:"status"`
		Kind   string `json:"kind"`
		Body   string `json:"body"`
	} `json:"messages"`
	FollowUpsLeft int        `json:"follow_ups_left"`
	FollowUpAt    *time.Time `json:"follow_up_at"`
	Wallet        walletResp `json:"wallet"`
}

func question(clientID uuid.UUID) map[string]any {
	return map[string]any{
		"client_id": clientID, "task_id": nil,
		"goal":  "Filter the task list by status without reloading the page.",
		"tried": "I used Array.filter on the tasks array but the list doesn't update when I pick a status.",
		"error": "No error, the list just stays the same.",
		"code":  "const shown = tasks.filter(t => t.status === status)",
	}
}

func (e *env) ask(token string, body map[string]any) resp {
	return e.do("POST", "/v1/me/ai/conversations", token, body)
}

func (e *env) followUp(token string, conv uuid.UUID, body map[string]any) resp {
	return e.do("POST", "/v1/me/ai/conversations/"+conv.String()+"/messages", token, body)
}

func TestAskAI(t *testing.T) {
	e := newEnv(t)
	stu := e.login(seed.StudentLogin)

	// A1: the problem must be explained in one go.
	short := question(uuid.New())
	short["goal"], short["tried"] = "fix it", "nothing"
	r := e.expect(e.ask(stu, short), 422)
	wantField(t, r, "goal")
	wantField(t, r, "tried")

	// A2: an answer costs one credit; the model sees the fixed instruction first.
	q := question(uuid.New())
	var d aiDetailResp
	e.expect(e.ask(stu, q), 201).json(t, &d)
	if len(d.Messages) != 2 || d.Messages[0].Status != "answered" || d.Messages[1].Role != "assistant" || d.Wallet.Credits.Balance != 19 {
		t.Fatalf("ask = %+v", d)
	}
	sent := e.ai.last()
	if sent[0].Role != "system" || sent[0].Content != ai.SystemPrompt || sent[len(sent)-1].Role != "user" || !strings.Contains(sent[len(sent)-1].Content, "Array.filter") {
		t.Fatalf("prompt = %+v", sent)
	}
	// A3: a retry with the same client id is free and returns the same conversation.
	var again aiDetailResp
	e.expect(e.ask(stu, q), 201).json(t, &again)
	if again.Conversation.ID != d.Conversation.ID || again.Wallet.Credits.Balance != 19 || len(e.ai.calls) != 1 {
		t.Fatalf("retry charged again: %+v", again.Wallet.Credits)
	}

	// A4: a new question right away is held back; so is a follow-up before trying the hint.
	r = e.expect(e.ask(stu, question(uuid.New())), 429)
	if ra := r.errCode(t).Error.RetryAfterSeconds; ra == nil || *ra < 1 {
		t.Fatalf("no retry_after: %s", r.Body)
	}
	fu := map[string]any{"client_id": uuid.New(), "tried_since": "", "body": "It still doesn't re-render."}
	wantField(t, e.expect(e.followUp(stu, d.Conversation.ID, fu), 422), "tried_since")
	fu["tried_since"] = "I logged status and it changes, but the list is computed once."
	e.expect(e.followUp(stu, d.Conversation.ID, fu), 429)

	e.clock.Advance(5 * time.Minute)
	stu = e.login(seed.StudentLogin)
	e.expect(e.followUp(stu, d.Conversation.ID, fu), 201).json(t, &d)
	if d.Conversation.FollowUps != 1 || d.FollowUpsLeft != 2 || d.Wallet.Credits.Balance != 18 {
		t.Fatalf("follow-up = %+v", d)
	}
	if hist := e.ai.last(); len(hist) != 4 || hist[2].Role != "assistant" {
		t.Fatalf("history = %+v", hist)
	}

	// A5: a failed answer refunds; a failed first question leaves nothing behind.
	e.clock.Advance(5 * time.Minute)
	stu = e.login(seed.StudentLogin)
	e.ai.fail = ai.ErrUnavailable
	fu["client_id"] = uuid.New()
	e.expect(e.followUp(stu, d.Conversation.ID, fu), 503)
	if w := e.wallet(stu); w.Credits.Balance != 18 {
		t.Fatalf("follow-up refund: %+v", w.Credits)
	}
	e.expect(e.ask(stu, question(uuid.New())), 503)
	var list struct {
		Items []struct {
			ID uuid.UUID `json:"id"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/ai/conversations", stu, nil), 200).json(t, &list)
	if len(list.Items) != 1 || e.wallet(stu).Credits.Balance != 18 {
		t.Fatalf("failed question kept or charged: %+v", list)
	}
	e.ai.fail = &ai.RateLimitedError{RetryAfter: 40 * time.Second}
	r = e.expect(e.ask(stu, question(uuid.New())), 429)
	if ra := r.errCode(t).Error.RetryAfterSeconds; ra == nil || *ra != 40 {
		t.Fatalf("provider retry_after: %s", r.Body)
	}
	e.ai.fail = nil

	// A6: quizzes are off limits; someone else's conversation is invisible.
	adm := e.login(seed.AdminLogin)
	var quiz workTaskResp
	e.expect(e.createTask(adm, e.enrollmentOf(seed.StudentLogin), quizBody(e.clock.Now())), 201).json(t, &quiz)
	withQuiz := question(uuid.New())
	withQuiz["task_id"] = quiz.ID
	wantField(t, e.expect(e.ask(stu, withQuiz), 422), "task_id")
	ravi := e.login(seed.Student2Login)
	e.expect(e.do("GET", "/v1/me/ai/conversations/"+d.Conversation.ID.String(), ravi, nil), 404)

	// Staff can read a student's conversations (read only); a college admin outside scope can't.
	enr := e.enrollmentOf(seed.StudentLogin)
	e.expect(e.do("GET", "/v1/admin/enrollments/"+enr.String()+"/ai/conversations/"+d.Conversation.ID.String(), adm, nil), 200)
	tpo := e.login(seed.CollegeAdminLogin)
	meera := e.enrollmentOf(seed.IndieStudentLogin)
	e.expect(e.do("GET", "/v1/admin/enrollments/"+meera.String()+"/ai/conversations", tpo, nil), 404)
}

func TestAILimits(t *testing.T) {
	e := newEnv(t, func(c *config.Config) {
		c.AI = config.AIConfig{GroqAPIKey: "k", Timeout: time.Second, DailyQuestions: 2, QuestionCooldown: 0, FollowUpCooldown: 0, MaxFollowUps: 1, GlobalPerMinute: 1000}
	})
	stu := e.login(seed.StudentLogin)
	var d aiDetailResp
	e.expect(e.ask(stu, question(uuid.New())), 201).json(t, &d)
	fu := map[string]any{"client_id": uuid.New(), "tried_since": "I re-read the docs on useMemo dependencies.", "body": "What should depend on status?"}
	e.expect(e.followUp(stu, d.Conversation.ID, fu), 201)
	// A7: daily cap (2 student messages today), then the follow-up cap.
	r := e.expect(e.ask(stu, question(uuid.New())), 429)
	if !strings.Contains(r.errCode(t).Error.Message, "today") {
		t.Fatalf("daily cap message: %s", r.Body)
	}
	e.clock.Advance(24 * time.Hour)
	stu = e.login(seed.StudentLogin)
	fu["client_id"] = uuid.New()
	e.expect(e.followUp(stu, d.Conversation.ID, fu), 422) // conversation full

	// A8: out of credits.
	adm := e.login(seed.AdminLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	bal := e.wallet(stu).Credits.Balance
	e.expect(e.do("POST", "/v1/admin/enrollments/"+enr.String()+"/credits", adm, map[string]any{"delta": -bal, "note": "Testing the empty wallet"}), 200)
	e.expect(e.ask(stu, question(uuid.New())), 402)
}

func TestAINotConfigured(t *testing.T) {
	e := newEnv(t, func(c *config.Config) {
		c.AI = config.AIConfig{DailyQuestions: 8, Timeout: time.Second, GlobalPerMinute: 10}
	})
	stu := e.login(seed.StudentLogin)
	if w := e.wallet(stu); w.AI.Enabled {
		t.Fatal("helper should report disabled")
	}
	r := e.expect(e.ask(stu, question(uuid.New())), 503)
	if r.errCode(t).Error.Code != "not_configured" {
		t.Fatalf("code = %s", r.Body)
	}
}
