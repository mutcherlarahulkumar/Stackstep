package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func day(d int) time.Time { return time.Date(2026, 11, d, 0, 0, 0, 0, time.UTC) }

func TestComputeStreak(t *testing.T) {
	days := []time.Time{day(1), day(2), day(3), day(5), day(6), day(6)}
	s, reached := ComputeStreak(days, day(7))
	if s.Current != 2 || s.Longest != 3 || s.ActiveToday {
		t.Fatalf("streak = %+v", s)
	}
	if !reached[3].Equal(day(3)) {
		t.Fatalf("reached 3 on %v", reached[3])
	}
	if s, _ := ComputeStreak(days, day(8)); s.Current != 0 {
		t.Fatalf("a missed day ends the streak: %+v", s)
	}
	if s, _ := ComputeStreak(append(days, day(7)), day(7)); s.Current != 3 || !s.ActiveToday {
		t.Fatalf("today counts: %+v", s)
	}
	if s, _ := ComputeStreak(nil, day(7)); s.Current != 0 || s.Longest != 0 {
		t.Fatalf("empty: %+v", s)
	}
}

func badge(a Achievements, k BadgeKey) BadgeState {
	for _, b := range a.Badges {
		if b.Def.Key == k {
			return b
		}
	}
	panic(k)
}

func TestComputeAchievements(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Kolkata")
	at := func(d, h int) time.Time { return time.Date(2026, 11, d, h, 0, 0, 0, loc) }
	f := AchievementFacts{}
	for i := 1; i <= 5; i++ {
		f.Done = append(f.Done, DoneFact{Type: TaskFeature, DoneAt: at(i, 12), ByReviewer: true, URL: "https://github.com/asha/app/pull/" + string(rune('0'+i))})
	}
	f.Done = append(f.Done, DoneFact{Type: TaskStandup, DoneAt: at(6, 12)})
	// Week of Mon 2 Nov: two on time. Week of Mon 9 Nov: late first, then two on time.
	f.HandIns = []HandInFact{
		{At: at(3, 10), DueAt: at(3, 18)}, {At: at(4, 10), DueAt: at(4, 18)},
		{At: at(10, 20), DueAt: at(10, 18)}, {At: at(11, 10), DueAt: at(11, 18)}, {At: at(12, 10), DueAt: at(12, 18)},
	}
	for d := 1; d <= 7; d++ {
		f.ActiveDays = append(f.ActiveDays, day(d))
	}
	a := ComputeAchievements(f, at(12, 15), loc)
	if b := badge(a, BadgeFirstPR); b.EarnedAt == nil || !b.EarnedAt.Equal(at(1, 12)) {
		t.Fatalf("first PR = %+v", b)
	}
	if b := badge(a, BadgeReviews5); b.EarnedAt == nil || !b.EarnedAt.Equal(at(5, 12)) || b.Progress != 5 {
		t.Fatalf("reviews = %+v", b)
	}
	if b := badge(a, BadgeOnTimeWeek); b.EarnedAt == nil || !b.EarnedAt.Equal(at(4, 10)) || b.Progress != 2 {
		t.Fatalf("on time = %+v", b)
	}
	if b := badge(a, BadgeStreak7); b.EarnedAt == nil || b.Progress != 7 {
		t.Fatalf("streak 7 = %+v", b)
	}
	if b := badge(a, BadgeTasks10); b.EarnedAt != nil || b.Progress != 6 {
		t.Fatalf("tasks 10 = %+v", b)
	}
	if b := badge(a, BadgeQuizAce); b.EarnedAt != nil || b.Progress != 0 {
		t.Fatalf("quiz = %+v", b)
	}
	if len(a.Badges) != len(Badges) {
		t.Fatalf("%d badges", len(a.Badges))
	}
	// A late hand-in first in a week blocks that week, and no reviewer means no first PR.
	g := AchievementFacts{HandIns: []HandInFact{{At: at(10, 20), DueAt: at(10, 18)}, {At: at(11, 10), DueAt: at(11, 18)}, {At: at(12, 10), DueAt: at(12, 18)}},
		Done: []DoneFact{{DoneAt: at(1, 1), URL: "https://github.com/a/b/pull/1"}}}
	b := ComputeAchievements(g, at(12, 15), loc)
	if badge(b, BadgeOnTimeWeek).EarnedAt != nil || badge(b, BadgeOnTimeWeek).Progress != 0 || badge(b, BadgeFirstPR).EarnedAt != nil {
		t.Fatalf("%+v", b.Badges)
	}
}

func TestIsPullRequestURL(t *testing.T) {
	for s, want := range map[string]bool{
		"https://github.com/asha/app/pull/12":          true,
		"https://www.github.com/asha/app/pull/3/files": true,
		"https://github.com/asha/app/issues/12":        false,
		"https://gitlab.com/asha/app/pull/12":          false,
		"https://github.com/asha/app/pull/":            false,
	} {
		if IsPullRequestURL(s) != want {
			t.Fatalf("%s: want %v", s, want)
		}
	}
}

func TestMentioned(t *testing.T) {
	team := []Persona{{ID: uuid.New(), Name: "Sam Rivera", Title: "Team Lead"}, {ID: uuid.New(), Name: "Priya Sharma", Title: "Engineering Manager"}}
	cases := map[string]string{
		"@sam can you look":         "Sam Rivera",
		"hey @Priya, quick one":     "Priya Sharma",
		"@Priya Sharma and @sam":    "Priya Sharma",
		"ping @engineering manager": "Priya Sharma",
		"@samuel please":            "",
		"email sam@example.com":     "",
		"no mention at all":         "",
		"last word @SAM":            "Sam Rivera",
	}
	for msg, want := range cases {
		got := ""
		if p := Mentioned(msg, team); p != nil {
			got = p.Name
		}
		if got != want {
			t.Fatalf("%q: got %q want %q", msg, got, want)
		}
	}
	if w := TeamWelcome("Asha Rao", team); w == "" || TeamKudos("Asha Rao", "X") == "" {
		t.Fatal("empty copy")
	}
}
