package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/ai"
)

type helpReq struct {
	Question string       `json:"question"`
	History  []ai.Message `json:"history"`
}

type helpTopicDTO struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

func (s *Server) askHelp(c *gin.Context) {
	var req helpReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	a, err := s.helper.AskHelp(c.Request.Context(), req.Question, req.History)
	if err != nil {
		s.fail(c, err)
		return
	}
	topics := make([]helpTopicDTO, len(a.Topics))
	for i, t := range a.Topics {
		topics[i] = helpTopicDTO{ID: t.ID, Title: t.Title}
	}
	c.JSON(http.StatusOK, gin.H{"answer": a.Answer, "ai": a.AI, "topics": topics})
}
