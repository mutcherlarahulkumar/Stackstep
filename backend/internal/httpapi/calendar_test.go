package httpapi

import (
	"testing"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type calendarResp struct {
	StartDate string `json:"start_date"`
	Timezone  string `json:"timezone"`
	Items     []struct {
		Kind     string     `json:"kind"`
		Date     string     `json:"date"`
		Day      int        `json:"day"`
		Released bool       `json:"released"`
		TaskID   *uuid.UUID `json:"task_id"`
		Title    *string    `json:"title"`
	} `json:"items"`
}

// CA4–CA5: a student on a flow sees what's out and what's coming; nothing ahead can be
// opened; students without an internship get the usual error.
func TestStudentCalendar(t *testing.T) {
	e := newEnv(t)
	meera := e.login(seed.IndieStudentLogin)
	var cal calendarResp
	e.expect(e.do("GET", "/v1/me/calendar", meera, nil), 200).json(t, &cal)
	if cal.StartDate == "" || cal.Timezone == "" || len(cal.Items) == 0 {
		t.Fatalf("calendar = %+v", cal)
	}
	var tasks struct {
		Items []struct {
			ID uuid.UUID `json:"id"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", meera, nil), 200).json(t, &tasks)
	board := map[uuid.UUID]bool{}
	for _, tk := range tasks.Items {
		board[tk.ID] = true
	}
	ahead := 0
	for _, it := range cal.Items {
		switch {
		case it.Released && (it.TaskID == nil || !board[*it.TaskID]):
			t.Errorf("released entry not on the board: %+v", it)
		case !it.Released && it.TaskID != nil:
			t.Errorf("unreleased entry can be opened: %+v", it)
		case !it.Released && it.Kind == "surprise" && it.Title != nil:
			t.Errorf("surprise shows its title: %+v", it)
		case !it.Released:
			ahead++
		}
	}
	if ahead == 0 {
		t.Fatal("nothing scheduled ahead")
	}
	e.expectCode(e.do("GET", "/v1/me/calendar", e.login(seed.NoEnrollLogin), nil), 409, "no_active_enrollment")
}
