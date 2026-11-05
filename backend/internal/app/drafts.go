package app

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/ai"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/clock"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/config"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/ghpr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// PRReader reads a GitHub pull request for a review draft.
type PRReader interface {
	Get(ctx context.Context, ref ghpr.Ref) (ghpr.PR, error)
}

// Drafter writes AI review drafts for admins. A draft is a suggestion only: the admin edits
// it and makes the decision through the normal review transition.
type Drafter struct {
	Store  *store.Store
	Clock  clock.Clock
	AI     ai.Provider
	PRs    PRReader
	Config config.AIConfig
	Log    *slog.Logger
}

// ReviewDraft is a draft decision, note and rubric ticks for one hand-in.
type ReviewDraft struct {
	Approve bool
	Summary string
	Note    string
	Rubric  []bool // nil when the task has no rubric or the model's ticks were unusable
	ReadPR  bool   // the draft looked at the pull request's diff
}

// prTimeout bounds reading the pull request.
const prTimeout = 12 * time.Second

// Enabled reports whether admins can ask for drafts.
func (d *Drafter) Enabled() bool { return d != nil && d.Config.ReviewDraftsEnabled() }

// Draft writes a review draft for a task waiting for review in the staff member's scope.
func (d *Drafter) Draft(ctx context.Context, u domain.User, taskID uuid.UUID) (ReviewDraft, error) {
	if _, err := staffCollege(u); err != nil {
		return ReviewDraft{}, err
	}
	t, err := store.GetTask(ctx, d.Store.Pool, taskID)
	if errors.Is(err, store.ErrNotFound) {
		return ReviewDraft{}, errNotFound
	}
	if err != nil {
		return ReviewDraft{}, err
	}
	e, err := store.GetEnrollment(ctx, d.Store.Pool, t.EnrollmentID)
	if errors.Is(err, store.ErrNotFound) || err == nil && !canStaff(u, e) {
		return ReviewDraft{}, errNotFound // never reveal tasks outside the actor's scope
	}
	if err != nil {
		return ReviewDraft{}, err
	}
	if t.Status != domain.StatusInReview || t.ReviewMode != domain.ReviewManual {
		return ReviewDraft{}, apperr.New(apperr.CodeInvalidState, "Only hand-ins waiting for review can be drafted.")
	}
	if !d.Enabled() {
		return ReviewDraft{}, apperr.New(apperr.CodeNotConfigured, "AI review drafts aren't set up.")
	}
	now := d.Clock.Now()
	dayStart := now.Truncate(24 * time.Hour)
	used, err := store.CountReviewDraftsSince(ctx, d.Store.Pool, u.ID, dayStart)
	if err != nil {
		return ReviewDraft{}, err
	}
	if used >= d.Config.DraftsPerStaffDay {
		return ReviewDraft{}, rateLimited("You've used today's AI review drafts.", dayStart.Add(24*time.Hour).Sub(now))
	}
	tasks := []domain.Task{t}
	if err := store.EnrichTasks(ctx, d.Store.Pool, tasks); err != nil {
		return ReviewDraft{}, err
	}
	t = tasks[0]

	in := ai.ReviewInput{TaskType: t.Type.Label(), Title: t.Title, Brief: t.Brief, Rubric: t.Content.Rubric}
	if s := t.Submission; s != nil {
		in.URL, in.Note = s.URL, s.Note
	}
	if ref, ok := ghpr.Parse(in.URL); ok && d.PRs != nil {
		pctx, cancel := context.WithTimeout(ctx, prTimeout)
		pr, err := d.PRs.Get(pctx, ref)
		cancel()
		if err != nil {
			d.Log.InfoContext(ctx, "review draft without the PR", "err", err, "task", t.ID)
			in.PRMissing = "private, deleted, or GitHub didn't answer"
		} else {
			in.PR = &ai.ReviewPR{Title: pr.Title, Body: pr.Body, State: pr.State, Additions: pr.Additions,
				Deletions: pr.Deletions, Files: pr.ChangedFiles, Diff: pr.Diff, Truncated: pr.Truncated}
		}
	}

	actx, cancel := context.WithTimeout(ctx, d.Config.Timeout)
	defer cancel()
	msgs := ai.ReviewMessages(in)
	var c ai.Completion
	if jp, ok := d.AI.(ai.JSONProvider); ok {
		c, err = jp.CompleteJSON(actx, msgs)
	} else {
		c, err = d.AI.Complete(actx, msgs)
	}
	var draft ai.ReviewDraft
	if err == nil {
		draft, err = ai.ParseReviewDraft(c.Text, len(t.Content.Rubric))
	}
	if err != nil {
		d.Log.WarnContext(ctx, "review draft failed", "err", err, "task", t.ID)
		var rl *ai.RateLimitedError
		switch {
		case errors.Is(err, ai.ErrNotConfigured):
			return ReviewDraft{}, apperr.New(apperr.CodeNotConfigured, "AI review drafts aren't set up.")
		case errors.As(err, &rl):
			return ReviewDraft{}, rateLimited("The AI is busy right now.", rl.RetryAfter)
		default:
			return ReviewDraft{}, apperr.New(apperr.CodeAIUnavailable, "The AI couldn't draft this review.")
		}
	}
	if err := store.InsertReviewDraft(ctx, d.Store.Pool, store.NewReviewDraft{
		TaskID: t.ID, StaffID: u.ID, Approve: draft.Approve, ReadPR: in.PR != nil, TokensIn: c.TokensIn, TokensOut: c.TokensOut,
	}, now); err != nil {
		return ReviewDraft{}, err
	}
	return ReviewDraft{Approve: draft.Approve, Summary: draft.Summary, Note: draft.Note, Rubric: draft.Rubric, ReadPR: in.PR != nil}, nil
}
