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

// Hub tracks subscribers per enrollment.
type Hub struct {
	mu   sync.RWMutex
	subs map[uuid.UUID]map[*Subscriber]struct{}
}

// NewHub returns an empty hub.
func NewHub() *Hub { return &Hub{subs: map[uuid.UUID]map[*Subscriber]struct{}{}} }

// MaxSubscribersPerEnrollment bounds sockets per student (tabs + devices).
const MaxSubscribersPerEnrollment = 10

// Subscribe registers a subscriber, or returns false when the enrollment is at capacity.
func (h *Hub) Subscribe(enrollmentID uuid.UUID) (*Subscriber, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.subs[enrollmentID]
	if len(set) >= MaxSubscribersPerEnrollment {
		return nil, false
	}
	if set == nil {
		set = map[*Subscriber]struct{}{}
		h.subs[enrollmentID] = set
	}
	s := &Subscriber{ch: make(chan []byte, 64), closed: make(chan struct{})}
	set[s] = struct{}{}
	return s, true
}

// Unsubscribe removes a subscriber.
func (h *Hub) Unsubscribe(enrollmentID uuid.UUID, s *Subscriber) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.subs[enrollmentID]; set != nil {
		delete(set, s)
		if len(set) == 0 {
			delete(h.subs, enrollmentID)
		}
	}
	s.close()
}

// Publish sends frame to every subscriber of the enrollment, dropping any whose buffer is full.
func (h *Hub) Publish(enrollmentID uuid.UUID, frame []byte) {
	h.mu.RLock()
	var slow []*Subscriber
	for s := range h.subs[enrollmentID] {
		select {
		case s.ch <- frame:
		default:
			slow = append(slow, s)
		}
	}
	h.mu.RUnlock()
	for _, s := range slow {
		h.Unsubscribe(enrollmentID, s) // client reconnects and refetches
	}
}

// Has reports whether anyone on this instance listens to the enrollment.
func (h *Hub) Has(enrollmentID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs[enrollmentID]) > 0
}

// Encoder turns a store event into a client frame, or nil to skip it.
type Encoder func(ctx context.Context, ev store.Event) ([]byte, error)

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
		if !hub.Has(ev.EnrollmentID) {
			continue
		}
		frame, err := encode(ctx, ev)
		if err != nil {
			log.Error("encode realtime event", "err", err, "kind", ev.Kind, "id", ev.ID)
			continue
		}
		if frame != nil {
			hub.Publish(ev.EnrollmentID, frame)
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
