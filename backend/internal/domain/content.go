package domain

import (
	"fmt"
	"hash/fnv"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Resource is a link a task points the student to (docs, an article, a starter repo).
type Resource struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// QuizQuestion is one multiple-choice question. Answer is the index of the right option.
type QuizQuestion struct {
	Prompt  string   `json:"prompt"`
	Options []string `json:"options"`
	Answer  int      `json:"answer"`
}

// Quiz is an auto-graded set of questions. Grading compares against the answer key; no AI.
type Quiz struct {
	Questions   []QuizQuestion `json:"questions"`
	PassPercent int            `json:"pass_percent"`
}

// TaskContent is what a task carries beyond its title and brief. Stored as JSON.
type TaskContent struct {
	Resources []Resource `json:"resources"`
	Quiz      *Quiz      `json:"quiz"`
	Practice  *Practice  `json:"practice,omitempty"`
	// Rubric is the reviewer's checklist (admin-reviewed tasks only).
	Rubric []string `json:"rubric,omitempty"`
}

// Bounds for task content (mirrored in clients).
const (
	MaxResources        = 5
	ResourceTitleMax    = 80
	URLMaxLen           = 2048
	MaxQuizQuestions    = 20
	QuizPromptMin       = 3
	QuizPromptMax       = 500
	MinQuizOptions      = 2
	MaxQuizOptions      = 6
	QuizOptionMax       = 200
	DefaultPassPercent  = 70
	MaxQuizAttempts     = 3
	MaxReleaseWindowMin = 8 * 60
	SubmissionNoteMax   = 4000
)

// ValidURL reports whether s is an absolute http(s) URL with a host.
func ValidURL(s string) bool {
	if s == "" || utf8.RuneCountInString(s) > URLMaxLen || strings.ContainsAny(s, " \t\r\n") {
		return false
	}
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" && u.User == nil
}

// ValidateContent normalizes and checks content for a task of type typ. Field keys are
// prefixed (e.g. "items[2].") and look like "quiz.questions[1].options".
func ValidateContent(c TaskContent, typ TaskType, review ReviewMode, prefix string) (TaskContent, map[string]string) {
	errs := map[string]string{}
	out := TaskContent{Resources: []Resource{}}
	if len(c.Resources) > MaxResources {
		errs[prefix+"resources"] = fmt.Sprintf("Add at most %d links.", MaxResources)
	}
	for i, r := range c.Resources {
		if i >= MaxResources {
			break
		}
		key := fmt.Sprintf("%sresources[%d]", prefix, i)
		title := NormalizeText(r.Title)
		link := strings.TrimSpace(r.URL)
		switch {
		case !ValidURL(link):
			errs[key+".url"] = "Use a full link starting with https://."
		case title == "":
			errs[key+".title"] = "Give the link a name."
		case utf8.RuneCountInString(title) > ResourceTitleMax:
			errs[key+".title"] = fmt.Sprintf("Link names can be at most %d characters.", ResourceTitleMax)
		case hasBadControl(title, false):
			errs[key+".title"] = "Link name contains characters that can't be displayed."
		}
		out.Resources = append(out.Resources, Resource{Title: title, URL: link})
	}

	switch {
	case typ == TaskQuiz && c.Quiz == nil:
		errs[prefix+"quiz"] = "Add at least one question."
	case typ != TaskQuiz && c.Quiz != nil:
		errs[prefix+"quiz"] = "Only quiz tasks have questions."
	case c.Quiz != nil:
		if review != ReviewSelf {
			errs[prefix+"review_mode"] = "Quizzes are graded automatically, so the student finishes them."
		}
		q, qErrs := validateQuiz(*c.Quiz, prefix+"quiz")
		for k, v := range qErrs {
			errs[k] = v
		}
		out.Quiz = &q
	}
	switch {
	case typ != TaskDSA && c.Practice != nil:
		errs[prefix+"practice"] = "Only DSA tasks have a practice pad."
	case c.Practice != nil:
		p, pErrs := validatePractice(*c.Practice, prefix+"practice")
		for k, v := range pErrs {
			errs[k] = v
		}
		out.Practice = &p
	}
	rubric, rErrs := validateRubric(c.Rubric, typ, review, prefix+"rubric")
	for k, v := range rErrs {
		errs[k] = v
	}
	out.Rubric = rubric
	return out, errs
}

func validateQuiz(q Quiz, key string) (Quiz, map[string]string) {
	errs := map[string]string{}
	out := Quiz{PassPercent: q.PassPercent, Questions: []QuizQuestion{}}
	if out.PassPercent == 0 {
		out.PassPercent = DefaultPassPercent
	}
	if out.PassPercent < 1 || out.PassPercent > 100 {
		errs[key+".pass_percent"] = "Pass mark must be between 1% and 100%."
	}
	switch {
	case len(q.Questions) == 0:
		errs[key+".questions"] = "Add at least one question."
	case len(q.Questions) > MaxQuizQuestions:
		errs[key+".questions"] = fmt.Sprintf("A quiz can have at most %d questions.", MaxQuizQuestions)
	}
	for i, qq := range q.Questions {
		if i >= MaxQuizQuestions {
			break
		}
		qk := fmt.Sprintf("%s.questions[%d]", key, i)
		prompt := strings.TrimSpace(qq.Prompt)
		n := utf8.RuneCountInString(prompt)
		switch {
		case n < QuizPromptMin:
			errs[qk+".prompt"] = "Write the question (at least 3 characters)."
		case n > QuizPromptMax:
			errs[qk+".prompt"] = fmt.Sprintf("Questions can be at most %d characters.", QuizPromptMax)
		case hasBadControl(prompt, true):
			errs[qk+".prompt"] = "Question contains characters that can't be displayed."
		}
		opts := make([]string, 0, len(qq.Options))
		seen := map[string]bool{}
		for _, o := range qq.Options {
			o = NormalizeText(o)
			switch {
			case o == "":
				errs[qk+".options"] = "Options can't be empty."
			case utf8.RuneCountInString(o) > QuizOptionMax:
				errs[qk+".options"] = fmt.Sprintf("Options can be at most %d characters.", QuizOptionMax)
			case hasBadControl(o, false):
				errs[qk+".options"] = "An option contains characters that can't be displayed."
			case seen[strings.ToLower(o)]:
				errs[qk+".options"] = "Each option must be different."
			}
			seen[strings.ToLower(o)] = true
			opts = append(opts, o)
		}
		if len(opts) < MinQuizOptions || len(opts) > MaxQuizOptions {
			errs[qk+".options"] = fmt.Sprintf("Give %d to %d options.", MinQuizOptions, MaxQuizOptions)
		}
		if qq.Answer < 0 || qq.Answer >= len(opts) {
			errs[qk+".answer"] = "Mark the right option."
		}
		out.Questions = append(out.Questions, QuizQuestion{Prompt: prompt, Options: opts, Answer: qq.Answer})
	}
	return out, errs
}

// QuizResult is one graded attempt.
type QuizResult struct {
	Attempt int
	Correct []bool
	Score   int // percent, rounded down
	Passed  bool
}

// GradeQuiz scores answers against the key. It returns a field error when the answers don't
// fit the quiz (wrong count or an option index out of range).
func GradeQuiz(q Quiz, answers []int, attempt int) (QuizResult, string) {
	if len(answers) != len(q.Questions) {
		return QuizResult{}, fmt.Sprintf("Answer all %d questions.", len(q.Questions))
	}
	r := QuizResult{Attempt: attempt, Correct: make([]bool, len(answers))}
	right := 0
	for i, a := range answers {
		if a < 0 || a >= len(q.Questions[i].Options) {
			return QuizResult{}, fmt.Sprintf("Question %d has no option %d.", i+1, a+1)
		}
		if a == q.Questions[i].Answer {
			r.Correct[i] = true
			right++
		}
	}
	r.Score = right * 100 / len(q.Questions)
	r.Passed = r.Score >= q.PassPercent
	return r, ""
}

// SurpriseOffset is a stable pseudo-random delay (0..window minutes) for one student and
// one flow item, so a "surprise" task lands at a different time for each student but never
// moves once scheduled.
func SurpriseOffset(enrollmentID, itemID uuid.UUID, window int) int {
	if window <= 0 {
		return 0
	}
	h := fnv.New32a()
	_, _ = h.Write(enrollmentID[:])
	_, _ = h.Write(itemID[:])
	return int(h.Sum32() % uint32(window+1))
}

// Submission is what a student hands in with a task: a link and/or a note.
type Submission struct {
	URL  string
	Note string
}

// NeedsLink is true for work that lives somewhere else (a PR, a post).
func (t TaskType) NeedsLink() bool {
	switch t {
	case TaskFeature, TaskBugFix, TaskGitChore, TaskCodeReview, TaskBlog:
		return true
	case TaskDSA, TaskDocReading, TaskQuiz, TaskStandup:
		return false
	}
	return false
}

// ValidateSubmission checks a submission sent with a move to in_review (required) or to
// done on a self-reviewed task (optional). Returns field → message.
func ValidateSubmission(s *Submission, typ TaskType, to TaskStatus) (*Submission, map[string]string) {
	errs := map[string]string{}
	if s == nil {
		if to == StatusInReview {
			if typ.NeedsLink() {
				errs["submission.url"] = "Add the link to your work (PR, post or repo)."
			} else {
				errs["submission.note"] = "Add your solution or a note for the reviewer."
			}
		}
		return nil, errs
	}
	out := &Submission{URL: strings.TrimSpace(s.URL), Note: strings.TrimSpace(s.Note)}
	if out.URL != "" && !ValidURL(out.URL) {
		errs["submission.url"] = "Use a full link starting with https://."
	}
	if utf8.RuneCountInString(out.Note) > SubmissionNoteMax {
		errs["submission.note"] = fmt.Sprintf("Notes can be at most %d characters.", SubmissionNoteMax)
	} else if hasBadControl(out.Note, true) {
		errs["submission.note"] = "Note contains characters that can't be displayed."
	}
	if to == StatusInReview {
		switch {
		case typ.NeedsLink() && out.URL == "":
			errs["submission.url"] = "Add the link to your work (PR, post or repo)."
		case out.URL == "" && out.Note == "":
			errs["submission.note"] = "Add your solution or a note for the reviewer."
		}
	}
	if out.URL == "" && out.Note == "" {
		return nil, errs
	}
	return out, errs
}
