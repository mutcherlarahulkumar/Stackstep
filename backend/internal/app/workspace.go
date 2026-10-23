// Package app holds the use cases. Handlers call these; these call store and domain.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/clock"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/lead"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Workspace implements tasks and chat.
type Workspace struct {
	Store *store.Store
	Clock clock.Clock
	Lead  lead.Agent
	Log   *slog.Logger
}

var (
	errNotFound = apperr.New(apperr.CodeNotFound, "Not found.")
	errNoEnroll = apperr.New(apperr.CodeNoActiveEnrollment, "You don't have an active internship.")
)

// OpenEnrollment returns the student's open enrollment, or nil when there is none.
func (w *Workspace) OpenEnrollment(ctx context.Context, u domain.User) (*domain.Enrollment, error) {
	if u.Role != domain.RoleStudent {
		return nil, nil
	}
	e, err := store.OpenEnrollmentForUser(ctx, w.Store.Pool, u.ID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (w *Workspace) requireEnrollment(ctx context.Context, u domain.User) (domain.Enrollment, error) {
	if u.Role != domain.RoleStudent {
		return domain.Enrollment{}, apperr.New(apperr.CodeForbidden, "Only students have a workspace.")
	}
	e, err := w.OpenEnrollment(ctx, u)
	if err != nil {
		return domain.Enrollment{}, err
	}
	if e == nil {
		return domain.Enrollment{}, errNoEnroll
	}
	return *e, nil
}

// canStaff reports whether staff member u may manage enrollment e.
func canStaff(u domain.User, e domain.Enrollment) bool {
	switch u.Role {
	case domain.RoleAdmin:
		return true
	case domain.RoleCollegeAdmin:
		return u.CollegeID != nil && e.CollegeID != nil && *u.CollegeID == *e.CollegeID
	case domain.RoleStudent:
		return false
	}
	return false
}

func (w *Workspace) staffEnrollment(ctx context.Context, u domain.User, id uuid.UUID) (domain.Enrollment, error) {
	if !u.Role.IsStaff() {
		return domain.Enrollment{}, apperr.New(apperr.CodeForbidden, "Admins only.")
	}
	e, err := store.GetEnrollment(ctx, w.Store.Pool, id)
	if errors.Is(err, store.ErrNotFound) || err == nil && !canStaff(u, e) {
		return domain.Enrollment{}, errNotFound // never reveal enrollments outside the actor's scope
	}
	return e, err
}

// StudentTasks returns the board for the signed-in student.
func (w *Workspace) StudentTasks(ctx context.Context, u domain.User) ([]domain.Task, error) {
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return nil, err
	}
	now := w.Clock.Now()
	tasks, err := store.ListTasks(ctx, w.Store.Pool, e.ID, store.TaskFilter{VisibleAt: &now})
	if err != nil {
		return nil, err
	}
	return tasks, store.EnrichTasks(ctx, w.Store.Pool, tasks)
}

// StaffTasks returns every task of an enrollment for staff.
func (w *Workspace) StaffTasks(ctx context.Context, u domain.User, enrollmentID uuid.UUID) ([]domain.Task, domain.Enrollment, error) {
	e, err := w.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return nil, domain.Enrollment{}, err
	}
	tasks, err := store.ListTasks(ctx, w.Store.Pool, e.ID, store.TaskFilter{IncludeCancelled: true})
	if err != nil {
		return nil, e, err
	}
	if err := store.EnrichTasks(ctx, w.Store.Pool, tasks); err != nil {
		return nil, e, err
	}
	return tasks, e, store.AddHandInChecks(ctx, w.Store.Pool, tasks)
}

// CreateTask assigns a task to a student and has the lead announce it in chat.
func (w *Workspace) CreateTask(ctx context.Context, u domain.User, enrollmentID uuid.UUID, in domain.NewTaskInput) (domain.Task, error) {
	e, err := w.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return domain.Task{}, err
	}
	if e.Status != domain.EnrollmentActive {
		return domain.Task{}, apperr.New(apperr.CodeEnrollmentNotActive, "This internship is "+string(e.Status)+", so tasks can't be assigned.")
	}
	now := w.Clock.Now()
	if in.PersonaID == uuid.Nil {
		in.PersonaID = domain.DefaultPersonaID
	}
	v, fields := domain.ValidateNewTask(in, e, now)
	if active, err := store.ActivePersonaIDs(ctx, w.Store.Pool, []uuid.UUID{in.PersonaID}); err != nil {
		return domain.Task{}, err
	} else if !active[in.PersonaID] {
		fields["persona_id"] = "Choose an active persona."
	}
	if len(fields) > 0 {
		return domain.Task{}, apperr.Validation(fields)
	}
	var task domain.Task
	err = w.Store.Tx(ctx, func(q store.Q) error {
		var err error
		if task, err = insertAnnouncedTask(ctx, q, e, u.ID, v, now); err != nil {
			return err
		}
		if task.ScheduledFor.After(now) {
			return nil // the student sees it when it is due; the announcement's delivery carries the signal
		}
		return store.Notify(ctx, q, store.Event{Kind: store.EventTask, ID: task.ID, EnrollmentID: e.ID})
	})
	return task, err
}

// insertAnnouncedTask stores a task and schedules its persona's announcement for when it releases.
func insertAnnouncedTask(ctx context.Context, q store.Q, e domain.Enrollment, by uuid.UUID, v domain.ValidatedTask, now time.Time) (domain.Task, error) {
	task, err := store.InsertTask(ctx, q, e.ID, by, v, now)
	if err != nil {
		return domain.Task{}, fmt.Errorf("insert task: %w", err)
	}
	if err := store.InsertTaskCreatedEvent(ctx, q, task); err != nil {
		return domain.Task{}, err
	}
	taskID := task.ID
	if _, _, err := store.InsertMessage(ctx, q, store.NewMessage{
		EnrollmentID: e.ID, PersonaID: task.PersonaID, Author: domain.AuthorPersona, Body: lead.AnnounceTask(task, e.Location()),
		TaskID: &taskID, DeliverAt: task.ScheduledFor,
	}, now); err != nil {
		return domain.Task{}, fmt.Errorf("announce task: %w", err)
	}
	return task, nil
}

// TransitionInput is a request to move a task.
type TransitionInput struct {
	To              domain.TaskStatus
	ExpectedVersion int
	Note            string
	// Submission is the student's hand-in: required when submitting for review, optional
	// when finishing a self-reviewed task, ignored otherwise.
	Submission *domain.Submission
}

// Transition moves a task along the graph if the actor is allowed to.
func (w *Workspace) Transition(ctx context.Context, u domain.User, taskID uuid.UUID, in TransitionInput) (domain.Task, error) {
	fields := map[string]string{}
	if !in.To.Valid() {
		fields["to"] = "Unknown status."
	}
	if in.ExpectedVersion < 1 {
		fields["expected_version"] = "Must be a positive integer."
	}
	note, noteErr := domain.ValidateNote(in.Note, in.To)
	if noteErr != "" {
		fields["note"] = noteErr
	}
	if len(fields) > 0 {
		return domain.Task{}, apperr.Validation(fields)
	}

	now := w.Clock.Now()
	var out domain.Task
	err := w.Store.Tx(ctx, func(q store.Q) error {
		t, err := store.GetTaskForUpdate(ctx, q, taskID)
		if errors.Is(err, store.ErrNotFound) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		e, err := store.GetEnrollment(ctx, q, t.EnrollmentID)
		if err != nil {
			return err
		}

		var actor domain.Actor
		switch {
		case u.Role == domain.RoleStudent:
			if e.UserID != u.ID || t.ScheduledFor.After(now) || t.Status == domain.StatusCancelled {
				return errNotFound
			}
			if e.Status != domain.EnrollmentActive {
				return apperr.New(apperr.CodeEnrollmentNotActive, "Your internship is "+string(e.Status)+".")
			}
			actor = domain.ActorStudent
		case u.Role.IsStaff():
			if !canStaff(u, e) {
				return errNotFound
			}
			actor = domain.ActorStaff
		default:
			return apperr.New(apperr.CodeForbidden, "Not allowed.")
		}

		if t.Version != in.ExpectedVersion {
			return apperr.New(apperr.CodeVersionConflict, "This task changed since you loaded it.")
		}
		if !domain.CanTransition(t.Status, in.To, actor, t.ReviewMode) {
			return apperr.New(apperr.CodeInvalidTransition, fmt.Sprintf("A task can't move from %s to %s.", t.Status, in.To))
		}
		// Quizzes finish only through grading.
		if t.Type == domain.TaskQuiz && actor == domain.ActorStudent && in.To == domain.StatusDone {
			return apperr.New(apperr.CodeInvalidTransition, "Quizzes are finished by submitting your answers.")
		}
		var sub *domain.Submission
		if actor == domain.ActorStudent && (in.To == domain.StatusInReview || in.To == domain.StatusDone) {
			var subErrs map[string]string
			if sub, subErrs = domain.ValidateSubmission(in.Submission, t.Type, in.To); len(subErrs) > 0 {
				return apperr.Validation(subErrs)
			}
		}
		if out, err = store.SetTaskStatus(ctx, q, t, in.To, u.ID, note, now); err != nil {
			return fmt.Errorf("set status: %w", err)
		}
		if sub != nil {
			if err := store.InsertSubmission(ctx, q, t.ID, u.ID, *sub, now); err != nil {
				return fmt.Errorf("insert submission: %w", err)
			}
		}
		if err := awardFinished(ctx, q, out, now); err != nil {
			return err
		}
		if out, err = store.EnrichTask(ctx, q, out); err != nil {
			return err
		}
		if actor == domain.ActorStudent {
			if err := w.handIn(ctx, q, e, u, out, t.Status, in.To, sub, nil, now); err != nil {
				return err
			}
		}
		if msg := lead.AnnounceTransition(out, in.To, note); actor == domain.ActorStaff && msg != "" {
			id := out.ID
			by := u.ID
			if _, _, err := store.InsertMessage(ctx, q, store.NewMessage{
				EnrollmentID: e.ID, PersonaID: out.PersonaID, SentBy: &by, Author: domain.AuthorPersona, Body: msg, TaskID: &id, DeliverAt: now,
			}, now); err != nil {
				return fmt.Errorf("announce transition: %w", err)
			}
		}
		return store.Notify(ctx, q, store.Event{Kind: store.EventTask, ID: out.ID, EnrollmentID: e.ID})
	})
	return out, err
}

// Page bounds for list endpoints.
const (
	DefaultPageSize = 50
	MaxPageSize     = 100
)

// ValidatePage checks limit and cursor query parameters.
func ValidatePage(limit int, cursor string) (*store.Cursor, map[string]string) {
	fields := map[string]string{}
	if limit < 1 || limit > MaxPageSize {
		fields["limit"] = "Must be between 1 and 100."
	}
	c, err := store.DecodeCursor(cursor)
	if err != nil {
		fields["cursor"] = "Invalid cursor."
	}
	return c, fields
}

// Threads lists the student's conversations, one per persona, newest first.
func (w *Workspace) Threads(ctx context.Context, u domain.User) ([]store.Thread, error) {
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return nil, err
	}
	return store.StudentThreads(ctx, w.Store.Pool, e.ID, w.Clock.Now())
}

// activePersona returns a persona the student may write to.
func (w *Workspace) activePersona(ctx context.Context, id uuid.UUID) (domain.Persona, error) {
	p, err := store.GetPersona(ctx, w.Store.Pool, id)
	if errors.Is(err, store.ErrNotFound) || err == nil && p.ArchivedAt != nil {
		return domain.Persona{}, errNotFound
	}
	return p, err
}

// Messages returns one page of a conversation, newest first.
func (w *Workspace) Messages(ctx context.Context, u domain.User, personaID uuid.UUID, before *store.Cursor, limit int) ([]domain.Message, string, error) {
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return nil, "", err
	}
	if _, err := store.GetPersona(ctx, w.Store.Pool, personaID); errors.Is(err, store.ErrNotFound) {
		return nil, "", errNotFound
	} else if err != nil {
		return nil, "", err
	}
	return pageMessages(ctx, w.Store.Pool, e.ID, personaID, w.Clock.Now(), before, limit)
}

func pageMessages(ctx context.Context, q store.Q, enrollmentID, personaID uuid.UUID, now time.Time, before *store.Cursor, limit int) ([]domain.Message, string, error) {
	if before != nil {
		if _, err := before.Time(); err != nil {
			return nil, "", apperr.Validation(map[string]string{"cursor": "Invalid cursor."})
		}
	}
	msgs, err := store.ListMessages(ctx, q, enrollmentID, personaID, now, before, limit+1)
	if err != nil {
		return nil, "", err
	}
	next := ""
	if len(msgs) > limit {
		msgs = msgs[:limit]
		last := msgs[len(msgs)-1]
		next = store.EncodeCursor(store.TimeCursor(last.SentAt, last.ID))
	}
	return msgs, next, nil
}

// MarkRead records that the student read a conversation.
func (w *Workspace) MarkRead(ctx context.Context, u domain.User, personaID uuid.UUID) error {
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return err
	}
	return store.MarkThreadRead(ctx, w.Store.Pool, e.ID, personaID, true, w.Clock.Now())
}

// SendResult is the outcome of sending a message.
type SendResult struct {
	Message domain.Message
	Created bool
}

// SendMessage stores a student message to a persona. Auto-reply personas answer after their
// delay; others are answered by an admin. Retries with the same client id return the original.
func (w *Workspace) SendMessage(ctx context.Context, u domain.User, personaID, clientID uuid.UUID, body string) (SendResult, error) {
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return SendResult{}, err
	}
	persona, err := w.activePersona(ctx, personaID)
	if err != nil {
		return SendResult{}, err
	}
	fields := map[string]string{}
	if clientID == uuid.Nil {
		fields["client_id"] = "Must be a UUID."
	}
	clean, msgErr := domain.ValidateMessage(body)
	if msgErr != "" {
		fields["body"] = msgErr
	}
	if len(fields) > 0 {
		return SendResult{}, apperr.Validation(fields)
	}

	now := w.Clock.Now()
	var res SendResult
	err = w.Store.Tx(ctx, func(q store.Q) error {
		if err := store.LockEnrollmentChat(ctx, q, e.ID); err != nil {
			return err
		}
		// A retry of an already-stored message returns the original and is never rate limited.
		existing, err := store.FindMessageByClientID(ctx, q, e.ID, clientID)
		if err == nil {
			res = SendResult{Message: existing}
			return nil
		}
		if !errors.Is(err, store.ErrNotFound) {
			return err
		}
		dayStart := now.Truncate(24 * time.Hour) // UTC midnight
		count, err := store.CountStudentMessagesSince(ctx, q, e.ID, dayStart)
		if err != nil {
			return err
		}
		if count >= domain.MaxStudentMsgsPerDay {
			return &apperr.Error{Code: apperr.CodeRateLimited, Message: "You've hit today's message limit.",
				RetryAfterSeconds: int(dayStart.Add(24*time.Hour).Sub(now).Seconds()) + 1}
		}
		cid := clientID
		msg, created, err := store.InsertMessage(ctx, q, store.NewMessage{
			EnrollmentID: e.ID, PersonaID: persona.ID, Author: domain.AuthorStudent, Body: clean, ClientID: &cid, DeliverAt: now,
		}, now)
		if err != nil {
			return fmt.Errorf("insert message: %w", err)
		}
		res = SendResult{Message: msg, Created: created}
		if !created {
			return nil
		}
		if err := store.MarkThreadRead(ctx, q, e.ID, persona.ID, true, now); err != nil {
			return err
		}
		if !persona.AutoReply {
			return nil
		}
		open, err := store.ListTasks(ctx, q, e.ID, store.TaskFilter{VisibleAt: &now})
		if err != nil {
			return err
		}
		reply, err := w.Lead.Reply(ctx, lead.Input{
			StudentName: u.Name, Message: clean, DayNumber: e.DayNumber(now), ProgramDays: e.Program.Days,
			OpenTasks: openOnly(open),
		})
		if err != nil {
			return fmt.Errorf("lead reply: %w", err)
		}
		replyBody := strings.TrimSpace(reply.Body)
		if replyBody == "" || utf8.RuneCountInString(replyBody) > domain.MessageMaxLen {
			w.Log.WarnContext(ctx, "auto reply dropped: empty or too long", "enrollment", e.ID)
			return nil
		}
		_, _, err = store.InsertMessage(ctx, q, store.NewMessage{
			EnrollmentID: e.ID, PersonaID: persona.ID, Author: domain.AuthorPersona, Body: replyBody, DeliverAt: now.Add(max(reply.Delay, 0)),
		}, now)
		return err
	})
	return res, err
}

func openOnly(ts []domain.Task) []domain.Task {
	out := make([]domain.Task, 0, len(ts))
	for _, t := range ts {
		if !t.Status.Terminal() {
			out = append(out, t)
		}
	}
	return out
}

// Students lists students the staff member manages.
func (w *Workspace) Students(ctx context.Context, u domain.User, search string, after *store.Cursor, limit int) ([]store.StudentRow, string, error) {
	if !u.Role.IsStaff() {
		return nil, "", apperr.New(apperr.CodeForbidden, "Admins only.")
	}
	search = domain.NormalizeText(search)
	if utf8.RuneCountInString(search) > domain.SearchQueryMaxLen {
		return nil, "", apperr.Validation(map[string]string{"q": "Search can be at most 100 characters."})
	}
	var college *uuid.UUID
	if u.Role == domain.RoleCollegeAdmin {
		if u.CollegeID == nil {
			return []store.StudentRow{}, "", nil
		}
		college = u.CollegeID
	}
	rows, err := store.ListStudents(ctx, w.Store.Pool, college, search, after, limit+1)
	if err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		next = store.EncodeCursor(store.Cursor{Key: last.SortKey, ID: last.User.ID})
	}
	if rows == nil {
		rows = []store.StudentRow{}
	}
	return rows, next, nil
}

// QuizOutcome is a graded attempt plus the task after it.
type QuizOutcome struct {
	Task   domain.Task
	Result domain.QuizResult
}

// SubmitQuiz grades a student's answers. Passing, or using the last attempt, finishes the
// task; the best score counts. A todo quiz is started automatically.
func (w *Workspace) SubmitQuiz(ctx context.Context, u domain.User, taskID uuid.UUID, expectedVersion int, answers []int) (QuizOutcome, error) {
	if expectedVersion < 1 {
		return QuizOutcome{}, apperr.Validation(map[string]string{"expected_version": "Must be a positive integer."})
	}
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return QuizOutcome{}, err
	}
	if e.Status != domain.EnrollmentActive {
		return QuizOutcome{}, apperr.New(apperr.CodeEnrollmentNotActive, "Your internship is "+string(e.Status)+".")
	}
	now := w.Clock.Now()
	var out QuizOutcome
	err = w.Store.Tx(ctx, func(q store.Q) error {
		t, err := store.GetTaskForUpdate(ctx, q, taskID)
		if errors.Is(err, store.ErrNotFound) || err == nil && (t.EnrollmentID != e.ID || t.ScheduledFor.After(now) || t.Status == domain.StatusCancelled) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		if t.Type != domain.TaskQuiz || t.Content.Quiz == nil {
			return apperr.New(apperr.CodeInvalidTransition, "This task isn't a quiz.")
		}
		if t.Version != expectedVersion {
			return apperr.New(apperr.CodeVersionConflict, "This task changed since you loaded it.")
		}
		if t.Status != domain.StatusTodo && t.Status != domain.StatusInProgress {
			return apperr.New(apperr.CodeInvalidTransition, "This quiz is already finished.")
		}
		used, err := store.QuizAttempts(ctx, q, t.ID)
		if err != nil {
			return err
		}
		if used >= domain.MaxQuizAttempts {
			return apperr.New(apperr.CodeInvalidTransition, "No attempts left on this quiz.")
		}
		res, msg := domain.GradeQuiz(*t.Content.Quiz, answers, used+1)
		if msg != "" {
			return apperr.Validation(map[string]string{"answers": msg})
		}
		if err := store.InsertQuizAttempt(ctx, q, t.ID, answers, res, now); err != nil {
			return fmt.Errorf("insert quiz attempt: %w", err)
		}
		if t.Status == domain.StatusTodo {
			if t, err = store.SetTaskStatus(ctx, q, t, domain.StatusInProgress, u.ID, "", now); err != nil {
				return err
			}
		}
		if res.Passed || res.Attempt == domain.MaxQuizAttempts {
			if t, err = store.SetTaskStatus(ctx, q, t, domain.StatusDone, u.ID, fmt.Sprintf("Quiz score %d%%", res.Score), now); err != nil {
				return err
			}
			if err := awardFinished(ctx, q, t, now); err != nil {
				return err
			}
		}
		if t, err = store.EnrichTask(ctx, q, t); err != nil {
			return err
		}
		if t.Status == domain.StatusDone {
			best := res.Score
			if t.Quiz != nil {
				best = max(best, t.Quiz.BestScore)
			}
			if err := w.handIn(ctx, q, e, u, t, domain.StatusInProgress, domain.StatusDone, nil, &best, now); err != nil {
				return err
			}
		}
		out = QuizOutcome{Task: t, Result: res}
		return store.Notify(ctx, q, store.Event{Kind: store.EventTask, ID: t.ID, EnrollmentID: e.ID})
	})
	return out, err
}

// handIn posts the student's hand-in in the assigner's chat and schedules the assigner's
// short reply (an "ok" for reviews, a reflection question for finished work), so the work
// and the conversation about it stay together.
func (w *Workspace) handIn(ctx context.Context, q store.Q, e domain.Enrollment, student domain.User, t domain.Task, from, to domain.TaskStatus,
	sub *domain.Submission, quizScore *int, now time.Time) error {
	body := lead.HandInMessage(t, from, to, sub, quizScore)
	if body == "" {
		return nil
	}
	id := t.ID
	if _, _, err := store.InsertMessage(ctx, q, store.NewMessage{
		EnrollmentID: e.ID, PersonaID: t.PersonaID, Author: domain.AuthorStudent, Body: body, TaskID: &id, DeliverAt: now,
	}, now); err != nil {
		return fmt.Errorf("hand-in message: %w", err)
	}
	ack := lead.Acknowledge(t, to, student.Name, quizScore)
	if ack == "" {
		return nil
	}
	var delay time.Duration
	if d, ok := w.Lead.(lead.Delayer); ok {
		delay = d.ReplyDelay()
	}
	if _, _, err := store.InsertMessage(ctx, q, store.NewMessage{
		EnrollmentID: e.ID, PersonaID: t.PersonaID, Author: domain.AuthorPersona, Body: ack, TaskID: &id, DeliverAt: now.Add(delay),
	}, now); err != nil {
		return fmt.Errorf("hand-in reply: %w", err)
	}
	return nil
}
