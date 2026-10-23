package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

const taskCols = "id, enrollment_id, type, title, brief, status, scheduled_for, due_at, created_by, version, created_at, updated_at, review_mode, persona_id, flow_item_id"

func scanTask(row pgx.Row) (domain.Task, error) {
	var t domain.Task
	var typ, status, review string
	if err := row.Scan(&t.ID, &t.EnrollmentID, &typ, &t.Title, &t.Brief, &status, &t.ScheduledFor, &t.DueAt,
		&t.CreatedBy, &t.Version, &t.CreatedAt, &t.UpdatedAt, &review, &t.PersonaID, &t.FlowItemID); err != nil {
		return domain.Task{}, notFound(err)
	}
	t.Type, t.Status, t.ReviewMode = domain.TaskType(typ), domain.TaskStatus(status), domain.ReviewMode(review)
	if !t.Type.Valid() || !t.Status.Valid() || !t.ReviewMode.Valid() {
		return domain.Task{}, fmt.Errorf("task %s has unknown type/status %q/%q", t.ID, typ, status)
	}
	return t, nil
}

// InsertTask stores a new task in status todo.
func InsertTask(ctx context.Context, q Q, enrollmentID, createdBy uuid.UUID, v domain.ValidatedTask, now time.Time) (domain.Task, error) {
	return scanTask(q.QueryRow(ctx, `
		INSERT INTO tasks (enrollment_id, type, title, brief, status, scheduled_for, due_at, created_by, created_at, updated_at,
		                   review_mode, persona_id, flow_item_id)
		VALUES ($1, $2, $3, $4, 'todo', $5, $6, $7, $8, $8, $9, $10, $11)
		RETURNING `+taskCols,
		enrollmentID, string(v.Type), v.Title, v.Brief, v.ScheduledFor, v.DueAt, createdBy, now,
		string(v.ReviewMode), v.PersonaID, v.FlowItemID))
}

// GetTaskForUpdate loads and row-locks a task.
func GetTaskForUpdate(ctx context.Context, q Q, id uuid.UUID) (domain.Task, error) {
	return scanTask(q.QueryRow(ctx, "SELECT "+taskCols+" FROM tasks WHERE id = $1 FOR UPDATE", id))
}

// GetTask loads a task.
func GetTask(ctx context.Context, q Q, id uuid.UUID) (domain.Task, error) {
	return scanTask(q.QueryRow(ctx, "SELECT "+taskCols+" FROM tasks WHERE id = $1", id))
}

// TaskFilter narrows ListTasks.
type TaskFilter struct {
	// VisibleAt hides tasks scheduled after this instant (student view). Nil shows all.
	VisibleAt *time.Time
	// IncludeCancelled shows cancelled tasks (staff view).
	IncludeCancelled bool
}

// MaxTasksPerList bounds a single board read.
const MaxTasksPerList = 500

// ListTasks returns an enrollment's tasks, earliest due first.
func ListTasks(ctx context.Context, q Q, enrollmentID uuid.UUID, f TaskFilter) ([]domain.Task, error) {
	rows, err := q.Query(ctx, "SELECT "+taskCols+` FROM tasks
		WHERE enrollment_id = $1
		  AND ($2::timestamptz IS NULL OR scheduled_for <= $2)
		  AND ($3 OR status <> 'cancelled')
		ORDER BY due_at, id
		LIMIT $4`, enrollmentID, f.VisibleAt, f.IncludeCancelled, MaxTasksPerList)
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()
	out := []domain.Task{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// SetTaskStatus moves a locked task to a new status and bumps its version.
func SetTaskStatus(ctx context.Context, q Q, t domain.Task, to domain.TaskStatus, actor uuid.UUID, note string, now time.Time) (domain.Task, error) {
	updated, err := scanTask(q.QueryRow(ctx, `
		UPDATE tasks SET status = $2, version = version + 1, updated_at = $3
		WHERE id = $1 AND version = $4
		RETURNING `+taskCols, t.ID, string(to), now, t.Version))
	if err != nil {
		return domain.Task{}, err
	}
	var notePtr *string
	if note != "" {
		notePtr = &note
	}
	if _, err := q.Exec(ctx, `INSERT INTO task_events (task_id, actor_id, from_status, to_status, note, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)`, t.ID, actor, string(t.Status), string(to), notePtr, now); err != nil {
		return domain.Task{}, fmt.Errorf("insert task event: %w", err)
	}
	return updated, nil
}

// InsertTaskCreatedEvent records the creation in the audit log.
func InsertTaskCreatedEvent(ctx context.Context, q Q, t domain.Task) error {
	_, err := q.Exec(ctx, `INSERT INTO task_events (task_id, actor_id, from_status, to_status, created_at)
		VALUES ($1, $2, NULL, $3, $4)`, t.ID, t.CreatedBy, string(t.Status), t.CreatedAt)
	return err
}

// CancelUnreleasedFlowTasks cancels flow-generated tasks of an enrollment that the student
// can't see yet, and deletes their not-yet-delivered announcements. Released tasks stay.
func CancelUnreleasedFlowTasks(ctx context.Context, q Q, enrollmentID, actor uuid.UUID, now time.Time) (int, error) {
	rows, err := q.Query(ctx, `
		UPDATE tasks SET status = 'cancelled', version = version + 1, updated_at = $3
		WHERE enrollment_id = $1 AND flow_item_id IS NOT NULL AND scheduled_for > $2 AND status <> 'cancelled'
		RETURNING id, status`, enrollmentID, now, now)
	if err != nil {
		return 0, fmt.Errorf("cancel flow tasks: %w", err)
	}
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		var st string
		if err := rows.Scan(&id, &st); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 0, nil
	}
	if _, err := q.Exec(ctx, `INSERT INTO task_events (task_id, actor_id, from_status, to_status, note, created_at)
		SELECT id, $2, 'todo', 'cancelled', 'Replaced by a new flow', $3 FROM unnest($1::uuid[]) AS id`, ids, actor, now); err != nil {
		return 0, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM chat_messages WHERE task_id = ANY($1) AND delivered_at IS NULL`, ids); err != nil {
		return 0, err
	}
	return len(ids), nil
}
