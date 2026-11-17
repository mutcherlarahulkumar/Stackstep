package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

type teamDTO struct {
	Members []personaDTO `json:"members"`
	Bot     teamBotDTO   `json:"bot"`
}

type teamBotDTO struct {
	Name  string `json:"name"`
	Title string `json:"title"`
}

// myTeam lists everyone in the student's team room.
func (s *Server) myTeam(c *gin.Context) {
	members, err := s.workspace.Team(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	out := teamDTO{Members: make([]personaDTO, len(members)), Bot: teamBotDTO{Name: domain.BotName, Title: domain.BotTitle}}
	for i, p := range members {
		out.Members[i] = toPersona(p)
	}
	c.JSON(http.StatusOK, out)
}
