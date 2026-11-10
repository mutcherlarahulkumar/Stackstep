package domain

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// ClassStatus is where a live class is in its life.
type ClassStatus string

const (
	ClassScheduled ClassStatus = "scheduled"
	ClassLive      ClassStatus = "live"
	ClassEnded     ClassStatus = "ended"
	ClassCancelled ClassStatus = "cancelled"
)

// Valid reports whether s is a known status.
func (s ClassStatus) Valid() bool {
	switch s {
	case ClassScheduled, ClassLive, ClassEnded, ClassCancelled:
		return true
	}
	return false
}

// Bounds for classes (mirrored in clients).
const (
	ClassTitleMin       = 3
	ClassTitleMax       = 120
	ClassDescriptionMax = 2000
	ClassMinMinutes     = 15
	ClassMaxMinutes     = 240
	ClassMaxDaysAhead   = 90
	// Room limits: what the room keeps in memory and how big a message can be.
	ClassChatKept       = 100
	ClassChatMax        = 500
	ClassQuestionMin    = 3
	ClassQuestionMax    = 300
	ClassQuestionsKept  = 200
	ClassStrokesKept    = 2000
	ClassStrokePointMax = 400
)

// ClassInput is what staff fill in to schedule a class.
type ClassInput struct {
	Title, Description string
	StartsAt           time.Time
	DurationMinutes    int
	Audience           Audience
}

// ValidateClass normalizes the title and checks the schedule.
func ValidateClass(in ClassInput, now time.Time) (ClassInput, map[string]string) {
	errs := map[string]string{}
	out := in
	out.Title = NormalizeText(in.Title)
	out.Description = strings.TrimSpace(in.Description)
	switch n := utf8.RuneCountInString(out.Title); {
	case hasBadControl(in.Title, false):
		errs["title"] = "The title contains characters that can't be displayed."
	case n < ClassTitleMin:
		errs["title"] = fmt.Sprintf("Give the class a title of at least %d characters.", ClassTitleMin)
	case n > ClassTitleMax:
		errs["title"] = fmt.Sprintf("Keep the title to %d characters.", ClassTitleMax)
	}
	switch {
	case !utf8.ValidString(out.Description) || hasBadControl(out.Description, true):
		errs["description"] = "The description contains characters that can't be displayed."
	case utf8.RuneCountInString(out.Description) > ClassDescriptionMax:
		errs["description"] = fmt.Sprintf("Keep the description to %d characters.", ClassDescriptionMax)
	}
	switch {
	case in.StartsAt.IsZero():
		errs["starts_at"] = "Pick when it starts."
	case in.StartsAt.Before(now.Add(-time.Hour)):
		errs["starts_at"] = "Pick a time from now on."
	case in.StartsAt.After(now.AddDate(0, 0, ClassMaxDaysAhead)):
		errs["starts_at"] = fmt.Sprintf("Schedule classes at most %d days ahead.", ClassMaxDaysAhead)
	}
	if in.DurationMinutes < ClassMinMinutes || in.DurationMinutes > ClassMaxMinutes {
		errs["duration_minutes"] = fmt.Sprintf("Classes last %d to %d minutes.", ClassMinMinutes, ClassMaxMinutes)
	}
	switch in.Audience {
	case AudienceAll, AudienceFlow, AudienceCohort:
	default:
		errs["audience"] = "Pick who is invited."
	}
	return out, errs
}

// ValidateRoomText checks a chat line or question typed in a class.
func ValidateRoomText(s string, minLen, maxLen int) (string, string) {
	t := strings.TrimSpace(s)
	switch n := utf8.RuneCountInString(t); {
	case !utf8.ValidString(s) || hasBadControl(t, true):
		return "", "That contains characters that can't be displayed."
	case n < minLen:
		if minLen <= 1 {
			return "", "Write something first."
		}
		return "", fmt.Sprintf("Write at least %d characters.", minLen)
	case n > maxLen:
		return "", fmt.Sprintf("Keep it to %d characters.", maxLen)
	}
	return t, ""
}

// ClassEnds is when a class is due to finish.
func ClassEnds(start time.Time, minutes int) time.Time {
	return start.Add(time.Duration(minutes) * time.Minute)
}
