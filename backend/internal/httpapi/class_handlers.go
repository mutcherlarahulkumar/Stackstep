package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/classroom"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/config"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

type classDTO struct {
	ID              uuid.UUID          `json:"id"`
	Title           string             `json:"title"`
	Description     string             `json:"description"`
	StartsAt        time.Time          `json:"starts_at"`
	EndsAt          time.Time          `json:"ends_at"`
	DurationMinutes int                `json:"duration_minutes"`
	Audience        domain.Audience    `json:"audience"`
	FlowID          *uuid.UUID         `json:"flow_id"`
	FlowName        *string            `json:"flow_name"`
	CohortID        *uuid.UUID         `json:"cohort_id"`
	CohortName      *string            `json:"cohort_name"`
	HostName        string             `json:"host_name"`
	Status          domain.ClassStatus `json:"status"`
	StartedAt       *time.Time         `json:"started_at"`
	EndedAt         *time.Time         `json:"ended_at"`
	InRoom          int                `json:"in_room"`
}

func (s *Server) toClass(c store.Class) classDTO {
	return classDTO{ID: c.ID, Title: c.Title, Description: c.Description, StartsAt: c.StartsAt.UTC(), EndsAt: domain.ClassEnds(c.StartsAt, c.DurationMinutes).UTC(),
		DurationMinutes: c.DurationMinutes, Audience: c.Audience, FlowID: c.FlowID, FlowName: c.FlowName, CohortID: c.CohortID, CohortName: c.CohortName,
		HostName: c.HostName, Status: c.Status, StartedAt: utcPtr(c.StartedAt), EndedAt: utcPtr(c.EndedAt), InRoom: s.classes.Live(c.ID)}
}

func (s *Server) classList(c *gin.Context, rows []store.Class, err error) {
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]classDTO, len(rows))
	for i, r := range rows {
		items[i] = s.toClass(r)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) staffClasses(c *gin.Context) {
	rows, err := s.workspace.StaffClasses(c.Request.Context(), currentUser(c))
	s.classList(c, rows, err)
}

func (s *Server) myClasses(c *gin.Context) {
	rows, err := s.workspace.StudentClasses(c.Request.Context(), currentUser(c))
	s.classList(c, rows, err)
}

type scheduleReq struct {
	Title           string          `json:"title"`
	Description     string          `json:"description"`
	StartsAt        *time.Time      `json:"starts_at"`
	DurationMinutes int             `json:"duration_minutes"`
	Audience        domain.Audience `json:"audience"`
	FlowID          *uuid.UUID      `json:"flow_id"`
	CohortID        *uuid.UUID      `json:"cohort_id"`
}

func (s *Server) scheduleClass(c *gin.Context) {
	var req scheduleReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	in := app.ScheduleInput{ClassInput: domain.ClassInput{Title: req.Title, Description: req.Description, DurationMinutes: req.DurationMinutes, Audience: req.Audience},
		FlowID: req.FlowID, CohortID: req.CohortID}
	if req.StartsAt != nil {
		in.StartsAt = *req.StartsAt
	}
	cl, err := s.workspace.ScheduleClass(c.Request.Context(), currentUser(c), in)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, s.toClass(cl))
}

func (s *Server) setClassStatus(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req struct {
		Status domain.ClassStatus `json:"status"`
	}
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	if req.Status != domain.ClassEnded && req.Status != domain.ClassCancelled {
		s.fail(c, apperr.Validation(map[string]string{"status": "End or cancel the class."}))
		return
	}
	cl, err := s.workspace.SetClassStatus(c.Request.Context(), currentUser(c), id, req.Status)
	if err != nil {
		s.fail(c, err)
		return
	}
	s.classes.End(id)
	c.JSON(http.StatusOK, s.toClass(cl))
}

// classDetailDTO is what a client needs to enter a room.
type classDetailDTO struct {
	classDTO
	Role       classroom.Role     `json:"role"`
	ICEServers []config.ICEServer `json:"ice_servers"`
}

func (s *Server) getClass(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	cl, role, err := s.workspace.ClassAccess(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, classDetailDTO{classDTO: s.toClass(cl), Role: role, ICEServers: s.cfg.ClassICEServers})
}

// Close codes for the class socket.
const (
	classCloseNotFound = websocket.StatusCode(4404)
	classCloseClosed   = websocket.StatusCode(4410) // cancelled or ended
	classCloseFull     = websocket.StatusCode(4429)
	classReadLimit     = 96 << 10
)

// classSocket is the room: authenticated like /v1/ws, but two-way. Hosts opening it put a
// scheduled class live; a host ending it ends the class for everyone.
func (s *Server) classSocket(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.AbortWithStatusJSON(http.StatusNotFound, errorBody{Error: errorPayload{Code: apperr.CodeNotFound, Message: "Not found."}})
		return
	}
	var token string
	offered := false
	for _, p := range strings.Split(c.GetHeader("Sec-WebSocket-Protocol"), ",") {
		p = strings.TrimSpace(p)
		if p == wsProtocol {
			offered = true
		}
		if t, ok := strings.CutPrefix(p, wsBearerPrefix); ok {
			token = t
		}
	}
	if !offered {
		c.AbortWithStatusJSON(http.StatusBadRequest, errorBody{Error: errorPayload{Code: "bad_request", Message: "Subprotocol stackstep.v1 is required."}})
		return
	}
	origins := make([]string, 0, len(s.cfg.AllowedOrigins))
	for _, o := range s.cfg.AllowedOrigins {
		if u, err := url.Parse(o); err == nil && u.Host != "" {
			origins = append(origins, u.Host)
		}
	}
	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{Subprotocols: []string{wsProtocol}, OriginPatterns: origins})
	if err != nil {
		s.log.WarnContext(c.Request.Context(), "class socket rejected", "origin", c.GetHeader("Origin"), "err", err)
		return
	}
	defer func() { _ = conn.CloseNow() }()
	conn.SetReadLimit(classReadLimit)

	ctx := c.Request.Context()
	u, err := s.userFromToken(ctx, token)
	if err != nil {
		_ = conn.Close(wsCloseAuth, "unauthenticated")
		return
	}
	cl, role, err := s.workspace.ClassAccess(ctx, u, id)
	if err != nil {
		_ = conn.Close(classCloseNotFound, "not invited")
		return
	}
	if app.ClassOpen(cl) != nil {
		_ = conn.Close(classCloseClosed, "class closed")
		return
	}
	if role == classroom.RoleHost && cl.Status == domain.ClassScheduled {
		if _, err := s.workspace.SetClassStatus(ctx, u, id, domain.ClassLive); err != nil {
			s.log.ErrorContext(ctx, "start class", "err", err)
		}
	}
	peer := classroom.NewPeer(u.ID, u.Name, u.GitHubLogin, u.AvatarURL, role)
	room, err := s.classes.Join(id, peer)
	if err != nil {
		code := classCloseClosed
		if errors.Is(err, classroom.ErrFull) {
			code = classCloseFull
		}
		_ = conn.Close(code, err.Error())
		return
	}
	defer s.classes.Leave(room, peer)

	// Writer: drains the outbox, pings to keep proxies from closing an idle room.
	done := make(chan struct{})
	go func() {
		defer close(done)
		ping := time.NewTicker(wsPingInterval)
		defer ping.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-peer.Closed():
				_ = conn.Close(websocket.StatusNormalClosure, "class ended")
				return
			case b := <-peer.Outbox():
				wctx, cancel := context.WithTimeout(ctx, wsWriteTimeout)
				err := conn.Write(wctx, websocket.MessageText, b)
				cancel()
				if err != nil {
					return
				}
			case <-ping.C:
				pctx, cancel := context.WithTimeout(ctx, wsWriteTimeout)
				err := conn.Ping(pctx)
				cancel()
				if err != nil {
					return
				}
			}
		}
	}()

	for {
		typ, b, err := conn.Read(ctx)
		if err != nil {
			break
		}
		if typ != websocket.MessageText {
			continue
		}
		var in classroom.In
		if json.Unmarshal(b, &in) != nil {
			continue
		}
		if in.Type == "promote" {
			s.promote(ctx, u, cl, room, peer, in.ID)
			continue
		}
		if room.Handle(peer, in, s.clock.Now()) {
			if _, err := s.workspace.SetClassStatus(ctx, u, id, domain.ClassEnded); err != nil {
				s.log.ErrorContext(ctx, "end class", "err", err)
			}
			s.classes.End(id)
			break
		}
	}
	<-done
}

// promote mails a chat line or question to every invitee as an announcement (hosts only).
func (s *Server) promote(ctx context.Context, u domain.User, cl store.Class, room *classroom.Room, peer *classroom.Peer, id string) {
	reply := func(o classroom.Out) {
		b, _ := json.Marshal(o)
		select {
		case <-peer.Closed():
		default:
			room.Send(peer, b)
		}
	}
	if peer.Role != classroom.RoleHost {
		reply(classroom.Out{Type: "error", Code: "forbidden", ErrorText: classroom.ErrNotAllowed.Error()})
		return
	}
	p, ok := room.TextOf(id)
	if !ok {
		reply(classroom.Out{Type: "error", Code: "not_found", ErrorText: "That message is no longer in the room."})
		return
	}
	a, err := s.workspace.Promote(ctx, u, cl, p)
	if err != nil {
		msg := "Couldn't send it as an announcement."
		if ae, ok := apperr.As(err); ok {
			msg = ae.Message
			for _, v := range ae.Fields {
				msg = v
			}
		}
		reply(classroom.Out{Type: "error", Code: "promote_failed", ErrorText: msg})
		return
	}
	reply(classroom.Out{Type: "promoted", Name: a.Subject, Code: id})
}
