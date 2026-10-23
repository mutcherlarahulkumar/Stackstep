package httpapi

import (
	"strings"
	"testing"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type progressResp struct {
	Released          int  `json:"released"`
	Done              int  `json:"done"`
	CompletionPercent int  `json:"completion_percent"`
	MeetsBar          bool `json:"meets_bar"`
	Points            int  `json:"points"`
	Certificate       *struct {
		Code string `json:"code"`
	} `json:"certificate"`
}

type certResp struct {
	Code         string  `json:"code"`
	StudentName  string  `json:"student_name"`
	TasksDone    int     `json:"tasks_done"`
	Points       int     `json:"points"`
	Status       string  `json:"status"`
	RevokeReason *string `json:"revoke_reason"`
}

func TestCertificates(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)

	task := e.mustCreateTask(adm, enr)
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	e.expect(e.move(stu, task.ID, "in_review", task.Version+1, ""), 200)
	e.expect(e.move(adm, task.ID, "done", task.Version+2, ""), 200)

	// CE1: progress counts what the student can see.
	var p progressResp
	e.expect(e.do("GET", "/v1/me/progress", stu, nil), 200).json(t, &p)
	if p.Released != 1 || p.Done != 1 || p.CompletionPercent != 100 || !p.MeetsBar || p.Points != 25 || p.Certificate != nil {
		t.Fatalf("progress = %+v", p)
	}

	// CE2: staff issue it; the snapshot carries the numbers; one valid certificate at a time.
	var c certResp
	e.expect(e.do("POST", "/v1/admin/enrollments/"+enr.String()+"/certificate", adm, nil), 201).json(t, &c)
	if !domain.ValidCertificateCode(c.Code) || c.StudentName != "Asha Rao" || c.TasksDone != 1 || c.Points != 25 || c.Status != "valid" {
		t.Fatalf("certificate = %+v", c)
	}
	e.expect(e.do("POST", "/v1/admin/enrollments/"+enr.String()+"/certificate", adm, nil), 422)
	e.expect(e.do("GET", "/v1/me/progress", stu, nil), 200).json(t, &p)
	if p.Certificate == nil || p.Certificate.Code != c.Code {
		t.Fatalf("student doesn't see it: %+v", p)
	}
	// The team lead congratulates the student in chat with the code.
	var msgs struct {
		Items []struct {
			Body string `json:"body"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/threads/"+domain.DefaultPersonaID.String()+"/messages", stu, nil), 200).json(t, &msgs)
	congratulated := false
	for _, m := range msgs.Items {
		congratulated = congratulated || strings.Contains(m.Body, c.Code)
	}
	if !congratulated {
		t.Fatalf("no congratulation: %+v", msgs.Items)
	}

	// CE3: anyone can verify, without signing in; junk and unknown codes are 404.
	var pub certResp
	e.expect(e.do("GET", "/v1/certificates/"+c.Code, "", nil), 200).json(t, &pub)
	if pub.StudentName != "Asha Rao" || pub.Status != "valid" {
		t.Fatalf("verify = %+v", pub)
	}
	e.expect(e.do("GET", "/v1/certificates/not-a-code", "", nil), 404)
	e.expect(e.do("GET", "/v1/certificates/ABCDEFGHJKMN", "", nil), 404)

	// CE4: only platform admins revoke, with a reason; revoked shows as revoked; a new one can be issued.
	tpo := e.login(seed.CollegeAdminLogin)
	e.expect(e.do("POST", "/v1/admin/certificates/"+c.Code+"/revoke", tpo, map[string]any{"reason": "x"}), 403)
	wantField(t, e.expect(e.do("POST", "/v1/admin/certificates/"+c.Code+"/revoke", adm, map[string]any{"reason": " "}), 422), "reason")
	e.expect(e.do("POST", "/v1/admin/certificates/"+c.Code+"/revoke", adm, map[string]any{"reason": "Issued to the wrong student"}), 200)
	e.expect(e.do("POST", "/v1/admin/certificates/"+c.Code+"/revoke", adm, map[string]any{"reason": "Again"}), 422)
	e.expect(e.do("GET", "/v1/certificates/"+c.Code, "", nil), 200).json(t, &pub)
	if pub.Status != "revoked" || pub.RevokeReason == nil {
		t.Fatalf("revoked = %+v", pub)
	}
	var again certResp
	e.expect(e.do("POST", "/v1/admin/enrollments/"+enr.String()+"/certificate", adm, nil), 201).json(t, &again)
	if again.Code == c.Code {
		t.Fatal("reissue reused the code")
	}
	var mine struct {
		Items []certResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/certificates", stu, nil), 200).json(t, &mine)
	if len(mine.Items) != 2 || mine.Items[0].Code != again.Code {
		t.Fatalf("my certificates = %+v", mine.Items)
	}

	// CE5: college admins only issue for their own students.
	meera := e.enrollmentOf(seed.IndieStudentLogin)
	e.expect(e.do("POST", "/v1/admin/enrollments/"+meera.String()+"/certificate", tpo, nil), 404)
	e.expect(e.do("POST", "/v1/admin/enrollments/"+meera.String()+"/certificate", stu, nil), 403)
}
