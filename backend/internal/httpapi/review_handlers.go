package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

type reviewItemDTO struct {
	Task         taskDTO `json:"task"`
	Student      userDTO `json:"student"`
	WaitingHours int     `json:"waiting_hours"`
	Overdue      bool    `json:"overdue"` // waiting longer than sla_hours
}

func (s *Server) reviews(c *gin.Context) {
	var persona *uuid.UUID
	if raw := c.Query("persona_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			s.fail(c, apperr.Validation(map[string]string{"persona_id": "Not a valid id."}))
			return
		}
		persona = &id
	}
	rows, err := s.workspace.Reviews(c.Request.Context(), currentUser(c), persona)
	if err != nil {
		s.fail(c, err)
		return
	}
	now := s.clock.Now()
	items := make([]reviewItemDTO, len(rows))
	late := 0
	for i, r := range rows {
		since := r.Task.UpdatedAt
		if sub := r.Task.Submission; sub != nil {
			since = sub.SubmittedAt
		}
		h := int(now.Sub(since) / time.Hour)
		items[i] = reviewItemDTO{Task: toTask(r.Task, true), Student: toUser(r.Student), WaitingHours: max(h, 0), Overdue: h >= domain.ReviewSLAHours}
		if items[i].Overdue {
			late++
		}
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "overdue": late, "sla_hours": domain.ReviewSLAHours})
}
