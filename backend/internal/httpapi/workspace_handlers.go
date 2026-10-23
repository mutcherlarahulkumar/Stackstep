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
	c.JSON(http.StatusOK, gin.H{"items": toTasks(tasks, false)})
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

func (s *Server) myThreads(c *gin.Context) {
	rows, err := s.workspace.Threads(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]threadDTO, len(rows))
	for i, t := range rows {
		items[i] = toThread(t, false)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) myMessages(c *gin.Context) {
	persona, err := pathUUID(c, "persona")
	if err != nil {
		s.fail(c, err)
		return
	}
	limit, raw, err := s.page(c)
	if err != nil {
		s.fail(c, err)
		return
	}
	cursor, _ := app.ValidatePage(limit, raw)
	msgs, next, err := s.workspace.Messages(c.Request.Context(), currentUser(c), persona, cursor, limit)
	if err != nil {
		s.fail(c, err)
		return
	}
	writeMessages(c, msgs, next)
}

func writeMessages(c *gin.Context, msgs []domain.Message, next string) {
	items := make([]messageDTO, len(msgs))
	for i, m := range msgs {
		items[i] = toMessage(m)
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "next_cursor": nullable(next)})
}

func (s *Server) sendMessage(c *gin.Context) {
	persona, err := pathUUID(c, "persona")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req sendMessageReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	res, err := s.workspace.SendMessage(c.Request.Context(), currentUser(c), persona, req.ClientID, req.Body)
	if err != nil {
		s.fail(c, err)
		return
	}
	writeSent(c, res)
}

func writeSent(c *gin.Context, res app.SendResult) {
	status := http.StatusOK
	if res.Created {
		status = http.StatusCreated
	}
	c.JSON(status, toMessage(res.Message))
}

func (s *Server) markRead(c *gin.Context) {
	persona, err := pathUUID(c, "persona")
	if err != nil {
		s.fail(c, err)
		return
	}
	if err := s.workspace.MarkRead(c.Request.Context(), currentUser(c), persona); err != nil {
		s.fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
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
	u := currentUser(c)
	t, err := s.workspace.Transition(c.Request.Context(), u, id, req.input())
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toTask(t, u.Role.IsStaff()))
}

func (s *Server) submitQuiz(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req quizReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	if req.Answers == nil {
		s.fail(c, apperr.Validation(map[string]string{"answers": "Answer the questions first."}))
		return
	}
	out, err := s.workspace.SubmitQuiz(c.Request.Context(), currentUser(c), id, req.ExpectedVersion, req.Answers)
	if err != nil {
		s.fail(c, err)
		return
	}
	r := out.Result
	left := domain.MaxQuizAttempts - r.Attempt
	if r.Passed {
		left = 0
	}
	c.JSON(http.StatusOK, gin.H{
		"task":   toTask(out.Task, false),
		"result": quizResultDTO{Attempt: r.Attempt, Score: r.Score, Passed: r.Passed, Correct: r.Correct, AttemptsLeft: left},
	})
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
	c.JSON(http.StatusOK, gin.H{"enrollment": toEnrollment(e, s.clock.Now()), "items": toTasks(tasks, true)})
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
	in := domain.NewTaskInput{Type: req.Type, Title: req.Title, Brief: req.Brief, ScheduledFor: req.ScheduledFor, DueAt: req.DueAt,
		ReviewMode: req.ReviewMode, Content: req.Content.input()}
	if req.PersonaID != nil {
		in.PersonaID = *req.PersonaID
	}
	t, err := s.workspace.CreateTask(c.Request.Context(), currentUser(c), id, in)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toTask(t, true))
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
