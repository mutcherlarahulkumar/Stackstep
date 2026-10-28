package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// ---- Personas ----

const personaColsP = "p.id, p.name, p.title, p.color, p.auto_reply, p.version, p.archived_at"

// ErrDuplicate is returned when a unique name is already taken.
var ErrDuplicate = fmt.Errorf("duplicate")

func scanPersona(row pgx.Row) (domain.Persona, error) {
	var p domain.Persona
	var color string
	if err := row.Scan(&p.ID, &p.Name, &p.Title, &color, &p.AutoReply, &p.Version, &p.ArchivedAt); err != nil {
		return domain.Persona{}, notFound(err)
	}
	p.Color = domain.PersonaColor(color)
	if !p.Color.Valid() {
		return domain.Persona{}, fmt.Errorf("persona %s has unknown color %q", p.ID, color)
	}
	return p, nil
}

// ListPersonas returns personas by name; archived ones only when asked.
func ListPersonas(ctx context.Context, q Q, includeArchived bool) ([]domain.Persona, error) {
	rows, err := q.Query(ctx, "SELECT "+personaColsP+" FROM personas p WHERE $1 OR p.archived_at IS NULL ORDER BY lower(p.name) LIMIT 200", includeArchived)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Persona{}
	for rows.Next() {
		p, err := scanPersona(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetPersona loads a persona.
func GetPersona(ctx context.Context, q Q, id uuid.UUID) (domain.Persona, error) {
	return scanPersona(q.QueryRow(ctx, "SELECT "+personaColsP+" FROM personas p WHERE p.id = $1", id))
}

// ActivePersonaIDs returns the ids of non-archived personas among ids.
func ActivePersonaIDs(ctx context.Context, q Q, ids []uuid.UUID) (map[uuid.UUID]bool, error) {
	rows, err := q.Query(ctx, "SELECT id FROM personas WHERE id = ANY($1) AND archived_at IS NULL", ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID]bool{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// InsertPersona creates a persona.
func InsertPersona(ctx context.Context, q Q, in domain.PersonaInput, now time.Time) (domain.Persona, error) {
	p, err := scanPersona(q.QueryRow(ctx, `INSERT INTO personas AS p (name, title, color, auto_reply, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $5) RETURNING `+personaColsP, in.Name, in.Title, string(in.Color), in.AutoReply, now))
	if isUnique(err) {
		return domain.Persona{}, ErrDuplicate
	}
	return p, err
}

// UpdatePersona applies an edit if the version still matches; archived toggles archived_at.
func UpdatePersona(ctx context.Context, q Q, id uuid.UUID, in domain.PersonaInput, archived bool, expectedVersion int, now time.Time) (domain.Persona, error) {
	p, err := scanPersona(q.QueryRow(ctx, `UPDATE personas AS p SET name = $2, title = $3, color = $4, auto_reply = $5,
		archived_at = CASE WHEN $6 THEN COALESCE(p.archived_at, $8) ELSE NULL END, version = p.version + 1, updated_at = $8
		WHERE p.id = $1 AND p.version = $7 RETURNING `+personaColsP,
		id, in.Name, in.Title, string(in.Color), in.AutoReply, archived, expectedVersion, now))
	if isUnique(err) {
		return domain.Persona{}, ErrDuplicate
	}
	return p, err
}

// ---- Task templates ----

const templateCols = "id, type, title, brief, persona_id, review_mode, release_time, due_minutes, version, archived_at, updated_at, release_window, content"

// clockFromDB converts a Postgres time (as microseconds since midnight) to a ClockTime.
func clockFromDB(microseconds int64) domain.ClockTime {
	return domain.ClockTime(microseconds / int64(time.Minute/time.Microsecond))
}

func scanTemplate(row pgx.Row) (domain.Template, error) {
	var t domain.Template
	var typ, review string
	var release pgTime
	var content []byte
	if err := row.Scan(&t.ID, &typ, &t.Spec.Title, &t.Spec.Brief, &t.Spec.PersonaID, &review, &release, &t.Spec.DueMinutes,
		&t.Version, &t.ArchivedAt, &t.UpdatedAt, &t.Spec.ReleaseWindow, &content); err != nil {
		return domain.Template{}, notFound(err)
	}
	var err error
	if t.Spec.Content, err = decodeContent(content); err != nil {
		return domain.Template{}, fmt.Errorf("template %s content: %w", t.ID, err)
	}
	t.Spec.Type, t.Spec.ReviewMode, t.Spec.ReleaseTime = domain.TaskType(typ), domain.ReviewMode(review), clockFromDB(release.Microseconds)
	if !t.Spec.Type.Valid() || !t.Spec.ReviewMode.Valid() {
		return domain.Template{}, fmt.Errorf("template %s has unknown type/review %q/%q", t.ID, typ, review)
	}
	return t, nil
}

// TemplateFilter narrows the library list.
type TemplateFilter struct {
	Search          string
	Type            *domain.TaskType
	PersonaID       *uuid.UUID
	IncludeArchived bool
	After           *Cursor
	Limit           int
}

// ListTemplates returns library entries by title.
func ListTemplates(ctx context.Context, q Q, f TemplateFilter) ([]domain.Template, error) {
	var typ *string
	if f.Type != nil {
		s := string(*f.Type)
		typ = &s
	}
	var afterKey *string
	var afterID *uuid.UUID
	if f.After != nil {
		afterKey, afterID = &f.After.Key, &f.After.ID
	}
	rows, err := q.Query(ctx, "SELECT "+templateCols+` FROM task_templates
		WHERE ($1 = '' OR title ILIKE $1)
		  AND ($2::text IS NULL OR type = $2)
		  AND ($3::uuid IS NULL OR persona_id = $3)
		  AND ($4 OR archived_at IS NULL)
		  AND ($5::text IS NULL OR (lower(title), id) > ($5, $6))
		ORDER BY lower(title), id
		LIMIT $7`, likePattern(f.Search), typ, f.PersonaID, f.IncludeArchived, afterKey, afterID, f.Limit)
	if err != nil {
		return nil, fmt.Errorf("list templates: %w", err)
	}
	defer rows.Close()
	out := []domain.Template{}
	for rows.Next() {
		t, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// TemplateSortKey matches the ORDER BY of ListTemplates for cursors.
func TemplateSortKey(ctx context.Context, q Q, id uuid.UUID) (string, error) {
	var k string
	err := q.QueryRow(ctx, "SELECT lower(title) FROM task_templates WHERE id = $1", id).Scan(&k)
	return k, notFound(err)
}

// GetTemplate loads a template.
func GetTemplate(ctx context.Context, q Q, id uuid.UUID) (domain.Template, error) {
	return scanTemplate(q.QueryRow(ctx, "SELECT "+templateCols+" FROM task_templates WHERE id = $1", id))
}

// InsertTemplate creates a library entry.
func InsertTemplate(ctx context.Context, q Q, s domain.TaskSpec, by uuid.UUID, now time.Time) (domain.Template, error) {
	return scanTemplate(q.QueryRow(ctx, `INSERT INTO task_templates
		(type, title, brief, persona_id, review_mode, release_time, due_minutes, created_by, created_at, updated_at, release_window, content)
		VALUES ($1, $2, $3, $4, $5, $6::time, $7, $8, $9, $9, $10, $11) RETURNING `+templateCols,
		string(s.Type), s.Title, s.Brief, s.PersonaID, string(s.ReviewMode), s.ReleaseTime.String(), s.DueMinutes, by, now,
		s.ReleaseWindow, encodeContent(s.Content)))
}

// UpdateTemplate edits a library entry if the version matches.
func UpdateTemplate(ctx context.Context, q Q, id uuid.UUID, s domain.TaskSpec, archived bool, expectedVersion int, now time.Time) (domain.Template, error) {
	return scanTemplate(q.QueryRow(ctx, `UPDATE task_templates SET type = $2, title = $3, brief = $4, persona_id = $5,
		review_mode = $6, release_time = $7::time, due_minutes = $8,
		archived_at = CASE WHEN $9 THEN COALESCE(archived_at, $11) ELSE NULL END, version = version + 1, updated_at = $11,
		release_window = $12, content = $13
		WHERE id = $1 AND version = $10 RETURNING `+templateCols,
		id, string(s.Type), s.Title, s.Brief, s.PersonaID, string(s.ReviewMode), s.ReleaseTime.String(), s.DueMinutes,
		archived, expectedVersion, now, s.ReleaseWindow, encodeContent(s.Content)))
}

// ---- Flows ----

const flowSelectCols = "f.id, f.name, f.stream, f.description, f.days, f.version, f.archived_at, f.updated_at"

func scanFlow(row pgx.Row) (domain.Flow, error) {
	var f domain.Flow
	if err := row.Scan(&f.ID, &f.Name, &f.Stream, &f.Description, &f.Days, &f.Version, &f.ArchivedAt, &f.UpdatedAt); err != nil {
		return domain.Flow{}, notFound(err)
	}
	return f, nil
}

// FlowSummary is a flow plus its version state for the list view.
type FlowSummary struct {
	Flow           domain.Flow
	Published      *domain.FlowVersion // without items
	HasDraft       bool
	ItemCount      int // items in the published version (or draft when unpublished)
	EnrolledActive int
}

// ListFlows returns flows by name with version info.
func ListFlows(ctx context.Context, q Q, includeArchived bool) ([]FlowSummary, error) {
	rows, err := q.Query(ctx, `SELECT `+flowSelectCols+`, pv.id, pv.number, pv.revision, pv.published_at,
		       EXISTS (SELECT 1 FROM flow_versions d WHERE d.flow_id = f.id AND d.status = 'draft'),
		       (SELECT count(*) FROM flow_items i WHERE i.version_id = COALESCE(pv.id,
		           (SELECT d.id FROM flow_versions d WHERE d.flow_id = f.id AND d.status = 'draft'))),
		       (SELECT count(*) FROM enrollments e JOIN flow_versions v ON v.id = e.flow_version_id
		         WHERE v.flow_id = f.id AND e.status IN ('active', 'paused'))
		FROM flows f
		LEFT JOIN flow_versions pv ON pv.flow_id = f.id AND pv.status = 'published'
		WHERE $1 OR f.archived_at IS NULL
		ORDER BY lower(f.name)
		LIMIT 200`, includeArchived)
	if err != nil {
		return nil, fmt.Errorf("list flows: %w", err)
	}
	defer rows.Close()
	out := []FlowSummary{}
	for rows.Next() {
		var s FlowSummary
		var pvID *uuid.UUID
		var pvNum, pvRev *int
		var pvAt *time.Time
		if err := rows.Scan(&s.Flow.ID, &s.Flow.Name, &s.Flow.Stream, &s.Flow.Description, &s.Flow.Days, &s.Flow.Version,
			&s.Flow.ArchivedAt, &s.Flow.UpdatedAt, &pvID, &pvNum, &pvRev, &pvAt, &s.HasDraft, &s.ItemCount, &s.EnrolledActive); err != nil {
			return nil, err
		}
		if pvID != nil && pvNum != nil && pvRev != nil {
			s.Published = &domain.FlowVersion{ID: *pvID, FlowID: s.Flow.ID, Number: *pvNum, Status: domain.FlowPublished, Revision: *pvRev, PublishedAt: pvAt}
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// GetFlow loads a flow; forUpdate row-locks it to serialize version changes.
func GetFlow(ctx context.Context, q Q, id uuid.UUID, forUpdate bool) (domain.Flow, error) {
	lock := ""
	if forUpdate {
		lock = " FOR UPDATE"
	}
	return scanFlow(q.QueryRow(ctx, "SELECT "+flowSelectCols+" FROM flows f WHERE f.id = $1"+lock, id))
}

// InsertFlow creates a flow (without versions).
func InsertFlow(ctx context.Context, q Q, in domain.FlowInput, by uuid.UUID, now time.Time) (domain.Flow, error) {
	f, err := scanFlow(q.QueryRow(ctx, `INSERT INTO flows AS f (name, stream, description, days, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING `+flowSelectCols, in.Name, in.Stream, in.Description, in.Days, by, now))
	if isUnique(err) {
		return domain.Flow{}, ErrDuplicate
	}
	return f, err
}

// UpdateFlow edits metadata (days can't change once any version is published).
func UpdateFlow(ctx context.Context, q Q, id uuid.UUID, in domain.FlowInput, archived bool, expectedVersion int, now time.Time) (domain.Flow, error) {
	f, err := scanFlow(q.QueryRow(ctx, `UPDATE flows AS f SET name = $2, stream = $3, description = $4, days = $5,
		archived_at = CASE WHEN $6 THEN COALESCE(f.archived_at, $8) ELSE NULL END, version = f.version + 1, updated_at = $8
		WHERE f.id = $1 AND f.version = $7 RETURNING `+flowSelectCols,
		id, in.Name, in.Stream, in.Description, in.Days, archived, expectedVersion, now))
	if isUnique(err) {
		return domain.Flow{}, ErrDuplicate
	}
	return f, err
}

func scanVersion(row pgx.Row) (domain.FlowVersion, error) {
	var v domain.FlowVersion
	var status string
	if err := row.Scan(&v.ID, &v.FlowID, &v.Number, &status, &v.Revision, &v.PublishedAt); err != nil {
		return domain.FlowVersion{}, notFound(err)
	}
	v.Status = domain.FlowVersionStatus(status)
	if !v.Status.Valid() {
		return domain.FlowVersion{}, fmt.Errorf("flow version %s has unknown status %q", v.ID, status)
	}
	return v, nil
}

const versionCols = "id, flow_id, number, status, revision, published_at"

// FlowVersionByStatus returns the flow's draft or published version (with items).
func FlowVersionByStatus(ctx context.Context, q Q, flowID uuid.UUID, status domain.FlowVersionStatus) (domain.FlowVersion, error) {
	v, err := scanVersion(q.QueryRow(ctx, "SELECT "+versionCols+" FROM flow_versions WHERE flow_id = $1 AND status = $2", flowID, string(status)))
	if err != nil {
		return domain.FlowVersion{}, err
	}
	v.Items, err = ListFlowItems(ctx, q, v.ID)
	return v, err
}

// InsertFlowVersion creates the next numbered draft, copying items from `from` when given.
func InsertFlowVersion(ctx context.Context, q Q, flowID uuid.UUID, from []domain.FlowItem, now time.Time) (domain.FlowVersion, error) {
	v, err := scanVersion(q.QueryRow(ctx, `INSERT INTO flow_versions (flow_id, number, status, created_at)
		VALUES ($1, COALESCE((SELECT max(number) FROM flow_versions WHERE flow_id = $1), 0) + 1, 'draft', $2)
		RETURNING `+versionCols, flowID, now))
	if err != nil {
		return domain.FlowVersion{}, err
	}
	if err := InsertFlowItems(ctx, q, v.ID, from); err != nil {
		return domain.FlowVersion{}, err
	}
	v.Items, err = ListFlowItems(ctx, q, v.ID)
	return v, err
}

// ReplaceDraftItems swaps a draft's items if its revision matches, bumping the revision.
func ReplaceDraftItems(ctx context.Context, q Q, versionID uuid.UUID, expectedRevision int, items []domain.FlowItem) (int, error) {
	var rev int
	err := q.QueryRow(ctx, `UPDATE flow_versions SET revision = revision + 1
		WHERE id = $1 AND status = 'draft' AND revision = $2 RETURNING revision`, versionID, expectedRevision).Scan(&rev)
	if err != nil {
		return 0, notFound(err)
	}
	if _, err := q.Exec(ctx, "DELETE FROM flow_items WHERE version_id = $1", versionID); err != nil {
		return 0, err
	}
	return rev, InsertFlowItems(ctx, q, versionID, items)
}

// InsertFlowItems bulk-inserts items into a version.
func InsertFlowItems(ctx context.Context, q Q, versionID uuid.UUID, items []domain.FlowItem) error {
	if len(items) == 0 {
		return nil
	}
	var b strings.Builder
	args := make([]any, 0, len(items)*12+1)
	args = append(args, versionID)
	b.WriteString(`INSERT INTO flow_items (version_id, day, position, template_id, type, title, brief, persona_id, review_mode,
		release_time, due_minutes, release_window, content) VALUES `)
	for i, it := range items {
		if i > 0 {
			b.WriteString(", ")
		}
		n := len(args)
		fmt.Fprintf(&b, "($1, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d::time, $%d, $%d, $%d)",
			n+1, n+2, n+3, n+4, n+5, n+6, n+7, n+8, n+9, n+10, n+11, n+12)
		args = append(args, it.Day, it.Position, it.TemplateID, string(it.Spec.Type), it.Spec.Title, it.Spec.Brief,
			it.Spec.PersonaID, string(it.Spec.ReviewMode), it.Spec.ReleaseTime.String(), it.Spec.DueMinutes,
			it.Spec.ReleaseWindow, encodeContent(it.Spec.Content))
	}
	_, err := q.Exec(ctx, b.String(), args...)
	return err
}

// ListFlowItems returns a version's items by day and position.
func ListFlowItems(ctx context.Context, q Q, versionID uuid.UUID) ([]domain.FlowItem, error) {
	rows, err := q.Query(ctx, `SELECT id, day, position, template_id, type, title, brief, persona_id, review_mode, release_time, due_minutes,
		release_window, content
		FROM flow_items WHERE version_id = $1 ORDER BY day, position`, versionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.FlowItem{}
	for rows.Next() {
		var it domain.FlowItem
		var typ, review string
		var release pgTime
		var content []byte
		if err := rows.Scan(&it.ID, &it.Day, &it.Position, &it.TemplateID, &typ, &it.Spec.Title, &it.Spec.Brief, &it.Spec.PersonaID,
			&review, &release, &it.Spec.DueMinutes, &it.Spec.ReleaseWindow, &content); err != nil {
			return nil, err
		}
		var err error
		if it.Spec.Content, err = decodeContent(content); err != nil {
			return nil, fmt.Errorf("flow item %s content: %w", it.ID, err)
		}
		it.Spec.Type, it.Spec.ReviewMode, it.Spec.ReleaseTime = domain.TaskType(typ), domain.ReviewMode(review), clockFromDB(release.Microseconds)
		out = append(out, it)
	}
	return out, rows.Err()
}

// PublishDraft retires the current published version and publishes the draft.
func PublishDraft(ctx context.Context, q Q, flowID, draftID uuid.UUID, expectedRevision int, now time.Time) (domain.FlowVersion, error) {
	if _, err := q.Exec(ctx, "UPDATE flow_versions SET status = 'retired' WHERE flow_id = $1 AND status = 'published'", flowID); err != nil {
		return domain.FlowVersion{}, err
	}
	v, err := scanVersion(q.QueryRow(ctx, `UPDATE flow_versions SET status = 'published', published_at = $3
		WHERE id = $1 AND status = 'draft' AND revision = $2 RETURNING `+versionCols, draftID, expectedRevision, now))
	if err != nil {
		return domain.FlowVersion{}, err
	}
	v.Items, err = ListFlowItems(ctx, q, v.ID)
	return v, err
}

func likePattern(search string) string {
	if search == "" {
		return ""
	}
	return "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(search) + "%"
}

// InsertTemplateWithID is InsertTemplate for content shipped with the app (the curriculum),
// whose ids are fixed so re-running finds the same rows.
func InsertTemplateWithID(ctx context.Context, q Q, id uuid.UUID, s domain.TaskSpec, by uuid.UUID, now time.Time) (domain.Template, error) {
	return scanTemplate(q.QueryRow(ctx, `INSERT INTO task_templates
		(id, type, title, brief, persona_id, review_mode, release_time, due_minutes, created_by, created_at, updated_at, release_window, content)
		VALUES ($1, $2, $3, $4, $5, $6, $7::time, $8, $9, $10, $10, $11, $12) RETURNING `+templateCols,
		id, string(s.Type), s.Title, s.Brief, s.PersonaID, string(s.ReviewMode), s.ReleaseTime.String(), s.DueMinutes, by, now,
		s.ReleaseWindow, encodeContent(s.Content)))
}

// InsertFlowWithID is InsertFlow with a fixed id (the curriculum's flows).
func InsertFlowWithID(ctx context.Context, q Q, id uuid.UUID, in domain.FlowInput, by uuid.UUID, now time.Time) (domain.Flow, error) {
	f, err := scanFlow(q.QueryRow(ctx, `INSERT INTO flows AS f (id, name, stream, description, days, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING `+flowSelectCols, id, in.Name, in.Stream, in.Description, in.Days, by, now))
	if isUnique(err) {
		return domain.Flow{}, ErrDuplicate
	}
	return f, err
}
