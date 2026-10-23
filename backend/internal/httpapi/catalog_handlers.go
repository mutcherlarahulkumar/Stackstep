package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

func boolQuery(c *gin.Context, key string) (bool, error) {
	switch c.Query(key) {
	case "", "false":
		return false, nil
	case "true":
		return true, nil
	}
	return false, apperr.Validation(map[string]string{key: "Must be true or false."})
}

func optionalUUIDQuery(c *gin.Context, key string) (*uuid.UUID, error) {
	raw := c.Query(key)
	if raw == "" {
		return nil, nil
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil, apperr.Validation(map[string]string{key: "Must be a UUID."})
	}
	return &id, nil
}

// ---- Personas ----

func (s *Server) listPersonas(c *gin.Context) {
	archived, err := boolQuery(c, "include_archived")
	if err != nil {
		s.fail(c, err)
		return
	}
	ps, err := s.workspace.Personas(c.Request.Context(), currentUser(c), archived)
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]personaDTO, len(ps))
	for i, p := range ps {
		items[i] = toPersona(p)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) createPersona(c *gin.Context) {
	var req personaReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	p, err := s.workspace.CreatePersona(c.Request.Context(), currentUser(c), req.input())
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toPersona(p))
}

func (s *Server) updatePersona(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req personaReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	p, err := s.workspace.UpdatePersona(c.Request.Context(), currentUser(c), id, req.input(), req.Archived, req.ExpectedVersion)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toPersona(p))
}

// ---- Task library ----

func (s *Server) listTemplates(c *gin.Context) {
	limit, raw, err := s.page(c)
	if err != nil {
		s.fail(c, err)
		return
	}
	cursor, _ := decodeCursorUnchecked(raw)
	archived, err := boolQuery(c, "include_archived")
	if err != nil {
		s.fail(c, err)
		return
	}
	persona, err := optionalUUIDQuery(c, "persona_id")
	if err != nil {
		s.fail(c, err)
		return
	}
	f := store.TemplateFilter{Search: c.Query("q"), PersonaID: persona, IncludeArchived: archived, After: cursor, Limit: limit}
	if t := c.Query("type"); t != "" {
		tt := domain.TaskType(t)
		if !tt.Valid() {
			s.fail(c, apperr.Validation(map[string]string{"type": "Unknown task type."}))
			return
		}
		f.Type = &tt
	}
	rows, next, err := s.workspace.Templates(c.Request.Context(), currentUser(c), f)
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]templateDTO, len(rows))
	for i, t := range rows {
		items[i] = toTemplate(t)
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "next_cursor": nullable(next)})
}

func decodeCursorUnchecked(raw string) (*store.Cursor, error) { return store.DecodeCursor(raw) }

func (s *Server) createTemplate(c *gin.Context) {
	var req templateReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	t, err := s.workspace.CreateTemplate(c.Request.Context(), currentUser(c), req.spec())
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toTemplate(t))
}

func (s *Server) updateTemplate(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req templateReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	t, err := s.workspace.UpdateTemplate(c.Request.Context(), currentUser(c), id, req.spec(), req.Archived, req.ExpectedVersion)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toTemplate(t))
}

// ---- Flows ----

func (s *Server) listFlows(c *gin.Context) {
	archived, err := boolQuery(c, "include_archived")
	if err != nil {
		s.fail(c, err)
		return
	}
	rows, err := s.workspace.Flows(c.Request.Context(), currentUser(c), archived)
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]flowSummaryDTO, len(rows))
	for i, r := range rows {
		d := flowSummaryDTO{flowDTO: toFlow(r.Flow), HasDraft: r.HasDraft, TaskCount: r.ItemCount, ActiveStudents: r.EnrolledActive}
		if r.Published != nil {
			n := r.Published.Number
			d.PublishedVersion = &n
		}
		items[i] = d
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) getFlow(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	d, err := s.workspace.Flow(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toFlowDetail(d))
}

func (s *Server) createFlow(c *gin.Context) {
	var req flowReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	d, err := s.workspace.CreateFlow(c.Request.Context(), currentUser(c), req.input())
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toFlowDetail(d))
}

func (s *Server) updateFlow(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req flowReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	f, err := s.workspace.UpdateFlow(c.Request.Context(), currentUser(c), id, req.input(), req.Archived, req.ExpectedVersion)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toFlow(f))
}

func (s *Server) saveDraft(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req draftReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	if req.Items == nil {
		s.fail(c, apperr.Validation(map[string]string{"items": "Send the full list of tasks (it may be empty)."}))
		return
	}
	items := make([]domain.FlowItemInput, len(req.Items))
	for i, it := range req.Items {
		items[i] = domain.FlowItemInput{Day: it.Day, TemplateID: it.TemplateID, Spec: it.input()}
	}
	d, err := s.workspace.SaveDraft(c.Request.Context(), currentUser(c), id, req.ExpectedRevision, items)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toFlowDetail(d))
}

func (s *Server) publishFlow(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req publishReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	d, err := s.workspace.PublishFlow(c.Request.Context(), currentUser(c), id, req.ExpectedRevision)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toFlowDetail(d))
}

func (s *Server) duplicateFlow(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req duplicateReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	d, err := s.workspace.DuplicateFlow(c.Request.Context(), currentUser(c), id, domain.FlowInput{Name: req.Name, Stream: req.Stream})
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toFlowDetail(d))
}

func (s *Server) bulkAssign(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req bulkAssignReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	results, err := s.workspace.BulkAssign(c.Request.Context(), currentUser(c), id, req.EnrollmentIDs)
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]assignResultDTO, len(results))
	for i, r := range results {
		items[i] = toAssignResult(r)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) assignEnrollmentFlow(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req assignFlowReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	r, err := s.workspace.AssignFlow(c.Request.Context(), currentUser(c), id, req.FlowID)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toAssignResult(r))
}
