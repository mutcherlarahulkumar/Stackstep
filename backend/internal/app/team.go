package app

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/lead"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Feature 29: the team room. Each student has one group conversation with every persona and
// Stackbot, the AI teammate. Nobody else is in it: it is keyed by the student's enrollment.

// teamMembers lists the personas who speak in team rooms (every active persona).
func teamMembers(ctx context.Context, q store.Q) ([]domain.Persona, error) {
	return store.ListPersonas(ctx, q, false)
}

// ensureTeamRoom posts Stackbot's welcome the first time a student's team room is read.
func (w *Workspace) ensureTeamRoom(ctx context.Context, e domain.Enrollment, studentName string) error {
	now := w.Clock.Now()
	return w.Store.Tx(ctx, func(q store.Q) error {
		if err := store.LockEnrollmentChat(ctx, q, e.ID); err != nil {
			return err
		}
		return welcomeOnce(ctx, q, e, studentName, now)
	})
}

// welcomeOnce posts the welcome if the room has no messages yet. Anything else posted in the
// room (a shout-out, a badge) calls it first, so the welcome is always the first message.
func welcomeOnce(ctx context.Context, q store.Q, e domain.Enrollment, studentName string, now time.Time) error {
	has, err := store.HasMessages(ctx, q, e.ID, domain.TeamPersonaID)
	if err != nil || has {
		return err
	}
	team, err := teamMembers(ctx, q)
	if err != nil {
		return err
	}
	_, _, err = store.InsertMessage(ctx, q, store.NewMessage{
		EnrollmentID: e.ID, PersonaID: domain.TeamPersonaID, Author: domain.AuthorPersona,
		Body: domain.TeamWelcome(studentName, team), DeliverAt: now.Add(-time.Second),
	}, now)
	return err
}

// teamSpeaker picks who answers a student's team room message: the persona they @mention, or
// Stackbot (nil). handOff is true when the mentioned persona is answered by people, not AI.
func teamSpeaker(body string, team []domain.Persona) (speaker *domain.Persona, handOff bool) {
	p := domain.Mentioned(body, team)
	if p == nil {
		return nil, false
	}
	return p, !p.AutoReply
}

// teamInput is what the AI sees when answering in the team room.
func teamInput(u domain.User, e domain.Enrollment, speaker *domain.Persona, team []domain.Persona, message string, open []domain.Task, history []lead.Turn, now time.Time) lead.Input {
	name, title := domain.BotName, domain.BotTitle
	if speaker != nil {
		name, title = speaker.Name, speaker.Title
	}
	mates := make([]string, 0, len(team))
	for _, p := range team {
		mates = append(mates, p.Name+" ("+p.Title+")")
	}
	return lead.Input{
		StudentName: u.Name, PersonaName: name, PersonaTitle: title, Message: message,
		DayNumber: e.DayNumber(now), ProgramDays: e.Program.Days, OpenTasks: openOnly(open), History: history,
		TeamRoom: true, Teammates: mates,
	}
}

// teamHistory is the recent team room conversation, oldest first, each line naming its speaker.
func teamHistory(msgs []domain.Message, skip uuid.UUID, names map[uuid.UUID]string) []lead.Turn {
	out := make([]lead.Turn, 0, len(msgs))
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		if m.ID == skip {
			continue
		}
		if m.Author == domain.AuthorStudent {
			out = append(out, lead.Turn{Body: m.Body})
			continue
		}
		who := domain.BotName
		if m.SpeakerID != nil {
			if n, ok := names[*m.SpeakerID]; ok {
				who = n
			}
		}
		out = append(out, lead.Turn{FromLead: true, Body: who + ": " + m.Body})
	}
	return out
}

// handOffNote is Stackbot telling the student a person will answer.
func handOffNote(p domain.Persona) string {
	return fmt.Sprintf("I've flagged this for %s. They'll answer here soon.", strings.Fields(p.Name)[0])
}

// teamReply answers a student's team room message. It runs after the message is stored.
func (w *Workspace) teamReply(ctx context.Context, e domain.Enrollment, u domain.User, msg domain.Message) {
	ctx, cancel := context.WithTimeout(ctx, aiReplyTimeout)
	defer cancel()
	now := w.Clock.Now()
	team, err := teamMembers(ctx, w.Store.Pool)
	if err != nil {
		w.Log.ErrorContext(ctx, "team reply: personas", "err", err, "enrollment", e.ID)
		return
	}
	speaker, handOff := teamSpeaker(msg.Body, team)
	var speakerID *uuid.UUID
	body := ""
	delay := time.Duration(0)
	if handOff {
		body = handOffNote(*speaker) // Stackbot says a person will answer
	} else {
		if speaker != nil {
			id := speaker.ID
			speakerID = &id
		}
		open, err := store.ListTasks(ctx, w.Store.Pool, e.ID, store.TaskFilter{VisibleAt: &now})
		if err != nil {
			w.Log.ErrorContext(ctx, "team reply: tasks", "err", err, "enrollment", e.ID)
			return
		}
		recent, err := store.ListMessages(ctx, w.Store.Pool, e.ID, domain.TeamPersonaID, now, nil, 11)
		if err != nil {
			w.Log.ErrorContext(ctx, "team reply: messages", "err", err, "enrollment", e.ID)
			return
		}
		names := map[uuid.UUID]string{}
		for _, p := range team {
			names[p.ID] = p.Name
		}
		reply, err := w.Lead.Reply(ctx, teamInput(u, e, speaker, team, msg.Body, open, teamHistory(recent, msg.ID, names), now))
		if err != nil {
			w.Log.ErrorContext(ctx, "team reply failed", "err", err, "enrollment", e.ID)
			return
		}
		body, delay = strings.TrimSpace(reply.Body), max(reply.Delay, 0)
	}
	if body == "" || utf8.RuneCountInString(body) > domain.MessageMaxLen {
		w.Log.WarnContext(ctx, "team reply dropped: empty or too long", "enrollment", e.ID)
		return
	}
	if _, _, err := store.InsertMessage(ctx, w.Store.Pool, store.NewMessage{
		EnrollmentID: e.ID, PersonaID: domain.TeamPersonaID, Author: domain.AuthorPersona, Body: body,
		SpeakerID: speakerID, DeliverAt: msg.SentAt.Add(delay),
	}, w.Clock.Now()); err != nil {
		w.Log.ErrorContext(ctx, "team reply: store", "err", err, "enrollment", e.ID)
	}
}

// teamKudos has the reviewing persona congratulate the student in the team room.
func teamKudos(ctx context.Context, q store.Q, e domain.Enrollment, t domain.Task, now time.Time) error {
	student, err := store.GetUser(ctx, q, e.UserID)
	if err != nil {
		return err
	}
	if err := welcomeOnce(ctx, q, e, student.Name, now); err != nil {
		return err
	}
	speaker := t.PersonaID
	_, _, err = store.InsertMessage(ctx, q, store.NewMessage{
		EnrollmentID: e.ID, PersonaID: domain.TeamPersonaID, Author: domain.AuthorPersona,
		Body: domain.TeamKudos(student.Name, t.Title), TaskID: &t.ID, SpeakerID: &speaker, DeliverAt: now,
	}, now)
	return err
}

// validTeamSpeaker checks the persona staff speak as in a team room.
func validTeamSpeaker(ctx context.Context, q store.Q, personaID uuid.UUID, speaker *uuid.UUID) (map[string]string, error) {
	switch {
	case personaID != domain.TeamPersonaID && speaker != nil:
		return map[string]string{"speaker_id": "Only the team room has speakers."}, nil
	case personaID != domain.TeamPersonaID:
		return nil, nil
	case speaker == nil:
		return map[string]string{"speaker_id": "Choose who is speaking in the team room."}, nil
	}
	active, err := store.ActivePersonaIDs(ctx, q, []uuid.UUID{*speaker})
	if err != nil {
		return nil, err
	}
	if !active[*speaker] {
		return map[string]string{"speaker_id": "Choose an active persona."}, nil
	}
	return nil, nil
}

// Team lists who is in the student's team room (every active persona; Stackbot is implied).
func (w *Workspace) Team(ctx context.Context, u domain.User) ([]domain.Persona, error) {
	if _, err := w.requireEnrollment(ctx, u); err != nil {
		return nil, err
	}
	return teamMembers(ctx, w.Store.Pool)
}
