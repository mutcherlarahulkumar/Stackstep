package help

import (
	"strings"
	"testing"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/ai"
)

func TestGuideParses(t *testing.T) {
	if len(Sections()) < 20 {
		t.Fatalf("only %d topics", len(Sections()))
	}
	seen := map[string]bool{}
	for _, s := range Sections() {
		if s.ID == "" || s.Body == "" || len(s.keywords) < 3 || seen[s.ID] {
			t.Fatalf("bad topic %+v", s)
		}
		seen[s.ID] = true
		// HB3: the guide only covers the student side.
		for _, w := range []string{"admin console", "flow builder", "task library"} {
			if strings.Contains(strings.ToLower(s.Body), w) {
				t.Fatalf("topic %s mentions %q", s.ID, w)
			}
		}
	}
}

func TestSearch(t *testing.T) {
	cases := map[string]string{
		"How do I hand in my pull request?":        "handing-in-work",
		"what are credits for the ai helper":       "ai-helper-and-credits",
		"when does day 1 start":                    "when-your-internship-starts",
		"how do I join a live class":               "live-classes",
		"install on iphone":                        "the-phone-app",
		"my payment screenshot was wrong":          "applying-and-paying",
		"how can recruiters verify my certificate": "certificates",
		"what is my seat number in attendance":     "attendance-and-your-forest",
	}
	for q, want := range cases {
		got := Search(q, 3)
		if len(got) == 0 || got[0].ID != want {
			ids := []string{}
			for _, s := range got {
				ids = append(ids, s.ID)
			}
			t.Errorf("%q → %v, want %s first", q, ids, want)
		}
	}
	if got := Search("zzzz qqqq", 3); len(got) != 0 {
		t.Fatalf("nonsense matched %v", got)
	}
}

func TestMessages(t *testing.T) {
	topics := Search("credits", 2)
	msgs := Messages("How many credits?", []ai.Message{{Role: "user", Content: "hi"}, {Role: "assistant", Content: "Hello"}}, topics)
	if len(msgs) != 4 || msgs[0].Role != "system" || msgs[3].Content != "How many credits?" {
		t.Fatalf("messages = %+v", msgs)
	}
	if !strings.Contains(msgs[0].Content, "AI helper and credits") || !strings.Contains(msgs[0].Content, "only know the student side") {
		t.Fatal("system prompt is missing the guide or the rules")
	}
	if Fallback(nil) == "" || Fallback(topics) != topics[0].Body {
		t.Fatal("fallback")
	}
}
