// Package reviewlab is the code review practice library (feature 27): pull requests with planted
// problems, shown like a code host's review screen and graded by where the reviewer commented.
// Everything lives here; nothing calls GitHub.
package reviewlab

import (
	"embed"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

//go:embed exercises/*.patch
var patches embed.FS

// Difficulty is how hard an exercise is.
type Difficulty string

const (
	Easy   Difficulty = "easy"
	Medium Difficulty = "medium"
	Hard   Difficulty = "hard"
)

// Severity is what kind of problem a planted issue is.
type Severity string

const (
	SevBug         Severity = "bug"
	SevSecurity    Severity = "security"
	SevPerformance Severity = "performance"
	SevA11y        Severity = "accessibility"
)

// Valid reports whether s is a known severity.
func (s Severity) Valid() bool {
	return s == SevBug || s == SevSecurity || s == SevPerformance || s == SevA11y
}

// LineKind is one row of a diff.
type LineKind string

const (
	LineHunk    LineKind = "hunk"
	LineContext LineKind = "context"
	LineAdd     LineKind = "add"
	LineDel     LineKind = "del"
)

// Line is one row of a file's diff. Old and New are 0 when the row has no number on that side.
type Line struct {
	Kind LineKind
	Old  int
	New  int
	Text string
}

// File is one changed file.
type File struct {
	Path      string
	Language  string
	Status    string // added | modified
	Lines     []Line
	Additions int
	Deletions int
}

// Commit is one commit in the pull request.
type Commit struct {
	SHA     string
	Message string
}

// Issue is a planted problem: lines From..To on the new side of Path.
type Issue struct {
	ID          string
	Path        string
	From, To    int
	Severity    Severity
	Title       string
	Explanation string
}

// Exercise is one practice pull request.
type Exercise struct {
	Key        string
	Title      string // the PR title
	Summary    string // one line for the library list
	Language   string
	Difficulty Difficulty
	Number     int
	Author     string
	Branch     string
	Base       string
	Body       string // Markdown description
	Commits    []Commit
	Files      []File
	Issues     []Issue
}

// Comment is one line comment from a reviewer.
type Comment struct {
	Path string
	Line int
	Side string // "new" or "old"
	Body string
}

// Verdict is how the reviewer finished the review.
type Verdict string

const (
	VerdictComment        Verdict = "comment"
	VerdictApprove        Verdict = "approve"
	VerdictRequestChanges Verdict = "request_changes"
)

// Valid reports whether v is a known verdict.
func (v Verdict) Valid() bool {
	return v == VerdictComment || v == VerdictApprove || v == VerdictRequestChanges
}

// Grading constants (mirrored in the clients' help text).
const (
	MaxComments       = 30
	CommentMax        = 2000
	SummaryMax        = 4000
	DefaultPass       = 60
	FreeNoise         = 2  // comments that point at nothing, without a penalty
	NoisePenalty      = 5  // points per comment beyond the free ones
	ApprovePenalty    = 10 // approving a PR that has problems
	LineTolerance     = 1  // a comment one line away still counts
	MaxTaskAttempts   = 3
	MaxExerciseKeyLen = 80
)

// Hit is one planted issue after grading.
type Hit struct {
	Issue   Issue
	Found   bool
	Comment int // index of the first comment that found it, or -1
}

// Result is a graded review.
type Result struct {
	Score          int
	Found          int
	Total          int
	Noise          int // comments that found nothing
	NoisePenalty   int
	ApprovePenalty int
	Passed         bool
	Hits           []Hit
}

var library []Exercise

func init() {
	for _, d := range definitions() {
		ex, err := build(d)
		if err != nil {
			panic(fmt.Sprintf("review lab %s: %v", d.key, err))
		}
		library = append(library, ex)
	}
}

// All lists every exercise, easiest first.
func All() []Exercise { return library }

// Get finds an exercise by key.
func Get(key string) (Exercise, bool) {
	for _, e := range library {
		if e.Key == key {
			return e, true
		}
	}
	return Exercise{}, false
}

// Exists reports whether key names an exercise.
func Exists(key string) bool {
	_, ok := Get(key)
	return ok
}

// ValidateReview checks a submitted review and returns field errors.
func ValidateReview(ex Exercise, verdict Verdict, summary string, comments []Comment) ([]Comment, map[string]string) {
	errs := map[string]string{}
	if !verdict.Valid() {
		errs["verdict"] = "Pick comment, approve or request changes."
	}
	if utf8.RuneCountInString(summary) > SummaryMax {
		errs["summary"] = fmt.Sprintf("The summary can be at most %d characters.", SummaryMax)
	}
	switch {
	case len(comments) == 0:
		errs["comments"] = "Leave at least one comment on a line before you submit."
	case len(comments) > MaxComments:
		errs["comments"] = fmt.Sprintf("Leave at most %d comments.", MaxComments)
	}
	out := make([]Comment, 0, len(comments))
	for i, c := range comments {
		if i >= MaxComments {
			break
		}
		key := fmt.Sprintf("comments[%d]", i)
		body := strings.TrimSpace(c.Body)
		switch {
		case body == "":
			errs[key+".body"] = "Write the comment."
		case utf8.RuneCountInString(body) > CommentMax:
			errs[key+".body"] = fmt.Sprintf("Comments can be at most %d characters.", CommentMax)
		}
		if c.Side != "new" && c.Side != "old" {
			errs[key+".side"] = "Side must be new or old."
		} else if !ex.HasLine(c.Path, c.Line, c.Side) {
			errs[key+".line"] = "That line isn't in this pull request."
		}
		out = append(out, Comment{Path: c.Path, Line: c.Line, Side: c.Side, Body: body})
	}
	return out, errs
}

// HasLine reports whether the diff shows line n on the given side of path.
func (ex Exercise) HasLine(path string, n int, side string) bool {
	for _, f := range ex.Files {
		if f.Path != path {
			continue
		}
		for _, l := range f.Lines {
			if l.Kind == LineHunk {
				continue
			}
			if side == "new" && l.New == n && n > 0 || side == "old" && l.Old == n && n > 0 {
				return true
			}
		}
	}
	return false
}

// Grade scores a validated review. passPercent 0 means DefaultPass.
func Grade(ex Exercise, verdict Verdict, comments []Comment, passPercent int) Result {
	if passPercent <= 0 {
		passPercent = DefaultPass
	}
	r := Result{Total: len(ex.Issues), Hits: make([]Hit, len(ex.Issues))}
	for i, is := range ex.Issues {
		r.Hits[i] = Hit{Issue: is, Comment: -1}
	}
	// Each comment counts for the one issue it is closest to, so a comment between two
	// neighbouring issues never finds both.
	for j, c := range comments {
		best, bestDist := -1, LineTolerance+1
		for i, is := range ex.Issues {
			if c.Side != "new" || c.Path != is.Path {
				continue
			}
			d := 0
			if c.Line < is.From {
				d = is.From - c.Line
			} else if c.Line > is.To {
				d = c.Line - is.To
			}
			if d < bestDist {
				best, bestDist = i, d
			}
		}
		if best < 0 {
			r.Noise++
			continue
		}
		if !r.Hits[best].Found {
			r.Hits[best].Found, r.Hits[best].Comment = true, j
			r.Found++
		}
	}
	r.NoisePenalty = max(0, r.Noise-FreeNoise) * NoisePenalty
	if verdict == VerdictApprove && r.Total > 0 {
		r.ApprovePenalty = ApprovePenalty
	}
	base := 100
	if r.Total > 0 {
		base = int(math.Round(100 * float64(r.Found) / float64(r.Total)))
	}
	r.Score = min(100, max(0, base-r.NoisePenalty-r.ApprovePenalty))
	r.Passed = r.Score >= passPercent
	return r
}

// ---- building exercises from patches ----

type fileDef struct {
	path, language, patch string
}

type issueDef struct {
	id       string
	severity Severity
	title    string
	why      string
}

type def struct {
	key, title, summary, language, author, branch, base, body string
	difficulty                                                Difficulty
	number                                                    int
	commits                                                   []Commit
	files                                                     []fileDef
	issues                                                    []issueDef
}

const markOpen, markClose = "⟪", "⟫"

// build parses each file's patch. Patches are hunks starting "@@ <old start>" (0 for a new
// file); planted issue lines end with ⟪id⟫, which is stripped.
func build(d def) (Exercise, error) {
	ex := Exercise{Key: d.key, Title: d.title, Summary: d.summary, Language: d.language, Difficulty: d.difficulty,
		Number: d.number, Author: d.author, Branch: d.branch, Base: d.base, Body: d.body, Commits: d.commits}
	spans := map[string]*Issue{}
	for _, fd := range d.files {
		raw, err := patches.ReadFile("exercises/" + fd.patch)
		if err != nil {
			return Exercise{}, err
		}
		f, marks, err := parsePatch(fd.path, fd.language, string(raw))
		if err != nil {
			return Exercise{}, fmt.Errorf("%s: %w", fd.patch, err)
		}
		for id, lines := range marks {
			is, ok := spans[id]
			if !ok {
				is = &Issue{ID: id, Path: f.Path, From: lines[0], To: lines[0]}
				spans[id] = is
			}
			if is.Path != f.Path {
				return Exercise{}, fmt.Errorf("issue %s spans two files", id)
			}
			for _, n := range lines {
				is.From, is.To = min(is.From, n), max(is.To, n)
			}
		}
		ex.Files = append(ex.Files, f)
	}
	for _, idf := range d.issues {
		is, ok := spans[idf.id]
		if !ok {
			return Exercise{}, fmt.Errorf("issue %s isn't marked in any patch", idf.id)
		}
		if !idf.severity.Valid() {
			return Exercise{}, fmt.Errorf("issue %s has severity %q", idf.id, idf.severity)
		}
		is.Severity, is.Title, is.Explanation = idf.severity, idf.title, idf.why
		ex.Issues = append(ex.Issues, *is)
		delete(spans, idf.id)
	}
	if len(spans) > 0 {
		return Exercise{}, fmt.Errorf("marked issues without a description: %v", keys(spans))
	}
	return ex, nil
}

func keys(m map[string]*Issue) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func parsePatch(path, language, raw string) (File, map[string][]int, error) {
	f := File{Path: path, Language: language, Status: "modified"}
	marks := map[string][]int{}
	offset := 0 // new minus old line numbers after the hunks so far
	type hunk struct {
		at int
	}
	var cur *hunk
	var oldN, newN, oldStart, newStart, oldCount, newCount int
	flush := func() {
		if cur == nil {
			return
		}
		header := fmt.Sprintf("@@ -%d,%d +%d,%d @@", oldStart, oldCount, newStart, newCount)
		f.Lines[cur.at].Text = header
		offset += newCount - oldCount
	}
	for _, line := range strings.Split(strings.TrimRight(raw, "\n"), "\n") {
		if rest, ok := strings.CutPrefix(line, "@@ "); ok {
			flush()
			start, err := strconv.Atoi(strings.TrimSpace(rest))
			if err != nil {
				return File{}, nil, fmt.Errorf("bad hunk %q", line)
			}
			if start == 0 {
				f.Status = "added"
			}
			oldStart, newStart = start, start+offset
			if start == 0 {
				newStart = 1
			}
			oldN, newN = max(start, 1), newStart
			oldCount, newCount = 0, 0
			f.Lines = append(f.Lines, Line{Kind: LineHunk})
			cur = &hunk{at: len(f.Lines) - 1}
			continue
		}
		if cur == nil {
			return File{}, nil, fmt.Errorf("line before the first hunk: %q", line)
		}
		kind, text := LineContext, ""
		switch {
		case line == "":
		case line[0] == '+':
			kind, text = LineAdd, line[1:]
		case line[0] == '-':
			kind, text = LineDel, line[1:]
		case line[0] == ' ':
			text = line[1:]
		default:
			return File{}, nil, fmt.Errorf("line without a prefix: %q", line)
		}
		var ids []string
		for {
			i := strings.LastIndex(text, markOpen)
			if i < 0 || !strings.HasSuffix(text, markClose) {
				break
			}
			ids = append(ids, text[i+len(markOpen):len(text)-len(markClose)])
			text = strings.TrimRight(text[:i], " ")
		}
		l := Line{Kind: kind, Text: text}
		switch kind {
		case LineAdd:
			l.New = newN
			newN++
			newCount++
			f.Additions++
		case LineDel:
			l.Old = oldN
			oldN++
			oldCount++
			f.Deletions++
		default:
			l.Old, l.New = oldN, newN
			oldN++
			newN++
			oldCount++
			newCount++
		}
		if len(ids) > 0 && kind != LineAdd {
			return File{}, nil, fmt.Errorf("issue marked on a line that isn't added: %q", line)
		}
		for _, id := range ids {
			marks[id] = append(marks[id], l.New)
		}
		f.Lines = append(f.Lines, l)
	}
	flush()
	if f.Status == "added" {
		for i := range f.Lines {
			if f.Lines[i].Kind == LineHunk {
				f.Lines[i].Text = fmt.Sprintf("@@ -0,0 +1,%d @@", f.Additions)
			}
		}
	}
	return f, marks, nil
}
