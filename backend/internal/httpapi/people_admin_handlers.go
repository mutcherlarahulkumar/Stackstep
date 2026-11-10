package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

type attendanceDayDTO struct {
	Date      string                  `json:"date"`
	Day       int                     `json:"day"`
	Status    domain.AttendanceStatus `json:"status"`
	Seat      *int                    `json:"seat"`
	FirstSeen *time.Time              `json:"first_seen_at"`
}

type attendanceDTO struct {
	Days    []attendanceDayDTO `json:"days"`
	Present int                `json:"present"`
	Missed  int                `json:"missed"`
	Streak  int                `json:"streak"`
}

func toAttendance(a domain.Attendance) attendanceDTO {
	out := attendanceDTO{Days: make([]attendanceDayDTO, len(a.Days)), Present: a.Present, Missed: a.Missed, Streak: a.Streak}
	for i, d := range a.Days {
		row := attendanceDayDTO{Date: d.Date.Format(time.DateOnly), Day: d.Day, Status: d.Status, FirstSeen: d.FirstSeen}
		if d.Seat > 0 {
			seat := d.Seat
			row.Seat = &seat
		}
		out.Days[i] = row
	}
	return out
}

type cohortRefDTO struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

type userRowDTO struct {
	User         userDTO        `json:"user"`
	CreatedAt    time.Time      `json:"created_at"`
	LastSeen     *time.Time     `json:"last_seen_at"`
	Enrollment   *enrollmentDTO `json:"enrollment"`
	Cohort       *cohortRefDTO  `json:"cohort"`
	CollegeName  *string        `json:"college_name"`
	Applications int            `json:"applications"`
}

type staffNoteDTO struct {
	ID         uuid.UUID  `json:"id"`
	Body       string     `json:"body"`
	Done       bool       `json:"done"`
	DoneAt     *time.Time `json:"done_at"`
	AuthorName string     `json:"author_name"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

func toStaffNote(n store.StaffNote) staffNoteDTO {
	return staffNoteDTO{ID: n.ID, Body: n.Body, Done: n.DoneAt != nil, DoneAt: n.DoneAt, AuthorName: n.AuthorName, CreatedAt: n.CreatedAt, UpdatedAt: n.UpdatedAt}
}

type profileEnrollmentDTO struct {
	Enrollment  enrollmentDTO `json:"enrollment"`
	CohortName  *string       `json:"cohort_name"`
	CollegeName *string       `json:"college_name"`
}

type profileApplicationDTO struct {
	ID         uuid.UUID                `json:"id"`
	Status     domain.ApplicationStatus `json:"status"`
	CohortName string                   `json:"cohort_name"`
	Phone      string                   `json:"phone"`
	College    string                   `json:"college"`
	CreatedAt  time.Time                `json:"created_at"`
}

type profileDTO struct {
	User         userDTO                 `json:"user"`
	GitHubURL    string                  `json:"github_url"`
	CreatedAt    time.Time               `json:"created_at"`
	LastSeen     *time.Time              `json:"last_seen_at"`
	SignedOutAt  *time.Time              `json:"signed_out_at"`
	Enrollments  []profileEnrollmentDTO  `json:"enrollments"`
	Applications []profileApplicationDTO `json:"applications"`
	Attendance   *attendanceDTO          `json:"attendance"`
	Notes        []staffNoteDTO          `json:"notes"`
}

func (s *Server) myAttendance(c *gin.Context) {
	a, err := s.workspace.MyAttendance(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toAttendance(a))
}

func (s *Server) listUsers(c *gin.Context) {
	f := store.UserFilter{Search: c.Query("q"), Kind: store.UserKind(c.Query("kind"))}
	var err error
	if f.Cohort, err = optionalUUIDQuery(c, "cohort_id"); err != nil {
		s.fail(c, err)
		return
	}
	if f.Flow, err = optionalUUIDQuery(c, "flow_id"); err != nil {
		s.fail(c, err)
		return
	}
	limit, ok := queryInt(c, "limit", 50)
	if !ok || limit < 1 || limit > app.UsersPageMax {
		s.fail(c, apperr.Validation(map[string]string{"limit": "Must be between 1 and 100."}))
		return
	}
	offset := 0
	if raw := c.Query("cursor"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 || n > 1_000_000 {
			s.fail(c, apperr.Validation(map[string]string{"cursor": "That page link is no longer valid."}))
			return
		}
		offset = n
	}
	f.Limit, f.Offset = limit+1, offset
	rows, err := s.workspace.Users(c.Request.Context(), currentUser(c), f)
	if err != nil {
		s.fail(c, err)
		return
	}
	var next *string
	if len(rows) > limit {
		rows = rows[:limit]
		n := strconv.Itoa(offset + limit)
		next = &n
	}
	now := s.clock.Now()
	items := make([]userRowDTO, len(rows))
	for i, r := range rows {
		row := userRowDTO{User: toUser(r.User), CreatedAt: r.CreatedAt, LastSeen: r.LastSeen, CollegeName: r.CollegeName, Applications: r.Applications}
		if r.Enrollment != nil {
			e := toEnrollment(*r.Enrollment, now)
			row.Enrollment = &e
		}
		if r.CohortID != nil && r.CohortName != nil {
			row.Cohort = &cohortRefDTO{ID: *r.CohortID, Name: *r.CohortName}
		}
		items[i] = row
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "next_cursor": next})
}

func (s *Server) personProfile(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	p, err := s.workspace.PersonProfile(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	now := s.clock.Now()
	out := profileDTO{
		User: toUser(p.User), GitHubURL: "https://github.com/" + p.User.GitHubLogin, CreatedAt: p.Meta.CreatedAt,
		LastSeen: p.Meta.LastSeen, SignedOutAt: p.Meta.SignedOutAt,
		Enrollments: make([]profileEnrollmentDTO, len(p.Enrollments)), Applications: make([]profileApplicationDTO, len(p.Applications)),
		Notes: make([]staffNoteDTO, len(p.Notes)),
	}
	for i, e := range p.Enrollments {
		out.Enrollments[i] = profileEnrollmentDTO{Enrollment: toEnrollment(e.Enrollment, now), CohortName: e.CohortName, CollegeName: e.CollegeName}
	}
	for i, a := range p.Applications {
		out.Applications[i] = profileApplicationDTO{ID: a.ID, Status: a.Status, CohortName: a.CohortName, Phone: a.Phone, College: a.College, CreatedAt: a.CreatedAt}
	}
	for i, n := range p.Notes {
		out.Notes[i] = toStaffNote(n)
	}
	if p.Attendance != nil {
		a := toAttendance(*p.Attendance)
		out.Attendance = &a
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) signOutEverywhere(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	if err := s.workspace.SignOutEverywhere(c.Request.Context(), currentUser(c), id); err != nil {
		s.fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

type staffNoteReq struct {
	Body string `json:"body"`
}

type staffNotePatch struct {
	Body *string `json:"body"`
	Done *bool   `json:"done"`
}

func (s *Server) addStaffNote(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req staffNoteReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	n, err := s.workspace.AddStaffNote(c.Request.Context(), currentUser(c), id, req.Body)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toStaffNote(n))
}

func (s *Server) editStaffNote(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	var req staffNotePatch
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	if req.Body == nil && req.Done == nil {
		s.fail(c, apperr.Validation(map[string]string{"body": "Change the text or tick it off."}))
		return
	}
	n, err := s.workspace.EditStaffNote(c.Request.Context(), currentUser(c), id, req.Body, req.Done)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toStaffNote(n))
}

func (s *Server) deleteStaffNote(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	if err := s.workspace.DeleteStaffNote(c.Request.Context(), currentUser(c), id); err != nil {
		s.fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
