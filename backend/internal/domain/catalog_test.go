package domain

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestParseClockTime(t *testing.T) {
	for in, want := range map[string]int{"00:00": 0, "10:30": 630, "23:59": 1439} {
		got, ok := ParseClockTime(in)
		if !ok || int(got) != want || got.String() != in {
			t.Errorf("%s → %d %v", in, got, ok)
		}
	}
	for _, bad := range []string{"24:00", "10:60", "9:00", "+1:00", "10-00", "ab:cd", "", "10:000"} {
		if _, ok := ParseClockTime(bad); ok {
			t.Errorf("%q accepted", bad)
		}
	}
}

func spec() TaskSpecInput {
	return TaskSpecInput{Type: TaskDSA, Title: "Two sum", PersonaID: DefaultPersonaID, ReviewMode: ReviewManual, ReleaseTime: "10:00", DueMinutes: 120}
}

func TestValidateTaskSpec(t *testing.T) {
	ok := func(uuid.UUID) bool { return true }
	cases := map[string]struct {
		mod   func(*TaskSpecInput)
		field string
	}{
		"valid":          {func(*TaskSpecInput) {}, ""},
		"blog type":      {func(i *TaskSpecInput) { i.Type = TaskBlog }, ""},
		"bad type":       {func(i *TaskSpecInput) { i.Type = "essay" }, "type"},
		"bad review":     {func(i *TaskSpecInput) { i.ReviewMode = "ai" }, "review_mode"},
		"no persona":     {func(i *TaskSpecInput) { i.PersonaID = uuid.Nil }, "persona_id"},
		"bad time":       {func(i *TaskSpecInput) { i.ReleaseTime = "25:00" }, "release_time"},
		"due too short":  {func(i *TaskSpecInput) { i.DueMinutes = 14 }, "due_minutes"},
		"due at max":     {func(i *TaskSpecInput) { i.DueMinutes = MaxDueMinutes }, ""},
		"due too long":   {func(i *TaskSpecInput) { i.DueMinutes = MaxDueMinutes + 1 }, "due_minutes"},
		"title too long": {func(i *TaskSpecInput) { i.Title = strings.Repeat("a", 121) }, "title"},
	}
	for name, tc := range cases {
		in := spec()
		tc.mod(&in)
		_, errs := ValidateTaskSpec(in, "items[2].", ok)
		if tc.field == "" && len(errs) > 0 {
			t.Errorf("%s: %v", name, errs)
		}
		if tc.field != "" {
			if _, found := errs["items[2]."+tc.field]; !found {
				t.Errorf("%s: want %s, got %v", name, tc.field, errs)
			}
		}
	}
	if _, errs := ValidateTaskSpec(spec(), "", func(uuid.UUID) bool { return false }); errs["persona_id"] == "" {
		t.Error("archived persona accepted")
	}
}

func TestValidateDraftItems(t *testing.T) {
	ok := func(uuid.UUID) bool { return true }
	items := []FlowItemInput{{Day: 1, Spec: spec()}, {Day: 1, Spec: spec()}, {Day: 2, Spec: spec()}}
	out, errs := ValidateDraftItems(items, 30, ok)
	if len(errs) > 0 || out[1].Position != 1 || out[2].Position != 0 {
		t.Fatalf("positions %+v errs %v", out, errs)
	}
	if _, errs := ValidateDraftItems([]FlowItemInput{{Day: 0, Spec: spec()}, {Day: 31, Spec: spec()}}, 30, ok); errs["items[0].day"] == "" || errs["items[1].day"] == "" {
		t.Fatalf("day bounds: %v", errs)
	}
	many := make([]FlowItemInput, MaxItemsPerDay+1)
	for i := range many {
		many[i] = FlowItemInput{Day: 3, Spec: spec()}
	}
	if _, errs := ValidateDraftItems(many, 30, ok); errs["items[10].day"] == "" {
		t.Fatalf("per-day cap: %v", errs)
	}
	if _, errs := ValidateDraftItems(make([]FlowItemInput, MaxItemsPerFlow+1), 30, ok); errs["items"] == "" {
		t.Fatal("flow cap not enforced")
	}
}

func TestValidateFlowAndPersona(t *testing.T) {
	if _, errs := ValidateFlow(FlowInput{Name: "React 30", Stream: "React", Days: 30}); len(errs) > 0 {
		t.Fatal(errs)
	}
	_, errs := ValidateFlow(FlowInput{Name: "ab", Stream: "x", Days: 45, Description: strings.Repeat("d", 501)})
	for _, f := range []string{"name", "stream", "days", "description"} {
		if errs[f] == "" {
			t.Errorf("missing %s error", f)
		}
	}
	_, errs = ValidatePersona(PersonaInput{Name: "P", Title: strings.Repeat("t", 61), Color: "pink"})
	for _, f := range []string{"name", "title", "color"} {
		if errs[f] == "" {
			t.Errorf("missing persona %s error", f)
		}
	}
}

func TestMaterialize(t *testing.T) {
	e := enrollment() // starts 2 Nov 2026, Asia/Kolkata, 30 days
	ist, _ := time.LoadLocation("Asia/Kolkata")
	at := func(day int, hh, mm int) time.Time {
		return time.Date(2026, 11, 1+day, hh, mm, 0, 0, ist).UTC()
	}
	item := func(day int, release string, due int) FlowItem {
		s := spec()
		s.ReleaseTime, s.DueMinutes = release, due
		v, _ := ValidateTaskSpec(s, "", func(uuid.UUID) bool { return true })
		return FlowItem{Day: day, Spec: v}
	}
	now := at(3, 12, 0) // day 3, noon IST
	rel, skipped := Materialize([]FlowItem{
		item(1, "10:00", 60),   // past day → skipped
		item(3, "09:00", 120),  // earlier today → now
		item(3, "15:00", 60),   // later today
		item(30, "23:50", 600), // last day: due clamped to the end, ≥ 15 min
		item(4, "10:00", 60),
	}, e, now)
	if skipped != 1 || len(rel) != 4 {
		t.Fatalf("skipped %d, released %d", skipped, len(rel))
	}
	if !rel[0].ScheduledFor.Equal(now) || !rel[0].DueAt.Equal(now.Add(2*time.Hour)) {
		t.Errorf("earlier-today item: %+v", rel[0])
	}
	if !rel[1].ScheduledFor.Equal(at(3, 15, 0)) {
		t.Errorf("later-today item: %v", rel[1].ScheduledFor)
	}
	last := rel[3]
	_, closes := e.Window()
	if !last.ScheduledFor.Equal(at(30, 23, 50)) || !last.DueAt.Equal(last.ScheduledFor.Add(15*time.Minute)) || !last.DueAt.After(closes.Add(-time.Minute)) {
		t.Errorf("last-day clamp: %+v (closes %v)", last, closes)
	}
}

func TestSelfReviewTransition(t *testing.T) {
	if !CanTransition(StatusInProgress, StatusDone, ActorStudent, ReviewSelf) {
		t.Error("self-review task can't be finished by the student")
	}
	if CanTransition(StatusInProgress, StatusDone, ActorStudent, ReviewManual) {
		t.Error("manual task finished without review")
	}
	if CanTransition(StatusTodo, StatusDone, ActorStudent, ReviewSelf) {
		t.Error("self-review task skipped in_progress")
	}
}
