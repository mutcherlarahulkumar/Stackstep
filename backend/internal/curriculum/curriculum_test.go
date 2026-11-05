package curriculum

import (
	"regexp"
	"strings"
	"testing"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// Every task passes the same validation as the admin console.
func TestEveryTaskIsValid(t *testing.T) {
	items, err := Templates()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) < 120 {
		t.Fatalf("only %d distinct tasks", len(items))
	}
	for _, it := range items {
		if _, err := it.Spec(); err != nil {
			t.Error(err)
		}
	}
}

// Each flow fills every day and keeps a healthy mix of work.
func TestFlowsCoverEveryDay(t *testing.T) {
	for _, f := range Flows() {
		if _, errs := domain.ValidateFlow(domain.FlowInput{Name: f.Name, Stream: f.Stream, Description: f.Description, Days: f.Days}); len(errs) > 0 {
			t.Errorf("%s: %v", f.Name, errs)
		}
		seen := map[int]bool{}
		types := map[domain.TaskType]int{}
		personas := map[string]int{}
		last := 0
		for _, d := range f.Plan {
			if d.N <= last {
				t.Errorf("%s: day %d is out of order", f.Name, d.N)
			}
			last = d.N
			seen[d.N] = true
			if len(d.Items) == 0 || len(d.Items) > 4 {
				t.Errorf("%s: day %d has %d tasks", f.Name, d.N, len(d.Items))
			}
			for _, it := range d.Items {
				types[it.Type]++
				personas[it.Persona.String()]++
			}
		}
		for n := 1; n <= f.Days; n++ {
			if !seen[n] {
				t.Errorf("%s: day %d has nothing", f.Name, n)
			}
		}
		minDSA := f.Days * 2 / 3
		if types[domain.TaskDSA] < minDSA {
			t.Errorf("%s: only %d DSA problems, want %d or more", f.Name, types[domain.TaskDSA], minDSA)
		}
		for _, typ := range []domain.TaskType{domain.TaskFeature, domain.TaskBugFix, domain.TaskQuiz, domain.TaskDocReading, domain.TaskGitChore, domain.TaskCodeReview, domain.TaskStandup, domain.TaskBlog} {
			if types[typ] == 0 {
				t.Errorf("%s: no %s tasks", f.Name, typ)
			}
		}
		if len(personas) < 5 {
			t.Errorf("%s: only %d personas post work", f.Name, len(personas))
		}
	}
}

// The two programs share weeks 1 to 3 exactly, so the library has one copy of each task.
func TestProgramsShareTheFoundation(t *testing.T) {
	fs := Flows()
	a, b := fs[0].Plan, fs[1].Plan
	for i := 0; i < 21; i++ {
		if len(a[i].Items) != len(b[i].Items) {
			t.Fatalf("day %d differs", i+1)
		}
		for j := range a[i].Items {
			if a[i].Items[j].Key != b[i].Items[j].Key {
				t.Fatalf("day %d item %d differs", i+1, j)
			}
		}
	}
}

var (
	fence      = regexp.MustCompile("(?s)```.*?```")
	inlineCode = regexp.MustCompile("`[^`]*`")
	url        = regexp.MustCompile(`https?://\S+`)
	proseColon = regexp.MustCompile(`[A-Za-z)\]"'*]:(\s|$)`)
)

// prose is what a reader sees as words: code, URLs and quoted error messages are left out.
func prose(s string) string {
	s = fence.ReplaceAllString(s, " ")
	s = inlineCode.ReplaceAllString(s, " ")
	s = url.ReplaceAllString(s, " ")
	lines := strings.Split(s, "\n")
	out := lines[:0]
	for _, l := range lines {
		if strings.HasPrefix(strings.TrimSpace(l), ">") { // quoted bug reports are users' own words
			continue
		}
		out = append(out, l)
	}
	return strings.Join(out, "\n")
}

// House style for anything students read. No em dashes, and no colons in running text.
func TestCopyStyle(t *testing.T) {
	items, _ := Templates()
	check := func(where, text string) {
		p := prose(text)
		if strings.Contains(p, "—") {
			t.Errorf("%s has an em dash", where)
		}
		if m := proseColon.FindString(p); m != "" {
			i := strings.Index(p, m)
			t.Errorf("%s has a colon in prose near %q", where, p[max(0, i-30):min(len(p), i+20)])
		}
	}
	for _, it := range items {
		check(it.Key+" title", it.Title)
		check(it.Key+" brief", it.Brief)
		for _, r := range it.Rubric {
			check(it.Key+" rubric", r)
		}
		for _, r := range it.Resources {
			check(it.Key+" link title", r.Title)
		}
	}
	for _, f := range Flows() {
		check(f.Name, f.Name+" "+f.Description)
	}
	for _, p := range Personas() {
		check(p.Name, p.Name+" "+p.Title)
	}
}

// Rubrics are for reviewed work and say what a reviewer actually checks.
func TestReviewedWorkHasARubric(t *testing.T) {
	items, _ := Templates()
	for _, it := range items {
		if it.Review == domain.ReviewManual && it.Type != domain.TaskQuiz && len(it.Rubric) < 3 {
			t.Errorf("%s is reviewed but has %d rubric items", it.Key, len(it.Rubric))
		}
		if it.Type.NeedsLink() && !strings.Contains(strings.ToLower(it.Brief), "hand in") {
			t.Errorf("%s doesn't say what to hand in", it.Key)
		}
	}
}
