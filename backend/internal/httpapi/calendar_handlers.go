package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

type calendarEntryDTO struct {
	Kind      domain.CalendarKind `json:"kind"`
	Date      string              `json:"date"`
	Day       int                 `json:"day"`
	At        *time.Time          `json:"at"`
	DueAt     *time.Time          `json:"due_at"`
	Released  bool                `json:"released"`
	TaskID    *uuid.UUID          `json:"task_id"`
	Title     *string             `json:"title"`
	TaskType  *domain.TaskType    `json:"task_type"`
	Status    *domain.TaskStatus  `json:"status"`
	PersonaID *uuid.UUID          `json:"persona_id"`
	ClassID   *uuid.UUID          `json:"class_id"`
}

func utcPtr(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

func (s *Server) myCalendar(c *gin.Context) {
	cal, err := s.workspace.StudentCalendar(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]calendarEntryDTO, len(cal.Entries))
	for i, e := range cal.Entries {
		items[i] = calendarEntryDTO{
			Kind: e.Kind, Date: e.Date.Format(time.DateOnly), Day: e.Day, At: utcPtr(e.At), DueAt: utcPtr(e.DueAt), Released: e.Released,
			TaskID: e.TaskID, Title: e.Title, TaskType: e.TaskType, Status: e.Status, PersonaID: e.PersonaID, ClassID: e.ClassID,
		}
	}
	en := cal.Enrollment
	c.JSON(http.StatusOK, gin.H{
		"start_date": en.StartDate.Format(time.DateOnly), "end_date": en.EndDate.Format(time.DateOnly), "timezone": en.Timezone, "items": items,
	})
}
