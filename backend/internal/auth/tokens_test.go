package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var key = []byte(strings.Repeat("k", 32))

func TestAccessTokenRoundTrip(t *testing.T) {
	s, _ := NewSigner(key)
	now := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	id := uuid.New()
	tok, exp, err := s.IssueAccess(id, now)
	if err != nil {
		t.Fatal(err)
	}
	if !exp.Equal(now.Add(AccessTTL)) {
		t.Fatalf("exp = %v", exp)
	}
	got, err := s.VerifyAccess(tok, now.Add(time.Minute))
	if err != nil || got != id {
		t.Fatalf("verify = %v, %v", got, err)
	}
	if _, err := s.VerifyAccess(tok, now.Add(AccessTTL+time.Second)); err == nil {
		t.Fatal("expired token accepted")
	}
}

func TestAuthRejectsForgedTokens(t *testing.T) {
	s, _ := NewSigner(key)
	other, _ := NewSigner([]byte(strings.Repeat("x", 32)))
	now := time.Now()
	forged, _, _ := other.IssueAccess(uuid.New(), now)
	none, _ := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.RegisteredClaims{
		Subject: uuid.NewString(), Issuer: issuer, Audience: jwt.ClaimStrings{audience},
		ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
	}).SignedString(jwt.UnsafeAllowNoneSignatureType)
	for name, tok := range map[string]string{"other key": forged, "alg none": none, "garbage": "a.b.c", "empty": ""} {
		if _, err := s.VerifyAccess(tok, now); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestOAuthState(t *testing.T) {
	s, _ := NewStateSigner(key)
	now := time.Unix(1_800_000_000, 0)
	raw, _ := s.Sign(State{Client: ClientWeb, Nonce: "n1", IssuedAt: now.Unix()})
	if _, err := s.Verify(raw, now.Add(StateTTL-time.Second)); err != nil {
		t.Fatalf("fresh state rejected: %v", err)
	}
	if _, err := s.Verify(raw, now.Add(StateTTL+time.Second)); err == nil {
		t.Fatal("stale state accepted")
	}
	tampered := "x" + raw[1:]
	if _, err := s.Verify(tampered, now); err == nil {
		t.Fatal("tampered state accepted")
	}
	mobileNoChallenge, _ := s.Sign(State{Client: ClientMobile, Nonce: "n", IssuedAt: now.Unix()})
	if _, err := s.Verify(mobileNoChallenge, now); err == nil {
		t.Fatal("mobile state without PKCE challenge accepted")
	}
}

func TestPKCE(t *testing.T) {
	verifier := strings.Repeat("v", 64)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	if !ValidCodeChallenge(challenge) || !VerifyPKCE(verifier, challenge) {
		t.Fatal("valid PKCE pair rejected")
	}
	if VerifyPKCE(strings.Repeat("w", 64), challenge) {
		t.Fatal("wrong verifier accepted")
	}
	if VerifyPKCE("short", challenge) {
		t.Fatal("short verifier accepted")
	}
}
