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
	c.JSON(http.StatusOK, gin.H{"items": items, "overdue": late, "sla_hours": domain.ReviewSLAHours, "ai_drafts": s.drafter.Enabled()})
}

type reviewDraftDTO struct {
	Decision domain.ReviewDecision `json:"decision"`
	Summary  string `json:"summary"`
	Note     string `json:"note"`
	Rubric   []bool `json:"rubric"` // null when there is no rubric or no usable ticks
	ReadPR   bool   `json:"read_pr"`
}

func (s *Server) reviewDraft(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	if s.drafter == nil {
		s.fail(c, apperr.New(apperr.CodeNotConfigured, "AI review drafts aren't set up."))
		return
	}
	d, err := s.drafter.Draft(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	decision := domain.DecisionRequestChanges
	if d.Approve {
		decision = domain.DecisionApprove
	}
	c.JSON(http.StatusOK, reviewDraftDTO{Decision: decision, Summary: d.Summary, Note: d.Note, Rubric: d.Rubric, ReadPR: d.ReadPR})
}
