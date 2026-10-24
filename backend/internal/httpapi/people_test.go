package httpapi

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type cohortResp struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	SeatsTotal int       `json:"seats_total"`
	SeatsUsed  int       `json:"seats_used"`
	StartDate  string    `json:"start_date"`
}

type enrollResp struct {
	Student struct {
		User struct {
			GitHubLogin string `json:"github_login"`
			Name        string `json:"name"`
		} `json:"user"`
		Enrollment struct {
			ID        uuid.UUID `json:"id"`
			StartDate string    `json:"start_date"`
			EndDate   string    `json:"end_date"`
			Status    string    `json:"status"`
			Flow      *struct {
				Name string `json:"name"`
			} `json:"flow"`
		} `json:"enrollment"`
	} `json:"student"`
	UserCreated bool `json:"user_created"`
}

func (e *env) mustCollege(token, name string) uuid.UUID {
	e.t.Helper()
	var c struct {
		ID uuid.UUID `json:"id"`
	}
	e.expect(e.do("POST", "/v1/admin/colleges", token, map[string]any{"name": name}), 201).json(e.t, &c)
	return c.ID
}

func (e *env) mustCohort(token string, body map[string]any) cohortResp {
	e.t.Helper()
	var c cohortResp
	e.expect(e.do("POST", "/v1/admin/cohorts", token, body), 201).json(e.t, &c)
	return c
}

func TestPeopleEnroll(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)

	// PE1: colleges are unique; names are validated; only platform admins create them.
	college := e.mustCollege(adm, "Vizag Institute")
	if f := e.expect(e.do("POST", "/v1/admin/colleges", adm, map[string]any{"name": "vizag institute"}), 422).errCode(t).Error.Fields; f["name"] == "" {
		t.Fatalf("duplicate college: %v", f)
	}
	e.expect(e.do("POST", "/v1/admin/colleges", e.login(seed.CollegeAdminLogin), map[string]any{"name": "Other"}), 403)

	// PE2: cohorts check kind/college, program, seats and dates.
	bad := e.expect(e.do("POST", "/v1/admin/cohorts", adm, map[string]any{
		"kind": "college", "name": "x", "program_slug": "nope", "start_date": "2020-01-01", "seats_total": 0,
	}), 422).errCode(t).Error.Fields
	for _, k := range []string{"name", "college_id", "program_slug", "start_date", "seats_total"} {
		if bad[k] == "" {
			t.Errorf("cohort field %s not flagged: %v", k, bad)
		}
	}
	cohort := e.mustCohort(adm, map[string]any{
		"kind": "college", "name": "Vizag Batch 1", "college_id": college, "program_slug": "frontend-30", "start_date": "2026-11-02", "seats_total": 2,
	})

	// PE3: enroll a login that has never signed in, on a flow; the lead welcomes them.
	var r enrollResp
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{
		"github_login": "@New-Intern", "name": "New Intern", "cohort_id": cohort.ID, "flow_id": seed.ReactFlowID,
	}), 201).json(t, &r)
	if !r.UserCreated || r.Student.User.GitHubLogin != "New-Intern" || r.Student.Enrollment.StartDate != "2026-11-02" ||
		r.Student.Enrollment.EndDate != "2026-12-01" || r.Student.Enrollment.Flow == nil {
		t.Fatalf("enroll = %+v", r)
	}
	stu := e.login("new-intern") // dev sign-in stands in for their first GitHub sign-in
	me := e.me(stu)
	if me.Enrollment == nil || me.Enrollment.Status != "active" || me.User.Role != "student" {
		t.Fatalf("me = %+v", me)
	}
	var msgs struct {
		Items []struct {
			Body string `json:"body"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/threads/"+domain.DefaultPersonaID.String()+"/messages", stu, nil), 200).json(t, &msgs)
	welcomed := false
	for _, m := range msgs.Items {
		welcomed = welcomed || strings.HasPrefix(m.Body, "Welcome to Stackstep, New.")
	}
	if !welcomed {
		t.Fatalf("no welcome: %+v", msgs.Items)
	}

	// PE4: one open internship per student; staff can't be enrolled; seats run out.
	if f := e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "new-intern", "cohort_id": cohort.ID}), 422).errCode(t).Error.Fields; !strings.Contains(f["github_login"], "already has") {
		t.Fatalf("double enroll: %v", f)
	}
	if f := e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": seed.AdminLogin, "program_slug": "frontend-30", "start_date": "2026-11-02"}), 422).errCode(t).Error.Fields; !strings.Contains(f["github_login"], "staff") {
		t.Fatalf("staff enroll: %v", f)
	}
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "second-intern", "cohort_id": cohort.ID}), 201)
	if f := e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "third-intern", "cohort_id": cohort.ID}), 422).errCode(t).Error.Fields; !strings.Contains(f["cohort_id"], "seats") {
		t.Fatalf("seats: %v", f)
	}

	// PE5: without a cohort, admins pick the program and date; bad input is flagged per field.
	f := e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "bad login!", "timezone": "Mars/Base", "email": "nope"}), 422).errCode(t).Error.Fields
	for _, k := range []string{"github_login", "timezone", "email", "program_slug", "start_date"} {
		if f[k] == "" {
			t.Errorf("enroll field %s not flagged: %v", k, f)
		}
	}
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "indie-intern", "program_slug": "frontend-30", "start_date": "2026-11-10"}), 201).json(t, &r)
	if r.Student.Enrollment.EndDate != "2026-12-09" {
		t.Fatalf("indie = %+v", r)
	}

	// PE6: college admins see and enroll only in their own college's cohorts.
	tpo := e.login(seed.CollegeAdminLogin)
	var cohorts struct {
		Items []cohortResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/cohorts", tpo, nil), 200).json(t, &cohorts)
	for _, c := range cohorts.Items {
		if c.ID == cohort.ID {
			t.Fatal("college admin sees another college's cohort")
		}
	}
	if len(cohorts.Items) == 0 {
		t.Fatal("college admin sees no cohorts")
	}
	if f := e.expect(e.do("POST", "/v1/admin/enrollments", tpo, map[string]any{"github_login": "tpo-pick", "program_slug": "frontend-30", "start_date": "2026-11-02"}), 422).errCode(t).Error.Fields; f["cohort_id"] == "" {
		t.Fatalf("college admin without cohort: %v", f)
	}
	if f := e.expect(e.do("POST", "/v1/admin/enrollments", tpo, map[string]any{"github_login": "tpo-pick", "cohort_id": cohort.ID}), 422).errCode(t).Error.Fields; f["cohort_id"] == "" {
		t.Fatalf("college admin into other college: %v", f)
	}
	e.expect(e.do("POST", "/v1/admin/enrollments", tpo, map[string]any{"github_login": "tpo-pick", "cohort_id": cohorts.Items[0].ID}), 201)
	e.expect(e.do("POST", "/v1/admin/enrollments", stu, map[string]any{"github_login": "x", "cohort_id": cohort.ID}), 403)
}

func TestPeopleImport(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	var res struct {
		Created int `json:"created"`
		Items   []struct {
			GitHubLogin string    `json:"github_login"`
			Student     *struct{} `json:"student"`
			UserCreated bool      `json:"user_created"`
			Error       *struct {
				Code   string            `json:"code"`
				Fields map[string]string `json:"fields"`
			} `json:"error"`
		} `json:"items"`
	}
	// PI1: each row stands alone; duplicates, bad logins and existing interns are reported.
	e.expect(e.do("POST", "/v1/admin/enrollments/import", adm, map[string]any{
		"program_slug": "frontend-30", "start_date": "2026-11-02",
		"rows": []map[string]any{
			{"github_login": "batch-one", "name": "Batch One", "email": "one@example.com"},
			{"github_login": "Batch-One"},
			{"github_login": "not valid"},
			{"github_login": seed.StudentLogin},
			{"github_login": "batch-two"},
		},
	}), 200).json(t, &res)
	if res.Created != 2 || len(res.Items) != 5 {
		t.Fatalf("import = %+v", res)
	}
	for i, wantErr := range []bool{false, true, true, true, false} {
		if (res.Items[i].Error != nil) != wantErr {
			t.Errorf("row %d (%s): error = %+v", i, res.Items[i].GitHubLogin, res.Items[i].Error)
		}
	}
	if !res.Items[0].UserCreated || res.Items[3].Error.Fields["github_login"] == "" {
		t.Fatalf("rows = %+v", res.Items)
	}
	// PI2: re-running is safe; empty and oversized imports are refused.
	e.expect(e.do("POST", "/v1/admin/enrollments/import", adm, map[string]any{
		"program_slug": "frontend-30", "start_date": "2026-11-02", "rows": []map[string]any{{"github_login": "batch-one"}},
	}), 200).json(t, &res)
	if res.Created != 0 || res.Items[0].Error == nil {
		t.Fatalf("re-run = %+v", res)
	}
	e.expect(e.do("POST", "/v1/admin/enrollments/import", adm, map[string]any{"program_slug": "frontend-30", "start_date": "2026-11-02", "rows": []map[string]any{}}), 422)
	rows := make([]map[string]any, domain.MaxImportRows+1)
	for i := range rows {
		rows[i] = map[string]any{"github_login": "x"}
	}
	e.expect(e.do("POST", "/v1/admin/enrollments/import", adm, map[string]any{"program_slug": "frontend-30", "start_date": "2026-11-02", "rows": rows}), 422)
}

func TestEnrollmentStatus(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin).String()
	set := func(token, to string, code int) resp {
		t.Helper()
		return e.expect(e.do("POST", "/v1/admin/enrollments/"+enr+"/status", token, map[string]any{"status": to}), code)
	}

	// PS1: pause and resume; the student sees the state and a note from the lead.
	set(adm, "paused", 200)
	if m := e.me(stu); m.Enrollment == nil || m.Enrollment.Status != "paused" {
		t.Fatalf("me = %+v", m)
	}
	set(adm, "paused", 422)
	set(adm, "active", 200)

	// PS2: college admins outside the student's college get 404; students 403.
	e.expect(e.do("POST", "/v1/admin/enrollments/"+e.enrollmentOf(seed.IndieStudentLogin).String()+"/status", e.login(seed.CollegeAdminLogin), map[string]any{"status": "paused"}), 404)
	set(stu, "paused", 403)
	set(adm, "bogus", 422)

	// PS3: completed is final; the student can then be enrolled again.
	set(adm, "completed", 200)
	set(adm, "active", 422)
	if m := e.me(stu); m.Enrollment != nil {
		t.Fatalf("completed internship still open: %+v", m)
	}
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": seed.StudentLogin, "program_slug": "frontend-30", "start_date": "2026-11-02"}), 201)
}

func TestStaffRoles(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	college := e.mustCollege(adm, "Staff College")
	type staffResp struct {
		User struct {
			ID          uuid.UUID `json:"id"`
			GitHubLogin string    `json:"github_login"`
			Role        string    `json:"role"`
		} `json:"user"`
		CollegeName *string `json:"college_name"`
		SignedIn    bool    `json:"signed_in"`
	}

	// PR1: grant a college admin by login before they sign in; they see only their college.
	var s staffResp
	e.expect(e.do("POST", "/v1/admin/staff", adm, map[string]any{"github_login": "new-tpo", "role": "college_admin", "college_id": college}), 200).json(t, &s)
	if s.User.Role != "college_admin" || s.CollegeName == nil || *s.CollegeName != "Staff College" || s.SignedIn {
		t.Fatalf("grant = %+v", s)
	}
	tpo := e.login("new-tpo")
	var students struct {
		Items []any `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/students", tpo, nil), 200).json(t, &students)
	if len(students.Items) != 0 {
		t.Fatalf("new college admin sees %d students", len(students.Items))
	}

	// PR2: validation; students with an open internship can't become staff; only admins grant.
	f := e.expect(e.do("POST", "/v1/admin/staff", adm, map[string]any{"github_login": "x", "role": "college_admin"}), 422).errCode(t).Error.Fields
	if f["college_id"] == "" {
		t.Fatalf("missing college: %v", f)
	}
	e.expect(e.do("POST", "/v1/admin/staff", adm, map[string]any{"github_login": "x", "role": "student"}), 422)
	if f := e.expect(e.do("POST", "/v1/admin/staff", adm, map[string]any{"github_login": seed.StudentLogin, "role": "admin"}), 422).errCode(t).Error.Fields; !strings.Contains(f["github_login"], "open internship") {
		t.Fatalf("enrolled student promoted: %v", f)
	}
	e.expect(e.do("POST", "/v1/admin/staff", tpo, map[string]any{"github_login": "y", "role": "admin"}), 403)
	e.expect(e.do("GET", "/v1/admin/staff", tpo, nil), 403)

	// PR3: revoke takes effect on the next request; admins can't remove themselves.
	e.expect(e.do("POST", "/v1/admin/staff/"+s.User.ID.String()+"/revoke", adm, nil), 200)
	e.expect(e.do("GET", "/v1/admin/students", tpo, nil), 403)
	me := e.me(adm)
	e.expect(e.do("POST", "/v1/admin/staff/"+me.User.ID.String()+"/revoke", adm, nil), 422)
	if f := e.expect(e.do("POST", "/v1/admin/staff", adm, map[string]any{"github_login": seed.AdminLogin, "role": "college_admin", "college_id": college}), 422).errCode(t).Error.Fields; f["role"] == "" {
		t.Fatalf("self demotion: %v", f)
	}

	// PR4: a second admin can demote the first; the list shows who is staff.
	var second staffResp
	e.expect(e.do("POST", "/v1/admin/staff", adm, map[string]any{"github_login": "second-admin", "role": "admin"}), 200).json(t, &second)
	adm2 := e.login("second-admin")
	e.expect(e.do("POST", "/v1/admin/staff/"+me.User.ID.String()+"/revoke", adm2, nil), 200)
	var list struct {
		Items []staffResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/staff", adm2, nil), 200).json(t, &list)
	for _, it := range list.Items {
		if it.User.GitHubLogin == seed.AdminLogin {
			t.Fatal("demoted admin still listed")
		}
	}
	e.expect(e.do("POST", "/v1/admin/staff/"+uuid.NewString()+"/revoke", adm2, nil), 404)
}
