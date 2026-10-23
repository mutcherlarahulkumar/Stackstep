package httpapi

import (
	"encoding/csv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type overviewResp struct {
	Items []struct {
		Student struct {
			User struct {
				GitHubLogin string `json:"github_login"`
			} `json:"user"`
		} `json:"student"`
		Released          int        `json:"released"`
		Done              int        `json:"done"`
		CompletionPercent int        `json:"completion_percent"`
		Points            int        `json:"points"`
		Credits           int        `json:"credits"`
		LastActiveAt      *time.Time `json:"last_active_at"`
		Inactive          bool       `json:"inactive"`
		Certificate       *struct {
			Code   string `json:"code"`
			Status string `json:"status"`
		} `json:"certificate"`
	} `json:"items"`
	Summary struct {
		Students     int `json:"students"`
		Inactive     int `json:"inactive"`
		Certificates int `json:"certificates"`
	} `json:"summary"`
	Truncated          bool `json:"truncated"`
	InactiveAfterHours int  `json:"inactive_after_hours"`
}

func (o overviewResp) row(t *testing.T, login string) int {
	t.Helper()
	for i, it := range o.Items {
		if it.Student.User.GitHubLogin == login {
			return i
		}
	}
	t.Fatalf("%s not in overview", login)
	return -1
}

func TestOverview(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)

	// PO1: numbers per student; activity clears the inactive flag.
	task := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.move(stu, task.ID, "in_review", task.Version+1, ""), 200)
	e.expect(e.move(adm, task.ID, "done", task.Version+2, ""), 200)
	e.expect(e.do("POST", "/v1/admin/enrollments/"+enr.String()+"/certificate", adm, nil), 201)

	var o overviewResp
	e.expect(e.do("GET", "/v1/admin/overview", adm, nil), 200).json(t, &o)
	r := o.Items[o.row(t, seed.StudentLogin)]
	if r.Released != 1 || r.Done != 1 || r.CompletionPercent != 100 || r.Points != 25 || r.Credits != domain.WelcomeCredits+1 ||
		r.LastActiveAt == nil || r.Inactive || r.Certificate == nil || r.Certificate.Status != "valid" {
		t.Fatalf("asha = %+v", r)
	}
	if o.InactiveAfterHours != 48 || o.Truncated || o.Summary.Certificates != 1 || o.Summary.Students != len(o.Items) {
		t.Fatalf("overview = %+v", o)
	}
	// PO2: a paused internship is never flagged; the welcome credits count before the
	// student first opens their wallet.
	if k := o.Items[o.row(t, seed.PausedLogin)]; k.Inactive || k.Credits != domain.WelcomeCredits {
		t.Fatalf("kiran = %+v", k)
	}

	// PO3: two quiet days flag the student; a chat message clears it.
	e.clock.Advance(domain.InactiveAfter + time.Minute)
	adm, stu = e.login(seed.AdminLogin), e.login(seed.StudentLogin) // tokens expired meanwhile
	e.expect(e.do("GET", "/v1/admin/overview", adm, nil), 200).json(t, &o)
	if !o.Items[o.row(t, seed.StudentLogin)].Inactive || o.Summary.Inactive < 1 {
		t.Fatalf("quiet student not flagged: %+v", o.Summary)
	}
	pid := domain.DefaultPersonaID.String()
	e.expect(e.do("POST", "/v1/me/threads/"+pid+"/messages", stu, map[string]any{"client_id": uuid.New(), "body": "Sorry, I was ill. Back now."}), 201)
	e.expect(e.do("GET", "/v1/admin/overview", adm, nil), 200).json(t, &o)
	if o.Items[o.row(t, seed.StudentLogin)].Inactive {
		t.Fatal("still flagged after a message")
	}

	// PO4: search narrows; college admins only see their college; students are refused.
	e.expect(e.do("GET", "/v1/admin/overview?q=ravi", adm, nil), 200).json(t, &o)
	if len(o.Items) != 1 || o.Items[0].Student.User.GitHubLogin != seed.Student2Login {
		t.Fatalf("search = %+v", o.Items)
	}
	e.expect(e.do("GET", "/v1/admin/overview", e.login(seed.CollegeAdminLogin), nil), 200).json(t, &o)
	for _, it := range o.Items {
		if it.Student.User.GitHubLogin == seed.IndieStudentLogin {
			t.Fatal("college admin sees an independent student")
		}
	}
	e.expect(e.do("GET", "/v1/admin/overview", stu, nil), 403)
	e.expect(e.do("GET", "/v1/admin/overview/export", stu, nil), 403)

	// PO5: CSV export has a header row and one row per student.
	res := e.expect(e.do("GET", "/v1/admin/overview/export", adm, nil), 200)
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Fatalf("content type = %q", ct)
	}
	if cd := res.Header.Get("Content-Disposition"); !strings.Contains(cd, "attachment;") || !strings.Contains(cd, ".csv") {
		t.Fatalf("disposition = %q", cd)
	}
	records, err := csv.NewReader(strings.NewReader(string(res.Body))).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	e.expect(e.do("GET", "/v1/admin/overview", adm, nil), 200).json(t, &o)
	if len(records) != len(o.Items)+1 || records[0][0] != "name" || len(records[0]) != len(csvHeader) {
		t.Fatalf("csv = %v", records)
	}
}

func TestCSVSafe(t *testing.T) {
	// PO6: cells that a spreadsheet would run as formulas are quoted.
	got := csvSafe([]string{"=HYPERLINK(\"x\")", "+1", "-2", "@cmd", "Asha", "", "12"})
	want := []string{"'=HYPERLINK(\"x\")", "'+1", "'-2", "'@cmd", "Asha", "", "12"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("csvSafe[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}
