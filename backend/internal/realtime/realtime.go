// Package realtime fans out workspace events to connected WebSocket clients.
//
// Writers call pg_notify inside their transaction; every API instance LISTENs, loads the
// changed row and pushes it to the sockets it holds for that enrollment. A separate
// deliverer marks delayed lead replies delivered once they are due, which triggers the same path.
package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/clock"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Subscriber receives encoded frames. Send must not block; slow subscribers are dropped.
type Subscriber struct {
	ch     chan []byte
	closed chan struct{}
	once   sync.Once
}

// Frames returns the subscriber's outbound frames.
func (s *Subscriber) Frames() <-chan []byte { return s.ch }

// Closed is closed when the hub drops the subscriber.
func (s *Subscriber) Closed() <-chan struct{} { return s.closed }

func (s *Subscriber) close() { s.once.Do(func() { close(s.closed) }) }

// Topic names a fan-out group: one student's enrollment, or a staff scope.
type Topic string

// EnrollmentTopic is where one student's sockets listen.
func EnrollmentTopic(id uuid.UUID) Topic { return Topic("enr:" + id.String()) }

// StaffTopic is where staff sockets listen: all students (nil) or one college's.
func StaffTopic(college *uuid.UUID) Topic {
	if college == nil {
		return "staff:all"
	}
	return Topic("staff:college:" + college.String())
}

// Hub tracks subscribers per topic.
type Hub struct {
	mu   sync.RWMutex
	subs map[Topic]map[*Subscriber]struct{}
}

// NewHub returns an empty hub.
func NewHub() *Hub { return &Hub{subs: map[Topic]map[*Subscriber]struct{}{}} }

// MaxSubscribersPerTopic bounds sockets per student (tabs + devices). Staff topics are shared
// by every admin in a scope, so they get a larger cap.
const (
	MaxSubscribersPerTopic = 10
	MaxStaffSubscribers    = 200
)

// Subscribe registers a subscriber, or returns false when the topic is at capacity.
func (h *Hub) Subscribe(topic Topic) (*Subscriber, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.subs[topic]
	limit := MaxSubscribersPerTopic
	if len(topic) > 6 && topic[:6] == "staff:" {
		limit = MaxStaffSubscribers
	}
	if len(set) >= limit {
		return nil, false
	}
	if set == nil {
		set = map[*Subscriber]struct{}{}
		h.subs[topic] = set
	}
	s := &Subscriber{ch: make(chan []byte, 64), closed: make(chan struct{})}
	set[s] = struct{}{}
	return s, true
}

// Unsubscribe removes a subscriber.
func (h *Hub) Unsubscribe(topic Topic, s *Subscriber) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.subs[topic]; set != nil {
		delete(set, s)
		if len(set) == 0 {
			delete(h.subs, topic)
		}
	}
	s.close()
}

// Publish sends frame to every subscriber of the topic, dropping any whose buffer is full.
func (h *Hub) Publish(topic Topic, frame []byte) {
	h.mu.RLock()
	var slow []*Subscriber
	for s := range h.subs[topic] {
		select {
		case s.ch <- frame:
		default:
			slow = append(slow, s)
		}
	}
	h.mu.RUnlock()
	for _, s := range slow {
		h.Unsubscribe(topic, s) // client reconnects and refetches
	}
}

// Has reports whether anyone on this instance listens to the topic.
func (h *Hub) Has(topic Topic) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs[topic]) > 0
}

// HasStaff reports whether any staff socket is connected on this instance.
func (h *Hub) HasStaff() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for t := range h.subs {
		if len(t) > 6 && t[:6] == "staff:" {
			return true
		}
	}
	return false
}

// Delivery is one encoded frame and the topics it goes to.
type Delivery struct {
	Frame  []byte
	Topics []Topic
}

// Encoder turns a store event into deliveries (none to skip it).
type Encoder func(ctx context.Context, ev store.Event) ([]Delivery, error)

// Listen LISTENs on the event channel until ctx ends, reconnecting with backoff.
func Listen(ctx context.Context, pool *pgxpool.Pool, hub *Hub, encode Encoder, log *slog.Logger) {
	backoff := time.Second
	for ctx.Err() == nil {
		err := listenOnce(ctx, pool, hub, encode, log)
		if ctx.Err() != nil {
			return
		}
		log.Warn("realtime listener stopped; reconnecting", "err", err, "in", backoff)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, 30*time.Second)
	}
}

func listenOnce(ctx context.Context, pool *pgxpool.Pool, hub *Hub, encode Encoder, log *slog.Logger) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "LISTEN "+store.EventChannel); err != nil {
		return err
	}
	for {
		n, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return err
		}
		var ev store.Event
		if err := json.Unmarshal([]byte(n.Payload), &ev); err != nil {
			log.Error("bad notification payload", "err", err)
			continue
		}
		if !hub.Has(EnrollmentTopic(ev.EnrollmentID)) && !hub.HasStaff() {
			continue
		}
		deliveries, err := encode(ctx, ev)
		if err != nil {
			log.Error("encode realtime event", "err", err, "kind", ev.Kind, "id", ev.ID)
			continue
		}
		for _, d := range deliveries {
			for _, t := range d.Topics {
				hub.Publish(t, d.Frame)
			}
		}
	}
}

// Deliver marks due delayed messages as delivered every interval until ctx ends.
func Deliver(ctx context.Context, s *store.Store, clk clock.Clock, interval time.Duration, log *slog.Logger) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		for {
			var n int
			err := s.Tx(ctx, func(q store.Q) error {
				var err error
				n, err = store.DeliverDue(ctx, q, clk.Now(), 200)
				return err
			})
			if err != nil {
				if ctx.Err() == nil {
					log.Error("deliver due messages", "err", err)
				}
				break
			}
			if n < 200 {
				break
			}
		}
	}
}
