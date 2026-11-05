// Package curriculum is Stackstep's own course content: the personas who post work, a task
// library, and the two published flows students follow (Frontend · 30 days and
// Full-stack · 60 days). It is plain data, checked by the same validation the admin console
// uses, and loaded into any database with `dbadmin curriculum` (safe to re-run).
//
// The arc follows the program design: setup and Git first, then guided projects whose
// hand-holding fades, then a capstone from a product brief. Every day mixes work from
// different managers so the chat feels like a real team.
package curriculum

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// Personas. Fixed ids so re-running updates them instead of adding copies.
var (
	TeamLead           = domain.DefaultPersonaID // Sam Rivera, created by the migrations
	EngineeringManager = uuid.MustParse("00000000-0000-4000-8000-0000000000c1")
	DeliveryManager    = uuid.MustParse("00000000-0000-4000-8000-0000000000c2")
	QALead             = uuid.MustParse("00000000-0000-4000-8000-0000000000c3")
	ContentLead        = uuid.MustParse("00000000-0000-4000-8000-0000000000c4")
	BackendLead        = uuid.MustParse("00000000-0000-4000-8000-0000000000c5")
)

// Persona is one member of the student's simulated team.
type Persona struct {
	ID        uuid.UUID
	Name      string
	Title     string
	Color     domain.PersonaColor
	AutoReply bool
	Posts     string // what they hand out, for docs and the admin
}

// Personas returns the team, team lead first.
func Personas() []Persona {
	return []Persona{
		{TeamLead, "Sam Rivera", "Team Lead", domain.PersonaColor("violet"), true, "Standups, onboarding, retros, capstone kickoffs and vivas"},
		{EngineeringManager, "Ananya Rao", "Engineering Manager", domain.PersonaColor("emerald"), false, "The DSA problem of the day, code reviews and interview prep"},
		{DeliveryManager, "Vikram Menon", "Delivery Manager", domain.PersonaColor("blue"), false, "Feature tickets, Git chores and deploys"},
		{QALead, "Kabir Shah", "QA Lead", domain.PersonaColor("amber"), false, "Bug reports, testing tickets and quality checks"},
		{ContentLead, "Zoya Khan", "Content Lead", domain.PersonaColor("rose"), false, "Doc readings, blog posts and CS fundamentals quizzes"},
		{BackendLead, "Rohan Kulkarni", "Backend Lead", domain.PersonaColor("cyan"), false, "API, database and auth tickets (60-day program)"},
	}
}

// Item is one task in a flow. Key names its library template: the same key in two flows is
// one template, so editing it in the library is editing it everywhere it's reused.
type Item struct {
	Key       string
	Type      domain.TaskType
	Title     string
	Persona   uuid.UUID
	Review    domain.ReviewMode
	Release   string // "HH:MM" in the student's time zone
	Due       int    // minutes after release
	Window    int    // > 0 makes it a surprise inside this many minutes
	Brief     string // Markdown
	Resources []domain.Resource
	Quiz      *domain.Quiz
	Practice  *domain.Practice
	Rubric    []string
}

// Day is a flow day and what lands on it, in order.
type Day struct {
	N     int
	Items []Item
}

// Flow is a published course.
type Flow struct {
	ID          uuid.UUID
	Name        string
	Stream      string
	Description string
	Days        int
	Plan        []Day
}

// Fixed flow ids.
var (
	Frontend30ID  = uuid.MustParse("00000000-0000-4000-8000-0000000000d1")
	Fullstack60ID = uuid.MustParse("00000000-0000-4000-8000-0000000000d2")
)

// Flows returns both courses.
func Flows() []Flow {
	return []Flow{
		{
			ID: Frontend30ID, Name: "Frontend Internship · 30 days", Stream: "Frontend", Days: 30,
			Description: "Setup and Git, a portfolio site, a React task manager, an API-driven show finder and a capstone from a product brief, with a DSA problem most days, quizzes and weekly writing.",
			Plan:        append(foundation(), frontendFinale()...),
		},
		{
			ID: Fullstack60ID, Name: "Full-stack Internship · 60 days", Stream: "Full-stack", Days: 60,
			Description: "The frontend track, then testing and CI, a Node and PostgreSQL API with auth, connecting it to React, and a deployed full-stack capstone with mock interviews. Deeper DSA from linked lists to dynamic programming.",
			Plan:        append(foundation(), fullstackRest()...),
		},
	}
}

// templateNamespace makes template ids from keys (stable across runs and databases).
var templateNamespace = uuid.MustParse("6f1c2a4e-7d3b-4c58-9a0e-5b2f8d1e3c70")

// TemplateID is the library id for an item key.
func TemplateID(key string) uuid.UUID {
	return uuid.NewSHA1(templateNamespace, []byte("stackstep-curriculum/"+key))
}

// Spec turns an item into the task spec the app stores.
func (it Item) Spec() (domain.TaskSpec, error) {
	content := domain.TaskContent{Resources: it.Resources, Quiz: it.Quiz, Practice: it.Practice, Rubric: it.Rubric}
	if content.Resources == nil {
		content.Resources = []domain.Resource{}
	}
	spec, errs := domain.ValidateTaskSpec(domain.TaskSpecInput{
		Type: it.Type, Title: it.Title, Brief: it.Brief, PersonaID: it.Persona, ReviewMode: it.Review,
		ReleaseTime: it.Release, DueMinutes: it.Due, ReleaseWindow: it.Window, Content: content,
	}, "", isPersona)
	if len(errs) > 0 {
		keys := make([]string, 0, len(errs))
		for k := range errs {
			keys = append(keys, k+" ("+errs[k]+")")
		}
		sort.Strings(keys)
		return domain.TaskSpec{}, fmt.Errorf("%s: %v", it.Key, keys)
	}
	return spec, nil
}

func isPersona(id uuid.UUID) bool {
	for _, p := range Personas() {
		if p.ID == id {
			return true
		}
	}
	return false
}

// Templates returns every distinct item across all flows, keyed once.
func Templates() ([]Item, error) {
	seen := map[string]Item{}
	order := []string{}
	for _, f := range Flows() {
		for _, d := range f.Plan {
			for _, it := range d.Items {
				prev, ok := seen[it.Key]
				if !ok {
					seen[it.Key] = it
					order = append(order, it.Key)
					continue
				}
				a, _ := json.Marshal(prev)
				b, _ := json.Marshal(it)
				if string(a) != string(b) {
					return nil, fmt.Errorf("key %q is used for two different tasks", it.Key)
				}
			}
		}
	}
	out := make([]Item, 0, len(order))
	for _, k := range order {
		out = append(out, seen[k])
	}
	return out, nil
}

// ---- helpers for writing content ----

func link(title, url string) domain.Resource { return domain.Resource{Title: title, URL: url} }

func links(rs ...domain.Resource) []domain.Resource { return rs }

// mcq is one quiz question; answer is the index of the right option.
func mcq(prompt string, answer int, options ...string) domain.QuizQuestion {
	return domain.QuizQuestion{Prompt: prompt, Options: options, Answer: answer}
}

func quiz(qs ...domain.QuizQuestion) *domain.Quiz {
	return &domain.Quiz{Questions: qs, PassPercent: domain.DefaultPassPercent}
}

// practice builds a practice pad from (args, expected) JSON pairs.
func practice(fn, starter string, pairs ...string) *domain.Practice {
	p := &domain.Practice{FunctionName: fn, Starter: starter}
	for i := 0; i+1 < len(pairs); i += 2 {
		p.Tests = append(p.Tests, domain.PracticeTest{Args: json.RawMessage(pairs[i]), Expected: json.RawMessage(pairs[i+1])})
	}
	return p
}

// Common slots. Times are the student's local time; due is minutes after release.
const (
	day     = 24 * 60
	release = "10:00"
)

func standup(key, title, brief string) Item {
	return Item{Key: key, Type: domain.TaskStandup, Title: title, Persona: TeamLead, Review: domain.ReviewSelf, Release: "09:30", Due: 180, Brief: brief}
}

// ticket is a feature for a manager to review, handed in as a PR link.
func ticket(key, title string, persona uuid.UUID, dueDays int, brief string, resources []domain.Resource, rubric ...string) Item {
	return Item{Key: key, Type: domain.TaskFeature, Title: title, Persona: persona, Review: domain.ReviewManual, Release: release, Due: dueDays * day, Brief: brief, Resources: resources, Rubric: rubric}
}

func bug(key, title, brief string, resources []domain.Resource, rubric ...string) Item {
	return Item{Key: key, Type: domain.TaskBugFix, Title: title, Persona: QALead, Review: domain.ReviewManual, Release: "11:30", Due: day, Brief: brief, Resources: resources, Rubric: rubric}
}

func chore(key, title, brief string, resources []domain.Resource, rubric ...string) Item {
	return Item{Key: key, Type: domain.TaskGitChore, Title: title, Persona: DeliveryManager, Review: domain.ReviewManual, Release: "16:00", Due: day, Brief: brief, Resources: resources, Rubric: rubric}
}

func reading(key, title, brief string, resources []domain.Resource) Item {
	return Item{Key: key, Type: domain.TaskDocReading, Title: title, Persona: ContentLead, Review: domain.ReviewSelf, Release: "15:00", Due: day, Brief: brief, Resources: resources}
}

// popQuiz lands as a surprise between 11:00 and 17:00 and is due an hour after it appears.
func popQuiz(key, title string, persona uuid.UUID, intro string, q *domain.Quiz) Item {
	return Item{Key: key, Type: domain.TaskQuiz, Title: title, Persona: persona, Review: domain.ReviewSelf, Release: "11:00", Window: 360, Due: 60, Brief: intro, Quiz: q}
}

func blog(key, title, brief string, rubric ...string) Item {
	return Item{Key: key, Type: domain.TaskBlog, Title: title, Persona: ContentLead, Review: domain.ReviewManual, Release: "17:00", Due: 2 * day, Brief: brief, Rubric: rubric,
		Resources: links(link("Hashnode", "https://hashnode.com"), link("DEV Community", "https://dev.to"), link("Write a good README", "https://www.makeareadme.com"))}
}

func review(key, title, brief string, rubric ...string) Item {
	return Item{Key: key, Type: domain.TaskCodeReview, Title: title, Persona: EngineeringManager, Review: domain.ReviewManual, Release: "14:00", Due: day, Brief: brief, Rubric: rubric,
		Resources: links(link("Reviewing proposed changes in a pull request", "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request"),
			link("Google's code review guide", "https://google.github.io/eng-practices/review/reviewer/"))}
}

// dsa is the problem of the day: the practice pad checks it in the browser, the student
// marks it done.
func dsa(key, title, brief string, p *domain.Practice, resources ...domain.Resource) Item {
	return Item{Key: key, Type: domain.TaskDSA, Title: title, Persona: EngineeringManager, Review: domain.ReviewSelf, Release: "13:00", Due: 8 * 60, Brief: brief, Practice: p, Resources: resources}
}

func days(ds ...Day) []Day { return ds }

func on(n int, items ...Item) Day { return Day{N: n, Items: items} }
