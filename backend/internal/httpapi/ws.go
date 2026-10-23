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

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/realtime"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

const (
	wsProtocol      = "stackstep.v1"
	wsBearerPrefix  = "bearer."
	wsCloseAuth     = websocket.StatusCode(4401)
	wsCloseNoEnroll = websocket.StatusCode(4409)
	wsCloseCapacity = websocket.StatusCode(4429)
	wsPingInterval  = 25 * time.Second
	wsWriteTimeout  = 10 * time.Second
)

// websocket authenticates with a bearer token sent as a subprotocol, because browsers
// can't set headers on WebSocket requests and query strings end up in logs.
func (s *Server) websocket(c *gin.Context) {
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
	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		Subprotocols:   []string{wsProtocol},
		OriginPatterns: origins,
	})
	if err != nil {
		return // Accept already wrote the HTTP error
	}
	defer func() { _ = conn.CloseNow() }()

	ctx := c.Request.Context()
	u, err := s.userFromToken(ctx, token)
	if err != nil {
		_ = conn.Close(wsCloseAuth, "unauthenticated")
		return
	}
	var topic realtime.Topic
	switch {
	case u.Role.IsStaff():
		college := u.CollegeID
		if u.Role == domain.RoleAdmin {
			college = nil
		} else if college == nil {
			_ = conn.Close(wsCloseNoEnroll, "no college")
			return
		}
		topic = realtime.StaffTopic(college)
	default:
		e, err := s.workspace.OpenEnrollment(ctx, u)
		if err != nil || e == nil {
			_ = conn.Close(wsCloseNoEnroll, "no active enrollment")
			return
		}
		topic = realtime.EnrollmentTopic(e.ID)
	}
	sub, ok := s.hub.Subscribe(topic)
	if !ok {
		_ = conn.Close(wsCloseCapacity, "too many connections")
		return
	}
	defer s.hub.Unsubscribe(topic, sub)

	ctx = conn.CloseRead(ctx) // we never read client frames; this handles pings and close
	write := func(b []byte) error {
		wctx, cancel := context.WithTimeout(ctx, wsWriteTimeout)
		defer cancel()
		return conn.Write(wctx, websocket.MessageText, b)
	}
	ready, _ := json.Marshal(frame{Type: frameReady})
	if err := write(ready); err != nil {
		return
	}

	ping := time.NewTicker(wsPingInterval)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-sub.Closed():
			_ = conn.Close(websocket.StatusTryAgainLater, "slow consumer")
			return
		case b := <-sub.Frames():
			if err := write(b); err != nil {
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
}

// EncodeEvent turns a NOTIFY event into frames. Messages go to the student and to staff in
// the student's scope; tasks only to the student. Messages not yet due and tasks not yet
// visible are skipped; the deliverer and the announcement message carry them later.
func (s *Server) EncodeEvent(ctx context.Context, ev store.Event) ([]realtime.Delivery, error) {
	now := s.clock.Now()
	switch ev.Kind {
	case store.EventMessage:
		m, err := store.GetMessage(ctx, s.store.Pool, ev.ID)
		if errors.Is(err, store.ErrNotFound) || err == nil && m.SentAt.After(now) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		dto := toMessage(m)
		b, err := json.Marshal(frame{Type: frameMessage, Message: &dto})
		if err != nil {
			return nil, err
		}
		topics := []realtime.Topic{realtime.EnrollmentTopic(m.EnrollmentID), realtime.StaffTopic(nil)}
		if e, err := store.GetEnrollment(ctx, s.store.Pool, m.EnrollmentID); err == nil && e.CollegeID != nil {
			topics = append(topics, realtime.StaffTopic(e.CollegeID))
		}
		return []realtime.Delivery{{Frame: b, Topics: topics}}, nil
	case store.EventTask:
		t, err := store.GetTask(ctx, s.store.Pool, ev.ID)
		if errors.Is(err, store.ErrNotFound) || err == nil && t.ScheduledFor.After(now) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		dto := toTask(t)
		b, err := json.Marshal(frame{Type: frameTask, Task: &dto})
		if err != nil {
			return nil, err
		}
		return []realtime.Delivery{{Frame: b, Topics: []realtime.Topic{realtime.EnrollmentTopic(t.EnrollmentID)}}}, nil
	}
	return nil, nil
}
