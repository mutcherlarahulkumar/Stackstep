package curriculum

import (
	"strings"
	"testing"
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
		})
	}
}
