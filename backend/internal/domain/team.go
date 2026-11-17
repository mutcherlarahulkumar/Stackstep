package domain

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/google/uuid"
)

// TeamPersonaID holds each student's team room: one group conversation with the student and
// every persona. It is created by migration 0017, never listed with the other personas, and
// never owns tasks. Messages in it carry a speaker (the persona talking); none means Stackbot.
var TeamPersonaID = uuid.MustParse("00000000-0000-4000-8000-0000000000f0")

// Stackbot is the AI teammate who answers in the team room when nobody is mentioned.
const (
	BotName  = "Stackbot"
	BotTitle = "AI teammate"
)

// IsTeam reports whether p is the team room.
func (p Persona) IsTeam() bool { return p.ID == TeamPersonaID }

// Mentioned returns the first persona the message @mentions by first name, full name or
// title, or nil. Matching ignores case, and a mention must stand alone ("@sam," counts, "@samuel" doesn't).
func Mentioned(body string, team []Persona) *Persona {
	lower := strings.ToLower(body)
	best, bestAt := -1, len(lower)+1
	for i, p := range team {
		for _, alias := range mentionAliases(p) {
			at := mentionAt(lower, alias)
			if at >= 0 && at < bestAt {
				best, bestAt = i, at
			}
		}
	}
	if best < 0 {
		return nil
	}
	return &team[best]
}

func mentionAliases(p Persona) []string {
	out := []string{strings.ToLower(p.Name)}
	if f := strings.Fields(p.Name); len(f) > 1 {
		out = append(out, strings.ToLower(f[0]))
	}
	return append(out, strings.ToLower(p.Title))
}

// mentionAt finds "@alias" followed by a non-word character or the end, or returns -1.
func mentionAt(s, alias string) int {
	needle := "@" + alias
	from := 0
	for {
		i := strings.Index(s[from:], needle)
		if i < 0 {
			return -1
		}
		at := from + i
		end := at + len(needle)
		if end == len(s) {
			return at
		}
		r := []rune(s[end:])[0]
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			return at
		}
		from = at + 1
	}
}

// TeamWelcome is Stackbot's first message in a new team room.
func TeamWelcome(studentName string, team []Persona) string {
	first := strings.Fields(studentName)
	name := "there"
	if len(first) > 0 {
		name = first[0]
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Welcome to your team room, %s. Everyone you work with is in here.", name)
	for _, p := range team {
		fmt.Fprintf(&b, "\n• %s, %s", p.Name, p.Title)
	}
	b.WriteString("\n\nThis room is just you and your team. Ask anything. Start with @ and a name (like @")
	if len(team) > 0 {
		b.WriteString(strings.Fields(team[0].Name)[0])
	} else {
		b.WriteString("Sam")
	}
	b.WriteString(") to ask someone directly, or ask me. I'm Stackbot, the team's AI helper, and my replies are automatic.")
	return b.String()
}

// TeamKudos is what the reviewer's persona says in the team room when a task is approved.
func TeamKudos(studentName, title string) string {
	first := strings.Fields(studentName)
	name := "team"
	if len(first) > 0 {
		name = first[0]
	}
	return fmt.Sprintf("“%s” is approved. Nice work, %s! 🎉", title, name)
}
