package ai

import (
	"errors"
	"strings"
	"testing"
)

func TestParseReviewDraft(t *testing.T) {
	d, err := ParseReviewDraft("```json\n{\"decision\":\"approve\",\"summary\":\"ok\",\"note\":\"Nice.\",\"rubric\":[true,false]}\n```", 2)
	if err != nil || !d.Approve || d.Note != "Nice." || len(d.Rubric) != 2 || d.Rubric[1] {
		t.Fatalf("draft = %+v, %v", d, err)
	}
	d, err = ParseReviewDraft(`{"decision":"request changes","summary":"","note":"Fix it.","rubric":"yes"}`, 2)
	if err != nil || d.Approve || d.Rubric != nil {
		t.Fatalf("loose draft = %+v, %v", d, err)
	}
	d, _ = ParseReviewDraft(`{"decision":"approve","note":"`+strings.Repeat("a", DraftNoteMax+50)+`"}`, 0)
	if n := len([]rune(d.Note)); n > DraftNoteMax {
		t.Fatalf("note not cut: %d", n)
	}
	for _, bad := range []string{"fine", `{"decision":"maybe","note":"x"}`, `{"decision":"approve","note":"  "}`} {
		if _, err := ParseReviewDraft(bad, 0); !errors.Is(err, ErrUnavailable) {
			t.Errorf("ParseReviewDraft(%q) err = %v", bad, err)
		}
	}
}

func TestReviewMessagesMarksMissingPR(t *testing.T) {
	m := ReviewMessages(ReviewInput{TaskType: "Feature", Title: "T", Rubric: []string{"A"}, URL: "https://github.com/a/b/pull/1", PRMissing: "private"})
	if c := m[1].Content; !strings.Contains(c, "1. A") || !strings.Contains(c, "not available (private)") {
		t.Fatalf("input = %q", c)
	}
	m = ReviewMessages(ReviewInput{TaskType: "Feature", Title: "T", PR: &ReviewPR{Title: "P", Diff: "+x", Truncated: true}})
	if c := m[1].Content; !strings.Contains(c, "CHECKLIST: none") || !strings.Contains(c, "diff cut here") {
		t.Fatalf("input = %q", c)
	}
}
