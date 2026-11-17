package httpapi

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/reviewlab"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

var teamThread = "/v1/me/threads/" + domain.TeamPersonaID.String() + "/messages"

type teamMsg struct {
	ID        uuid.UUID  `json:"id"`
	Author    string     `json:"author"`
	Body      string     `json:"body"`
	SpeakerID *uuid.UUID `json:"speaker_id"`
	Automated bool       `json:"automated"`
}

func (e *env) teamMessages(token string) []teamMsg {
	e.t.Helper()
	var page struct {
		Items []teamMsg `json:"items"`
	}
	e.expect(e.do("GET", teamThread+"?limit=50", token, nil), 200).json(e.t, &page)
	return page.Items
}

// TR1-TR6: the team room holds the student and every persona; @mentions pick who answers.
func TestTeamRoom(t *testing.T) {
	e := newEnv(t)
	stu := e.login(seed.StudentLogin)
	adm := e.login(seed.AdminLogin)

	// TR1: the room exists from the first visit, with Stackbot's welcome naming the team.
	var threads struct {
		Items []struct {
			Persona struct {
				ID   uuid.UUID `json:"id"`
				Team bool      `json:"team"`
			} `json:"persona"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/threads", stu, nil), 200).json(t, &threads)
	found := false
	for _, th := range threads.Items {
		if th.Persona.ID == domain.TeamPersonaID {
			found = th.Persona.Team
		}
	}
	if !found {
		t.Fatal("team room missing from the chat list")
	}
	msgs := e.teamMessages(stu)
	if len(msgs) != 1 || msgs[0].SpeakerID != nil || !strings.Contains(msgs[0].Body, "Sam Rivera") || !strings.Contains(msgs[0].Body, "Priya Sharma") {
		t.Fatalf("welcome = %+v", msgs)
	}
	e.expect(e.do("GET", "/v1/me/threads", stu, nil), 200)
	if n := len(e.teamMessages(stu)); n != 1 {
		t.Fatalf("welcome posted %d times", n)
	}

	// TR2: the team list has every persona but not the room itself; admin persona lists hide it too.
	var team struct {
		Members []struct {
			ID uuid.UUID `json:"id"`
		} `json:"members"`
		Bot struct {
			Name string `json:"name"`
		} `json:"bot"`
	}
	e.expect(e.do("GET", "/v1/me/team", stu, nil), 200).json(t, &team)
	if len(team.Members) < 2 || team.Bot.Name != "Stackbot" {
		t.Fatalf("team = %+v", team)
	}
	var personas struct {
		Items []struct {
			ID uuid.UUID `json:"id"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/personas", adm, nil), 200).json(t, &personas)
	for _, p := range append(personas.Items, team.Members...) {
		if p.ID == domain.TeamPersonaID {
			t.Fatal("team room listed as a persona")
		}
	}
	e.expect(e.do("PATCH", "/v1/admin/personas/"+domain.TeamPersonaID.String(), adm, map[string]any{
		"name": "Hacked", "title": "Nope", "color": "slate", "expected_version": 1}), 404)

	// TR3: no mention, Stackbot answers. TR4: @Sam (auto reply) answers as Sam.
	e.expect(e.do("POST", teamThread, stu, map[string]any{"client_id": uuid.New(), "body": "How do I start the first ticket?"}), 201)
	e.clock.Advance(31 * time.Second)
	msgs = e.teamMessages(stu)
	if msgs[0].Author != "persona" || msgs[0].SpeakerID != nil || !msgs[0].Automated {
		t.Fatalf("bot reply = %+v", msgs[0])
	}
	e.expect(e.do("POST", teamThread, stu, map[string]any{"client_id": uuid.New(), "body": "@sam can you look at my PR?"}), 201)
	e.clock.Advance(31 * time.Second)
	msgs = e.teamMessages(stu)
	if msgs[0].SpeakerID == nil || *msgs[0].SpeakerID != domain.DefaultPersonaID {
		t.Fatalf("sam reply = %+v", msgs[0])
	}

	// TR5: @Priya isn't answered by AI; Stackbot says she'll reply, and staff answer as her.
	e.expect(e.do("POST", teamThread, stu, map[string]any{"client_id": uuid.New(), "body": "@Priya when is the demo?"}), 201)
	msgs = e.teamMessages(stu)
	if msgs[0].SpeakerID != nil || !strings.Contains(msgs[0].Body, "Priya") {
		t.Fatalf("hand-off = %+v", msgs[0])
	}
	enr := e.enrollmentOf(seed.StudentLogin)
	staffPath := "/v1/admin/threads/" + enr.String() + "/" + domain.TeamPersonaID.String() + "/messages"
	f := e.expect(e.do("POST", staffPath, adm, map[string]any{"client_id": uuid.New(), "body": "Friday."}), 422).errCode(t).Error.Fields
	if f["speaker_id"] == "" {
		t.Fatalf("fields = %v", f)
	}
	e.expect(e.do("POST", staffPath, adm, map[string]any{"client_id": uuid.New(), "body": "Friday.", "speaker_id": domain.TeamPersonaID}), 422)
	var sent teamMsg
	priya := team.Members[0].ID
	for _, m := range team.Members {
		if m.ID != domain.DefaultPersonaID {
			priya = m.ID
		}
	}
	e.expect(e.do("POST", staffPath, adm, map[string]any{"client_id": uuid.New(), "body": "Friday at 4.", "speaker_id": priya}), 201).json(t, &sent)
	if sent.SpeakerID == nil || *sent.SpeakerID != priya || sent.Automated {
		t.Fatalf("staff message = %+v", sent)
	}
	// A speaker outside the team room is refused.
	e.expect(e.do("POST", "/v1/admin/threads/"+enr.String()+"/"+domain.DefaultPersonaID.String()+"/messages", adm,
		map[string]any{"client_id": uuid.New(), "body": "hi", "speaker_id": priya}), 422)

	// TR6: another student's team room is their own; nothing from Asha's shows up.
	other := e.login(seed.Student2Login)
	for _, m := range e.teamMessages(other) {
		if strings.Contains(m.Body, "demo") || strings.Contains(m.Body, "Friday") {
			t.Fatalf("leaked into another room: %+v", m)
		}
	}
}

// TR7: an approval is celebrated in the team room by the reviewing persona.
func TestTeamKudos(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	task := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.move(stu, task.ID, "in_review", task.Version+1, ""), 200)
	e.expect(e.move(adm, task.ID, "done", task.Version+2, ""), 200)
	msgs := e.teamMessages(stu)
	found := false
	for _, m := range msgs {
		if strings.Contains(m.Body, task.Title) && m.SpeakerID != nil && *m.SpeakerID == domain.DefaultPersonaID {
			found = true
		}
	}
	// The welcome still comes first, even though the student never opened the room before.
	if !found || len(msgs) < 2 || !strings.Contains(msgs[len(msgs)-1].Body, "Welcome to your team room") {
		t.Fatalf("no kudos after the welcome in %+v", msgs)
	}
}

func labComments(key string, skip int) []map[string]any {
	ex, _ := reviewlab.Get(key)
	out := []map[string]any{}
	for i, is := range ex.Issues {
		if i < skip {
			continue
		}
		out = append(out, map[string]any{"path": is.Path, "line": is.From, "side": "new", "body": "This line has a problem."})
	}
	return out
}

type labOutcome struct {
	Review struct {
		Score  int  `json:"score"`
		Found  int  `json:"found"`
		Total  int  `json:"total"`
		Passed bool `json:"passed"`
		Issues []struct {
			ID          string `json:"id"`
			Found       bool   `json:"found"`
			Explanation string `json:"explanation"`
		} `json:"issues"`
	} `json:"review"`
	Task *struct {
		Status    string `json:"status"`
		Version   int    `json:"version"`
		LabResult *struct {
			Attempts     int `json:"attempts"`
			AttemptsLeft int `json:"attempts_left"`
			BestScore    int `json:"best_score"`
		} `json:"lab_result"`
	} `json:"task"`
}

// RL1-RL5: practice pull requests are listed, shown without answers and graded.
func TestReviewLabPractice(t *testing.T) {
	e := newEnv(t)
	stu := e.login(seed.StudentLogin)
	var lib struct {
		Items []struct {
			Key    string `json:"key"`
			Issues int    `json:"issues"`
			Record struct {
				Attempts  int  `json:"attempts"`
				BestScore *int `json:"best_score"`
			} `json:"record"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/review-lab", stu, nil), 200).json(t, &lib)
	if len(lib.Items) < 5 || lib.Items[0].Record.BestScore != nil {
		t.Fatalf("library = %+v", lib)
	}
	// RL2: the exercise has diffs but no planted issues until a review is graded.
	r := e.expect(e.do("GET", "/v1/review-lab/users-pagination", stu, nil), 200)
	if strings.Contains(string(r.Body), "explanation") || !strings.Contains(string(r.Body), "file_diffs") {
		t.Fatal("exercise leaks answers or has no diff")
	}
	e.expect(e.do("GET", "/v1/review-lab/nope", stu, nil), 404)
	// RL3: validation.
	f := e.expect(e.do("POST", "/v1/review-lab/users-pagination/reviews", stu, map[string]any{"verdict": "lgtm", "comments": []any{}}), 422).errCode(t).Error.Fields
	if f["verdict"] == "" || f["comments"] == "" {
		t.Fatalf("fields = %v", f)
	}
	e.expect(e.do("POST", "/v1/review-lab/users-pagination/reviews", stu, map[string]any{"verdict": "comment",
		"comments": []any{map[string]any{"path": "src/routes/users.js", "line": 999, "side": "new", "body": "x"}}}), 422)
	// RL4: finding everything with request changes scores 100 and reveals every issue.
	var out labOutcome
	e.expect(e.do("POST", "/v1/review-lab/users-pagination/reviews", stu, map[string]any{"verdict": "request_changes", "summary": "Needs work.",
		"comments": labComments("users-pagination", 0)}), 201).json(t, &out)
	if out.Review.Score != 100 || !out.Review.Passed || out.Review.Found != out.Review.Total || out.Review.Issues[0].Explanation == "" || out.Task != nil {
		t.Fatalf("outcome = %+v", out)
	}
	// RL5: the library remembers the best score and the exercise shows the last review.
	var ex struct {
		LastReview *struct {
			Score int `json:"score"`
		} `json:"last_review"`
	}
	e.expect(e.do("GET", "/v1/review-lab/users-pagination", stu, nil), 200).json(t, &ex)
	if ex.LastReview == nil || ex.LastReview.Score != 100 {
		t.Fatalf("last review = %+v", ex.LastReview)
	}
	// BG: finding every planted problem earns Bug hunter, celebrated in the team room.
	var ach struct {
		Badges []struct {
			Key      string     `json:"key"`
			EarnedAt *time.Time `json:"earned_at"`
		} `json:"badges"`
	}
	e.expect(e.do("GET", "/v1/me/achievements", stu, nil), 200).json(t, &ach)
	earned := false
	for _, b := range ach.Badges {
		if b.Key == "bug_hunter" && b.EarnedAt != nil {
			earned = true
		}
	}
	if !earned {
		t.Fatalf("badges = %+v", ach.Badges)
	}
	celebrated := 0
	for _, m := range e.teamMessages(stu) {
		if strings.Contains(m.Body, "Bug hunter") {
			celebrated++
		}
	}
	e.expect(e.do("GET", "/v1/me/achievements", stu, nil), 200)
	if celebrated != 1 {
		t.Fatalf("celebrated %d times", celebrated)
	}
}

// RL6-RL9: a code review task can be a practice pull request, finished by grading.
func TestReviewLabTask(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	body := map[string]any{"type": "code_review", "title": "Review the users endpoint", "brief": "Find the problems.",
		"due_at": e.clock.Now().Add(4 * time.Hour), "review_mode": "manual", "content": map[string]any{"review_lab": map[string]any{"exercise": "users-pagination"}}}
	// RL6: practice reviews are graded, so they must be finished by the student.
	f := e.expect(e.createTask(adm, enr, body), 422).errCode(t).Error.Fields
	if f["review_mode"] == "" {
		t.Fatalf("fields = %v", f)
	}
	body["review_mode"] = "self"
	body["content"] = map[string]any{"review_lab": map[string]any{"exercise": "nope"}}
	e.expect(e.createTask(adm, enr, body), 422)
	body["type"] = "feature"
	body["content"] = map[string]any{"review_lab": map[string]any{"exercise": "users-pagination"}}
	e.expect(e.createTask(adm, enr, body), 422)
	body["type"] = "code_review"
	var task taskResp
	e.expect(e.createTask(adm, enr, body), 201).json(t, &task)

	// RL7: the student can't just mark it done.
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.do("POST", "/v1/tasks/"+task.ID.String()+"/transitions", stu, map[string]any{"to": "done", "expected_version": task.Version + 1, "note": ""}), 422)

	// RL8: a review of the wrong exercise or with a stale version is refused.
	e.expect(e.do("POST", "/v1/review-lab/modal-a11y/reviews", stu, map[string]any{"task_id": task.ID, "expected_version": task.Version + 1,
		"verdict": "comment", "comments": labComments("modal-a11y", 0)}), 422)
	e.expect(e.do("POST", "/v1/review-lab/users-pagination/reviews", stu, map[string]any{"task_id": task.ID, "expected_version": 99,
		"verdict": "comment", "comments": labComments("users-pagination", 0)}), 409)

	// RL9: below the pass mark keeps the task open; three tries end it with the best score.
	v := task.Version + 1
	var out labOutcome
	for i := 1; i <= 3; i++ {
		e.expect(e.do("POST", "/v1/review-lab/users-pagination/reviews", stu, map[string]any{"task_id": task.ID, "expected_version": v,
			"verdict": "comment", "comments": labComments("users-pagination", 3)}), 201).json(t, &out)
		if out.Task == nil || out.Task.LabResult == nil || out.Task.LabResult.Attempts != i {
			t.Fatalf("try %d = %+v", i, out.Task)
		}
		v = out.Task.Version
		if i < 3 && out.Task.Status != "in_progress" {
			t.Fatalf("finished early: %+v", out.Task)
		}
	}
	if out.Task.Status != "done" || out.Task.LabResult.BestScore != 25 || out.Task.LabResult.AttemptsLeft != 0 {
		t.Fatalf("final = %+v", out.Task)
	}
	e.expect(e.do("POST", "/v1/review-lab/users-pagination/reviews", stu, map[string]any{"task_id": task.ID, "expected_version": v,
		"verdict": "comment", "comments": labComments("users-pagination", 0)}), 422)
}

// PF1-PF4: the public portfolio is off until the student turns it on.
func TestPortfolio(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	e.expect(e.do("GET", "/v1/portfolios/"+seed.StudentLogin, "", nil), 404)
	var st struct {
		Public bool   `json:"public"`
		Login  string `json:"login"`
	}
	e.expect(e.do("GET", "/v1/me/portfolio", stu, nil), 200).json(t, &st)
	if st.Public || st.Login != seed.StudentLogin {
		t.Fatalf("settings = %+v", st)
	}
	e.expect(e.do("PUT", "/v1/me/portfolio", stu, map[string]any{"public": true, "headline": strings.Repeat("x", 121)}), 422)
	e.expect(e.do("PUT", "/v1/me/portfolio", adm, map[string]any{"public": true, "headline": ""}), 403)
	e.expect(e.do("PUT", "/v1/me/portfolio", stu, map[string]any{"public": true, "headline": "  Frontend intern   building React apps "}), 200).json(t, &st)

	// Finished, approved work with a PR link shows up.
	task := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.move(stu, task.ID, "in_review", task.Version+1, ""), 200)
	e.expect(e.move(adm, task.ID, "done", task.Version+2, ""), 200)
	var p struct {
		Name      string `json:"name"`
		Headline  string `json:"headline"`
		TasksDone int    `json:"tasks_done"`
		PRsMerged int    `json:"prs_merged"`
		Work      []struct {
			Title string  `json:"title"`
			URL   *string `json:"url"`
		} `json:"work"`
		Badges []struct {
			Key string `json:"key"`
		} `json:"badges"`
	}
	r := e.expect(e.do("GET", "/v1/portfolios/"+seed.StudentLogin, "", nil), 200)
	r.json(t, &p)
	if p.Name != "Asha Rao" || p.Headline != "Frontend intern building React apps" || p.TasksDone < 1 || p.PRsMerged < 1 || len(p.Work) < 1 {
		t.Fatalf("portfolio = %+v", p)
	}
	if strings.Contains(string(r.Body), "note") || strings.Contains(string(r.Body), "rubric") {
		t.Fatal("portfolio leaks private fields")
	}
	firstPR := false
	for _, b := range p.Badges {
		firstPR = firstPR || b.Key == "first_pr"
	}
	if !firstPR {
		t.Fatalf("badges = %+v", p.Badges)
	}
	// PF4: staff and unknown logins have no portfolio; turning it off hides it again.
	e.expect(e.do("GET", "/v1/portfolios/"+seed.AdminLogin, "", nil), 404)
	e.expect(e.do("GET", "/v1/portfolios/no-such-person", "", nil), 404)
	e.expect(e.do("PUT", "/v1/me/portfolio", stu, map[string]any{"public": false, "headline": ""}), 200)
	e.expect(e.do("GET", "/v1/portfolios/"+seed.StudentLogin, "", nil), 404)
}
