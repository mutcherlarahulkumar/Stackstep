package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

type collegeDTO struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Students      int       `json:"students"`
	Cohorts       int       `json:"cohorts"`
	CollegeAdmins int       `json:"college_admins"`
	CreatedAt     time.Time `json:"created_at"`
}

func toCollege(r store.CollegeRow) collegeDTO {
	return collegeDTO{ID: r.College.ID, Name: r.College.Name, Students: r.Students, Cohorts: r.Cohorts, CollegeAdmins: r.CollegeAdmins, CreatedAt: r.College.CreatedAt.UTC()}
}

type cohortDTO struct {
	ID          uuid.UUID         `json:"id"`
	Kind        domain.CohortKind `json:"kind"`
	Name        string            `json:"name"`
	CollegeID   *uuid.UUID        `json:"college_id"`
	CollegeName *string           `json:"college_name"`
	Program     programDTO        `json:"program"`
	StartDate   string            `json:"start_date"`
	SeatsTotal  int               `json:"seats_total"`
	SeatsUsed   int               `json:"seats_used"`
}

func toCohort(r store.CohortRow) cohortDTO {
	p := r.Cohort.Program
	return cohortDTO{ID: r.Cohort.ID, Kind: r.Cohort.Kind, Name: r.Cohort.Name, CollegeID: r.Cohort.CollegeID, CollegeName: r.CollegeName,
		Program: programDTO{Slug: p.Slug, Days: p.Days, Track: p.Track}, StartDate: r.Cohort.StartDate.Format(time.DateOnly),
		SeatsTotal: r.Cohort.SeatsTotal, SeatsUsed: r.SeatsUsed}
}

type staffDTO struct {
	User        userDTO `json:"user"`
	CollegeName *string `json:"college_name"`
	SignedIn    bool    `json:"signed_in"`
}

func toStaff(r store.StaffRow) staffDTO {
	return staffDTO{User: toUser(r.User), CollegeName: r.CollegeName, SignedIn: r.SignedIn}
}

// parseDate reads an optional YYYY-MM-DD field.
func parseDate(raw *string, field string) (*time.Time, error) {
	if raw == nil || *raw == "" {
		return nil, nil
	}
	t, err := time.Parse(time.DateOnly, *raw)
	if err != nil {
		return nil, apperr.Validation(map[string]string{field: "Use a date like 2026-11-02."})
	}
	return &t, nil
}

func (s *Server) listColleges(c *gin.Context) {
	rows, err := s.workspace.Colleges(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]collegeDTO, len(rows))
	for i, r := range rows {
		items[i] = toCollege(r)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type createCollegeReq struct {
	Name string `json:"name"`
}

func (s *Server) createCollege(c *gin.Context) {
	var req createCollegeReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	col, err := s.workspace.CreateCollege(c.Request.Context(), currentUser(c), req.Name)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toCollege(store.CollegeRow{College: col}))
}

func (s *Server) listPrograms(c *gin.Context) {
	rows, err := s.workspace.Programs(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]programDTO, len(rows))
	for i, r := range rows {
		items[i] = programDTO{Slug: r.Program.Slug, Days: r.Program.Days, Track: r.Program.Track}
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) listCohorts(c *gin.Context) {
	rows, err := s.workspace.Cohorts(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]cohortDTO, len(rows))
	for i, r := range rows {
		items[i] = toCohort(r)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type createCohortReq struct {
	Kind        domain.CohortKind `json:"kind"`
	Name        string            `json:"name"`
	CollegeID   *uuid.UUID        `json:"college_id"`
	ProgramSlug string            `json:"program_slug"`
	StartDate   *string           `json:"start_date"`
	Timezone    string            `json:"timezone"`
	SeatsTotal  int               `json:"seats_total"`
}

func (s *Server) createCohort(c *gin.Context) {
	var req createCohortReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	start, err := parseDate(req.StartDate, "start_date")
	if err != nil {
		s.fail(c, err)
		return
	}
	if start == nil {
		s.fail(c, apperr.Validation(map[string]string{"start_date": "Pick a start date."}))
		return
	}
	row, err := s.workspace.CreateCohort(c.Request.Context(), currentUser(c), app.CohortInput{
		Kind: req.Kind, Name: req.Name, CollegeID: req.CollegeID, ProgramSlug: req.ProgramSlug, StartDate: *start, Timezone: req.Timezone, SeatsTotal: req.SeatsTotal,
	})
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toCohort(row))
}

// enrollSettings are the fields shared by one enrollment and a bulk import.
type enrollSettings struct {
	CohortID    *uuid.UUID `json:"cohort_id"`
	ProgramSlug string     `json:"program_slug"`
	StartDate   *string    `json:"start_date"`
	Timezone    string     `json:"timezone"`
	FlowID      *uuid.UUID `json:"flow_id"`
}

func (e enrollSettings) input() (app.EnrollInput, error) {
	start, err := parseDate(e.StartDate, "start_date")
	if err != nil {
		return app.EnrollInput{}, err
	}
	return app.EnrollInput{CohortID: e.CohortID, ProgramSlug: e.ProgramSlug, StartDate: start, Timezone: e.Timezone, FlowID: e.FlowID}, nil
}

type personReq struct {
	GitHubLogin string `json:"github_login"`
	Name        string `json:"name"`
	Email       string `json:"email"`
}

func (p personReq) person() domain.PersonInput {
	return domain.PersonInput{GitHubLogin: p.GitHubLogin, Name: p.Name, Email: p.Email}
}

type enrollReq struct {
	personReq
	enrollSettings
}

type enrollResultDTO struct {
	Student     studentDTO `json:"student"`
	UserCreated bool       `json:"user_created"`
}

func (s *Server) enroll(c *gin.Context) {
	var req enrollReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	in, err := req.input()
	if err != nil {
		s.fail(c, err)
		return
	}
	in.Person = req.person()
	res, err := s.workspace.Enroll(c.Request.Context(), currentUser(c), in)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, enrollResultDTO{Student: toStudents([]store.StudentRow{res.Student}, s.clock.Now())[0], UserCreated: res.UserCreated})
}

type importReq struct {
	enrollSettings
	Rows []personReq `json:"rows"`
}

type importRowDTO struct {
	GitHubLogin string        `json:"github_login"`
	Student     *studentDTO   `json:"student"`
	UserCreated bool          `json:"user_created"`
	Error       *itemErrorDTO `json:"error"`
}

func (s *Server) importEnrollments(c *gin.Context) {
	var req importReq
	if err := decodeLimit(c, &req, MaxImportBodyBytes); err != nil {
		s.fail(c, err)
		return
	}
	shared, err := req.input()
	if err != nil {
		s.fail(c, err)
		return
	}
	people := make([]domain.PersonInput, len(req.Rows))
	for i, r := range req.Rows {
		people[i] = r.person()
	}
	results, err := s.workspace.ImportEnrollments(c.Request.Context(), currentUser(c), shared, people)
	if err != nil {
		s.fail(c, err)
		return
	}
	now := s.clock.Now()
	items := make([]importRowDTO, len(results))
	created := 0
	for i, r := range results {
		items[i] = importRowDTO{GitHubLogin: r.GitHubLogin, UserCreated: r.UserCreated, Error: toItemError(r.Err)}
		if r.Student != nil {
			st := toStudents([]store.StudentRow{*r.Student}, now)[0]
			items[i].Student = &st
			created++
		}
	}
	c.JSON(http.StatusOK, gin.H{"created": created, "items": items})
}

type statusReq struct {
	Status domain.EnrollmentStatus `json:"status"`
}

func (s *Server) setEnrollmentStatus(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req statusReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	e, err := s.workspace.SetEnrollmentStatus(c.Request.Context(), currentUser(c), id, req.Status)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toEnrollment(e, s.clock.Now()))
}

func (s *Server) listStaff(c *gin.Context) {
	rows, err := s.workspace.Staff(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	items := make([]staffDTO, len(rows))
	for i, r := range rows {
		items[i] = toStaff(r)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type grantStaffReq struct {
	personReq
	Role      domain.Role `json:"role"`
	CollegeID *uuid.UUID  `json:"college_id"`
}

func (s *Server) grantStaff(c *gin.Context) {
	var req grantStaffReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	row, err := s.workspace.GrantStaff(c.Request.Context(), currentUser(c), app.StaffInput{Person: req.person(), Role: req.Role, CollegeID: req.CollegeID})
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toStaff(row))
}

func (s *Server) revokeStaff(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	row, err := s.workspace.RevokeStaff(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toStaff(row))
}
