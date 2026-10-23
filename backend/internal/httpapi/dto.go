package httpapi

import (
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
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
	}
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
}

func toTask(t domain.Task) taskDTO {
	return taskDTO{ID: t.ID, EnrollmentID: t.EnrollmentID, Type: t.Type, Title: t.Title, Brief: t.Brief, Status: t.Status,
		ScheduledFor: t.ScheduledFor.UTC(), DueAt: t.DueAt.UTC(), Version: t.Version, CreatedAt: t.CreatedAt.UTC(), UpdatedAt: t.UpdatedAt.UTC()}
}

func toTasks(ts []domain.Task) []taskDTO {
	out := make([]taskDTO, len(ts))
	for i, t := range ts {
		out[i] = toTask(t)
	}
	return out
}

type messageDTO struct {
	ID       uuid.UUID     `json:"id"`
	Author   domain.Author `json:"author"`
	Body     string        `json:"body"`
	TaskID   *uuid.UUID    `json:"task_id"`
	ClientID *uuid.UUID    `json:"client_id"`
	SentAt   time.Time     `json:"sent_at"`
}

func toMessage(m domain.Message) messageDTO {
	return messageDTO{ID: m.ID, Author: m.Author, Body: m.Body, TaskID: m.TaskID, ClientID: m.ClientID, SentAt: m.SentAt.UTC()}
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
	Type         domain.TaskType `json:"type"`
	Title        string          `json:"title"`
	Brief        string          `json:"brief"`
	ScheduledFor *time.Time      `json:"scheduled_for"`
	DueAt        time.Time       `json:"due_at"`
}

type transitionReq struct {
	To              domain.TaskStatus `json:"to"`
	ExpectedVersion int               `json:"expected_version"`
	Note            string            `json:"note"`
}

func (r transitionReq) input() app.TransitionInput {
	return app.TransitionInput{To: r.To, ExpectedVersion: r.ExpectedVersion, Note: r.Note}
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
