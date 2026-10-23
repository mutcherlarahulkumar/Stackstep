package httpapi

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type workTaskResp struct {
	ID         uuid.UUID `json:"id"`
	Status     string    `json:"status"`
	Version    int       `json:"version"`
	Submission *struct {
		Attempt int     `json:"attempt"`
		URL     *string `json:"url"`
		Note    string  `json:"note"`
	} `json:"submission"`
	Content struct {
		Resources []struct {
			Title string `json:"title"`
			URL   string `json:"url"`
		} `json:"resources"`
		Quiz *struct {
			Questions []struct {
				Prompt  string   `json:"prompt"`
				Options []string `json:"options"`
				Answer  *int     `json:"answer"`
			} `json:"questions"`
		} `json:"quiz"`
	} `json:"content"`
	QuizResult *struct {
		Attempts     int  `json:"attempts"`
		AttemptsLeft int  `json:"attempts_left"`
		BestScore    int  `json:"best_score"`
		Passed       bool `json:"passed"`
	} `json:"quiz_result"`
}

func (e *env) transition(token string, id uuid.UUID, to string, version int, submission map[string]any) resp {
	e.t.Helper()
	body := map[string]any{"to": to, "expected_version": version, "note": ""}
	if submission != nil {
		body["submission"] = submission
	}
	return e.do("POST", "/v1/tasks/"+id.String()+"/transitions", token, body)
}

func (e *env) studentTask(token string, id uuid.UUID) workTaskResp {
	e.t.Helper()
	var board struct {
		Items []workTaskResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", token, nil), 200).json(e.t, &board)
	for _, it := range board.Items {
		if it.ID == id {
			return it
		}
	}
	e.t.Fatalf("task %s not on the board", id)
	return workTaskResp{}
}

func TestSubmissions(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	task := e.mustCreateTask(adm, enr)
	stu := e.login(seed.StudentLogin)
	e.expect(e.transition(stu, task.ID, "in_progress", task.Version, nil), 200)
	v := task.Version + 1

	// S1: a feature needs a link; bad links are refused.
	r := e.expect(e.transition(stu, task.ID, "in_review", v, nil), 422)
	wantField(t, r, "submission.url")
	r = e.expect(e.transition(stu, task.ID, "in_review", v, map[string]any{"url": "javascript:alert(1)", "note": ""}), 422)
	wantField(t, r, "submission.url")

	// S2: stored and shown to both sides; resubmission is attempt 2.
	var got workTaskResp
	e.expect(e.transition(stu, task.ID, "in_review", v, map[string]any{"url": "https://github.com/asha/p/pull/3", "note": "Filters in the URL."}), 200).json(t, &got)
	if got.Submission == nil || got.Submission.Attempt != 1 || *got.Submission.URL != "https://github.com/asha/p/pull/3" {
		t.Fatalf("submission = %+v", got.Submission)
	}
	e.expect(e.move(adm, task.ID, "changes_requested", got.Version, "Add tests."), 200)
	e.expect(e.transition(stu, task.ID, "in_review", got.Version+1, map[string]any{"url": "https://github.com/asha/p/pull/3", "note": "Added tests."}), 200).json(t, &got)
	if got.Submission.Attempt != 2 || got.Submission.Note != "Added tests." {
		t.Fatalf("resubmission = %+v", got.Submission)
	}
	var staff struct {
		Items []workTaskResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/enrollments/"+enr.String()+"/tasks", adm, nil), 200).json(t, &staff)
	if staff.Items[0].Submission == nil || staff.Items[0].Submission.Note != "Added tests." {
		t.Fatalf("staff view = %+v", staff.Items[0].Submission)
	}

	// DSA: a note (solution) is enough.
	body := validTask(e.clock.Now())
	body["type"] = "dsa"
	var dsa taskResp
	e.expect(e.createTask(adm, enr, body), 201).json(t, &dsa)
	e.expect(e.transition(stu, dsa.ID, "in_progress", dsa.Version, nil), 200)
	r = e.expect(e.transition(stu, dsa.ID, "in_review", dsa.Version+1, nil), 422)
	wantField(t, r, "submission.note")
	e.expect(e.transition(stu, dsa.ID, "in_review", dsa.Version+1, map[string]any{"url": "", "note": "Hash map, O(n)."}), 200)
}

func quizBody(now time.Time) map[string]any {
	return map[string]any{
		"type": "quiz", "title": "Git basics quiz", "brief": "", "review_mode": "self", "due_at": now.Add(4 * time.Hour),
		"content": map[string]any{"resources": []any{}, "quiz": map[string]any{"pass_percent": 100, "questions": []any{
			map[string]any{"prompt": "What does git add do?", "options": []string{"Commits", "Stages changes"}, "answer": 1},
			map[string]any{"prompt": "Which command shares commits?", "options": []string{"git push", "git log", "git diff"}, "answer": 0},
		}}},
	}
}

func (e *env) answer(token string, id uuid.UUID, version int, answers []int) resp {
	return e.do("POST", "/v1/tasks/"+id.String()+"/quiz", token, map[string]any{"expected_version": version, "answers": answers})
}

type quizAnswerResp struct {
	Task   workTaskResp `json:"task"`
	Result struct {
		Attempt      int    `json:"attempt"`
		Score        int    `json:"score"`
		Passed       bool   `json:"passed"`
		Correct      []bool `json:"correct"`
		AttemptsLeft int    `json:"attempts_left"`
	} `json:"result"`
}

func TestQuizzes(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	now := e.clock.Now()

	// Q1: shape rules.
	bad := quizBody(now)
	bad["review_mode"] = "manual"
	wantField(t, e.expect(e.createTask(adm, enr, bad), 422), "review_mode")
	bad = quizBody(now)
	bad["content"] = map[string]any{"resources": []any{}, "quiz": nil}
	wantField(t, e.expect(e.createTask(adm, enr, bad), 422), "quiz")

	var quiz workTaskResp
	e.expect(e.createTask(adm, enr, quizBody(now)), 201).json(t, &quiz)
	if quiz.Content.Quiz == nil || quiz.Content.Quiz.Questions[0].Answer == nil {
		t.Fatal("staff should see the answer key")
	}

	// Q2: students don't see answers yet.
	stu := e.login(seed.StudentLogin)
	mine := e.studentTask(stu, quiz.ID)
	if mine.Content.Quiz.Questions[0].Answer != nil || len(mine.Content.Quiz.Questions[1].Options) != 3 {
		t.Fatalf("student view leaks answers: %+v", mine.Content.Quiz)
	}

	// Q5: can't finish by hand; someone else can't grade it.
	e.expect(e.transition(stu, quiz.ID, "in_progress", mine.Version, nil), 200)
	mine.Version++
	e.expect(e.transition(stu, quiz.ID, "done", mine.Version, nil), 422)
	ravi := e.login(seed.Student2Login)
	e.expect(e.answer(ravi, quiz.ID, mine.Version, []int{1, 0}), 404)

	// Q3: answers must fit.
	wantField(t, e.expect(e.answer(stu, quiz.ID, mine.Version, []int{1}), 422), "answers")
	wantField(t, e.expect(e.answer(stu, quiz.ID, mine.Version, []int{1, 7}), 422), "answers")
	e.expect(e.answer(stu, quiz.ID, mine.Version+5, []int{1, 0}), 409)

	// Q4: two failures keep it open, the third attempt closes it with the best score.
	var res quizAnswerResp
	e.expect(e.answer(stu, quiz.ID, mine.Version, []int{1, 1}), 200).json(t, &res)
	if res.Result.Score != 50 || res.Result.Passed || res.Result.AttemptsLeft != 2 || res.Task.Status != "in_progress" || res.Task.Content.Quiz.Questions[0].Answer != nil {
		t.Fatalf("attempt 1 = %+v", res)
	}
	e.expect(e.answer(stu, quiz.ID, res.Task.Version, []int{0, 1}), 200).json(t, &res)
	e.expect(e.answer(stu, quiz.ID, res.Task.Version, []int{0, 0}), 200).json(t, &res)
	if res.Task.Status != "done" || res.Task.QuizResult.BestScore != 50 || res.Result.AttemptsLeft != 0 || res.Task.Content.Quiz.Questions[0].Answer == nil {
		t.Fatalf("attempt 3 = %+v", res)
	}
	e.expect(e.answer(stu, quiz.ID, res.Task.Version, []int{1, 0}), 422)

	// Passing on the first try finishes it at once; a todo quiz starts automatically.
	var second workTaskResp
	e.expect(e.createTask(adm, enr, quizBody(now)), 201).json(t, &second)
	e.expect(e.answer(stu, second.ID, second.Version, []int{1, 0}), 200).json(t, &res)
	if !res.Result.Passed || res.Task.Status != "done" || res.Task.QuizResult.Attempts != 1 {
		t.Fatalf("pass = %+v", res)
	}

	// Not a quiz.
	plain := e.mustCreateTask(adm, enr)
	e.expect(e.answer(stu, plain.ID, plain.Version, []int{0}), 422)
}

func TestSurpriseWindow(t *testing.T) {
	e := newEnv(t) // day 3, 10:00 IST
	adm := e.login(seed.AdminLogin)

	// W1
	bad := item(3, "Too wide", seed.EngineeringManagerID, "manual", "10:00", 60)
	bad["release_window"] = 481
	d := e.newFlow(adm, "Window bounds")
	wantField(t, e.expect(e.saveDraft(adm, d.Flow.ID, 0, []map[string]any{bad}), 422), "items[0].release_window")
	bad = item(3, "Past midnight", seed.EngineeringManagerID, "manual", "22:00", 60)
	bad["release_window"] = 180
	wantField(t, e.expect(e.saveDraft(adm, d.Flow.ID, 0, []map[string]any{bad}), 422), "items[0].release_window")

	// C1 + W2: a surprise item on day 4 with a link lands inside its window on the student's board.
	it := item(4, "Surprise standup", seed.DeliveryManagerID, "self", "10:00", 60)
	it["type"] = "standup"
	it["release_window"] = 240
	it["content"] = map[string]any{"resources": []any{map[string]any{"title": "Standup guide", "url": "https://example.com/standup"}}, "quiz": nil}
	flow := publishedFlow(e, adm, "Surprise flow", 30, []map[string]any{it})
	enr := e.enrollmentOf(seed.StudentLogin)
	e.expect(e.do("PUT", "/v1/admin/enrollments/"+enr.String()+"/flow", adm, map[string]any{"flow_id": flow}), 200)

	var staff struct {
		Items []struct {
			Title        string    `json:"title"`
			ScheduledFor time.Time `json:"scheduled_for"`
			Content      struct {
				Resources []struct {
					URL string `json:"url"`
				} `json:"resources"`
			} `json:"content"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/enrollments/"+enr.String()+"/tasks", adm, nil), 200).json(t, &staff)
	var found bool
	for _, x := range staff.Items {
		if x.Title != "Surprise standup" {
			continue
		}
		found = true
		local := x.ScheduledFor.In(time.FixedZone("IST", 5*3600+1800))
		mins := local.Hour()*60 + local.Minute()
		if mins < 10*60 || mins > 14*60 {
			t.Fatalf("surprise released at %s, outside 10:00–14:00", local.Format("15:04"))
		}
		if len(x.Content.Resources) != 1 || !strings.HasPrefix(x.Content.Resources[0].URL, "https://example.com") {
			t.Fatalf("content not copied: %+v", x.Content)
		}
	}
	if !found {
		t.Fatal("surprise task not generated")
	}
}

func wantField(t *testing.T, r resp, field string) {
	t.Helper()
	if r.errCode(t).Error.Fields[field] == "" {
		t.Fatalf("want a %q error, got %s", field, r.Body)
	}
}
