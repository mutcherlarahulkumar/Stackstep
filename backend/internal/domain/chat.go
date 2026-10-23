package domain

import (
	"time"

	"github.com/google/uuid"
)

// Author is who wrote a chat message.
type Author string

const (
	AuthorStudent Author = "student"
	AuthorLead    Author = "lead"
)

// Valid reports whether a is a known author.
func (a Author) Valid() bool { return a == AuthorStudent || a == AuthorLead }

// Message is one chat message. SentAt is when it becomes visible (its deliver_at).
type Message struct {
	ID           uuid.UUID
	EnrollmentID uuid.UUID
	Author       Author
	Body         string
	TaskID       *uuid.UUID
	ClientID     *uuid.UUID
	SentAt       time.Time
}
