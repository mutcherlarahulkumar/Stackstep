package domain

import (
	"fmt"
	"net/url"
	"strings"
)

// HandInCheckCode names a reviewer warning about a hand-in. Warnings never block; they ask
// the reviewer to look closer.
type HandInCheckCode string

const (
	CheckForeignRepo HandInCheckCode = "foreign_repo" // a GitHub link outside the student's account
	CheckReusedLink  HandInCheckCode = "reused_link"  // the same link was handed in for another task
)

// Valid reports whether c is a known check.
func (c HandInCheckCode) Valid() bool { return c == CheckForeignRepo || c == CheckReusedLink }

// HandInCheck is one warning for the reviewer.
type HandInCheck struct {
	Code    HandInCheckCode
	Message string
}

// ReviewSLAHours is how long a hand-in may wait before the queue flags it.
const ReviewSLAHours = 24

// CheckGitHubOwner warns when a github.com link isn't under the student's own account.
// Students build on their own GitHub, so someone else's repo deserves a second look
// (it may still be fine, e.g. an open-source contribution).
func CheckGitHubOwner(rawURL, login string) *HandInCheck {
	u, err := url.Parse(rawURL)
	if err != nil || !strings.EqualFold(strings.TrimPrefix(u.Hostname(), "www."), "github.com") {
		return nil
	}
	owner, _, _ := strings.Cut(strings.Trim(u.Path, "/"), "/")
	if owner == "" || strings.EqualFold(owner, login) {
		return nil
	}
	return &HandInCheck{Code: CheckForeignRepo, Message: fmt.Sprintf("The link is under github.com/%s, not @%s's account.", owner, login)}
}

// ReusedLinkCheck warns when the same link was handed in for other tasks.
func ReusedLinkCheck(otherTasks int) *HandInCheck {
	if otherTasks <= 0 {
		return nil
	}
	s := "task"
	if otherTasks > 1 {
		s = "tasks"
	}
	return &HandInCheck{Code: CheckReusedLink, Message: fmt.Sprintf("The same link was handed in for %d other %s.", otherTasks, s)}
}
