package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

type creditEntryDTO struct {
	ID        int64               `json:"id"`
	Delta     int                 `json:"delta"`
	Reason    domain.CreditReason `json:"reason"`
	Note      string              `json:"note"`
	TaskID    *uuid.UUID          `json:"task_id"`
	CreatedAt time.Time           `json:"created_at"`
}

type walletDTO struct {
	Points struct {
		Total    int `json:"total"`
		Finished int `json:"finished"`
		OnTime   int `json:"on_time"`
	} `json:"points"`
	Credits struct {
		Balance int              `json:"balance"`
		History []creditEntryDTO `json:"history"`
	} `json:"credits"`
	AI struct {
		Enabled         bool       `json:"enabled"`
		DailyLimit      int        `json:"daily_limit"`
		UsedToday       int        `json:"used_today"`
		CostPerQuestion int        `json:"cost_per_question"`
		NextQuestionAt  *time.Time `json:"next_question_at"`
	} `json:"ai"`
}

func toWallet(w app.Wallet) walletDTO {
	var d walletDTO
	d.Points.Total, d.Points.Finished, d.Points.OnTime = w.Points.Points, w.Points.Finished, w.Points.OnTime
	d.Credits.Balance = w.Credits
	d.Credits.History = make([]creditEntryDTO, len(w.History))
	for i, h := range w.History {
		d.Credits.History[i] = creditEntryDTO{ID: h.ID, Delta: h.Delta, Reason: h.Reason, Note: h.Note, TaskID: h.TaskID, CreatedAt: h.CreatedAt.UTC()}
	}
	d.AI.Enabled, d.AI.DailyLimit, d.AI.UsedToday, d.AI.CostPerQuestion = w.AI.Enabled, w.AI.DailyLimit, w.AI.UsedToday, w.AI.CostPerQuestion
	if w.AI.NextQuestionAt != nil {
		t := w.AI.NextQuestionAt.UTC()
		d.AI.NextQuestionAt = &t
	}
	return d
}

type aiConversationDTO struct {
	ID        uuid.UUID  `json:"id"`
	TaskID    *uuid.UUID `json:"task_id"`
	Title     string     `json:"title"`
	FollowUps int        `json:"follow_ups"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

func toAIConversation(c store.AIConversation) aiConversationDTO {
	return aiConversationDTO{ID: c.ID, TaskID: c.TaskID, Title: c.Title, FollowUps: c.FollowUps, CreatedAt: c.CreatedAt.UTC(), UpdatedAt: c.UpdatedAt.UTC()}
}

type aiPartsDTO struct {
	Goal       string `json:"goal"`
	Tried      string `json:"tried"`
	Error      string `json:"error"`
	Code       string `json:"code"`
	TriedSince string `json:"tried_since"`
	Question   string `json:"question"`
}

type aiMessageDTO struct {
	ID        uuid.UUID   `json:"id"`
	Role      string      `json:"role"`
	Status    string      `json:"status"`
	Kind      string      `json:"kind"`
	Body      string      `json:"body"`
	Parts     *aiPartsDTO `json:"parts"`
	CreatedAt time.Time   `json:"created_at"`
}

type aiDetailDTO struct {
	Conversation  aiConversationDTO `json:"conversation"`
	Messages      []aiMessageDTO    `json:"messages"`
	FollowUpsLeft int               `json:"follow_ups_left"`
	FollowUpAt    *time.Time        `json:"follow_up_at"`
	Wallet        walletDTO         `json:"wallet"`
}

func toAIDetail(d app.ConversationDetail) aiDetailDTO {
	out := aiDetailDTO{Conversation: toAIConversation(d.Conversation), Messages: make([]aiMessageDTO, len(d.Messages)), FollowUpsLeft: d.FollowUpsLeft, Wallet: toWallet(d.Wallet)}
	for i, m := range d.Messages {
		out.Messages[i] = aiMessageDTO{ID: m.ID, Role: m.Role, Status: m.Status, Kind: m.Kind, Body: m.Body, CreatedAt: m.CreatedAt.UTC()}
		if p := m.Parts; p != nil {
			out.Messages[i].Parts = &aiPartsDTO{Goal: p.Goal, Tried: p.Tried, Error: p.Error, Code: p.Code, TriedSince: p.TriedSince, Question: p.Question}
		}
	}
	if d.FollowUpAt != nil {
		t := d.FollowUpAt.UTC()
		out.FollowUpAt = &t
	}
	return out
}

type askReq struct {
	ClientID uuid.UUID  `json:"client_id"`
	TaskID   *uuid.UUID `json:"task_id"`
	Goal     string     `json:"goal"`
	Tried    string     `json:"tried"`
	Error    string     `json:"error"`
	Code     string     `json:"code"`
}

type followUpReq struct {
	ClientID   uuid.UUID `json:"client_id"`
	TriedSince string    `json:"tried_since"`
	Body       string    `json:"body"`
}

type creditReq struct {
	Delta int    `json:"delta"`
	Note  string `json:"note"`
}

func (s *Server) myWallet(c *gin.Context) {
	w, err := s.helper.MyWallet(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toWallet(w))
}

func writeConversations(c *gin.Context, rows []store.AIConversation) {
	items := make([]aiConversationDTO, len(rows))
	for i, r := range rows {
		items[i] = toAIConversation(r)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) myAIConversations(c *gin.Context) {
	rows, err := s.helper.Conversations(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	writeConversations(c, rows)
}

func (s *Server) myAIConversation(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	d, err := s.helper.Conversation(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toAIDetail(d))
}

func (s *Server) askAI(c *gin.Context) {
	var req askReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	d, err := s.helper.Ask(c.Request.Context(), currentUser(c), req.ClientID, req.TaskID,
		domain.AIQuestion{Goal: req.Goal, Tried: req.Tried, Error: req.Error, Code: req.Code})
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toAIDetail(d))
}

func (s *Server) followUpAI(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req followUpReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	d, err := s.helper.FollowUp(c.Request.Context(), currentUser(c), id, req.ClientID, domain.AIFollowUp{TriedSince: req.TriedSince, Body: req.Body})
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toAIDetail(d))
}

func (s *Server) staffWallet(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	w, err := s.helper.StaffWallet(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toWallet(w))
}

func (s *Server) grantCredits(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req creditReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	w, err := s.helper.GrantCredits(c.Request.Context(), currentUser(c), id, req.Delta, req.Note)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toWallet(w))
}

func (s *Server) staffAIConversations(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	rows, err := s.helper.StaffConversations(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	writeConversations(c, rows)
}

func (s *Server) staffAIConversation(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	conv, err := pathUUID(c, "conversation")
	if err != nil {
		s.fail(c, err)
		return
	}
	d, err := s.helper.StaffConversation(c.Request.Context(), currentUser(c), id, conv)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toAIDetail(d))
}
