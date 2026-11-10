package curriculum

import (
	"embed"
	neturl "net/url"
	"strings"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

//go:embed guides/*.md
var guideFiles embed.FS

// inHouseGuide is the lesson our team wrote for a task, if there is one. Lessons are named
// after the task key; the Flexbox and Grid one predates that and keeps its name.
func inHouseGuide(key string) string {
	name := key
	if key == "w1-flex-grid" {
		name = "flexbox-grid"
	}
	b, err := guideFiles.ReadFile("guides/" + name + ".md")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// credits lists the free resources a lesson draws on. The reader opens each in a new tab.
func credits(rs []domain.Resource) string {
	if len(rs) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\n## Credits and further reading\n\n")
	b.WriteString("Written in-house by the Stackstep team. It builds on these free resources, with thanks to their authors. Each link opens in a new tab.\n\n")
	for _, r := range rs {
		b.WriteString("- [" + r.Title + "](" + r.URL + ")")
		if u, err := neturl.Parse(r.URL); err == nil && u.Host != "" {
			b.WriteString(" · " + strings.TrimPrefix(u.Host, "www."))
		}
		b.WriteString("\n")
	}
	return b.String()
}

// Existing courses keep their assignments and schedules. Their complete brief is also
// available in the dedicated reader; syncing publishes a new snapshot for new assignments.
func (it Item) taskDocuments() []domain.TaskDocument {
	if len(it.Documents) > 0 {
		return append([]domain.TaskDocument{}, it.Documents...)
	}
	title := []rune("Guide: " + it.Title)
	if len(title) > domain.DocumentTitleMax {
		title = append(title[:domain.DocumentTitleMax-1], '…')
	}
	body := "# " + it.Title + "\n\n" + it.Brief
	if guide := inHouseGuide(it.Key); guide != "" {
		body = guide + "\n\n## Your assignment\n\n" + it.Brief
	}
	body += "\n\n## Work deliberately\n\n" +
		"1. Before coding, predict one normal result and one edge case. Write down what you expect.\n" +
		"2. Make the smallest change that lets you test that prediction. Keep required work separate from optional extensions.\n" +
		"3. Compare expected and actual behaviour. If blocked after a focused 25-minute attempt, ask your mentor with the reproduction, what you tried, and the result.\n" +
		"4. Hand in only checks you actually ran. Explain one decision in your own words and one point you want reviewed.\n"
	if it.Review == domain.ReviewManual && len(it.Rubric) > 0 {
		body += "\n## Review checklist\n\n"
		for _, criterion := range it.Rubric {
			body += "- [ ] " + criterion + "\n"
		}
	}
	body += credits(it.Resources)
	body += "\n## After feedback\n\nFix the highest-impact issue, repeat its check, and record what changed in your understanding. Ask when a review comment is unclear; do not add unrelated scope to make a small revision look larger.\n"
	return []domain.TaskDocument{{Title: string(title), Body: strings.TrimSpace(body) + "\n"}}
}
