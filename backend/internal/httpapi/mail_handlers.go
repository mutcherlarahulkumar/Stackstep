package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// mailPreview is how much of a body the mailbox list shows.
const mailPreview = 160

type mailDTO struct {
	ID             uuid.UUID       `json:"id"`
	Kind           domain.MailKind `json:"kind"`
	Subject        string          `json:"subject"`
	Preview        string          `json:"preview"`
	Body           *string         `json:"body"`
	FromName       string          `json:"from_name"`
	PersonaID      *uuid.UUID      `json:"persona_id"`
	AnnouncementID *uuid.UUID      `json:"announcement_id"`
	TaskID         *uuid.UUID      `json:"task_id"`
	ClassID        *uuid.UUID      `json:"class_id"`
	CreatedAt      time.Time       `json:"created_at"`
	Read           bool            `json:"read"`
}

// preview is the body's first characters as plain text: Markdown markers at the start of a
// line (headings, quotes, list bullets, callout tags) and inline emphasis are dropped.
func preview(body string) string {
	words := []string{}
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimLeft(line, "#> ")
		line = strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(line, "- "), "* "), "+ ")
		if strings.HasPrefix(line, "[!") {
			if k := strings.Index(line, "]"); k > 0 {
				line = strings.TrimSpace(line[k+1:])
			}
		}
		line = strings.NewReplacer("**", "", "__", "", "`", "", "*", "", "_", "", "[", "", "]", "").Replace(line)
		words = append(words, strings.Fields(line)...)
	}
	out := []rune(strings.Join(words, " "))
	if len(out) > mailPreview {
		return string(out[:mailPreview]) + "…"
	}
	return string(out)
}

func toMail(m store.Mail, withBody bool) mailDTO {
	d := mailDTO{ID: m.ID, Kind: m.Kind, Subject: m.Subject, Preview: preview(m.Body), FromName: m.FromName, PersonaID: m.PersonaID,
		AnnouncementID: m.AnnouncementID, TaskID: m.TaskID, ClassID: m.ClassID, CreatedAt: m.CreatedAt.UTC(), Read: m.ReadAt != nil}
	if withBody {
		b := m.Body
		d.Body = &b
	}
	return d
}

func (s *Server) myMail(c *gin.Context) {
	limit, raw, err := s.page(c)
	if err != nil {
		s.fail(c, err)
		return
	}
	cur, _ := app.ValidatePage(limit, raw)
	p, err := s.workspace.MyMail(c.Request.Context(), currentUser(c), cur, limit)
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]mailDTO, len(p.Items))
	for i, m := range p.Items {
		items[i] = toMail(m, false)
	}
	var next *string
	if p.Next != "" {
		next = &p.Next
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "next_cursor": next, "unread": p.Unread})
}

func (s *Server) openMail(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	m, err := s.workspace.OpenMail(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toMail(m, true))
}

type announcementDTO struct {
	ID         uuid.UUID       `json:"id"`
	Subject    string          `json:"subject"`
	Body       string          `json:"body"`
	Audience   domain.Audience `json:"audience"`
	FlowID     *uuid.UUID      `json:"flow_id"`
	FlowName   *string         `json:"flow_name"`
	CohortID   *uuid.UUID      `json:"cohort_id"`
	CohortName *string         `json:"cohort_name"`
	SentByName string          `json:"sent_by_name"`
	Recipients int             `json:"recipients"`
	Reads      int             `json:"reads"`
	CreatedAt  time.Time       `json:"created_at"`
}

func toAnnouncement(a store.Announcement) announcementDTO {
	return announcementDTO{ID: a.ID, Subject: a.Subject, Body: a.Body, Audience: a.Audience, FlowID: a.FlowID, FlowName: a.FlowName,
		CohortID: a.CohortID, CohortName: a.CohortName, SentByName: a.SentByName, Recipients: a.Recipients, Reads: a.Reads, CreatedAt: a.CreatedAt.UTC()}
}

type announceReq struct {
	Subject  string          `json:"subject"`
	Body     string          `json:"body"`
	Audience domain.Audience `json:"audience"`
	FlowID   *uuid.UUID      `json:"flow_id"`
	CohortID *uuid.UUID      `json:"cohort_id"`
	ClassID  *uuid.UUID      `json:"class_id"`
}

func (s *Server) announce(c *gin.Context) {
	var req announceReq
	if err := decodeLimit(c, &req, MaxContentBodyBytes); err != nil {
		s.fail(c, err)
		return
	}
	a, err := s.workspace.Announce(c.Request.Context(), currentUser(c), app.AnnouncementInput{
		Subject: req.Subject, Body: req.Body, Audience: req.Audience, FlowID: req.FlowID, CohortID: req.CohortID, ClassID: req.ClassID,
	})
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toAnnouncement(a))
}

func (s *Server) listAnnouncements(c *gin.Context) {
	rows, err := s.workspace.Announcements(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]announcementDTO, len(rows))
	for i, a := range rows {
		items[i] = toAnnouncement(a)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}
