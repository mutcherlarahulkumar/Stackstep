// Package auth issues and verifies tokens and talks to GitHub OAuth.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	issuer   = "stackstep-api"
	audience = "stackstep"

	AccessTTL    = 15 * time.Minute
	RefreshTTL   = 30 * 24 * time.Hour
	LoginCodeTTL = 60 * time.Second
	StateTTL     = 10 * time.Minute
)

// ErrInvalidToken is returned for any token that fails verification.
var ErrInvalidToken = errors.New("invalid token")

// Signer issues and verifies access tokens.
type Signer struct{ key []byte }

// NewSigner returns a Signer using an HMAC key of at least 32 bytes.
func NewSigner(key []byte) (*Signer, error) {
	if len(key) < 32 {
		return nil, errors.New("jwt key must be at least 32 bytes")
	}
	return &Signer{key: key}, nil
}

type accessClaims struct {
	jwt.RegisteredClaims
}

// IssueAccess returns a signed access token for userID valid for AccessTTL from now.
func (s *Signer) IssueAccess(userID uuid.UUID, now time.Time) (string, time.Time, error) {
	exp := now.Add(AccessTTL)
	claims := accessClaims{jwt.RegisteredClaims{
		Issuer:    issuer,
		Audience:  jwt.ClaimStrings{audience},
		Subject:   userID.String(),
		IssuedAt:  jwt.NewNumericDate(now),
		NotBefore: jwt.NewNumericDate(now.Add(-30 * time.Second)),
		ExpiresAt: jwt.NewNumericDate(exp),
		ID:        uuid.NewString(),
	}}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.key)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign access token: %w", err)
	}
	return tok, exp, nil
}

// VerifyAccess checks signature, algorithm, issuer, audience and expiry, and returns the user id.
func (s *Signer) VerifyAccess(raw string, now time.Time) (uuid.UUID, error) {
	var claims accessClaims
	_, err := jwt.ParseWithClaims(raw, &claims, func(*jwt.Token) (any, error) { return s.key, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(issuer),
		jwt.WithAudience(audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithTimeFunc(func() time.Time { return now }),
	)
	if err != nil {
		return uuid.Nil, ErrInvalidToken
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, ErrInvalidToken
	}
	return id, nil
}

// NewOpaqueToken returns a random URL-safe token and its SHA-256 hash for storage.
func NewOpaqueToken() (token string, hash []byte, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", nil, fmt.Errorf("random token: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	return token, HashToken(token), nil
}

// HashToken returns the storage hash of an opaque token.
func HashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

// Client is which app started a sign-in.
type Client string

const (
	ClientWeb    Client = "web"
	ClientMobile Client = "mobile"
)

// Valid reports whether c is a known client.
func (c Client) Valid() bool { return c == ClientWeb || c == ClientMobile }

// State is the signed OAuth state round-tripped through GitHub.
type State struct {
	Client        Client `json:"c"`
	Nonce         string `json:"n"`
	CodeChallenge string `json:"cc,omitempty"`
	IssuedAt      int64  `json:"t"`
}

// StateSigner signs OAuth state with HMAC-SHA256.
type StateSigner struct{ key []byte }

// NewStateSigner returns a StateSigner with a key of at least 32 bytes.
func NewStateSigner(key []byte) (*StateSigner, error) {
	if len(key) < 32 {
		return nil, errors.New("state key must be at least 32 bytes")
	}
	return &StateSigner{key: key}, nil
}

// Sign encodes and signs st.
func (s *StateSigner) Sign(st State) (string, error) {
	payload, err := json.Marshal(st)
	if err != nil {
		return "", fmt.Errorf("encode state: %w", err)
	}
	p := base64.RawURLEncoding.EncodeToString(payload)
	return p + "." + base64.RawURLEncoding.EncodeToString(s.mac(p)), nil
}

// Verify checks the signature and age of a state string.
func (s *StateSigner) Verify(raw string, now time.Time) (State, error) {
	p, sig, ok := strings.Cut(raw, ".")
	if !ok || len(raw) > 2048 {
		return State{}, ErrInvalidToken
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(got, s.mac(p)) {
		return State{}, ErrInvalidToken
	}
	payload, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return State{}, ErrInvalidToken
	}
	var st State
	if err := json.Unmarshal(payload, &st); err != nil || !st.Client.Valid() || st.Nonce == "" {
		return State{}, ErrInvalidToken
	}
	issued := time.Unix(st.IssuedAt, 0)
	if issued.After(now.Add(time.Minute)) || now.Sub(issued) > StateTTL {
		return State{}, ErrInvalidToken
	}
	if st.Client == ClientMobile && !ValidCodeChallenge(st.CodeChallenge) {
		return State{}, ErrInvalidToken
	}
	return st, nil
}

func (s *StateSigner) mac(p string) []byte {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(p))
	return m.Sum(nil)
}

// ValidCodeChallenge checks a PKCE S256 challenge: 43 base64url characters.
func ValidCodeChallenge(c string) bool {
	if len(c) != 43 {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(c)
	return err == nil
}

// VerifyPKCE checks that verifier hashes to challenge (RFC 7636, S256).
func VerifyPKCE(verifier, challenge string) bool {
	if len(verifier) < 43 || len(verifier) > 128 {
		return false
	}
	sum := sha256.Sum256([]byte(verifier))
	want := base64.RawURLEncoding.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(want), []byte(challenge)) == 1
}
