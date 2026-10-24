package domain

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// Rubric bounds (mirrored in clients).
const (
	MaxRubricItems   = 8
	RubricItemMinLen = 3
	RubricItemMaxLen = 120
)

// validateRubric normalizes a task's review checklist. Only admin-reviewed, non-quiz tasks
// have one: a quiz grades itself and a self-check has no reviewer to tick it.
func validateRubric(items []string, typ TaskType, review ReviewMode, key string) ([]string, map[string]string) {
	errs := map[string]string{}
	if len(items) == 0 {
		return nil, errs
	}
	switch {
	case typ == TaskQuiz:
		errs[key] = "Quizzes grade themselves, so they don't have a rubric."
		return nil, errs
	case review != ReviewManual:
		errs[key] = "Rubrics are for tasks an admin reviews."
		return nil, errs
	case len(items) > MaxRubricItems:
		errs[key] = fmt.Sprintf("Add at most %d criteria.", MaxRubricItems)
	}
	out := make([]string, 0, len(items))
	seen := map[string]bool{}
	for i, raw := range items {
		if i >= MaxRubricItems {
			break
		}
		k := fmt.Sprintf("%s[%d]", key, i)
		s := NormalizeText(raw)
		n := utf8.RuneCountInString(s)
		switch {
		case n < RubricItemMinLen:
			errs[k] = "Write the criterion (at least 3 characters)."
		case n > RubricItemMaxLen:
			errs[k] = fmt.Sprintf("Keep each criterion under %d characters.", RubricItemMaxLen)
		case hasBadControl(s, false):
			errs[k] = "This criterion contains characters that can't be displayed."
		case seen[strings.ToLower(s)]:
			errs[k] = "Each criterion must be different."
		}
		seen[strings.ToLower(s)] = true
		out = append(out, s)
	}
	return out, errs
}

// ValidateRubricResult checks a reviewer's ticks against the task's rubric when approving or
// requesting changes. Tasks without a rubric take no result.
func ValidateRubricResult(rubric []string, result []bool, to TaskStatus) string {
	reviewing := to == StatusDone || to == StatusChangesRequested
	switch {
	case len(rubric) == 0 && len(result) > 0:
		return "This task has no rubric."
	case len(rubric) == 0 || !reviewing:
		return ""
	case len(result) != len(rubric):
		return fmt.Sprintf("Tick the %d rubric criteria that were met (leave the others unticked).", len(rubric))
	}
	return ""
}

// RubricSummary is "3 of 4 criteria met".
func RubricSummary(result []bool) string {
	met := 0
	for _, b := range result {
		if b {
			met++
		}
	}
	return fmt.Sprintf("%d of %d criteria met", met, len(result))
}
