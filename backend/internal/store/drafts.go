package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// NewReviewDraft records one AI review draft an admin asked for.
type NewReviewDraft struct {
	TaskID, StaffID     uuid.UUID
	Approve, ReadPR     bool
	TokensIn, TokensOut int
}

// InsertReviewDraft stores the audit row for a draft.
func InsertReviewDraft(ctx context.Context, q Q, d NewReviewDraft, now time.Time) error {
	if _, err := q.Exec(ctx, `INSERT INTO review_drafts (task_id, staff_id, approve, read_pr, tokens_in, tokens_out, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`, d.TaskID, d.StaffID, d.Approve, d.ReadPR, d.TokensIn, d.TokensOut, now); err != nil {
		return fmt.Errorf("insert review draft: %w", err)
	}
	return nil
}

// CountReviewDraftsSince counts a staff member's drafts at or after since.
func CountReviewDraftsSince(ctx context.Context, q Q, staffID uuid.UUID, since time.Time) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT count(*) FROM review_drafts WHERE staff_id = $1 AND created_at >= $2`, staffID, since).Scan(&n)
	return n, err
}
