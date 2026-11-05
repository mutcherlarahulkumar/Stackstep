package guidedcurriculum

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

func TestCompleteCurriculumAndLessonQuality(t *testing.T) {
	entries, err := Entries(ImportPersonas())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 45 {
		t.Fatalf("got %d tasks, want complete reviewed 45-task edition", len(entries))
	}
	counts, effort := map[int]int{}, map[int]int{}
	seen := map[string]bool{}
	for _, entry := range entries {
		t.Run(entry.Spec.Title, func(t *testing.T) {
			if entry.Day < 1 || entry.Day > 30 {
				t.Fatalf("invalid day %d", entry.Day)
			}
			if seen[entry.Spec.Title] {
				t.Fatal("duplicate task title")
			}
			seen[entry.Spec.Title] = true
			if entry.EstimatedMinutes < 15 || entry.EstimatedMinutes > 120 {
				t.Fatalf("unbounded effort: %d", entry.EstimatedMinutes)
			}
			if len(entry.Spec.Content.Documents) != 1 {
				t.Fatal("each task must include its own in-app guide")
			}
			body := entry.Spec.Content.Documents[0].Body
			if len(strings.Fields(body)) < 150 {
				t.Fatal("lesson is missing enough actionable context")
			}
			for _, requirement := range []string{"**Estimated effort:**", "**Prerequisite:", "## Core work", "## Done checks", "## Hand-in", "Optional stretch"} {
				if !strings.Contains(body, requirement) {
					t.Errorf("lesson missing %q", requirement)
				}
			}
			if entry.Spec.ReviewMode == domain.ReviewManual && len(entry.Spec.Content.Rubric) < 3 {
				t.Error("reviewed tasks need observable review criteria")
			}
			if entry.Spec.Type == domain.TaskDSA && entry.Spec.Content.Practice == nil {
				t.Error("DSA task needs runnable example tests")
			}
			_, fields := domain.ValidateTaskSpec(domain.TaskSpecInput{Type: entry.Spec.Type, Title: entry.Spec.Title, Brief: entry.Spec.Brief, PersonaID: entry.Spec.PersonaID, ReviewMode: entry.Spec.ReviewMode, ReleaseTime: entry.Spec.ReleaseTime.String(), DueMinutes: entry.Spec.DueMinutes, ReleaseWindow: entry.Spec.ReleaseWindow, Content: entry.Spec.Content}, "", func(id uuid.UUID) bool { return id != uuid.Nil })
			if len(fields) != 0 {
				t.Errorf("invalid task spec: %v", fields)
			}
		})
		counts[entry.Day]++
		effort[entry.Day] += entry.EstimatedMinutes
	}
	for day := 1; day <= 30; day++ {
		if counts[day] < 1 || counts[day] > 3 {
			t.Errorf("day %d has %d tasks; want 1–3", day, counts[day])
		}
		if effort[day] > 150 {
			t.Errorf("day %d has overloaded estimated core effort %d", day, effort[day])
		}
	}
	for _, day := range []int{5, 7, 14, 21, 29} {
		if effort[day] > 60 {
			t.Errorf("consolidation day %d should remain lighter, got %d minutes", day, effort[day])
		}
	}
}

func TestFixtureCompatibilityAndIndependentValues(t *testing.T) {
	first, err := Entries(ImportPersonas())
	if err != nil {
		t.Fatal(err)
	}
	byTitle := map[string]Entry{}
	for _, entry := range first {
		byTitle[entry.Spec.Title] = entry
	}
	for title, day := range map[string]int{
		"Introduce yourself to the team": 1, "Set up Git and open your first PR": 1,
		"Two Sum": 2, "Build the portfolio hero section": 2, "Read MDN: Flexbox": 3,
		"Git basics quiz": 4, "Valid Anagram": 3, "Write: what I learned in week one": 3,
		"Projects grid with filters": 4, "Best Time to Buy and Sell Stock": 4, "Friday standup": 5,
	} {
		entry, ok := byTitle[title]
		if !ok || entry.Day != day {
			t.Errorf("fixture task %q moved or vanished", title)
		}
	}
	quiz := byTitle["Git basics quiz"].Spec.Content.Quiz
	if quiz == nil || len(quiz.Questions) != 5 || quiz.PassPercent != 60 {
		t.Fatal("existing quiz contract changed")
	}
	if byTitle["Two Sum"].Spec.Content.Practice.FunctionName != "twoSum" {
		t.Fatal("existing practice function changed")
	}
	first[0].Spec.Content.Documents[0].Body = "changed by caller"
	second, err := Entries(ImportPersonas())
	if err != nil {
		t.Fatal(err)
	}
	if second[0].Spec.Content.Documents[0].Body == "changed by caller" {
		t.Fatal("callers share mutable curriculum values")
	}
}
