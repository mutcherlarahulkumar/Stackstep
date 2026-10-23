// Package store is the Postgres data-access layer. Every query takes "now" from the caller
// so time-based rules stay deterministic in tests.
package store

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a row does not exist (or is outside the caller's scope).
var ErrNotFound = errors.New("not found")

// Q is satisfied by both the pool and a transaction.
type Q interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Store wraps the pool.
type Store struct{ Pool *pgxpool.Pool }

// New returns a Store.
func New(pool *pgxpool.Pool) *Store { return &Store{Pool: pool} }

// Tx runs fn in a transaction, committing on nil error.
func (s *Store) Tx(ctx context.Context, fn func(q Q) error) error {
	return pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error { return fn(tx) })
}

// EventChannel is the LISTEN/NOTIFY channel for realtime fan-out.
const EventChannel = "stackstep_events"

// EventKind names what changed.
type EventKind string

const (
	EventMessage EventKind = "message"
	EventTask    EventKind = "task"
)

// Event is the NOTIFY payload. Listeners load the row by ID.
type Event struct {
	Kind         EventKind `json:"kind"`
	ID           uuid.UUID `json:"id"`
	EnrollmentID uuid.UUID `json:"enrollment_id"`
}

// Notify queues an event; inside a transaction it fires on commit only.
func Notify(ctx context.Context, q Q, ev Event) error {
	b, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, "SELECT pg_notify($1, $2)", EventChannel, string(b))
	return err
}

// Cursor is a keyset position: a timestamp-or-text key plus an id tiebreaker.
type Cursor struct {
	Key   string
	ID    uuid.UUID
	Extra string // optional third key part
}

// EncodeCursor returns an opaque cursor string.
func EncodeCursor(c Cursor) string {
	raw := c.Key + "\x1f" + c.ID.String()
	if c.Extra != "" {
		raw += "\x1f" + c.Extra
	}
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

// DecodeCursor parses an opaque cursor; empty input means "from the start".
func DecodeCursor(raw string) (*Cursor, error) {
	if raw == "" {
		return nil, nil
	}
	if len(raw) > 512 {
		return nil, errors.New("cursor too long")
	}
	b, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return nil, errors.New("bad cursor encoding")
	}
	parts := strings.Split(string(b), "\x1f")
	if len(parts) < 2 || len(parts) > 3 {
		return nil, errors.New("bad cursor shape")
	}
	u, err := uuid.Parse(parts[1])
	if err != nil {
		return nil, errors.New("bad cursor id")
	}
	c := &Cursor{Key: parts[0], ID: u}
	if len(parts) == 3 {
		c.Extra = parts[2]
	}
	return c, nil
}

// TimeCursor builds a cursor from a timestamp key.
func TimeCursor(t time.Time, id uuid.UUID) Cursor {
	return Cursor{Key: t.UTC().Format(time.RFC3339Nano), ID: id}
}

// Time parses the cursor key as a timestamp.
func (c Cursor) Time() (time.Time, error) {
	t, err := time.Parse(time.RFC3339Nano, c.Key)
	if err != nil {
		return time.Time{}, fmt.Errorf("bad cursor time: %w", err)
	}
	return t, nil
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// pgTime is how pgx scans a Postgres `time` column.
type pgTime = pgtype.Time

func isUnique(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}
