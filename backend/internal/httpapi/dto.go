package httpapi

import (
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Wire types. Field names and shapes are the contract in api/openapi.yaml.

type userDTO struct {
	ID          uuid.UUID   `json:"id"`
	GitHubLogin string      `json:"github_login"`
	Name        string      `json:"name"`
	Email       *string     `json:"email"`
	AvatarURL   *string     `json:"avatar_url"`
	Role        domain.Role `json:"role"`
	CollegeID   *uuid.UUID  `json:"college_id"`
}

func toUser(u domain.User) userDTO {
	return userDTO{ID: u.ID, GitHubLogin: u.GitHubLogin, Name: u.Name, Email: u.Email, AvatarURL: u.AvatarURL, Role: u.Role, CollegeID: u.CollegeID}
}

type programDTO struct {
	Slug  string `json:"slug"`
	Days  int    `json:"days"`
	Track string `json:"track"`
}

type enrollmentDTO struct {
	ID        uuid.UUID               `json:"id"`
	Program   programDTO              `json:"program"`
	StartDate string                  `json:"start_date"`
	EndDate   string                  `json:"end_date"`
	Timezone  string                  `json:"timezone"`
	Status    domain.EnrollmentStatus `json:"status"`
	DayNumber int                     `json:"day_number"`
	Flow      *enrollmentFlowDTO      `json:"flow"`
}

type enrollmentFlowDTO struct {
	FlowID    uuid.UUID `json:"flow_id"`
	VersionID uuid.UUID `json:"version_id"`
	Name      string    `json:"name"`
	Version   int       `json:"version"`
}

func toEnrollment(e domain.Enrollment, now time.Time) enrollmentDTO {
	return enrollmentDTO{
		ID:        e.ID,
		Program:   programDTO{Slug: e.Program.Slug, Days: e.Program.Days, Track: e.Program.Track},
		StartDate: e.StartDate.Format(time.DateOnly),
		EndDate:   e.EndDate.Format(time.DateOnly),
		Timezone:  e.Timezone,
		Status:    e.Status,
		DayNumber: e.DayNumber(now),
		Flow:      toEnrollmentFlow(e.Flow),
	}
}

func toEnrollmentFlow(f *domain.EnrollmentFlow) *enrollmentFlowDTO {
	if f == nil {
		return nil
	}
	return &enrollmentFlowDTO{FlowID: f.FlowID, VersionID: f.VersionID, Name: f.Name, Version: f.Number}
}

type taskDTO struct {
	ID           uuid.UUID         `json:"id"`
	EnrollmentID uuid.UUID         `json:"enrollment_id"`
	Type         domain.TaskType   `json:"type"`
	Title        string            `json:"title"`
	Brief        string            `json:"brief"`
	Status       domain.TaskStatus `json:"status"`
	ScheduledFor time.Time         `json:"scheduled_for"`
	DueAt        time.Time         `json:"due_at"`
	Version      int               `json:"version"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
	ReviewMode   domain.ReviewMode `json:"review_mode"`
	PersonaID    uuid.UUID         `json:"persona_id"`
	FromFlow     bool              `json:"from_flow"`
	Content      contentDTO        `json:"content"`
	Submission   *submissionDTO    `json:"submission"`
	QuizResult   *quizStatsDTO     `json:"quiz_result"`
}

type resourceDTO struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

type quizQuestionDTO struct {
	Prompt  string   `json:"prompt"`
	Options []string `json:"options"`
	// Answer is the right option's index; null for students until the quiz is finished.
	Answer *int `json:"answer"`
}

type quizDTO struct {
	Questions   []quizQuestionDTO `json:"questions"`
	PassPercent int               `json:"pass_percent"`
}

type contentDTO struct {
	Resources []resourceDTO `json:"resources"`
	Quiz      *quizDTO      `json:"quiz"`
}

func toContent(c domain.TaskContent, showAnswers bool) contentDTO {
	out := contentDTO{Resources: make([]resourceDTO, len(c.Resources))}
	for i, r := range c.Resources {
		out.Resources[i] = resourceDTO(r)
	}
	if c.Quiz != nil {
		q := &quizDTO{PassPercent: c.Quiz.PassPercent, Questions: make([]quizQuestionDTO, len(c.Quiz.Questions))}
		for i, qq := range c.Quiz.Questions {
			q.Questions[i] = quizQuestionDTO{Prompt: qq.Prompt, Options: qq.Options}
			if showAnswers {
				a := qq.Answer
				q.Questions[i].Answer = &a
			}
		}
		out.Quiz = q
	}
	return out
}

// input converts a request body; a missing answer becomes -1 so validation flags it.
func (c contentDTO) input() domain.TaskContent {
	out := domain.TaskContent{Resources: make([]domain.Resource, len(c.Resources))}
	for i, r := range c.Resources {
		out.Resources[i] = domain.Resource(r)
	}
	if c.Quiz != nil {
		q := &domain.Quiz{PassPercent: c.Quiz.PassPercent, Questions: make([]domain.QuizQuestion, len(c.Quiz.Questions))}
		for i, qq := range c.Quiz.Questions {
			a := -1
			if qq.Answer != nil {
				a = *qq.Answer
			}
			q.Questions[i] = domain.QuizQuestion{Prompt: qq.Prompt, Options: qq.Options, Answer: a}
		}
		out.Quiz = q
	}
	return out
}

type submissionDTO struct {
	Attempt     int              `json:"attempt"`
	URL         *string          `json:"url"`
	Note        string           `json:"note"`
	SubmittedAt time.Time        `json:"submitted_at"`
	Checks      []handInCheckDTO `json:"checks"` // reviewer warnings; always empty for students
}

type handInCheckDTO struct {
	Code    domain.HandInCheckCode `json:"code"`
	Message string                 `json:"message"`
}

type quizStatsDTO struct {
	Attempts     int    `json:"attempts"`
	AttemptsLeft int    `json:"attempts_left"`
	BestScore    int    `json:"best_score"`
	Passed       bool   `json:"passed"`
	LastCorrect  []bool `json:"last_correct"`
}

// toTask renders a task. Students see a quiz's answers only once it is finished.
func toTask(t domain.Task, staff bool) taskDTO {
	finished := t.Quiz != nil && t.Quiz.Finished() || t.Status == domain.StatusDone
	dto := taskDTO{ID: t.ID, EnrollmentID: t.EnrollmentID, Type: t.Type, Title: t.Title, Brief: t.Brief, Status: t.Status,
		ScheduledFor: t.ScheduledFor.UTC(), DueAt: t.DueAt.UTC(), Version: t.Version, CreatedAt: t.CreatedAt.UTC(), UpdatedAt: t.UpdatedAt.UTC(),
		ReviewMode: t.ReviewMode, PersonaID: t.PersonaID, FromFlow: t.FlowItemID != nil, Content: toContent(t.Content, staff || finished)}
	if s := t.Submission; s != nil {
		dto.Submission = &submissionDTO{Attempt: s.Attempt, Note: s.Note, SubmittedAt: s.SubmittedAt.UTC(), Checks: []handInCheckDTO{}}
		if staff {
			for _, c := range s.Checks {
				dto.Submission.Checks = append(dto.Submission.Checks, handInCheckDTO{Code: c.Code, Message: c.Message})
			}
		}
		if s.URL != "" {
			u := s.URL
			dto.Submission.URL = &u
		}
	}
	if q := t.Quiz; q != nil {
		dto.QuizResult = &quizStatsDTO{Attempts: q.Attempts, AttemptsLeft: max(0, domain.MaxQuizAttempts-q.Attempts), BestScore: q.BestScore,
			Passed: q.Passed, LastCorrect: q.LastCorrect}
		if q.Passed {
			dto.QuizResult.AttemptsLeft = 0
		}
	}
	return dto
}

func toTasks(ts []domain.Task, staff bool) []taskDTO {
	out := make([]taskDTO, len(ts))
	for i, t := range ts {
		out[i] = toTask(t, staff)
	}
	return out
}

type messageDTO struct {
	ID           uuid.UUID     `json:"id"`
	EnrollmentID uuid.UUID     `json:"enrollment_id"`
	PersonaID    uuid.UUID     `json:"persona_id"`
	Author       domain.Author `json:"author"`
	Body         string        `json:"body"`
	TaskID       *uuid.UUID    `json:"task_id"`
	ClientID     *uuid.UUID    `json:"client_id"`
	SentAt       time.Time     `json:"sent_at"`
}

func toMessage(m domain.Message) messageDTO {
	return messageDTO{ID: m.ID, EnrollmentID: m.EnrollmentID, PersonaID: m.PersonaID, Author: m.Author, Body: m.Body, TaskID: m.TaskID, ClientID: m.ClientID, SentAt: m.SentAt.UTC()}
}

type meDTO struct {
	User       userDTO        `json:"user"`
	Enrollment *enrollmentDTO `json:"enrollment"`
}

type tokensDTO struct {
	AccessToken      string     `json:"access_token"`
	AccessExpiresAt  time.Time  `json:"access_expires_at"`
	RefreshToken     *string    `json:"refresh_token,omitempty"`
	RefreshExpiresAt *time.Time `json:"refresh_expires_at,omitempty"`
}

type studentDTO struct {
	User       userDTO       `json:"user"`
	Enrollment enrollmentDTO `json:"enrollment"`
	OpenTasks  int           `json:"open_tasks"`
	InReview   int           `json:"in_review"`
}

func toStudents(rows []store.StudentRow, now time.Time) []studentDTO {
	out := make([]studentDTO, len(rows))
	for i, r := range rows {
		out[i] = studentDTO{User: toUser(r.User), Enrollment: toEnrollment(r.Enrollment, now), OpenTasks: r.OpenTasks, InReview: r.InReview}
	}
	return out
}

// Requests.

type devLoginReq struct {
	GitHubLogin string `json:"github_login"`
}

type exchangeReq struct {
	Code         string `json:"code"`
	CodeVerifier string `json:"code_verifier"`
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

type createTaskReq struct {
	Content      contentDTO        `json:"content"`
	Type         domain.TaskType   `json:"type"`
	PersonaID    *uuid.UUID        `json:"persona_id"`
	ReviewMode   domain.ReviewMode `json:"review_mode"`
	Title        string            `json:"title"`
	Brief        string            `json:"brief"`
	ScheduledFor *time.Time        `json:"scheduled_for"`
	DueAt        time.Time         `json:"due_at"`
}

type transitionReq struct {
	To              domain.TaskStatus `json:"to"`
	ExpectedVersion int               `json:"expected_version"`
	Note            string            `json:"note"`
	Submission      *submissionReq    `json:"submission"`
}

type submissionReq struct {
	URL  string `json:"url"`
	Note string `json:"note"`
}

func (r transitionReq) input() app.TransitionInput {
	in := app.TransitionInput{To: r.To, ExpectedVersion: r.ExpectedVersion, Note: r.Note}
	if r.Submission != nil {
		in.Submission = &domain.Submission{URL: r.Submission.URL, Note: r.Submission.Note}
	}
	return in
}

type quizReq struct {
	ExpectedVersion int   `json:"expected_version"`
	Answers         []int `json:"answers"`
}

type quizResultDTO struct {
	Attempt      int    `json:"attempt"`
	Score        int    `json:"score"`
	Passed       bool   `json:"passed"`
	Correct      []bool `json:"correct"`
	AttemptsLeft int    `json:"attempts_left"`
}

type sendMessageReq struct {
	ClientID uuid.UUID `json:"client_id"`
	Body     string    `json:"body"`
}

// Realtime frames.

type frameType string

const (
	frameReady   frameType = "ready"
	frameMessage frameType = "message"
	frameTask    frameType = "task"
)

type frame struct {
	Type    frameType   `json:"type"`
	Message *messageDTO `json:"message,omitempty"`
	Task    *taskDTO    `json:"task,omitempty"`
}

// ---- Feature 02 wire types ----

type personaDTO struct {
	ID        uuid.UUID           `json:"id"`
	Name      string              `json:"name"`
	Title     string              `json:"title"`
	Color     domain.PersonaColor `json:"color"`
	AutoReply bool                `json:"auto_reply"`
	Archived  bool                `json:"archived"`
	Version   int                 `json:"version"`
}

func toPersona(p domain.Persona) personaDTO {
	return personaDTO{ID: p.ID, Name: p.Name, Title: p.Title, Color: p.Color, AutoReply: p.AutoReply, Archived: p.ArchivedAt != nil, Version: p.Version}
}

type personaReq struct {
	Name            string              `json:"name"`
	Title           string              `json:"title"`
	Color           domain.PersonaColor `json:"color"`
	AutoReply       bool                `json:"auto_reply"`
	Archived        bool                `json:"archived"`
	ExpectedVersion int                 `json:"expected_version"`
}

func (r personaReq) input() domain.PersonaInput {
	return domain.PersonaInput{Name: r.Name, Title: r.Title, Color: r.Color, AutoReply: r.AutoReply}
}

type taskSpecDTO struct {
	Type          domain.TaskType   `json:"type"`
	Title         string            `json:"title"`
	Brief         string            `json:"brief"`
	PersonaID     uuid.UUID         `json:"persona_id"`
	ReviewMode    domain.ReviewMode `json:"review_mode"`
	ReleaseTime   string            `json:"release_time"`
	DueMinutes    int               `json:"due_minutes"`
	ReleaseWindow int               `json:"release_window"`
	Content       contentDTO        `json:"content"`
}

func toSpec(s domain.TaskSpec) taskSpecDTO {
	return taskSpecDTO{Type: s.Type, Title: s.Title, Brief: s.Brief, PersonaID: s.PersonaID, ReviewMode: s.ReviewMode,
		ReleaseTime: s.ReleaseTime.String(), DueMinutes: s.DueMinutes, ReleaseWindow: s.ReleaseWindow, Content: toContent(s.Content, true)}
}

func (s taskSpecDTO) input() domain.TaskSpecInput {
	return domain.TaskSpecInput{Type: s.Type, Title: s.Title, Brief: s.Brief, PersonaID: s.PersonaID, ReviewMode: s.ReviewMode,
		ReleaseTime: s.ReleaseTime, DueMinutes: s.DueMinutes, ReleaseWindow: s.ReleaseWindow, Content: s.Content.input()}
}

type templateDTO struct {
	ID uuid.UUID `json:"id"`
	taskSpecDTO
	Archived  bool      `json:"archived"`
	Version   int       `json:"version"`
	UpdatedAt time.Time `json:"updated_at"`
}

func toTemplate(t domain.Template) templateDTO {
	return templateDTO{ID: t.ID, taskSpecDTO: toSpec(t.Spec), Archived: t.ArchivedAt != nil, Version: t.Version, UpdatedAt: t.UpdatedAt.UTC()}
}

type templateReq struct {
	Type            domain.TaskType   `json:"type"`
	Title           string            `json:"title"`
	Brief           string            `json:"brief"`
	PersonaID       uuid.UUID         `json:"persona_id"`
	ReviewMode      domain.ReviewMode `json:"review_mode"`
	ReleaseTime     string            `json:"release_time"`
	DueMinutes      int               `json:"due_minutes"`
	ReleaseWindow   int               `json:"release_window"`
	Content         contentDTO        `json:"content"`
	Archived        bool              `json:"archived"`
	ExpectedVersion int               `json:"expected_version"`
}

func (r templateReq) spec() domain.TaskSpecInput {
	return domain.TaskSpecInput{Type: r.Type, Title: r.Title, Brief: r.Brief, PersonaID: r.PersonaID, ReviewMode: r.ReviewMode,
		ReleaseTime: r.ReleaseTime, DueMinutes: r.DueMinutes, ReleaseWindow: r.ReleaseWindow, Content: r.Content.input()}
}

type flowDTO struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Stream      string    `json:"stream"`
	Description string    `json:"description"`
	Days        int       `json:"days"`
	Archived    bool      `json:"archived"`
	Version     int       `json:"version"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func toFlow(f domain.Flow) flowDTO {
	return flowDTO{ID: f.ID, Name: f.Name, Stream: f.Stream, Description: f.Description, Days: f.Days, Archived: f.ArchivedAt != nil,
		Version: f.Version, UpdatedAt: f.UpdatedAt.UTC()}
}

type flowSummaryDTO struct {
	flowDTO
	PublishedVersion *int `json:"published_version"`
	HasDraft         bool `json:"has_draft"`
	TaskCount        int  `json:"task_count"`
	ActiveStudents   int  `json:"active_students"`
}

type flowItemDTO struct {
	ID         uuid.UUID  `json:"id"`
	Day        int        `json:"day"`
	Position   int        `json:"position"`
	TemplateID *uuid.UUID `json:"template_id"`
	taskSpecDTO
}

type flowVersionDTO struct {
	ID          uuid.UUID                `json:"id"`
	Number      int                      `json:"number"`
	Status      domain.FlowVersionStatus `json:"status"`
	Revision    int                      `json:"revision"`
	PublishedAt *time.Time               `json:"published_at"`
	Items       []flowItemDTO            `json:"items"`
}

func toVersion(v *domain.FlowVersion) *flowVersionDTO {
	if v == nil {
		return nil
	}
	items := make([]flowItemDTO, len(v.Items))
	for i, it := range v.Items {
		items[i] = flowItemDTO{ID: it.ID, Day: it.Day, Position: it.Position, TemplateID: it.TemplateID, taskSpecDTO: toSpec(it.Spec)}
	}
	return &flowVersionDTO{ID: v.ID, Number: v.Number, Status: v.Status, Revision: v.Revision, PublishedAt: v.PublishedAt, Items: items}
}

type flowDetailDTO struct {
	Flow      flowDTO         `json:"flow"`
	Draft     *flowVersionDTO `json:"draft"`
	Published *flowVersionDTO `json:"published"`
}

func toFlowDetail(d app.FlowDetail) flowDetailDTO {
	return flowDetailDTO{Flow: toFlow(d.Flow), Draft: toVersion(d.Draft), Published: toVersion(d.Published)}
}

type flowReq struct {
	Name            string `json:"name"`
	Stream          string `json:"stream"`
	Description     string `json:"description"`
	Days            int    `json:"days"`
	Archived        bool   `json:"archived"`
	ExpectedVersion int    `json:"expected_version"`
}

func (r flowReq) input() domain.FlowInput {
	return domain.FlowInput{Name: r.Name, Stream: r.Stream, Description: r.Description, Days: r.Days}
}

type duplicateReq struct {
	Name   string `json:"name"`
	Stream string `json:"stream"`
}

type draftItemReq struct {
	Day        int        `json:"day"`
	TemplateID *uuid.UUID `json:"template_id"`
	taskSpecDTO
}

type draftReq struct {
	ExpectedRevision int            `json:"expected_revision"`
	Items            []draftItemReq `json:"items"`
}

type publishReq struct {
	ExpectedRevision int `json:"expected_revision"`
}

type assignFlowReq struct {
	FlowID uuid.UUID `json:"flow_id"`
}

type bulkAssignReq struct {
	EnrollmentIDs []uuid.UUID `json:"enrollment_ids"`
}

type itemErrorDTO struct {
	Code    apperr.Code       `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func toItemError(e *apperr.Error) *itemErrorDTO {
	if e == nil {
		return nil
	}
	return &itemErrorDTO{Code: e.Code, Message: e.Message, Fields: e.Fields}
}

type assignResultDTO struct {
	EnrollmentID uuid.UUID     `json:"enrollment_id"`
	Generated    int           `json:"generated"`
	Skipped      int           `json:"skipped"`
	Cancelled    int           `json:"cancelled"`
	Error        *itemErrorDTO `json:"error"`
}

func toAssignResult(r app.AssignResult) assignResultDTO {
	return assignResultDTO{EnrollmentID: r.EnrollmentID, Generated: r.Generated, Skipped: r.Skipped, Cancelled: r.Cancelled, Error: toItemError(r.Err)}
}

type threadDTO struct {
	EnrollmentID uuid.UUID   `json:"enrollment_id"`
	Persona      personaDTO  `json:"persona"`
	LastMessage  *messageDTO `json:"last_message"`
	Unread       int         `json:"unread"`
}

type staffThreadDTO struct {
	threadDTO
	Student threadStudentDTO `json:"student"`
}

type threadStudentDTO struct {
	Name        string  `json:"name"`
	GitHubLogin string  `json:"github_login"`
	AvatarURL   *string `json:"avatar_url"`
}

func toThread(t store.Thread, staff bool) threadDTO {
	var last *messageDTO
	if t.LastMessage != nil {
		m := toMessage(*t.LastMessage)
		last = &m
	}
	unread := t.UnreadStudent
	if staff {
		unread = t.UnreadStaff
	}
	return threadDTO{EnrollmentID: t.EnrollmentID, Persona: toPersona(t.Persona), LastMessage: last, Unread: unread}
}

type broadcastReq struct {
	PersonaID     uuid.UUID   `json:"persona_id"`
	ClientID      uuid.UUID   `json:"client_id"`
	EnrollmentIDs []uuid.UUID `json:"enrollment_ids"`
	Body          string      `json:"body"`
}

type broadcastResultDTO struct {
	EnrollmentID uuid.UUID     `json:"enrollment_id"`
	Sent         bool          `json:"sent"`
	Error        *itemErrorDTO `json:"error"`
}
