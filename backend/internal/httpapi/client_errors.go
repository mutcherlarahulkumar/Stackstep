package httpapi

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

// clientErrorReq is a crash the web app reports so it shows up in the API's logs. Nothing is
// stored: it is one log line, so a problem a student hits can be found without asking them.
type clientErrorReq struct {
	Where   string `json:"where"`   // "page", "section: <name>", "unhandled"
	Message string `json:"message"` // error.message
	Stack   string `json:"stack"`   // first lines of error.stack
	Path    string `json:"path"`    // location.pathname
	Digest  string `json:"digest"`  // Next.js error digest, when present
	Release string `json:"release"` // web build id
}

const clientErrorMaxBytes = 16 << 10

func clip(s string, n int) string {
	s = strings.ToValidUTF8(s, "")
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n]) + "…"
}

func (s *Server) clientError(c *gin.Context) {
	var req clientErrorReq
	if err := decodeLimit(c, &req, clientErrorMaxBytes); err != nil {
		s.fail(c, err)
		return
	}
	s.log.Warn("client error",
		"where", clip(req.Where, 80),
		"message", clip(req.Message, 500),
		"path", clip(req.Path, 200),
		"digest", clip(req.Digest, 80),
		"release", clip(req.Release, 80),
		"stack", clip(req.Stack, 3000),
		"user_agent", clip(c.Request.UserAgent(), 300),
		"request_id", c.GetString(ctxRequestID),
	)
	c.Status(http.StatusNoContent)
}
