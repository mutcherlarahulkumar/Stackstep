package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/auth"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/clock"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Sessions issues, rotates and revokes tokens.
type Sessions struct {
	Store           *store.Store
	Clock           clock.Clock
	Signer          *auth.Signer
	BootstrapAdmins map[string]struct{}
}

// Tokens is a signed-in session.
type Tokens struct {
	AccessToken      string
	AccessExpiresAt  time.Time
	RefreshToken     string
	RefreshExpiresAt time.Time
}

var errUnauth = apperr.New(apperr.CodeUnauthenticated, "Please sign in again.")

// Issue starts a new token family for user.
func (s *Sessions) Issue(ctx context.Context, q store.Q, userID uuid.UUID) (Tokens, error) {
	return s.issue(ctx, q, userID, uuid.New())
}

func (s *Sessions) issue(ctx context.Context, q store.Q, userID, family uuid.UUID) (Tokens, error) {
	now := s.Clock.Now()
	access, accessExp, err := s.Signer.IssueAccess(userID, now)
	if err != nil {
		return Tokens{}, err
	}
	refresh, hash, err := auth.NewOpaqueToken()
	if err != nil {
		return Tokens{}, err
	}
	refreshExp := now.Add(auth.RefreshTTL)
	if err := store.InsertRefreshToken(ctx, q, family, userID, hash, refreshExp, now); err != nil {
		return Tokens{}, fmt.Errorf("store refresh token: %w", err)
	}
	return Tokens{AccessToken: access, AccessExpiresAt: accessExp, RefreshToken: refresh, RefreshExpiresAt: refreshExp}, nil
}

// Refresh rotates a refresh token. Presenting an already-rotated token revokes its whole family.
func (s *Sessions) Refresh(ctx context.Context, refresh string) (Tokens, error) {
	if refresh == "" || len(refresh) > 256 {
		return Tokens{}, errUnauth
	}
	now := s.Clock.Now()
	var out Tokens
	var reused bool
	err := s.Store.Tx(ctx, func(q store.Q) error {
		rt, err := store.GetRefreshTokenForUpdate(ctx, q, auth.HashToken(refresh))
		if errors.Is(err, store.ErrNotFound) {
			return errUnauth
		}
		if err != nil {
			return err
		}
		if rt.RevokedAt != nil {
			reused = true
			return store.RevokeRefreshFamily(ctx, q, rt.FamilyID, now)
		}
		if !rt.ExpiresAt.After(now) {
			return errUnauth
		}
		if err := store.RevokeRefreshToken(ctx, q, rt.ID, now); err != nil {
			return err
		}
		out, err = s.issue(ctx, q, rt.UserID, rt.FamilyID)
		return err
	})
	if reused {
		return Tokens{}, errUnauth // the revocation above committed
	}
	return out, err
}

// Logout revokes the refresh token's family. Unknown tokens are ignored.
func (s *Sessions) Logout(ctx context.Context, refresh string) error {
	if refresh == "" || len(refresh) > 256 {
		return nil
	}
	return s.Store.Tx(ctx, func(q store.Q) error {
		rt, err := store.GetRefreshTokenForUpdate(ctx, q, auth.HashToken(refresh))
		if errors.Is(err, store.ErrNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		return store.RevokeRefreshFamily(ctx, q, rt.FamilyID, s.Clock.Now())
	})
}

// SignInGitHub upserts the GitHub user.
func (s *Sessions) SignInGitHub(ctx context.Context, p auth.GitHubProfile) (domain.User, error) {
	var u domain.User
	err := s.Store.Tx(ctx, func(q store.Q) error {
		_, promote := s.BootstrapAdmins[strings.ToLower(p.Login)]
		var err error
		u, err = store.UpsertGitHubUser(ctx, q, store.GitHubUpsert{
			GitHubID: p.ID, Login: p.Login, Name: p.Name, Email: p.Email, AvatarURL: p.AvatarURL, PromoteToAdmin: promote,
		}, s.Clock.Now())
		return err
	})
	return u, err
}

// IssueLoginCode creates a 60-second one-time code for the mobile app, bound to its PKCE challenge.
func (s *Sessions) IssueLoginCode(ctx context.Context, userID uuid.UUID, challenge string) (string, error) {
	code, hash, err := auth.NewOpaqueToken()
	if err != nil {
		return "", err
	}
	if err := store.InsertLoginCode(ctx, s.Store.Pool, hash, userID, challenge, s.Clock.Now().Add(auth.LoginCodeTTL)); err != nil {
		return "", fmt.Errorf("store login code: %w", err)
	}
	return code, nil
}

// ExchangeLoginCode trades a one-time code plus PKCE verifier for tokens.
func (s *Sessions) ExchangeLoginCode(ctx context.Context, code, verifier string) (Tokens, error) {
	bad := apperr.New(apperr.CodeInvalidCode, "This sign-in link expired. Please try again.")
	if code == "" || len(code) > 256 {
		return Tokens{}, bad
	}
	var out Tokens
	var wrongVerifier bool
	err := s.Store.Tx(ctx, func(q store.Q) error {
		userID, challenge, err := store.ConsumeLoginCode(ctx, q, auth.HashToken(code), s.Clock.Now())
		if errors.Is(err, store.ErrNotFound) {
			return bad
		}
		if err != nil {
			return err
		}
		if !auth.VerifyPKCE(verifier, challenge) {
			wrongVerifier = true
			return nil // commit, so a code presented with the wrong verifier is burned
		}
		out, err = s.Issue(ctx, q, userID)
		return err
	})
	if err == nil && wrongVerifier {
		return Tokens{}, bad
	}
	return out, err
}

// DevLogin signs in an existing user by GitHub login. Callers must gate this to non-production.
func (s *Sessions) DevLogin(ctx context.Context, login string) (Tokens, error) {
	var out Tokens
	err := s.Store.Tx(ctx, func(q store.Q) error {
		u, err := store.GetUserByLogin(ctx, q, login)
		if errors.Is(err, store.ErrNotFound) {
			return apperr.Validation(map[string]string{"github_login": "No user with that login. Run the seed first."})
		}
		if err != nil {
			return err
		}
		out, err = s.Issue(ctx, q, u.ID)
		return err
	})
	return out, err
}
