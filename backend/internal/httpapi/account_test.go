package httpapi

import (
	"testing"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type accountResp struct {
	TermsVersion    int  `json:"terms_version"`
	ConsentRequired bool `json:"consent_required"`
	Onboarded       bool `json:"onboarded"`
}

func TestAccountConsentAndOnboarding(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "fresh-intern", "program_slug": "frontend-30", "start_date": e.clock.Now().Format("2006-01-02")}), 201)
	tok := e.login("fresh-intern")

	// AC1: a new user must accept the current terms and hasn't seen the guide.
	var me struct {
		Account accountResp `json:"account"`
	}
	e.expect(e.do("GET", "/v1/me", tok, nil), 200).json(t, &me)
	if !me.Account.ConsentRequired || me.Account.Onboarded || me.Account.TermsVersion != domain.TermsVersion {
		t.Fatalf("new account = %+v", me.Account)
	}

	// AC2: a stale or missing version is refused; the current one is recorded.
	if f := e.expect(e.do("POST", "/v1/me/consent", tok, map[string]any{"version": domain.TermsVersion - 1}), 422).errCode(t).Error.Fields; f["version"] == "" {
		t.Fatalf("fields = %v", f)
	}
	e.expect(e.do("POST", "/v1/me/consent", tok, map[string]any{"version": "1"}), 400)
	var a accountResp
	e.expect(e.do("POST", "/v1/me/consent", tok, map[string]any{"version": domain.TermsVersion}), 200).json(t, &a)
	if a.ConsentRequired {
		t.Fatalf("after consent = %+v", a)
	}

	// AC3: onboarding is idempotent.
	e.expect(e.do("POST", "/v1/me/onboarded", tok, nil), 200).json(t, &a)
	e.expect(e.do("POST", "/v1/me/onboarded", tok, nil), 200).json(t, &a)
	e.expect(e.do("GET", "/v1/me", tok, nil), 200).json(t, &me)
	if me.Account.ConsentRequired || !me.Account.Onboarded {
		t.Fatalf("after onboarding = %+v", me.Account)
	}

	// AC4: unauthenticated callers are refused.
	e.expect(e.do("POST", "/v1/me/consent", "", map[string]any{"version": domain.TermsVersion}), 401)
	e.expect(e.do("GET", "/v1/me/export", "", nil), 404) // data export was removed
}
