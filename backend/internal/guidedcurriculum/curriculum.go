// Package curriculum contains the versioned, original React internship lessons.
// Lessons are embedded in task snapshots so reading never depends on an external site.
package guidedcurriculum

import (
	"embed"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// Version changes when a new curated edition should be imported alongside old flows.
const Version = "react-30-v1"

// Name is the import name; fixture flows retain their historical name and identifier.
const Name = "React Frontend · 30 days · Guided v1"

// Description describes the outcomes without promising credentials or a job.
const Description = "Build a portfolio, a tested product explorer and a capstone through original in-app lessons, deliberate practice, code review and weekly reflection."

//go:embed lessons/*.md
var lessons embed.FS

// Personas supplies manager identities; fixture and real imports can use different ids.
type Personas struct{ Lead, Engineering, Delivery, Content uuid.UUID }

// Entry is a curriculum task and its planning metadata. Effort is an estimate, not a timer.
type Entry struct {
	Day              int
	EstimatedMinutes int
	Spec             domain.TaskSpec
}

type task struct {
	day, effort          int
	typ                  domain.TaskType
	title, brief, lesson string
	persona              uuid.UUID
	review               domain.ReviewMode
	release              string
	due, window          int
	content              domain.TaskContent
}

// Entries returns independent task values with validated, embedded lesson documents.
func Entries(p Personas) ([]Entry, error) {
	manual, self := domain.ReviewManual, domain.ReviewSelf
	tasks := []task{
		{1, 20, domain.TaskStandup, "Introduce yourself to the team", "Introduce your current skills, one learning goal and the project you will build. Read the working agreement and ask one useful question.", "01-introduction", p.Lead, self, "10:00", 240, 0, domain.TaskContent{}},
		{1, 75, domain.TaskGitChore, "Set up Git and open your first PR", "Create your own portfolio repository; no hidden starter is needed. Add a README on chore/intro and open a small pull request with evidence.", "01-git", p.Delivery, manual, "11:00", 480, 0, domain.TaskContent{Rubric: []string{"README explains setup, purpose and the next milestone", "Small chore/intro PR includes a useful description", "No credentials, dependencies or generated build files committed"}}},
		{2, 45, domain.TaskDSA, "Two Sum", "Return two distinct indices in O(n). Explain why you look up the complement before adding the current number; cover duplicates and negative numbers.", "02-two-sum", p.Engineering, manual, "10:30", 360, 0, domain.TaskContent{Practice: practice("twoSum", "function twoSum(nums, target) {\n  // Return the indices of two distinct numbers that sum to target.\n}\n", "[[2,7,11,15],9]", "[0,1]", "[[3,2,4],6]", "[1,2]", "[[3,3],6]", "[0,1]", "[[-3,4,3,90],0]", "[0,2]"), Rubric: []string{"Uses two distinct indices and handles duplicate values", "Explains O(n) time and O(n) auxiliary space", "Hand-in includes the approach and tested edge cases"}}},
		{2, 90, domain.TaskFeature, "Build the portfolio hero section", "Ship a semantic, responsive hero on feat/hero: name, role, brief bio and meaningful links. Test at 360px and with only a keyboard.", "02-hero", p.Delivery, manual, "11:00", 1440, 0, domain.TaskContent{Rubric: []string{"Looks right at 360px wide", "Links open in a new tab", "Work is on feat/hero with a PR", "Heading order, link names and keyboard focus are clear"}}},
		{3, 35, domain.TaskDocReading, "Read MDN: Flexbox", "Learn Flexbox in the attached guide without leaving Stackstep. Predict three layouts, build them, then explain justify-content and align-items in your own words. MDN is optional further reading.", "03-flexbox", p.Delivery, self, "09:30", 240, 0, domain.TaskContent{Resources: []domain.Resource{{Title: "Optional reference: MDN Flexbox", URL: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox"}}}},
		{3, 45, domain.TaskDSA, "Valid Anagram", "Compare lowercase a–z strings with a frequency map. State the input assumptions, test unequal lengths and explain the time/space trade-off.", "03-anagram", p.Engineering, manual, "12:00", 360, 0, domain.TaskContent{Practice: practice("isAnagram", "function isAnagram(s, t) {\n  // Return true when t uses exactly the letters of s.\n}\n", `["anagram","nagaram"]`, "true", `["rat","car"]`, "false", `["a","ab"]`, "false", `["aab","abb"]`, "false", `["",""]`, "true"), Rubric: []string{"Handles repeated letters, unequal lengths and empty strings", "Does not mutate input and states the lowercase alphabet assumption", "Explains time and auxiliary space with examples"}}},
		{3, 45, domain.TaskBlog, "Write: what I learned in week one", "Write a 300–500 word early learning log: one shipped change, one debugging story and a next experiment. Submit a Markdown file in your repo; external publishing is optional.", "03-learning-log", p.Content, manual, "15:00", 2880, 0, domain.TaskContent{Rubric: []string{"Uses a concrete PR and a reproducible debugging example", "Separates what was observed from what was assumed", "Includes one measurable next experiment"}}},
		{4, 15, domain.TaskQuiz, "Git basics quiz", "Check the Git commands you used, then explain one wrong answer in your task notes before retrying. The answer key appears after completion.", "04-git-quiz", p.Delivery, self, "16:00", 240, 0, domain.TaskContent{Quiz: gitQuiz()}},
		{4, 90, domain.TaskFeature, "Projects grid with filters", "Render a local project dataset with a selected tag AND a case-insensitive title search. Keep controls labelled and show a helpful empty state. Branch: feat/projects.", "04-projects", p.Delivery, manual, "10:00", 1440, 0, domain.TaskContent{Rubric: []string{"Filters combine (tag and search)", "Empty state when nothing matches", "Cards are keyboard reachable", "Project data is separate from rendering and has stable ids"}}},
		{4, 40, domain.TaskDSA, "Best Time to Buy and Sell Stock", "Find the best profit from one buy followed by one sell, or zero. Use one pass and constant space; explain why a future minimum cannot buy in the past.", "04-stock", p.Engineering, manual, "12:00", 360, 0, domain.TaskContent{Practice: practice("maxProfit", "function maxProfit(prices) {\n  // Best profit from one buy and one later sell, or 0.\n}\n", "[[7,1,5,3,6,4]]", "5", "[[7,6,4,3,1]]", "0", "[[2,4,1]]", "2", "[[]]", "0", "[[4]]", "0"), Rubric: []string{"Buy precedes sell and decreasing input returns zero", "Uses O(n) time and O(1) auxiliary space", "Walkthrough states the running minimum and best profit"}}},
		{5, 20, domain.TaskStandup, "Friday standup", "Make a short evidence-based weekly update: shipped, blocked, next. This is a lighter catch-up day; finish feedback before adding scope.", "05-review", p.Lead, self, "15:00", 120, 120, domain.TaskContent{}},
		newTask(5, 30, domain.TaskDocReading, "Ask a reproducible debugging question", "Turn one real blocker into a minimal example with expected behaviour, actual behaviour and what you have already tried. Practise making help easy to give.", "05-debug-question", p.Engineering, self, "10:00", 480),
		newTask(6, 90, domain.TaskBugFix, "Debug a real layout regression", "Reproduce one portfolio layout failure, isolate its cause and land the smallest verified fix with before/after evidence.", "06-debugging", p.Engineering, manual, "11:00", 1440, "Reproduction includes viewport and exact steps", "Fix addresses a demonstrated cause rather than hiding overflow", "Regression check covers narrow and wide layouts"),
		newTask(7, 45, domain.TaskStandup, "Recover, retrieve and plan week two", "Recall Git and CSS concepts without notes, finish one review comment and set two measurable goals. Keep today light.", "07-retrieval", p.Lead, self, "10:00", 480),
		newTask(8, 90, domain.TaskFeature, "Rebuild the portfolio as React components", "Extract Hero, ProjectCard and ProjectFilters with explicit props and stable keys; preserve the portfolio behaviour before adding features.", "08-components", p.Delivery, manual, "10:00", 1440, "Components have focused responsibilities and explicit props", "Stable ids are used as keys; behaviour matches the original", "No duplicated project data or unnecessary state"),
		{8, 35, domain.TaskDSA, "Contains Duplicate", "Detect whether an integer appears more than once. Compare a nested-loop baseline with a Set solution and test empty input.", "08-duplicates", p.Engineering, manual, "14:00", 360, 0, domain.TaskContent{Practice: practice("containsDuplicate", "function containsDuplicate(nums) {\n  // Return true if any integer appears at least twice.\n}\n", "[[1,2,3,1]]", "true", "[[1,2,3,4]]", "false", "[[]]", "false", "[[-1,-1]]", "true"), Rubric: []string{"Handles empty input and repeated negative integers", "Explains the time/space trade-off against the baseline", "Returns a boolean without mutating the input"}}},
		newTask(9, 105, domain.TaskFeature, "Model filter state without duplication", "Make selected tag and search controlled state, derive visible projects and a result count, and provide one reliable reset action.", "09-state", p.Engineering, manual, "10:00", 1440, "Visible projects are derived rather than copied into state", "Tag and query compose and reset together", "Controls remain keyboard-operable and result count is announced"),
		newTask(10, 90, domain.TaskFeature, "Build an accessible contact form", "Implement labelled name, email and message inputs with validation, an honest demo-only submit state and recoverable errors. No real email service is required.", "10-forms", p.Delivery, manual, "10:00", 1440, "Labels, errors and focus make the form usable by keyboard", "Invalid input is rejected and entered values are preserved", "UI clearly states that the demo sends no real message"),
		{10, 20, domain.TaskQuiz, "React state and effects checkpoint", "Reason about state, derived data, keys and effect cleanup using small scenarios. Explain your reasoning before retrying.", "10-checkpoint", p.Engineering, self, "15:00", 360, 0, domain.TaskContent{Quiz: reactQuiz()}},
		newTask(11, 105, domain.TaskFeature, "Load data with honest async states", "Replace the project list with a deterministic local JSON data loader that can simulate delay and failure. Implement loading, retry, empty and success states without stale updates.", "11-async", p.Engineering, manual, "10:00", 1440, "Loading, error, empty and success states are demonstrated", "Retry preserves user filters and does not duplicate records", "Cleanup prevents stale requests from replacing newer results"),
		newTask(12, 90, domain.TaskFeature, "Test behaviour at the user boundary", "Write automated tests for combined filters, empty results and contact validation using accessible queries and deterministic data.", "12-testing", p.Engineering, manual, "10:00", 1440, "Tests fail when the relevant behaviour is removed", "Assertions use user-visible behaviour and accessible queries", "Mocks are deterministic and restored between tests"),
		{12, 40, domain.TaskDSA, "Balanced brackets", "Check whether parentheses, square brackets and braces are properly nested. Use a stack and explain why counting alone fails.", "12-brackets", p.Engineering, manual, "14:00", 360, 0, domain.TaskContent{Practice: practice("isBalanced", "function isBalanced(text) {\n  // Input contains only ()[]{}. Return whether brackets are balanced.\n}\n", `["()[]{}"]`, "true", `["([{}])"]`, "true", `["(]"]`, "false", `["([)]"]`, "false", `[""]`, "true"), Rubric: []string{"Rejects crossed, missing and unexpected closing brackets", "Uses a stack and explains O(n) time and O(n) space", "States and respects the brackets-only input contract"}}},
		newTask(13, 75, domain.TaskCodeReview, "Review a pull request with useful evidence", "Review a partner PR or a deliberately flawed branch of your own portfolio. Leave actionable comments on correctness, accessibility and maintainability; propose one focused fix.", "13-code-review", p.Engineering, manual, "10:00", 1440, "Comments point to a line, observable impact and a suggestion", "Correctness and accessibility are considered before style", "Author response or follow-up diff closes the feedback loop"),
		newTask(14, 45, domain.TaskStandup, "Demo the portfolio and close the feedback loop", "Record a short portfolio demo, revisit two earlier mistakes from memory and choose a specific improvement for the next project. Catch-up takes priority over extra work.", "14-demo", p.Lead, self, "10:00", 480),
		newTask(15, 90, domain.TaskFeature, "Start a product explorer from a written contract", "Create a second project that lists and filters products from a checked-in fixture. Define the Product shape, states and acceptance tests before implementing the first vertical slice.", "15-explorer", p.Delivery, manual, "10:00", 1440, "Written contract covers valid, empty and failed responses", "First slice loads fixture products and applies one filter", "README explains setup and avoids an external API dependency"),
		newTask(15, 25, domain.TaskDocReading, "Read an API response defensively", "Use the attached response examples to distinguish transport errors, invalid JSON and invalid domain data. Write three checks at the API boundary.", "15-contract", p.Engineering, self, "14:00", 360),
		newTask(16, 105, domain.TaskFeature, "Make search reproducible and race-safe", "Sync explorer query and category to URL search parameters; handle back/forward navigation and ensure slower older requests cannot overwrite newer results.", "16-search", p.Engineering, manual, "10:00", 1440, "Copied URL reconstructs query and category", "Back and forward restore the controls and results", "A deliberately slower old response cannot overwrite the latest query"),
		newTask(17, 90, domain.TaskFeature, "Save favourites and recover from failed writes", "Add favourite toggles with an injected persistence adapter. Use a local implementation, show saving/failure, and rollback or retry honestly.", "17-mutations", p.Delivery, manual, "10:00", 1440, "Pending writes cannot create duplicate operations", "Failure preserves or restores the truthful saved state", "Reload restores data and corrupted storage has a safe fallback"),
		newTask(18, 90, domain.TaskBugFix, "Harden untrusted content and session states", "Audit the explorer's input boundaries and implement explicit signed-out, forbidden and expired-session demo states. Keep fixture auth clearly separate from real security.", "18-boundaries", p.Engineering, manual, "10:00", 1440, "Untrusted text is never injected as HTML", "Unauthorized states have clear next actions and no fake success", "No credentials appear in browser storage, logs or committed files"),
		newTask(19, 90, domain.TaskFeature, "Prove the explorer works through failures", "Add integration tests covering search races, favourite-write failure and malformed product data, plus one end-to-end happy path.", "19-integration", p.Engineering, manual, "10:00", 1440, "Regression tests cover a race and a rejected write", "Malformed data produces a recoverable UI state", "Happy path exercises real page interactions with deterministic fixtures"),
		{19, 35, domain.TaskDSA, "Binary search insertion index", "Return the first index where target could be inserted to preserve sorted order. Use a half-open interval and cover duplicates and empty arrays.", "19-binary-search", p.Engineering, manual, "14:00", 360, 0, domain.TaskContent{Practice: practice("searchInsert", "function searchInsert(nums, target) {\n  // Return the first index whose value is >= target, or nums.length.\n}\n", "[[1,3,5,6],5]", "2", "[[1,3,5,6],2]", "1", "[[1,3,5,6],7]", "4", "[[],3]", "0", "[[1,2,2,2,4],2]", "1"), Rubric: []string{"Returns the first matching index when values repeat", "Loop invariant handles empty input and both endpoints", "Explains O(log n) time and O(1) auxiliary space"}}},
		newTask(20, 105, domain.TaskBugFix, "Audit accessibility and performance with evidence", "Run keyboard, zoom, narrow-screen and loading checks. Measure one slow interaction, fix its cause and compare the same scenario before and after.", "20-audit", p.Engineering, manual, "10:00", 1440, "Audit includes keyboard, focus, zoom and 360px evidence", "Performance claim includes repeatable measurements", "Fix preserves correctness and has a regression check"),
		newTask(21, 45, domain.TaskStandup, "Retrospect and transfer what you learned", "Demo the explorer, explain one trade-off without notes, and improve a weak test or review comment. Keep the day for consolidation and recovery.", "21-retrospective", p.Lead, self, "10:00", 480),
		newTask(22, 75, domain.TaskDocReading, "Write a capstone brief you can actually finish", "Choose a small user problem, interview or observe one potential user, and define a three-slice capstone with explicit exclusions and acceptance checks.", "22-capstone-plan", p.Delivery, manual, "10:00", 1440, "Problem names a user, situation and current workaround", "Three small slices each have demonstrable acceptance checks", "Scope excludes payments, real auth and other unsupported integrations"),
		newTask(22, 30, domain.TaskStandup, "Test the capstone idea before building", "Show a sketch or text prototype to one person. Record the task they attempted, where they hesitated and the scope decision you changed.", "22-user-check", p.Content, self, "14:00", 360),
		newTask(23, 120, domain.TaskFeature, "Ship the first capstone vertical slice", "Implement the smallest useful end-to-end capstone journey with checked-in fixtures, explicit data types and a focused test. Keep the PR small enough to review.", "23-capstone-slice", p.Delivery, manual, "10:00", 1440, "A user can complete the first planned journey", "Data contract and one behaviour test accompany the slice", "PR excludes unrelated scaffolding and explains how to verify"),
		newTask(24, 105, domain.TaskFeature, "Make the capstone resilient to real user mistakes", "Add the second planned slice plus truthful validation, loading, empty and failed-save states. Test refresh and interrupted work without claiming unsupported offline guarantees.", "24-resilience", p.Engineering, manual, "10:00", 1440, "Second slice meets its acceptance checks", "Validation and failed saves preserve recoverable user work", "Refresh and interrupted operations behave as documented"),
		newTask(25, 90, domain.TaskFeature, "Build a capstone regression safety net", "Turn the three riskiest user journeys into automated checks and add a reproducible bug report for one defect you found.", "25-regression", p.Engineering, manual, "10:00", 1440, "Three meaningful tests cover the riskiest journeys", "At least one test demonstrates failure before its fix", "Bug report records expected/actual behaviour and minimal reproduction"),
		{25, 40, domain.TaskDSA, "Merge overlapping intervals", "Sort a copy of closed intervals and merge overlaps, including touching endpoints. Explain the invariant and why the input should remain unchanged.", "25-intervals", p.Engineering, manual, "14:00", 360, 0, domain.TaskContent{Practice: practice("mergeIntervals", "function mergeIntervals(intervals) {\n  // Merge overlapping closed intervals without mutating intervals.\n}\n", "[[[1,3],[2,6],[8,10],[15,18]]]", "[[1,6],[8,10],[15,18]]", "[[[1,4],[4,5]]]", "[[1,5]]", "[[]]", "[]", "[[[5,7],[1,2]]]", "[[1,2],[5,7]]"), Rubric: []string{"Handles nested intervals, touching endpoints and empty input", "Sorts a copy rather than mutating the original input", "Explains O(n log n) time and output-space requirements"}}},
		newTask(26, 105, domain.TaskFeature, "Finish the capstone with an inclusive interaction", "Ship the final slice and polish its hardest interaction for keyboard, mobile and slow devices. Measure before optimizing and record one deliberate trade-off.", "26-polish", p.Delivery, manual, "10:00", 1440, "Final planned slice meets its acceptance checks", "Keyboard, mobile and slow-loading paths remain usable", "Optimization has a repeatable measurement and preserves behaviour"),
		newTask(27, 75, domain.TaskCodeReview, "Request a review and handle disagreement well", "Ask a reviewer to attempt the capstone's primary journey. Triage feedback by user impact, fix the highest-priority issue and explain one trade-off respectfully.", "27-review", p.Engineering, manual, "10:00", 1440, "Reviewer can run and verify the change from the PR description", "Feedback is triaged with evidence rather than defensiveness", "Follow-up diff or rationale closes each blocking comment"),
		newTask(28, 90, domain.TaskGitChore, "Prepare a repeatable capstone release", "Create a release checklist, verify a clean checkout and production build, and document deployment plus rollback or a local production demo. A paid hosting account is unnecessary.", "28-release", p.Delivery, manual, "10:00", 1440, "Clean checkout installs, tests and builds using documented commands", "Release includes version, known limitations and rollback steps", "Configuration template contains names and examples but no credentials"),
		newTask(29, 60, domain.TaskStandup, "Practise explaining your decisions under questions", "Give a short project walkthrough, solve one earlier problem without notes and record the gaps honestly. Use follow-up questions to improve an explanation rather than memorize answers.", "29-interview", p.Engineering, self, "10:00", 480),
		newTask(30, 90, domain.TaskBlog, "Publish an evidence-based capstone case study", "Write a concise Markdown case study in your repository with the user problem, your contribution, evidence, trade-offs and next steps. Link real work; external publishing is optional.", "30-case-study", p.Content, manual, "10:00", 480, "Case study links verifiable PRs, tests and demo evidence", "Trade-offs, limitations and individual contribution are explicit", "Next steps follow observed user needs rather than a feature wish list"),
		newTask(30, 30, domain.TaskStandup, "Plan the next 30 days from your evidence", "Compare your first and final work, identify two growth areas and commit to a realistic practice plan with feedback checkpoints.", "30-growth-plan", p.Lead, self, "16:00", 120),
	}
	out := make([]Entry, 0, len(tasks))
	for _, t := range tasks {
		body, err := lessons.ReadFile("lessons/" + t.lesson + ".md")
		if err != nil {
			return nil, fmt.Errorf("lesson %s: %w", t.lesson, err)
		}
		t.content.Documents = []domain.TaskDocument{{Title: "Guide: " + t.title, Body: string(body)}}
		if t.content.Resources == nil {
			t.content.Resources = []domain.Resource{}
		}
		spec, fields := domain.ValidateTaskSpec(domain.TaskSpecInput{Type: t.typ, Title: t.title, Brief: t.brief, PersonaID: t.persona, ReviewMode: t.review, ReleaseTime: t.release, DueMinutes: t.due, ReleaseWindow: t.window, Content: t.content}, "", func(id uuid.UUID) bool { return id != uuid.Nil })
		if len(fields) != 0 {
			return nil, fmt.Errorf("day %d task %q: %v", t.day, t.title, fields)
		}
		out = append(out, Entry{Day: t.day, EstimatedMinutes: t.effort, Spec: spec})
	}
	return out, nil
}

func newTask(day, effort int, typ domain.TaskType, title, brief, lesson string, persona uuid.UUID, review domain.ReviewMode, release string, due int, rubric ...string) task {
	return task{day: day, effort: effort, typ: typ, title: title, brief: brief, lesson: lesson, persona: persona, review: review, release: release, due: due, content: domain.TaskContent{Rubric: rubric}}
}

func practice(fn, starter string, pairs ...string) *domain.Practice {
	p := &domain.Practice{FunctionName: fn, Starter: starter}
	for i := 0; i+1 < len(pairs); i += 2 {
		p.Tests = append(p.Tests, domain.PracticeTest{Args: json.RawMessage(pairs[i]), Expected: json.RawMessage(pairs[i+1])})
	}
	return p
}

func gitQuiz() *domain.Quiz {
	return &domain.Quiz{PassPercent: 60, Questions: []domain.QuizQuestion{
		{Prompt: "What does `git add` do?", Options: []string{"Creates a commit", "Stages changes for the next commit", "Uploads to GitHub"}, Answer: 1},
		{Prompt: "Which command shares your commits with the remote?", Options: []string{"git push", "git fetch", "git stash"}, Answer: 0},
		{Prompt: "Where should new work happen?", Options: []string{"Directly on main", "On a feature branch", "In a fork of a fork"}, Answer: 1},
		{Prompt: "What does a pull request ask for?", Options: []string{"A review before merging", "A copy of the repo", "Admin access"}, Answer: 0},
		{Prompt: "What does `git status` show?", Options: []string{"Commit history", "Changed and staged files", "Remote branches"}, Answer: 1},
	}}
}

func reactQuiz() *domain.Quiz {
	return &domain.Quiz{PassPercent: 80, Questions: []domain.QuizQuestion{
		{Prompt: "Filtered products depend only on products and query. Where should the result usually live?", Options: []string{"Separate state updated by an effect", "A derived value during rendering", "A global variable"}, Answer: 1},
		{Prompt: "Why use a stable product id as a list key?", Options: []string{"To increase network speed", "To preserve the correct item's identity when order changes", "To sort automatically"}, Answer: 1},
		{Prompt: "Two state updates depend on the previous count. Which form avoids a stale value?", Options: []string{"setCount(count + 1) twice", "count++", "setCount(c => c + 1) twice"}, Answer: 2},
		{Prompt: "An old search response arrives after the latest search. What should the UI do?", Options: []string{"Always show the last response to arrive", "Ignore responses that do not belong to the active request", "Clear all filters"}, Answer: 1},
		{Prompt: "What is an effect cleanup useful for?", Options: []string{"Removing subscriptions or cancelling obsolete work", "Mutating props before rendering", "Replacing validation"}, Answer: 0},
	}}
}
