package domain

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func quiz(qs ...QuizQuestion) *Quiz { return &Quiz{Questions: qs} }

func q(prompt string, answer int, opts ...string) QuizQuestion {
	return QuizQuestion{Prompt: prompt, Options: opts, Answer: answer}
}

func TestValidateContent(t *testing.T) {
	ok := quiz(q("What does git add do?", 1, "Commits", "Stages changes"))
	cases := map[string]struct {
		c      TaskContent
		typ    TaskType
		review ReviewMode
		field  string
	}{
		"quiz without questions":  {TaskContent{}, TaskQuiz, ReviewSelf, "quiz"},
		"questions on a non-quiz": {TaskContent{Quiz: ok}, TaskDSA, ReviewManual, "quiz"},
		"quiz with admin review":  {TaskContent{Quiz: ok}, TaskQuiz, ReviewManual, "review_mode"},
		"one option":              {TaskContent{Quiz: quiz(q("Pick one?", 0, "Only"))}, TaskQuiz, ReviewSelf, "quiz.questions[0].options"},
		"seven options":           {TaskContent{Quiz: quiz(q("Pick one?", 0, "a", "b", "c", "d", "e", "f", "g"))}, TaskQuiz, ReviewSelf, "quiz.questions[0].options"},
		"duplicate options":       {TaskContent{Quiz: quiz(q("Pick one?", 0, "Yes", "yes"))}, TaskQuiz, ReviewSelf, "quiz.questions[0].options"},
		"answer out of range":     {TaskContent{Quiz: quiz(q("Pick one?", 2, "a", "b"))}, TaskQuiz, ReviewSelf, "quiz.questions[0].answer"},
		"short prompt":            {TaskContent{Quiz: quiz(q("?", 0, "a", "b"))}, TaskQuiz, ReviewSelf, "quiz.questions[0].prompt"},
		"bad pass mark":           {TaskContent{Quiz: &Quiz{Questions: ok.Questions, PassPercent: 101}}, TaskQuiz, ReviewSelf, "quiz.pass_percent"},
		"too many links":          {TaskContent{Resources: make([]Resource, 6)}, TaskDSA, ReviewManual, "resources"},
		"link without a name":     {TaskContent{Resources: []Resource{{URL: "https://go.dev"}}}, TaskDSA, ReviewManual, "resources[0].title"},
		"javascript link":         {TaskContent{Resources: []Resource{{Title: "x", URL: "javascript:alert(1)"}}}, TaskDSA, ReviewManual, "resources[0].url"},
		"link with credentials":   {TaskContent{Resources: []Resource{{Title: "x", URL: "https://a:b@example.com"}}}, TaskDSA, ReviewManual, "resources[0].url"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, errs := ValidateContent(c.c, c.typ, c.review, "")
			if _, found := errs[c.field]; !found {
				t.Fatalf("want error on %q, got %v", c.field, errs)
			}
		})
	}
	many := make([]QuizQuestion, 21)
	for i := range many {
		many[i] = q("Question here?", 0, "a", "b")
	}
	if _, errs := ValidateContent(TaskContent{Quiz: &Quiz{Questions: many}}, TaskQuiz, ReviewSelf, ""); errs["quiz.questions"] == "" {
		t.Fatalf("21 questions accepted: %v", errs)
	}
	out, errs := ValidateContent(TaskContent{Quiz: ok, Resources: []Resource{{Title: "  Pro  Git ", URL: " https://git-scm.com/book "}}}, TaskQuiz, ReviewSelf, "items[0].")
	if len(errs) > 0 || out.Quiz.PassPercent != DefaultPassPercent || out.Resources[0].Title != "Pro Git" || out.Resources[0].URL != "https://git-scm.com/book" {
		t.Fatalf("valid content: %+v %v", out, errs)
	}
}

func TestGradeQuiz(t *testing.T) {
	qz := Quiz{PassPercent: 70, Questions: []QuizQuestion{q("a?", 0, "x", "y"), q("b?", 1, "x", "y"), q("c?", 1, "x", "y")}}
	r, msg := GradeQuiz(qz, []int{0, 1, 0}, 1)
	if msg != "" || r.Score != 66 || r.Passed || !r.Correct[0] || r.Correct[2] {
		t.Fatalf("grade = %+v %q", r, msg)
	}
	if r, _ := GradeQuiz(qz, []int{0, 1, 1}, 2); !r.Passed || r.Score != 100 {
		t.Fatalf("perfect = %+v", r)
	}
	if _, msg := GradeQuiz(qz, []int{0, 1}, 1); msg == "" {
		t.Fatal("short answers accepted")
	}
	if _, msg := GradeQuiz(qz, []int{0, 1, 5}, 1); msg == "" {
		t.Fatal("out-of-range option accepted")
	}
}

func TestValidateSubmission(t *testing.T) {
	if _, errs := ValidateSubmission(nil, TaskFeature, StatusInReview); errs["submission.url"] == "" {
		t.Fatal("feature without link accepted")
	}
	if _, errs := ValidateSubmission(nil, TaskDSA, StatusInReview); errs["submission.note"] == "" {
		t.Fatal("dsa without anything accepted")
	}
	if s, errs := ValidateSubmission(&Submission{Note: " func twoSum() "}, TaskDSA, StatusInReview); len(errs) > 0 || s.Note != "func twoSum()" {
		t.Fatalf("dsa with note: %+v %v", s, errs)
	}
	for _, bad := range []string{"ftp://x.org", "https://", "github.com/x", "https://exa mple.com", "https://u:p@x.com"} {
		if _, errs := ValidateSubmission(&Submission{URL: bad}, TaskFeature, StatusInReview); errs["submission.url"] == "" {
			t.Fatalf("bad url %q accepted", bad)
		}
	}
	if _, errs := ValidateSubmission(&Submission{URL: "https://x.dev", Note: strings.Repeat("x", 4001)}, TaskFeature, StatusInReview); errs["submission.note"] == "" {
		t.Fatal("long note accepted")
	}
	if s, errs := ValidateSubmission(nil, TaskStandup, StatusDone); s != nil || len(errs) > 0 {
		t.Fatal("self-check done should not need a hand-in")
	}
}

func TestSurpriseOffset(t *testing.T) {
	a, item := uuid.New(), uuid.New()
	if SurpriseOffset(a, item, 0) != 0 {
		t.Fatal("no window must mean no offset")
	}
	seen := map[int]bool{}
	for range 50 {
		o := SurpriseOffset(uuid.New(), item, 240)
		if o < 0 || o > 240 {
			t.Fatalf("offset %d out of window", o)
		}
		seen[o] = true
	}
	if len(seen) < 10 {
		t.Fatalf("offsets barely vary: %v", seen)
	}
	first, again := SurpriseOffset(a, item, 240), SurpriseOffset(a, item, 240)
	if first != again {
		t.Fatal("offset must be stable")
	}
}

func TestValidatePractice(t *testing.T) {
	good := func() *Practice {
		return &Practice{FunctionName: "twoSum", Starter: "function twoSum(nums, target) {}", Tests: []PracticeTest{{Args: []byte(`[ [2,7], 9 ]`), Expected: []byte(`[0, 1]`)}}}
	}
	out, errs := ValidateContent(TaskContent{Practice: good()}, TaskDSA, ReviewManual, "")
	if len(errs) != 0 {
		t.Fatalf("errs = %v", errs)
	}
	// DP1: JSON is stored compact.
	if string(out.Practice.Tests[0].Args) != "[[2,7],9]" || string(out.Practice.Tests[0].Expected) != "[0,1]" {
		t.Fatalf("not compacted: %s %s", out.Practice.Tests[0].Args, out.Practice.Tests[0].Expected)
	}
	cases := map[string]struct {
		edit  func(p *Practice)
		typ   TaskType
		field string
	}{
		"not a DSA task":   {func(*Practice) {}, TaskFeature, "practice"},
		"bad name":         {func(p *Practice) { p.FunctionName = "two sum" }, TaskDSA, "practice.function_name"},
		"reserved name":    {func(p *Practice) { p.FunctionName = "return" }, TaskDSA, "practice.function_name"},
		"no tests":         {func(p *Practice) { p.Tests = nil }, TaskDSA, "practice.tests"},
		"eleven tests":     {func(p *Practice) { p.Tests = make([]PracticeTest, 11) }, TaskDSA, "practice.tests"},
		"args not array":   {func(p *Practice) { p.Tests[0].Args = []byte(`{"a":1}`) }, TaskDSA, "practice.tests[0].args"},
		"args invalid":     {func(p *Practice) { p.Tests[0].Args = []byte(`[1,`) }, TaskDSA, "practice.tests[0].args"},
		"expected missing": {func(p *Practice) { p.Tests[0].Expected = nil }, TaskDSA, "practice.tests[0].expected"},
		"huge args":        {func(p *Practice) { p.Tests[0].Args = []byte("[\"" + strings.Repeat("a", 2001) + "\"]") }, TaskDSA, "practice.tests[0].args"},
		"long starter":     {func(p *Practice) { p.Starter = strings.Repeat("x", 4001) }, TaskDSA, "practice.starter"},
		"control in code":  {func(p *Practice) { p.Starter = "a\x07" }, TaskDSA, "practice.starter"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			p := good()
			c.edit(p)
			_, errs := ValidateContent(TaskContent{Practice: p}, c.typ, ReviewManual, "")
			if errs[c.field] == "" {
				t.Fatalf("want error on %s, got %v", c.field, errs)
			}
		})
	}
}
