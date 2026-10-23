package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/time/rate"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/ai"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/clock"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/config"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Helper runs points, credits and the students' AI helper. AI is used only here, and only
// to answer students; admins do everything by hand.
type Helper struct {
	Store  *store.Store
	Clock  clock.Clock
	AI     ai.Provider
	Limits config.AIConfig
	Log    *slog.Logger

	once   sync.Once
	global *rate.Limiter
	ws     *Workspace
}

// NewHelper wires a Helper to the workspace it shares enrollment checks with.
func NewHelper(w *Workspace, provider ai.Provider, limits config.AIConfig) *Helper {
	return &Helper{Store: w.Store, Clock: w.Clock, AI: provider, Limits: limits, Log: w.Log, ws: w}
}

func (h *Helper) limiter() *rate.Limiter {
	h.once.Do(func() {
		per := max(1, h.Limits.GlobalPerMinute)
		h.global = rate.NewLimiter(rate.Every(time.Minute/time.Duration(per)), per)
	})
	return h.global
}

// AIStatus tells the client what the student can do right now.
type AIStatus struct {
	Enabled         bool
	DailyLimit      int
	UsedToday       int
	CostPerQuestion int
	NextQuestionAt  *time.Time // set while the new-question cooldown runs
}

// Wallet is a student's points and credits.
type Wallet struct {
	Points  store.PointsSummary
	Credits int
	History []store.CreditEntry
	AI      AIStatus
}

func localDayStart(e domain.Enrollment, now time.Time) time.Time {
	loc := e.Location()
	y, m, d := now.In(loc).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, loc)
}

func (h *Helper) wallet(ctx context.Context, q store.Q, e domain.Enrollment, now time.Time) (Wallet, error) {
	if err := store.EnsureWelcomeCredits(ctx, q, e.ID, now); err != nil {
		return Wallet{}, err
	}
	var w Wallet
	var err error
	if w.Points, err = store.Points(ctx, q, e.ID); err != nil {
		return Wallet{}, err
	}
	if w.Credits, err = store.CreditBalance(ctx, q, e.ID); err != nil {
		return Wallet{}, err
	}
	if w.History, err = store.CreditHistory(ctx, q, e.ID, 50); err != nil {
		return Wallet{}, err
	}
	usage, err := store.GetAIUsage(ctx, q, e.ID, localDayStart(e, now), now.Add(-time.Minute), nil)
	if err != nil {
		return Wallet{}, err
	}
	w.AI = AIStatus{Enabled: h.Limits.Enabled(), DailyLimit: h.Limits.DailyQuestions, UsedToday: usage.QuestionsSince, CostPerQuestion: domain.CreditsPerQuestion}
	if usage.LastQuestionAt != nil {
		if next := usage.LastQuestionAt.Add(h.Limits.QuestionCooldown); next.After(now) {
			w.AI.NextQuestionAt = &next
		}
	}
	return w, nil
}

// MyWallet is the signed-in student's points and credits.
func (h *Helper) MyWallet(ctx context.Context, u domain.User) (Wallet, error) {
	e, err := h.ws.requireEnrollment(ctx, u)
	if err != nil {
		return Wallet{}, err
	}
	var w Wallet
	err = h.Store.Tx(ctx, func(q store.Q) error {
		w, err = h.wallet(ctx, q, e, h.Clock.Now())
		return err
	})
	return w, err
}

// StaffWallet shows a student's points and credits to staff in scope.
func (h *Helper) StaffWallet(ctx context.Context, u domain.User, enrollmentID uuid.UUID) (Wallet, error) {
	e, err := h.ws.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return Wallet{}, err
	}
	var w Wallet
	err = h.Store.Tx(ctx, func(q store.Q) error {
		w, err = h.wallet(ctx, q, e, h.Clock.Now())
		return err
	})
	return w, err
}

// GrantCredits is a staff member's manual change to a student's credits, with a reason.
func (h *Helper) GrantCredits(ctx context.Context, u domain.User, enrollmentID uuid.UUID, delta int, note string) (Wallet, error) {
	e, err := h.ws.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return Wallet{}, err
	}
	now := h.Clock.Now()
	var w Wallet
	err = h.Store.Tx(ctx, func(q store.Q) error {
		if err := store.LockEnrollment(ctx, q, e.ID); err != nil {
			return err
		}
		if err := store.EnsureWelcomeCredits(ctx, q, e.ID, now); err != nil {
			return err
		}
		balance, err := store.CreditBalance(ctx, q, e.ID)
		if err != nil {
			return err
		}
		n, fields := domain.ValidateCreditGrant(delta, note, balance)
		if len(fields) > 0 {
			return apperr.Validation(fields)
		}
		reason := domain.CreditAdminGrant
		if delta < 0 {
			reason = domain.CreditAdminRevoke
		}
		by := u.ID
		if _, err := store.InsertCredit(ctx, q, store.NewCredit{EnrollmentID: e.ID, Delta: delta, Reason: reason, Note: n, CreatedBy: &by}, now); err != nil {
			return err
		}
		w, err = h.wallet(ctx, q, e, now)
		return err
	})
	return w, err
}

// awardFinished records points and the task credit when a task reaches done. Idempotent.
func awardFinished(ctx context.Context, q store.Q, t domain.Task, now time.Time) error {
	if t.Status != domain.StatusDone {
		return nil
	}
	first, err := store.FirstSubmissionAt(ctx, q, t.ID)
	if err != nil {
		return err
	}
	best := 0
	if t.Type == domain.TaskQuiz {
		if best, err = store.BestQuizScore(ctx, q, t.ID); err != nil {
			return err
		}
	}
	onTime := domain.OnTime(t, first, now)
	if _, err := store.InsertPoints(ctx, q, t, domain.TaskPoints(t, best, onTime), onTime, now); err != nil {
		return fmt.Errorf("award points: %w", err)
	}
	if err := store.EnsureWelcomeCredits(ctx, q, t.EnrollmentID, now); err != nil {
		return err
	}
	id := t.ID
	_, err = store.InsertCredit(ctx, q, store.NewCredit{EnrollmentID: t.EnrollmentID, Delta: domain.CreditsPerTaskDone, Reason: domain.CreditTaskDone, TaskID: &id, Note: "Finished “" + t.Title + "”"}, now)
	return err
}

// ConversationDetail is a conversation with its turns and what the student may do next.
type ConversationDetail struct {
	Conversation  store.AIConversation
	Messages      []store.AIMessage
	FollowUpsLeft int
	// FollowUpAt is when the next follow-up opens (after time to try it yourself).
	FollowUpAt *time.Time
	Wallet     Wallet
}

func (h *Helper) detail(ctx context.Context, q store.Q, e domain.Enrollment, c store.AIConversation, now time.Time) (ConversationDetail, error) {
	msgs, err := store.ListAIMessages(ctx, q, c.ID)
	if err != nil {
		return ConversationDetail{}, err
	}
	d := ConversationDetail{Conversation: c, Messages: msgs, FollowUpsLeft: max(0, h.Limits.MaxFollowUps-c.FollowUps)}
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == "assistant" {
			at := msgs[i].CreatedAt.Add(h.Limits.FollowUpCooldown)
			d.FollowUpAt = &at
			break
		}
	}
	d.Wallet, err = h.wallet(ctx, q, e, now)
	return d, err
}

func (h *Helper) ownConversation(ctx context.Context, q store.Q, e domain.Enrollment, id uuid.UUID) (store.AIConversation, error) {
	c, err := store.GetAIConversation(ctx, q, id)
	if errors.Is(err, store.ErrNotFound) || err == nil && c.EnrollmentID != e.ID {
		return store.AIConversation{}, errNotFound
	}
	return c, err
}

// Conversations lists the student's AI conversations.
func (h *Helper) Conversations(ctx context.Context, u domain.User) ([]store.AIConversation, error) {
	e, err := h.ws.requireEnrollment(ctx, u)
	if err != nil {
		return nil, err
	}
	return store.ListAIConversations(ctx, h.Store.Pool, e.ID, 50)
}

// Conversation returns one of the student's conversations.
func (h *Helper) Conversation(ctx context.Context, u domain.User, id uuid.UUID) (ConversationDetail, error) {
	e, err := h.ws.requireEnrollment(ctx, u)
	if err != nil {
		return ConversationDetail{}, err
	}
	var d ConversationDetail
	err = h.Store.Tx(ctx, func(q store.Q) error {
		c, err := h.ownConversation(ctx, q, e, id)
		if err != nil {
			return err
		}
		d, err = h.detail(ctx, q, e, c, h.Clock.Now())
		return err
	})
	return d, err
}

// StaffConversations lets staff read a student's AI conversations (read only).
func (h *Helper) StaffConversations(ctx context.Context, u domain.User, enrollmentID uuid.UUID) ([]store.AIConversation, error) {
	e, err := h.ws.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return nil, err
	}
	return store.ListAIConversations(ctx, h.Store.Pool, e.ID, 50)
}

// StaffConversation reads one conversation of a student in scope.
func (h *Helper) StaffConversation(ctx context.Context, u domain.User, enrollmentID, id uuid.UUID) (ConversationDetail, error) {
	e, err := h.ws.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return ConversationDetail{}, err
	}
	var d ConversationDetail
	err = h.Store.Tx(ctx, func(q store.Q) error {
		c, err := h.ownConversation(ctx, q, e, id)
		if err != nil {
			return err
		}
		d, err = h.detail(ctx, q, e, c, h.Clock.Now())
		return err
	})
	return d, err
}

func rateLimited(msg string, wait time.Duration) error {
	secs := max(1, int(wait.Round(time.Second)/time.Second))
	return &apperr.Error{Code: apperr.CodeRateLimited, Message: msg, RetryAfterSeconds: secs}
}

// checkLimits enforces one question at a time, the daily cap and the credit balance.
func (h *Helper) checkLimits(ctx context.Context, q store.Q, e domain.Enrollment, now time.Time, conv *uuid.UUID) (store.AIUsage, error) {
	if err := store.LockEnrollment(ctx, q, e.ID); err != nil {
		return store.AIUsage{}, err
	}
	if err := store.EnsureWelcomeCredits(ctx, q, e.ID, now); err != nil {
		return store.AIUsage{}, err
	}
	dayStart := localDayStart(e, now)
	usage, err := store.GetAIUsage(ctx, q, e.ID, dayStart, now.Add(-time.Minute), conv)
	if err != nil {
		return usage, err
	}
	switch {
	case usage.Pending:
		return usage, rateLimited("Your last question is still being answered.", 10*time.Second)
	case usage.QuestionsSince >= h.Limits.DailyQuestions:
		return usage, rateLimited(fmt.Sprintf("You've used today's %d questions.", h.Limits.DailyQuestions), dayStart.AddDate(0, 0, 1).Sub(now))
	}
	balance, err := store.CreditBalance(ctx, q, e.ID)
	if err != nil {
		return usage, err
	}
	if balance < domain.CreditsPerQuestion {
		return usage, apperr.New(apperr.CodeInsufficientCredits, "You're out of credits.")
	}
	return usage, nil
}

func (h *Helper) taskContext(ctx context.Context, e domain.Enrollment, taskID *uuid.UUID, now time.Time) (*ai.TaskContext, error) {
	if taskID == nil {
		return nil, nil
	}
	t, err := store.GetTask(ctx, h.Store.Pool, *taskID)
	if errors.Is(err, store.ErrNotFound) || err == nil && (t.EnrollmentID != e.ID || t.ScheduledFor.After(now) || t.Status == domain.StatusCancelled) {
		return nil, apperr.Validation(map[string]string{"task_id": "Pick one of your tasks."})
	}
	if err != nil {
		return nil, err
	}
	if t.Type == domain.TaskQuiz {
		return nil, apperr.Validation(map[string]string{"task_id": "The helper can't help with quizzes. They check what you know."})
	}
	return &ai.TaskContext{Type: t.Type.Label(), Title: t.Title, Brief: t.Brief}, nil
}

func (h *Helper) requireAI(e domain.Enrollment) error {
	if !h.Limits.Enabled() || h.AI == nil {
		return apperr.New(apperr.CodeNotConfigured, "The AI helper isn't set up yet.")
	}
	if e.Status != domain.EnrollmentActive {
		return apperr.New(apperr.CodeEnrollmentNotActive, "Your internship is "+string(e.Status)+".")
	}
	return nil
}

// Ask starts a conversation with a fully explained question. It costs one credit, which is
// refunded if the model can't answer. Retrying with the same client id never charges twice.
func (h *Helper) Ask(ctx context.Context, u domain.User, clientID uuid.UUID, taskID *uuid.UUID, question domain.AIQuestion) (ConversationDetail, error) {
	e, err := h.ws.requireEnrollment(ctx, u)
	if err != nil {
		return ConversationDetail{}, err
	}
	if err := h.requireAI(e); err != nil {
		return ConversationDetail{}, err
	}
	if clientID == uuid.Nil {
		return ConversationDetail{}, apperr.Validation(map[string]string{"client_id": "Required."})
	}
	qv, fields := domain.ValidateAIQuestion(question)
	if len(fields) > 0 {
		return ConversationDetail{}, apperr.Validation(fields)
	}
	now := h.Clock.Now()
	if prev, err := store.AIMessageByClientID(ctx, h.Store.Pool, e.ID, clientID); err == nil {
		return h.Conversation(ctx, u, prev.ConversationID)
	} else if !errors.Is(err, store.ErrNotFound) {
		return ConversationDetail{}, err
	}
	taskCtx, err := h.taskContext(ctx, e, taskID, now)
	if err != nil {
		return ConversationDetail{}, err
	}

	var conv store.AIConversation
	var msgID uuid.UUID
	err = h.Store.Tx(ctx, func(q store.Q) error {
		usage, err := h.checkLimits(ctx, q, e, now, nil)
		if err != nil {
			return err
		}
		if usage.LastQuestionAt != nil {
			if wait := usage.LastQuestionAt.Add(h.Limits.QuestionCooldown).Sub(now); wait > 0 {
				return rateLimited("Take a couple of minutes with the last answer before asking something new.", wait)
			}
		}
		if !h.limiter().Allow() {
			return rateLimited("The helper is busy right now. Try again in a moment.", 20*time.Second)
		}
		if conv, err = store.InsertAIConversation(ctx, q, e.ID, taskID, qv.Title(), now); err != nil {
			return err
		}
		cid := clientID
		if msgID, err = store.InsertAIMessage(ctx, q, store.NewAIMessage{
			ConversationID: conv.ID, EnrollmentID: e.ID, Role: "student", Status: "pending", Kind: "question", Body: qv.Prompt(),
			Parts: &store.AIParts{Goal: qv.Goal, Tried: qv.Tried, Error: qv.Error, Code: qv.Code}, ClientID: &cid,
		}, now); err != nil {
			return err
		}
		_, err = store.InsertCredit(ctx, q, store.NewCredit{EnrollmentID: e.ID, Delta: -domain.CreditsPerQuestion, Reason: domain.CreditAIQuestion, AIMessageID: &msgID, Note: qv.Title()}, now)
		return err
	})
	if err != nil {
		return ConversationDetail{}, err
	}
	history := []ai.Message{{Role: "user", Content: qv.Prompt()}}
	return h.answer(ctx, e, conv, msgID, taskCtx, history, true)
}

// FollowUp continues a conversation. The student must have spent a few minutes with the
// last answer and say what they tried since.
func (h *Helper) FollowUp(ctx context.Context, u domain.User, convID, clientID uuid.UUID, f domain.AIFollowUp) (ConversationDetail, error) {
	e, err := h.ws.requireEnrollment(ctx, u)
	if err != nil {
		return ConversationDetail{}, err
	}
	if err := h.requireAI(e); err != nil {
		return ConversationDetail{}, err
	}
	if clientID == uuid.Nil {
		return ConversationDetail{}, apperr.Validation(map[string]string{"client_id": "Required."})
	}
	fv, fields := domain.ValidateAIFollowUp(f)
	if len(fields) > 0 {
		return ConversationDetail{}, apperr.Validation(fields)
	}
	now := h.Clock.Now()
	if prev, err := store.AIMessageByClientID(ctx, h.Store.Pool, e.ID, clientID); err == nil {
		return h.Conversation(ctx, u, prev.ConversationID)
	} else if !errors.Is(err, store.ErrNotFound) {
		return ConversationDetail{}, err
	}

	var conv store.AIConversation
	var msgID uuid.UUID
	var history []ai.Message
	var taskCtx *ai.TaskContext
	err = h.Store.Tx(ctx, func(q store.Q) error {
		var err error
		if conv, err = h.ownConversation(ctx, q, e, convID); err != nil {
			return err
		}
		usage, err := h.checkLimits(ctx, q, e, now, &conv.ID)
		if err != nil {
			return err
		}
		if conv.FollowUps >= h.Limits.MaxFollowUps {
			return apperr.New(apperr.CodeInvalidTransition, "This conversation is full. Start a new question with everything you know now.")
		}
		if usage.LastAnswerInConv == nil {
			return apperr.New(apperr.CodeInvalidTransition, "Wait for the first answer before following up.")
		}
		if wait := usage.LastAnswerInConv.Add(h.Limits.FollowUpCooldown).Sub(now); wait > 0 {
			return rateLimited("Try the last hint yourself first. Follow-ups open after a few minutes.", wait)
		}
		if !h.limiter().Allow() {
			return rateLimited("The helper is busy right now. Try again in a moment.", 20*time.Second)
		}
		msgs, err := store.ListAIMessages(ctx, q, conv.ID)
		if err != nil {
			return err
		}
		for _, m := range msgs {
			switch {
			case m.Role == "assistant":
				history = append(history, ai.Message{Role: "assistant", Content: m.Body})
			case m.Status == "answered":
				history = append(history, ai.Message{Role: "user", Content: m.Body})
			}
		}
		history = append(history, ai.Message{Role: "user", Content: fv.Prompt()})
		cid := clientID
		if msgID, err = store.InsertAIMessage(ctx, q, store.NewAIMessage{
			ConversationID: conv.ID, EnrollmentID: e.ID, Role: "student", Status: "pending", Kind: "follow_up", Body: fv.Prompt(),
			Parts: &store.AIParts{TriedSince: fv.TriedSince, Question: fv.Body}, ClientID: &cid,
		}, now); err != nil {
			return err
		}
		_, err = store.InsertCredit(ctx, q, store.NewCredit{EnrollmentID: e.ID, Delta: -domain.CreditsPerQuestion, Reason: domain.CreditAIQuestion, AIMessageID: &msgID, Note: "Follow-up: " + conv.Title}, now)
		return err
	})
	if err != nil {
		return ConversationDetail{}, err
	}
	if conv.TaskID != nil {
		taskCtx, _ = h.taskContext(ctx, e, conv.TaskID, now) // the task may have been cancelled since; answer without it
	}
	return h.answer(ctx, e, conv, msgID, taskCtx, history, false)
}

// answer calls the model outside any transaction, then stores the answer or refunds.
func (h *Helper) answer(ctx context.Context, e domain.Enrollment, conv store.AIConversation, msgID uuid.UUID, task *ai.TaskContext,
	history []ai.Message, first bool,
) (ConversationDetail, error) {
	callCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), h.Limits.Timeout)
	defer cancel()
	out, callErr := h.AI.Complete(callCtx, ai.Build(task, history))
	now := h.Clock.Now()
	var d ConversationDetail
	err := h.Store.Tx(context.WithoutCancel(ctx), func(q store.Q) error {
		if callErr != nil {
			if _, err := store.InsertCredit(ctx, q, store.NewCredit{EnrollmentID: e.ID, Delta: domain.CreditsPerQuestion, Reason: domain.CreditAIRefund, AIMessageID: &msgID, Note: "Refund: no answer"}, now); err != nil {
				return err
			}
			if first {
				// Nothing useful to keep; the student still has their draft and can ask again.
				if err := store.DeleteAIConversation(ctx, q, conv.ID); err != nil {
					return err
				}
				return nil
			}
			return store.SetAIMessageStatus(ctx, q, msgID, "failed")
		}
		if err := store.SetAIMessageStatus(ctx, q, msgID, "answered"); err != nil {
			return err
		}
		if _, err := store.InsertAIMessage(ctx, q, store.NewAIMessage{
			ConversationID: conv.ID, EnrollmentID: e.ID, Role: "assistant", Status: "ok", Kind: "answer", Body: clipAnswer(out.Text),
			TokensIn: out.TokensIn, TokensOut: out.TokensOut,
		}, now); err != nil {
			return err
		}
		c, err := store.GetAIConversation(ctx, q, conv.ID)
		if err != nil {
			return err
		}
		d, err = h.detail(ctx, q, e, c, now)
		return err
	})
	if err != nil {
		return ConversationDetail{}, err
	}
	if callErr != nil {
		h.Log.WarnContext(ctx, "ai helper failed", "err", callErr, "enrollment", e.ID)
		var rl *ai.RateLimitedError
		switch {
		case errors.Is(callErr, ai.ErrNotConfigured):
			return ConversationDetail{}, apperr.New(apperr.CodeNotConfigured, "The AI helper isn't set up yet.")
		case errors.As(callErr, &rl):
			return ConversationDetail{}, rateLimited("The helper is busy right now. Your credit was refunded.", rl.RetryAfter)
		default:
			return ConversationDetail{}, apperr.New(apperr.CodeAIUnavailable, "The helper couldn't answer. Your credit was refunded.")
		}
	}
	return d, nil
}

// clipAnswer keeps stored answers inside the column bound.
func clipAnswer(s string) string {
	if r := []rune(s); len(r) > 12000 {
		return string(r[:11999]) + "…"
	}
	return s
}
