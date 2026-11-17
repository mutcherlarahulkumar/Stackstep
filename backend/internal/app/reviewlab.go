package app

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/reviewlab"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Feature 27: the review lab. Practice pull requests with planted problems, reviewed on a
// code host style screen inside Stackstep and graded by where the reviewer commented.

// LabEntry is one exercise in the library with the user's record on it.
type LabEntry struct {
	Exercise reviewlab.Exercise
	Record   store.LabSummary
}

// LabLibrary lists every exercise for any signed-in person.
func (w *Workspace) LabLibrary(ctx context.Context, u domain.User) ([]LabEntry, error) {
	records, err := store.LabSummaries(ctx, w.Store.Pool, u.ID)
	if err != nil {
		return nil, err
	}
	out := make([]LabEntry, 0, len(reviewlab.All()))
	for _, ex := range reviewlab.All() {
		out = append(out, LabEntry{Exercise: ex, Record: records[ex.Key]})
	}
	return out, nil
}

// LabReview is a stored review with its grading.
type LabReview struct {
	Attempt store.LabAttempt
	Result  reviewlab.Result
}

// LabDetail is an exercise, the user's record and their latest graded review.
type LabDetail struct {
	Exercise reviewlab.Exercise
	Record   store.LabSummary
	Last     *LabReview
}

// LabExercise loads one exercise. Planted issues are only revealed through a graded review.
func (w *Workspace) LabExercise(ctx context.Context, u domain.User, key string) (LabDetail, error) {
	ex, ok := reviewlab.Get(key)
	if !ok {
		return LabDetail{}, errNotFound
	}
	records, err := store.LabSummaries(ctx, w.Store.Pool, u.ID)
	if err != nil {
		return LabDetail{}, err
	}
	d := LabDetail{Exercise: ex, Record: records[key]}
	a, err := store.LastLabAttempt(ctx, w.Store.Pool, u.ID, key)
	switch {
	case errors.Is(err, store.ErrNotFound):
	case err != nil:
		return LabDetail{}, err
	default:
		d.Last = &LabReview{Attempt: a, Result: reviewlab.Grade(ex, a.Verdict, a.Comments, passFor(ctx, w, a.TaskID))}
	}
	return d, nil
}

// passFor is the pass mark that applied to an attempt.
func passFor(ctx context.Context, w *Workspace, taskID *uuid.UUID) int {
	if taskID == nil {
		return reviewlab.DefaultPass
	}
	t, err := store.GetTask(ctx, w.Store.Pool, *taskID)
	if err != nil || t.Content.ReviewLab == nil {
		return reviewlab.DefaultPass
	}
	return t.Content.ReviewLab.PassPercent
}

// LabReviewInput is a submitted review. TaskID and ExpectedVersion are set when the review is
// a task's hand-in.
type LabReviewInput struct {
	TaskID          *uuid.UUID
	ExpectedVersion int
	Verdict         reviewlab.Verdict
	Summary         string
	Comments        []reviewlab.Comment
}

// LabOutcome is a graded review and, for a task, the task after it.
type LabOutcome struct {
	Review LabReview
	Task   *domain.Task
}

// SubmitLabReview grades a review. Practice is unlimited. As a task's hand-in, the student has
// three tries; passing or the last try finishes the task, and the best score counts.
func (w *Workspace) SubmitLabReview(ctx context.Context, u domain.User, key string, in LabReviewInput) (LabOutcome, error) {
	ex, ok := reviewlab.Get(key)
	if !ok {
		return LabOutcome{}, errNotFound
	}
	comments, fields := reviewlab.ValidateReview(ex, in.Verdict, in.Summary, in.Comments)
	if in.TaskID != nil && in.ExpectedVersion < 1 {
		fields["expected_version"] = "Must be a positive integer."
	}
	if len(fields) > 0 {
		return LabOutcome{}, apperr.Validation(fields)
	}
	now := w.Clock.Now()
	attempt := store.LabAttempt{Exercise: key, TaskID: in.TaskID, Verdict: in.Verdict, Summary: strings.TrimSpace(in.Summary),
		Comments: comments, CreatedAt: now}
	if in.TaskID == nil {
		res := reviewlab.Grade(ex, in.Verdict, comments, 0)
		id, err := store.InsertLabAttempt(ctx, w.Store.Pool, u.ID, attempt, res)
		if err != nil {
			return LabOutcome{}, err
		}
		attempt.ID, attempt.Score, attempt.Passed = id, res.Score, res.Passed
		w.later(func() { w.refreshBadgesFor(context.WithoutCancel(ctx), u) })
		return LabOutcome{Review: LabReview{Attempt: attempt, Result: res}}, nil
	}

	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return LabOutcome{}, err
	}
	if e.Status != domain.EnrollmentActive {
		return LabOutcome{}, apperr.New(apperr.CodeEnrollmentNotActive, "Your internship is "+string(e.Status)+".")
	}
	var out LabOutcome
	err = w.Store.Tx(ctx, func(q store.Q) error {
		t, err := store.GetTaskForUpdate(ctx, q, *in.TaskID)
		if errors.Is(err, store.ErrNotFound) || err == nil && (t.EnrollmentID != e.ID || t.ScheduledFor.After(now) || t.Status == domain.StatusCancelled) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		if t.Content.ReviewLab == nil || t.Content.ReviewLab.Exercise != key {
			return apperr.New(apperr.CodeInvalidTransition, "This task isn't a review of this pull request.")
		}
		if t.Version != in.ExpectedVersion {
			return apperr.New(apperr.CodeVersionConflict, "This task changed since you loaded it.")
		}
		if t.Status != domain.StatusTodo && t.Status != domain.StatusInProgress {
			return apperr.New(apperr.CodeInvalidTransition, "This review is already finished.")
		}
		used, err := store.TaskLabAttempts(ctx, q, t.ID)
		if err != nil {
			return err
		}
		if used >= reviewlab.MaxTaskAttempts {
			return apperr.New(apperr.CodeInvalidTransition, "No tries left on this review.")
		}
		res := reviewlab.Grade(ex, in.Verdict, comments, t.Content.ReviewLab.PassPercent)
		id, err := store.InsertLabAttempt(ctx, q, u.ID, attempt, res)
		if err != nil {
			return err
		}
		attempt.ID, attempt.Score, attempt.Passed = id, res.Score, res.Passed
		if t.Status == domain.StatusTodo {
			if t, err = store.SetTaskStatus(ctx, q, t, domain.StatusInProgress, u.ID, "", now); err != nil {
				return err
			}
		}
		if res.Passed || used+1 == reviewlab.MaxTaskAttempts {
			if t, err = store.SetTaskStatus(ctx, q, t, domain.StatusDone, u.ID, fmt.Sprintf("Review score %d%%", res.Score), now); err != nil {
				return err
			}
			if err := awardFinished(ctx, q, t, now); err != nil {
				return err
			}
		}
		if t, err = store.EnrichTask(ctx, q, t); err != nil {
			return err
		}
		out = LabOutcome{Review: LabReview{Attempt: attempt, Result: res}, Task: &t}
		return store.Notify(ctx, q, store.Event{Kind: store.EventTask, ID: t.ID, EnrollmentID: e.ID})
	})
	if err == nil {
		enr := e
		w.later(func() { w.refreshBadgesOf(context.WithoutCancel(ctx), enr) })
	}
	return out, err
}
