package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

func (s *Server) staffThreads(c *gin.Context) {
	limit, raw, err := s.page(c)
	if err != nil {
		s.fail(c, err)
		return
	}
	cursor, _ := app.ValidatePage(limit, raw)
	persona, err := optionalUUIDQuery(c, "persona_id")
	if err != nil {
		s.fail(c, err)
		return
	}
	unread, err := boolQuery(c, "unread")
	if err != nil {
		s.fail(c, err)
		return
	}
	rows, next, err := s.workspace.StaffThreads(c.Request.Context(), currentUser(c), store.StaffThreadFilter{
		PersonaID: persona, Unread: unread, After: cursor, Limit: limit,
	})
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]staffThreadDTO, len(rows))
	for i, t := range rows {
		items[i] = staffThreadDTO{threadDTO: toThread(t, true), Student: threadStudentDTO{Name: t.StudentName, GitHubLogin: t.StudentLogin, AvatarURL: t.StudentAvatar}}
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "next_cursor": nullable(next)})
}

func (s *Server) staffMessages(c *gin.Context) {
	enrollment, err := pathUUID(c, "enrollment")
	if err != nil {
		s.fail(c, err)
		return
	}
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
	msgs, next, err := s.workspace.StaffMessages(c.Request.Context(), currentUser(c), enrollment, persona, cursor, limit)
	if err != nil {
		s.fail(c, err)
		return
	}
	writeMessages(c, msgs, next)
}

func (s *Server) staffSend(c *gin.Context) {
	enrollment, err := pathUUID(c, "enrollment")
	if err != nil {
		s.fail(c, err)
		return
	}
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
	res, err := s.workspace.StaffSend(c.Request.Context(), currentUser(c), enrollment, persona, req.ClientID, req.Body)
	if err != nil {
		s.fail(c, err)
		return
	}
	writeSent(c, res)
}

func (s *Server) staffMarkRead(c *gin.Context) {
	enrollment, err := pathUUID(c, "enrollment")
	if err != nil {
		s.fail(c, err)
		return
	}
	persona, err := pathUUID(c, "persona")
	if err != nil {
		s.fail(c, err)
		return
	}
	if err := s.workspace.StaffMarkRead(c.Request.Context(), currentUser(c), enrollment, persona); err != nil {
		s.fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) broadcast(c *gin.Context) {
	var req broadcastReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	results, err := s.workspace.Broadcast(c.Request.Context(), currentUser(c), req.PersonaID, req.ClientID, req.EnrollmentIDs, req.Body)
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]broadcastResultDTO, len(results))
	sent := 0
	for i, r := range results {
		items[i] = broadcastResultDTO{EnrollmentID: r.EnrollmentID, Sent: r.Sent, Error: toItemError(r.Err)}
		if r.Sent {
			sent++
		}
	}
	c.JSON(http.StatusOK, gin.H{"sent": sent, "items": items})
}
