package domain

import (
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// DefaultPersonaID is the "Team Lead" persona created by migration 0002.
var DefaultPersonaID = uuid.MustParse("00000000-0000-4000-8000-000000000001")

// PersonaColor is the accent used for a persona's avatar in every client.
type PersonaColor string

// AllPersonaColors lists every allowed color.
var AllPersonaColors = []PersonaColor{"violet", "blue", "emerald", "amber", "rose", "cyan", "slate"}

// Valid reports whether c is a known color.
func (c PersonaColor) Valid() bool {
	for _, k := range AllPersonaColors {
		if k == c {
			return true
		}
	}
	return false
}

// Persona is a manager identity students chat with; admins speak as it.
type Persona struct {
	ID         uuid.UUID
	Name       string
	Title      string
	Color      PersonaColor
	AutoReply  bool
	Version    int
	ArchivedAt *time.Time
}

// PersonaInput is a create/update request before validation.
type PersonaInput struct {
	Name      string
	Title     string
	Color     PersonaColor
	AutoReply bool
}

// ValidatePersona normalizes and checks a persona.
func ValidatePersona(in PersonaInput) (PersonaInput, map[string]string) {
	errs := map[string]string{}
	out := PersonaInput{Name: NormalizeText(in.Name), Title: NormalizeText(in.Title), Color: in.Color, AutoReply: in.AutoReply}
	if msg := lineBetween(out.Name, 2, 60, "Name"); msg != "" {
		errs["name"] = msg
	}
	if msg := lineBetween(out.Title, 2, 60, "Title"); msg != "" {
		errs["title"] = msg
	}
	if !out.Color.Valid() {
		errs["color"] = "Choose a color."
	}
	return out, errs
}

// ClockTime is a local wall-clock time as minutes after midnight (0–1439).
type ClockTime int

// ParseClockTime parses "HH:MM" (24-hour).
func ParseClockTime(s string) (ClockTime, bool) {
	if len(s) != 5 || s[2] != ':' {
		return 0, false
	}
	digit := func(c byte) (int, bool) { return int(c - '0'), c >= '0' && c <= '9' }
	h1, ok1 := digit(s[0])
	h2, ok2 := digit(s[1])
	m1, ok3 := digit(s[3])
	m2, ok4 := digit(s[4])
	h, m := h1*10+h2, m1*10+m2
	if !ok1 || !ok2 || !ok3 || !ok4 || h > 23 || m > 59 {
		return 0, false
	}
	return ClockTime(h*60 + m), true
}

// String formats as "HH:MM".
func (c ClockTime) String() string { return fmt.Sprintf("%02d:%02d", int(c)/60, int(c)%60) }

// Bounds for the catalog (mirrored in clients).
const (
	MinDueMinutes     = 15
	MaxDueMinutes     = 7 * 24 * 60
	MaxItemsPerDay    = 10
	MaxItemsPerFlow   = 600
	MaxBroadcastUsers = 500
	MaxBulkAssign     = 500
)

// TaskSpec is the content shared by templates and flow items.
type TaskSpec struct {
	Type        TaskType
	Title       string
	Brief       string
	PersonaID   uuid.UUID
	ReviewMode  ReviewMode
	ReleaseTime ClockTime
	DueMinutes  int
}

// TaskSpecInput is a TaskSpec before validation; ReleaseTime is "HH:MM".
type TaskSpecInput struct {
	Type        TaskType
	Title       string
	Brief       string
	PersonaID   uuid.UUID
	ReviewMode  ReviewMode
	ReleaseTime string
	DueMinutes  int
}

// ValidateTaskSpec checks a template or flow item. Field keys are prefixed with prefix
// (e.g. "items[3].") so clients can point at the right row.
func ValidateTaskSpec(in TaskSpecInput, prefix string, personaOK func(uuid.UUID) bool) (TaskSpec, map[string]string) {
	errs := map[string]string{}
	out := TaskSpec{Type: in.Type, Title: NormalizeText(in.Title), Brief: strings.TrimSpace(in.Brief), PersonaID: in.PersonaID, ReviewMode: in.ReviewMode, DueMinutes: in.DueMinutes}
	if !in.Type.Valid() {
		errs[prefix+"type"] = "Choose a task type."
	}
	if msg := checkLine(out.Title, TitleMinLen, TitleMaxLen, "Title"); msg != "" {
		errs[prefix+"title"] = msg
	}
	if utf8.RuneCountInString(out.Brief) > BriefMaxLen {
		errs[prefix+"brief"] = "Brief can be at most 8000 characters."
	} else if hasBadControl(out.Brief, true) {
		errs[prefix+"brief"] = "Brief contains characters that can't be displayed."
	}
	if in.PersonaID == uuid.Nil || !personaOK(in.PersonaID) {
		errs[prefix+"persona_id"] = "Choose an active persona."
	}
	if !in.ReviewMode.Valid() {
		errs[prefix+"review_mode"] = "Choose who finishes this task."
	}
	t, ok := ParseClockTime(in.ReleaseTime)
	if !ok {
		errs[prefix+"release_time"] = "Use a 24-hour time like 10:00."
	}
	out.ReleaseTime = t
	if in.DueMinutes < MinDueMinutes || in.DueMinutes > MaxDueMinutes {
		errs[prefix+"due_minutes"] = "Time to finish must be between 15 minutes and 7 days."
	}
	return out, errs
}

// Template is a reusable task in the library.
type Template struct {
	ID         uuid.UUID
	Spec       TaskSpec
	Version    int
	ArchivedAt *time.Time
	UpdatedAt  time.Time
}

// FlowInput is a flow's metadata before validation.
type FlowInput struct {
	Name        string
	Stream      string
	Description string
	Days        int
}

// ValidateFlow checks flow metadata.
func ValidateFlow(in FlowInput) (FlowInput, map[string]string) {
	errs := map[string]string{}
	out := FlowInput{Name: NormalizeText(in.Name), Stream: NormalizeText(in.Stream), Description: strings.TrimSpace(in.Description), Days: in.Days}
	if msg := lineBetween(out.Name, 3, 80, "Name"); msg != "" {
		errs["name"] = msg
	}
	if msg := lineBetween(out.Stream, 2, 40, "Stream"); msg != "" {
		errs["stream"] = msg
	}
	if utf8.RuneCountInString(out.Description) > 500 {
		errs["description"] = "Description can be at most 500 characters."
	} else if hasBadControl(out.Description, true) {
		errs["description"] = "Description contains characters that can't be displayed."
	}
	if out.Days != 30 && out.Days != 60 {
		errs["days"] = "A flow lasts 30 or 60 days."
	}
	return out, errs
}

// Flow is a course for one stream.
type Flow struct {
	ID          uuid.UUID
	Name        string
	Stream      string
	Description string
	Days        int
	Version     int
	ArchivedAt  *time.Time
	UpdatedAt   time.Time
}

// FlowVersionStatus is the lifecycle of a version.
type FlowVersionStatus string

const (
	FlowDraft     FlowVersionStatus = "draft"
	FlowPublished FlowVersionStatus = "published"
	FlowRetired   FlowVersionStatus = "retired"
)

// Valid reports whether s is a known status.
func (s FlowVersionStatus) Valid() bool {
	return s == FlowDraft || s == FlowPublished || s == FlowRetired
}

// FlowVersion is one frozen (or draft) set of items.
type FlowVersion struct {
	ID          uuid.UUID
	FlowID      uuid.UUID
	Number      int
	Status      FlowVersionStatus
	Revision    int
	PublishedAt *time.Time
	Items       []FlowItem
}

// FlowItem is a task placed on a day of a flow.
type FlowItem struct {
	ID         uuid.UUID
	Day        int
	Position   int
	TemplateID *uuid.UUID
	Spec       TaskSpec
}

// FlowItemInput is one row of a draft save.
type FlowItemInput struct {
	Day        int
	TemplateID *uuid.UUID
	Spec       TaskSpecInput
}

// ValidateDraftItems checks a whole draft item list and assigns positions within each day
// in the order given. It returns field errors keyed like "items[3].day".
func ValidateDraftItems(items []FlowItemInput, flowDays int, personaOK func(uuid.UUID) bool) ([]FlowItem, map[string]string) {
	errs := map[string]string{}
	if len(items) > MaxItemsPerFlow {
		errs["items"] = fmt.Sprintf("A flow can hold at most %d tasks.", MaxItemsPerFlow)
		return nil, errs
	}
	perDay := map[int]int{}
	out := make([]FlowItem, 0, len(items))
	for i, in := range items {
		prefix := fmt.Sprintf("items[%d].", i)
		if in.Day < 1 || in.Day > flowDays {
			errs[prefix+"day"] = fmt.Sprintf("Pick a day from 1 to %d.", flowDays)
		}
		spec, fieldErrs := ValidateTaskSpec(in.Spec, prefix, personaOK)
		for k, v := range fieldErrs {
			errs[k] = v
		}
		pos := perDay[in.Day]
		perDay[in.Day] = pos + 1
		if pos == MaxItemsPerDay {
			errs[prefix+"day"] = fmt.Sprintf("A day can hold at most %d tasks.", MaxItemsPerDay)
		}
		out = append(out, FlowItem{Day: in.Day, Position: pos, TemplateID: in.TemplateID, Spec: spec})
	}
	return out, errs
}

// Release is when a flow item becomes a visible task.
type Release struct {
	Item         FlowItem
	ScheduledFor time.Time
	DueAt        time.Time
}

// Materialize turns flow items into dated tasks for an enrollment, starting from now.
// Days already over are skipped; items earlier today are released now; due times are
// kept inside the internship (but always at least MinDueMinutes after release).
func Materialize(items []FlowItem, e Enrollment, now time.Time) (releases []Release, skipped int) {
	loc := e.Location()
	_, closes := e.Window()
	todayY, todayM, todayD := now.In(loc).Date()
	sy, sm, sd := e.StartDate.Date()
	sorted := append([]FlowItem(nil), items...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Day != sorted[j].Day {
			return sorted[i].Day < sorted[j].Day
		}
		return sorted[i].Position < sorted[j].Position
	})
	for _, it := range sorted {
		date := time.Date(sy, sm, sd+it.Day-1, 0, 0, 0, 0, loc)
		release := date.Add(time.Duration(it.Spec.ReleaseTime) * time.Minute).UTC()
		y, m, d := date.Date()
		isToday := y == todayY && m == todayM && d == todayD
		switch {
		case !release.Before(closes):
			skipped++
			continue
		case release.Before(now) && !isToday:
			skipped++
			continue
		case release.Before(now):
			release = now
		}
		due := release.Add(time.Duration(it.Spec.DueMinutes) * time.Minute)
		if due.After(closes) {
			due = closes
		}
		if minDue := release.Add(MinDueMinutes * time.Minute); due.Before(minDue) {
			due = minDue
		}
		releases = append(releases, Release{Item: it, ScheduledFor: release, DueAt: due})
	}
	return releases, skipped
}

func lineBetween(s string, minLen, maxLen int, label string) string {
	n := utf8.RuneCountInString(s)
	switch {
	case n == 0:
		return label + " is required."
	case n < minLen:
		return fmt.Sprintf("%s must be at least %d characters.", label, minLen)
	case n > maxLen:
		return fmt.Sprintf("%s can be at most %d characters.", label, maxLen)
	case hasBadControl(s, false):
		return label + " contains characters that can't be displayed."
	}
	return ""
}
