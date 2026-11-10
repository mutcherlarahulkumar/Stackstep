package guidedcurriculum

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// FlowID identifies this edition. New editions get new ids, never overwrite assignments.
var FlowID = uuid.NewSHA1(uuid.NameSpaceURL, []byte("https://stackstep.app/curriculum/"+Version))

// ImportPersonas are separate from fixture and user-created manager identities.
func ImportPersonas() Personas {
	id := func(role string) uuid.UUID { return uuid.NewSHA1(FlowID, []byte("persona/"+role)) }
	return Personas{Lead: id("lead"), Engineering: id("engineering"), Delivery: id("delivery"), Content: id("content")}
}

// ImportResult reports whether a complete edition was created or left untouched.
type ImportResult struct {
	FlowID  uuid.UUID
	Created bool
	Tasks   int
}

// Import adds this edition's own library, manager personas and published flow atomically.
// q must be a transaction. Existing editions, assignments and user edits are untouched.
func Import(ctx context.Context, q store.Q, admin uuid.UUID, now time.Time) (ImportResult, error) {
	result := ImportResult{FlowID: FlowID}
	if _, ok := q.(pgx.Tx); !ok {
		return result, errors.New("curriculum import must run inside a transaction")
	}
	var role string
	if err := q.QueryRow(ctx, "SELECT role FROM users WHERE id = $1", admin).Scan(&role); err != nil {
		return result, fmt.Errorf("load importing administrator: %w", err)
	}
	if role != string(domain.RoleAdmin) {
		return result, errors.New("only an existing platform admin can import curriculum")
	}
	if _, err := q.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1))", "stackstep/curriculum/"+Version); err != nil {
		return result, fmt.Errorf("lock curriculum edition: %w", err)
	}
	var exists bool
	if err := q.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM flows WHERE id = $1)", FlowID).Scan(&exists); err != nil {
		return result, err
	}
	if exists {
		if err := q.QueryRow(ctx, `SELECT count(*) FROM flow_items i JOIN flow_versions v ON v.id = i.version_id
			WHERE v.flow_id = $1 AND v.status = 'published'`, FlowID).Scan(&result.Tasks); err != nil {
			return result, err
		}
		return result, nil
	}
	p := ImportPersonas()
	entries, err := Entries(p)
	if err != nil {
		return result, err
	}
	personas := []struct {
		id                 uuid.UUID
		name, title, color string
	}{
		{p.Lead, "Guided v1 · Team Lead", "Team Lead", "violet"},
		{p.Engineering, "Guided v1 · Engineering", "Engineering Manager", "emerald"},
		{p.Delivery, "Guided v1 · Delivery", "Delivery Manager", "blue"},
		{p.Content, "Guided v1 · Writing", "Content Lead", "rose"},
	}
	for _, person := range personas {
		if _, err := q.Exec(ctx, `INSERT INTO personas (id, name, title, color, auto_reply, created_at, updated_at)
			VALUES ($1, $2, $3, $4, false, $5, $5) ON CONFLICT (id) DO NOTHING`, person.id, person.name, person.title, person.color, now); err != nil {
			return result, fmt.Errorf("create curriculum persona: %w", err)
		}
		var active, autoReply bool
		var name, title, color string
		if err := q.QueryRow(ctx, "SELECT name, title, color, auto_reply, archived_at IS NULL FROM personas WHERE id = $1", person.id).Scan(&name, &title, &color, &autoReply, &active); err != nil {
			return result, err
		}
		if !active {
			return result, errors.New("an edition persona is archived; preserve it and review before importing")
		}
		if name != person.name || title != person.title || color != person.color || autoReply {
			return result, errors.New("an edition persona id is already used with different settings; preserve it and review before importing")
		}
	}
	if _, err := q.Exec(ctx, `INSERT INTO flows (id, name, stream, description, days, created_by, created_at, updated_at)
		VALUES ($1, $2, 'React', $3, 30, $4, $5, $5)`, FlowID, Name, Description, admin, now); err != nil {
		return result, fmt.Errorf("create new curriculum flow: %w", err)
	}
	var versionID uuid.UUID
	if err := q.QueryRow(ctx, `INSERT INTO flow_versions (flow_id, number, status, published_at, created_at)
		VALUES ($1, 1, 'published', $2, $2) RETURNING id`, FlowID, now).Scan(&versionID); err != nil {
		return result, err
	}
	items := make([]domain.FlowItem, 0, len(entries))
	perDay := map[int]int{}
	for _, entry := range entries {
		template, err := store.InsertTemplate(ctx, q, entry.Spec, admin, now)
		if err != nil {
			return result, fmt.Errorf("create task library entry: %w", err)
		}
		id := template.ID
		items = append(items, domain.FlowItem{Day: entry.Day, Position: perDay[entry.Day], TemplateID: &id, Spec: entry.Spec})
		perDay[entry.Day]++
	}
	if err := store.InsertFlowItems(ctx, q, versionID, items); err != nil {
		return result, err
	}
	result.Created, result.Tasks = true, len(entries)
	return result, nil
}
