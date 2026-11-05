package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// EventReaction is fired when a message's reactions change; listeners send the message again
// as a reaction frame, so unread counters aren't touched.
const EventReaction EventKind = "reaction"

// SetReaction adds (on) or removes one side's emoji on a message. Repeating either is a no-op.
func SetReaction(ctx context.Context, q Q, messageID uuid.UUID, by domain.Author, emoji domain.ReactionEmoji, on bool, now time.Time) error {
	var err error
	if on {
		_, err = q.Exec(ctx, `INSERT INTO chat_reactions (message_id, author, emoji, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
			messageID, string(by), string(emoji), now)
	} else {
		_, err = q.Exec(ctx, `DELETE FROM chat_reactions WHERE message_id = $1 AND author = $2 AND emoji = $3`, messageID, string(by), string(emoji))
	}
	if err != nil {
		return fmt.Errorf("set reaction: %w", err)
	}
	return nil
}

// AttachReactions fills Reactions on each message (empty when it has none).
func AttachReactions(ctx context.Context, q Q, msgs []domain.Message) error {
	if len(msgs) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, len(msgs))
	for i, m := range msgs {
		ids[i] = m.ID
		msgs[i].Reactions = []domain.Reaction{}
	}
	rows, err := q.Query(ctx, `SELECT message_id, author, emoji FROM chat_reactions WHERE message_id = ANY($1) ORDER BY created_at, emoji`, ids)
	if err != nil {
		return fmt.Errorf("load reactions: %w", err)
	}
	defer rows.Close()
	byID := map[uuid.UUID][]domain.Reaction{}
	for rows.Next() {
		var id uuid.UUID
		var by, emoji string
		if err := rows.Scan(&id, &by, &emoji); err != nil {
			return err
		}
		byID[id] = append(byID[id], domain.Reaction{Emoji: domain.ReactionEmoji(emoji), By: domain.Author(by)})
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range msgs {
		if r := byID[msgs[i].ID]; r != nil {
			msgs[i].Reactions = r
		}
	}
	return nil
}
