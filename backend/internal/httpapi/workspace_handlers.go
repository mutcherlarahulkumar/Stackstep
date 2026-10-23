package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

func (s *Server) me(c *gin.Context) {
	u := currentUser(c)
	e, err := s.workspace.OpenEnrollment(c.Request.Context(), u)
	if err != nil {
		s.fail(c, err)
		return
	}
	out := meDTO{User: toUser(u)}
	if e != nil {
		dto := toEnrollment(*e, s.clock.Now())
		out.Enrollment = &dto
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) myTasks(c *gin.Context) {
	tasks, err := s.workspace.StudentTasks(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": toTasks(tasks)})
}

func (s *Server) page(c *gin.Context) (limit int, cursorRaw string, err error) {
	limit, ok := queryInt(c, "limit", app.DefaultPageSize)
	if !ok {
		return 0, "", apperr.Validation(map[string]string{"limit": "Must be between 1 and 100."})
	}
	cursorRaw = c.Query("cursor")
	if _, fields := app.ValidatePage(limit, cursorRaw); len(fields) > 0 {
		return 0, "", apperr.Validation(fields)
	}
	return limit, cursorRaw, nil
}

func (s *Server) myMessages(c *gin.Context) {
	limit, raw, err := s.page(c)
	if err != nil {
		s.fail(c, err)
		return
	}
	cursor, _ := app.ValidatePage(limit, raw)
	msgs, next, err := s.workspace.Messages(c.Request.Context(), currentUser(c), cursor, limit)
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]messageDTO, len(msgs))
	for i, m := range msgs {
		items[i] = toMessage(m)
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "next_cursor": nullable(next)})
}

func (s *Server) sendMessage(c *gin.Context) {
	var req sendMessageReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	res, err := s.workspace.SendMessage(c.Request.Context(), currentUser(c), req.ClientID, req.Body)
	if err != nil {
		s.fail(c, err)
		return
	}
	status := http.StatusOK
	if res.Created {
		status = http.StatusCreated
	}
	c.JSON(status, toMessage(res.Message))
}

func (s *Server) transition(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req transitionReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	t, err := s.workspace.Transition(c.Request.Context(), currentUser(c), id, req.input())
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toTask(t))
}

func (s *Server) students(c *gin.Context) {
	limit, raw, err := s.page(c)
	if err != nil {
		s.fail(c, err)
		return
	}
	cursor, _ := app.ValidatePage(limit, raw)
	rows, next, err := s.workspace.Students(c.Request.Context(), currentUser(c), c.Query("q"), cursor, limit)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": toStudents(rows, s.clock.Now()), "next_cursor": nullable(next)})
}

func (s *Server) enrollmentTasks(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	tasks, e, err := s.workspace.StaffTasks(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"enrollment": toEnrollment(e, s.clock.Now()), "items": toTasks(tasks)})
}

func (s *Server) createTask(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req createTaskReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	t, err := s.workspace.CreateTask(c.Request.Context(), currentUser(c), id, domain.NewTaskInput{
		Type: req.Type, Title: req.Title, Brief: req.Brief, ScheduledFor: req.ScheduledFor, DueAt: req.DueAt,
	})
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toTask(t))
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
