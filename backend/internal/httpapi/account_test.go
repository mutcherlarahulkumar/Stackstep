package httpapi

import (
	"encoding/json"
	"strings"
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
	e.expect(e.do("GET", "/v1/me/export", "", nil), 401)
}

func TestExportMyData(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	task := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)

	// AX1: a JSON download with the profile, the internship, its tasks and its chat.
	r := e.expect(e.do("GET", "/v1/me/export", stu, nil), 200)
	if cd := r.Header.Get("Content-Disposition"); !strings.Contains(cd, "attachment;") || !strings.Contains(cd, ".json") {
		t.Fatalf("disposition = %q", cd)
	}
	if cc := r.Header.Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("cache-control = %q", cc)
	}
	var out struct {
		Profile struct {
			GitHubLogin string `json:"github_login"`
		} `json:"profile"`
		Internships []struct {
			Tasks []struct {
				Title string `json:"title"`
			} `json:"tasks"`
			Chat []struct {
				Body string `json:"body"`
			} `json:"chat"`
			Credits []json.RawMessage `json:"credits"`
		} `json:"internships"`
	}
	r.json(t, &out)
	if out.Profile.GitHubLogin != seed.StudentLogin || len(out.Internships) != 1 {
		t.Fatalf("export = %+v", out)
	}
	in := out.Internships[0]
	found := false
	for _, tk := range in.Tasks {
		found = found || tk.Title == task.Title
	}
	if !found || len(in.Chat) == 0 || in.Credits == nil {
		t.Fatalf("internship = %+v", in)
	}

	// AX2: staff get their own (internship-free) export; no one else's data leaks in.
	var staff struct {
		Profile struct {
			GitHubLogin string `json:"github_login"`
		} `json:"profile"`
		Internships []json.RawMessage `json:"internships"`
	}
	e.expect(e.do("GET", "/v1/me/export", adm, nil), 200).json(t, &staff)
	if staff.Profile.GitHubLogin != seed.AdminLogin || len(staff.Internships) != 0 {
		t.Fatalf("staff export = %+v", staff)
	}
}
