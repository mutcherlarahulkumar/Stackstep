package curriculum

import (
	"strings"
	"testing"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

func TestEveryPublishedCurriculumTaskHasAnInternalGuide(t *testing.T) {
	templates, err := Templates()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range templates {
		t.Run(item.Key, func(t *testing.T) {
			spec, err := item.Spec()
			if err != nil {
				t.Fatal(err)
			}
			if len(spec.Content.Documents) == 0 {
				t.Fatal("task is missing its in-app guide")
			}
			body := spec.Content.Documents[0].Body
			if !strings.Contains(body, item.Brief) || !strings.Contains(body, "## After feedback") {
				t.Fatal("reader lost the assignment or its feedback loop")
			}
			if item.Key == "w1-flex-grid" && !strings.Contains(body, "grid-template-columns") {
				t.Fatal("reading still depends entirely on external references")
			}
			// RD1: every reading is an in-house lesson, not just a list of links (vivas,
			// interview prep and system design are briefs you present, not readings).
			if item.Type == domain.TaskDocReading && inHouseGuide(item.Key) == "" && !strings.Contains(item.Key, "viva") && item.Key != "fe-interview-prep" && item.Key != "fs-system-design" {
				t.Fatal("reading has no in-house lesson")
			}
			// RD2: links are credited, and only http(s) links are used.
			if len(item.Resources) > 0 && !strings.Contains(body, "## Credits and further reading") {
				t.Fatal("resources aren't credited")
			}
			for _, r := range item.Resources {
				if !strings.HasPrefix(r.URL, "https://") && !strings.HasPrefix(r.URL, "http://") {
					t.Fatalf("resource %q isn't a web link", r.URL)
				}
			}
		})
	}
}

func TestInHouseLessons(t *testing.T) {
	entries, err := guideFiles.ReadDir("guides")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) < 12 {
		t.Fatalf("only %d lessons", len(entries))
	}
	for _, e := range entries {
		b, _ := guideFiles.ReadFile("guides/" + e.Name())
		body := string(b)
		// RD3: each lesson opens with a title, has sections, and has no em dashes.
		if !strings.HasPrefix(body, "# ") || strings.Count(body, "\n## ") < 3 {
			t.Errorf("%s needs a title and at least three sections", e.Name())
		}
		if strings.Contains(body, "—") {
			t.Errorf("%s has an em dash", e.Name())
		}
	}
}
