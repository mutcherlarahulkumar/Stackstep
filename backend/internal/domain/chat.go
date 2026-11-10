package domain

import (
	"time"

	"github.com/google/uuid"
)

// Author is who wrote a chat message.
type Author string

const (
	AuthorStudent Author = "student"
	AuthorPersona Author = "persona"
)

// Valid reports whether a is a known author.
func (a Author) Valid() bool { return a == AuthorStudent || a == AuthorPersona }

// ReactionEmoji is one of the reactions a message can get.
type ReactionEmoji string

const (
	ReactThumbsUp ReactionEmoji = "thumbs_up"
	ReactHeart    ReactionEmoji = "heart"
	ReactParty    ReactionEmoji = "party"
	ReactLaugh    ReactionEmoji = "laugh"
	ReactThinking ReactionEmoji = "thinking"
	ReactEyes     ReactionEmoji = "eyes"
)

// Valid reports whether r is a known reaction.
func (r ReactionEmoji) Valid() bool {
	switch r {
	case ReactThumbsUp, ReactHeart, ReactParty, ReactLaugh, ReactThinking, ReactEyes:
		return true
	}
	return false
}

// Reaction is one emoji left by one side of the conversation.
type Reaction struct {
	Emoji ReactionEmoji
	By    Author
}

// Message is one chat message. SentAt is when it becomes visible (its deliver_at).
type Message struct {
	ID           uuid.UUID
	EnrollmentID uuid.UUID
	PersonaID    uuid.UUID
	Author       Author
	Body         string
	TaskID       *uuid.UUID
	ClientID     *uuid.UUID
	SentAt       time.Time
	// Automated is a persona message no admin wrote (scripted or AI reply, acknowledgement,
	// announcement).
	Automated bool
	// Reactions, oldest first; filled where the conversation is read.
	Reactions []Reaction
}
