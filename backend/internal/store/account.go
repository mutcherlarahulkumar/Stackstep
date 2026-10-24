package store

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// GetAccount loads a user's consent and onboarding state.
func GetAccount(ctx context.Context, q Q, userID uuid.UUID) (domain.Account, error) {
	var a domain.Account
	err := q.QueryRow(ctx, `SELECT consent_version, consent_at, onboarded_at FROM users WHERE id = $1`, userID).Scan(&a.ConsentVersion, &a.ConsentAt, &a.OnboardedAt)
	return a, notFound(err)
}

// SetConsent records acceptance of a terms version.
func SetConsent(ctx context.Context, q Q, userID uuid.UUID, version int, now time.Time) error {
	_, err := q.Exec(ctx, `UPDATE users SET consent_version = $2, consent_at = $3 WHERE id = $1`, userID, version, now)
	return err
}

// SetOnboarded marks the first-run guide as seen (idempotent; keeps the first time).
func SetOnboarded(ctx context.Context, q Q, userID uuid.UUID, now time.Time) error {
	_, err := q.Exec(ctx, `UPDATE users SET onboarded_at = COALESCE(onboarded_at, $2) WHERE id = $1`, userID, now)
	return err
}

// ExportUser returns everything Stackstep holds about a user as one JSON document: profile,
// internships, released tasks with hand-ins, delivered chat, AI helper conversations, credits,
// points and certificates. Staff-only data (review checks, staff read times) is left out.
func ExportUser(ctx context.Context, q Q, userID uuid.UUID, now time.Time) ([]byte, error) {
	var out []byte
	err := q.QueryRow(ctx, `
WITH me AS (SELECT * FROM users WHERE id = $1),
     enr AS (SELECT e.*, p.slug AS program_slug FROM enrollments e JOIN programs p ON p.id = e.program_id WHERE e.user_id = $1)
SELECT jsonb_build_object(
  'exported_at', $2::timestamptz,
  'profile', (SELECT jsonb_build_object('github_login', github_login, 'name', name, 'email', email, 'role', role,
      'created_at', created_at, 'consent_version', consent_version, 'consent_at', consent_at, 'onboarded_at', onboarded_at) FROM me),
  'internships', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'program', enr.program_slug, 'start_date', enr.start_date, 'end_date', enr.end_date, 'timezone', enr.timezone,
      'status', enr.status, 'created_at', enr.created_at,
      'tasks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'title', t.title, 'type', t.type, 'brief', t.brief, 'status', t.status, 'scheduled_for', t.scheduled_for, 'due_at', t.due_at,
          'hand_ins', COALESCE((SELECT jsonb_agg(jsonb_build_object('attempt', s.attempt, 'url', s.url, 'note', s.note, 'created_at', s.created_at) ORDER BY s.attempt)
              FROM task_submissions s WHERE s.task_id = t.id), '[]'::jsonb),
          'note', (SELECT jsonb_build_object('body', n.body, 'shared', n.shared, 'updated_at', n.updated_at) FROM task_notes n WHERE n.task_id = t.id),
          'quiz_attempts', COALESCE((SELECT jsonb_agg(jsonb_build_object('attempt', qa.attempt, 'answers', qa.answers, 'score', qa.score, 'passed', qa.passed, 'created_at', qa.created_at) ORDER BY qa.attempt)
              FROM quiz_attempts qa WHERE qa.task_id = t.id), '[]'::jsonb)
        ) ORDER BY t.scheduled_for) FROM tasks t WHERE t.enrollment_id = enr.id AND t.scheduled_for <= $2), '[]'::jsonb),
      'chat', COALESCE((SELECT jsonb_agg(jsonb_build_object('with', p.name, 'from', m.author, 'body', m.body, 'at', m.delivered_at) ORDER BY m.delivered_at, m.id)
          FROM chat_messages m JOIN personas p ON p.id = m.persona_id
          WHERE m.enrollment_id = enr.id AND m.delivered_at IS NOT NULL), '[]'::jsonb),
      'ai_helper', COALESCE((SELECT jsonb_agg(jsonb_build_object('title', c.title, 'created_at', c.created_at,
          'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('role', am.role, 'kind', am.kind, 'body', am.body, 'status', am.status, 'at', am.created_at) ORDER BY am.seq)
              FROM ai_messages am WHERE am.conversation_id = c.id), '[]'::jsonb)) ORDER BY c.created_at)
          FROM ai_conversations c WHERE c.enrollment_id = enr.id), '[]'::jsonb),
      'credits', COALESCE((SELECT jsonb_agg(jsonb_build_object('delta', cl.delta, 'reason', cl.reason, 'note', cl.note, 'at', cl.created_at) ORDER BY cl.id)
          FROM credit_ledger cl WHERE cl.enrollment_id = enr.id), '[]'::jsonb),
      'points', COALESCE((SELECT jsonb_agg(jsonb_build_object('points', pl.points, 'on_time', pl.on_time, 'at', pl.created_at) ORDER BY pl.created_at)
          FROM points_ledger pl WHERE pl.enrollment_id = enr.id), '[]'::jsonb),
      'certificates', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', ce.code, 'issued_at', ce.issued_at, 'revoked_at', ce.revoked_at, 'revoke_reason', ce.revoke_reason) ORDER BY ce.issued_at)
          FROM certificates ce WHERE ce.enrollment_id = enr.id), '[]'::jsonb)
    ) ORDER BY enr.created_at) FROM enr), '[]'::jsonb)
) FROM me`, userID, now).Scan(&out)
	return out, notFound(err)
}
