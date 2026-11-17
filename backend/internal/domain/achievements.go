package domain

import (
	"net/url"
	"sort"
	"strings"
	"time"
)

// Feature 30: streaks and badges. Everything here is worked out from what the student did;
// nothing is entered by hand.

// BadgeKey names a badge.
type BadgeKey string

const (
	BadgeFirstPR    BadgeKey = "first_pr"
	BadgeReviews5   BadgeKey = "reviews_5"
	BadgeOnTimeWeek BadgeKey = "on_time_week"
	BadgeStreak7    BadgeKey = "streak_7"
	BadgeStreak30   BadgeKey = "streak_30"
	BadgeBugHunter  BadgeKey = "bug_hunter"
	BadgeQuizAce    BadgeKey = "quiz_ace"
	BadgeTasks10    BadgeKey = "tasks_10"
	BadgeTasks25    BadgeKey = "tasks_25"
)

// BadgeDef describes a badge. Target is how far progress must get.
type BadgeDef struct {
	Key         BadgeKey
	Title       string
	Description string
	Target      int
}

// Badges lists every badge in display order.
var Badges = []BadgeDef{
	{BadgeFirstPR, "First PR merged", "A pull request you handed in was approved.", 1},
	{BadgeReviews5, "5 reviews passed", "Five hand-ins approved by a reviewer.", 5},
	{BadgeOnTimeWeek, "On time all week", "Two or more hand-ins in one week, none of them late.", 2},
	{BadgeStreak7, "7-day streak", "Worked on your internship seven days in a row.", 7},
	{BadgeStreak30, "30-day streak", "Worked on your internship thirty days in a row.", 30},
	{BadgeBugHunter, "Bug hunter", "Found every planted problem in a review lab pull request.", 1},
	{BadgeQuizAce, "Quiz ace", "Scored 100% on a quiz.", 1},
	{BadgeTasks10, "10 tasks done", "Finished ten tasks.", 10},
	{BadgeTasks25, "25 tasks done", "Finished twenty-five tasks.", 25},
}

// Valid reports whether k is a known badge.
func (k BadgeKey) Valid() bool {
	for _, b := range Badges {
		if b.Key == k {
			return true
		}
	}
	return false
}

// BadgeDefFor finds a badge's definition.
func BadgeDefFor(k BadgeKey) (BadgeDef, bool) {
	for _, b := range Badges {
		if b.Key == k {
			return b, true
		}
	}
	return BadgeDef{}, false
}

// DoneFact is a finished task as achievements see it.
type DoneFact struct {
	Type       TaskType
	DoneAt     time.Time
	URL        string // latest hand-in link, if any
	ByReviewer bool   // approved by staff (not finished by the student)
}

// HandInFact is a hand-in: the first submission, or the finish of a task without one.
type HandInFact struct {
	At    time.Time
	DueAt time.Time
}

// AchievementFacts is everything badges and streaks are worked out from.
type AchievementFacts struct {
	ActiveDays    []time.Time // local calendar dates (midnight UTC of the date) with any work
	Done          []DoneFact
	HandIns       []HandInFact
	QuizPerfectAt *time.Time
	LabPerfectAt  *time.Time
}

// Streak is the student's run of active days.
type Streak struct {
	Current     int
	Longest     int
	ActiveToday bool
}

// BadgeState is a badge with the student's progress. EarnedAt is nil until earned.
type BadgeState struct {
	Def      BadgeDef
	Progress int
	EarnedAt *time.Time
}

// Achievements is a student's streak and badges.
type Achievements struct {
	Streak Streak
	Badges []BadgeState
}

// IsPullRequestURL reports whether s links to a GitHub pull request.
func IsPullRequestURL(s string) bool {
	u, err := url.Parse(s)
	if err != nil || !strings.EqualFold(strings.TrimPrefix(u.Hostname(), "www."), "github.com") {
		return false
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	return len(parts) >= 4 && parts[2] == "pull" && parts[3] != ""
}

func dateOnly(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// ComputeStreak works out the current and longest run of consecutive active days. today is
// the student's local date; a run that ended yesterday is still current until today ends.
func ComputeStreak(days []time.Time, today time.Time) (Streak, map[int]time.Time) {
	set := map[time.Time]bool{}
	for _, d := range days {
		set[dateOnly(d)] = true
	}
	sorted := make([]time.Time, 0, len(set))
	for d := range set {
		sorted = append(sorted, d)
	}
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Before(sorted[j]) })
	reached := map[int]time.Time{} // run length -> first date it was reached
	s := Streak{}
	run := 0
	for i, d := range sorted {
		if i > 0 && sorted[i-1].AddDate(0, 0, 1).Equal(d) {
			run++
		} else {
			run = 1
		}
		if _, ok := reached[run]; !ok {
			reached[run] = d
		}
		s.Longest = max(s.Longest, run)
	}
	today = dateOnly(today)
	s.ActiveToday = set[today]
	start := today
	if !s.ActiveToday {
		start = today.AddDate(0, 0, -1)
	}
	for d := start; set[d]; d = d.AddDate(0, 0, -1) {
		s.Current++
	}
	return s, reached
}

// weekStart is the Monday of t's week.
func weekStart(t time.Time) time.Time {
	d := dateOnly(t)
	wd := (int(d.Weekday()) + 6) % 7
	return d.AddDate(0, 0, -wd)
}

// ComputeAchievements works out the streak and every badge. loc is the student's time zone.
func ComputeAchievements(f AchievementFacts, now time.Time, loc *time.Location) Achievements {
	local := now.In(loc)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
	streak, reached := ComputeStreak(f.ActiveDays, today)
	dayAt := func(d time.Time) *time.Time {
		t := time.Date(d.Year(), d.Month(), d.Day(), 12, 0, 0, 0, loc).UTC()
		return &t
	}

	done := append([]DoneFact(nil), f.Done...)
	sort.Slice(done, func(i, j int) bool { return done[i].DoneAt.Before(done[j].DoneAt) })
	var firstPR *time.Time
	var reviewed []time.Time
	for _, d := range done {
		if d.ByReviewer {
			reviewed = append(reviewed, d.DoneAt)
			if firstPR == nil && IsPullRequestURL(d.URL) {
				at := d.DoneAt
				firstPR = &at
			}
		}
	}
	nth := func(ts []time.Time, n int) *time.Time {
		if len(ts) < n {
			return nil
		}
		at := ts[n-1]
		return &at
	}
	doneAt := make([]time.Time, len(done))
	for i, d := range done {
		doneAt[i] = d.DoneAt
	}

	// On time all week: within one Monday-to-Sunday week, two on-time hand-ins before any late one.
	handIns := append([]HandInFact(nil), f.HandIns...)
	sort.Slice(handIns, func(i, j int) bool { return handIns[i].At.Before(handIns[j].At) })
	type week struct {
		onTime int
		late   bool
		earned *time.Time
	}
	weeks := map[time.Time]*week{}
	var onTimeAt *time.Time
	for _, h := range handIns {
		k := weekStart(h.At.In(loc))
		w := weeks[k]
		if w == nil {
			w = &week{}
			weeks[k] = w
		}
		if h.At.After(h.DueAt) {
			w.late = true
			continue
		}
		if w.late || w.earned != nil {
			continue
		}
		w.onTime++
		if w.onTime >= 2 {
			at := h.At
			w.earned = &at
			if onTimeAt == nil {
				onTimeAt = &at
			}
		}
	}
	thisWeek := 0
	if w := weeks[weekStart(local)]; w != nil && !w.late {
		thisWeek = w.onTime
	}

	streakAt := func(n int) *time.Time {
		if d, ok := reached[n]; ok {
			return dayAt(d)
		}
		return nil
	}
	flag := func(t *time.Time) int {
		if t != nil {
			return 1
		}
		return 0
	}
	out := Achievements{Streak: streak}
	for _, def := range Badges {
		st := BadgeState{Def: def}
		switch def.Key {
		case BadgeFirstPR:
			st.EarnedAt, st.Progress = firstPR, flag(firstPR)
		case BadgeReviews5:
			st.EarnedAt, st.Progress = nth(reviewed, 5), len(reviewed)
		case BadgeOnTimeWeek:
			st.EarnedAt, st.Progress = onTimeAt, thisWeek
		case BadgeStreak7:
			st.EarnedAt, st.Progress = streakAt(7), max(streak.Current, 0)
		case BadgeStreak30:
			st.EarnedAt, st.Progress = streakAt(30), streak.Current
		case BadgeBugHunter:
			st.EarnedAt, st.Progress = f.LabPerfectAt, flag(f.LabPerfectAt)
		case BadgeQuizAce:
			st.EarnedAt, st.Progress = f.QuizPerfectAt, flag(f.QuizPerfectAt)
		case BadgeTasks10:
			st.EarnedAt, st.Progress = nth(doneAt, 10), len(doneAt)
		case BadgeTasks25:
			st.EarnedAt, st.Progress = nth(doneAt, 25), len(doneAt)
		}
		if st.EarnedAt != nil {
			st.Progress = def.Target
		}
		st.Progress = min(st.Progress, def.Target)
		out.Badges = append(out.Badges, st)
	}
	return out
}

// BadgeCelebration is Stackbot's team room message for a newly earned badge.
func BadgeCelebration(def BadgeDef) string {
	return "🏅 You earned the “" + def.Title + "” badge. " + def.Description
}
