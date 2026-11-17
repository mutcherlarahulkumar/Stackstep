package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// ---- Streaks and badges (feature 30) ----

type badgeDTO struct {
	Key         domain.BadgeKey `json:"key"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Target      int             `json:"target"`
	Progress    int             `json:"progress"`
	EarnedAt    *time.Time      `json:"earned_at"`
}

func toBadge(b domain.BadgeState) badgeDTO {
	d := badgeDTO{Key: b.Def.Key, Title: b.Def.Title, Description: b.Def.Description, Target: b.Def.Target, Progress: b.Progress}
	if b.EarnedAt != nil {
		t := b.EarnedAt.UTC()
		d.EarnedAt = &t
	}
	return d
}

func toBadges(bs []domain.BadgeState) []badgeDTO {
	out := make([]badgeDTO, len(bs))
	for i, b := range bs {
		out[i] = toBadge(b)
	}
	return out
}

type streakDTO struct {
	Current     int  `json:"current"`
	Longest     int  `json:"longest"`
	ActiveToday bool `json:"active_today"`
}

type achievementsDTO struct {
	Streak streakDTO  `json:"streak"`
	Badges []badgeDTO `json:"badges"`
}

func toAchievements(a domain.Achievements) achievementsDTO {
	return achievementsDTO{Streak: streakDTO(a.Streak), Badges: toBadges(a.Badges)}
}

func (s *Server) myAchievements(c *gin.Context) {
	a, err := s.workspace.MyAchievements(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toAchievements(a))
}

func (s *Server) staffAchievements(c *gin.Context) {
	id, err := pathUUID(c, "id")
	if err != nil {
		s.fail(c, err)
		return
	}
	a, err := s.workspace.StaffAchievements(c.Request.Context(), currentUser(c), id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toAchievements(a))
}

// ---- Portfolio (feature 28) ----

type portfolioSettingsDTO struct {
	Public   bool   `json:"public"`
	Headline string `json:"headline"`
	Login    string `json:"login"`
}

func (s *Server) myPortfolio(c *gin.Context) {
	u := currentUser(c)
	st, err := s.workspace.MyPortfolioSettings(c.Request.Context(), u)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, portfolioSettingsDTO{Public: st.Public, Headline: st.Headline, Login: u.GitHubLogin})
}

type portfolioReq struct {
	Public   bool   `json:"public"`
	Headline string `json:"headline"`
}

func (s *Server) saveMyPortfolio(c *gin.Context) {
	var req portfolioReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	u := currentUser(c)
	st, err := s.workspace.SetMyPortfolio(c.Request.Context(), u, req.Public, req.Headline)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, portfolioSettingsDTO{Public: st.Public, Headline: st.Headline, Login: u.GitHubLogin})
}

type portfolioWorkDTO struct {
	Title  string          `json:"title"`
	Type   domain.TaskType `json:"type"`
	DoneAt time.Time       `json:"done_at"`
	URL    *string         `json:"url"`
}

type portfolioCertDTO struct {
	Code     string    `json:"code"`
	IssuedAt time.Time `json:"issued_at"`
}

type portfolioLabDTO struct {
	Key       string `json:"key"`
	Title     string `json:"title"`
	Language  string `json:"language"`
	BestScore int    `json:"best_score"`
}

type portfolioDTO struct {
	Login        string             `json:"login"`
	Name         string             `json:"name"`
	AvatarURL    *string            `json:"avatar_url"`
	Headline     string             `json:"headline"`
	ProgramSlug  string             `json:"program_slug"`
	ProgramDays  int                `json:"program_days"`
	FlowName     *string            `json:"flow_name"`
	Status       string             `json:"status"`
	StartDate    string             `json:"start_date"`
	EndDate      string             `json:"end_date"`
	DayNumber    int                `json:"day_number"`
	TasksDone    int                `json:"tasks_done"`
	PRsMerged    int                `json:"prs_merged"`
	Points       int                `json:"points"`
	Streak       streakDTO          `json:"streak"`
	Badges       []badgeDTO         `json:"badges"`
	Work         []portfolioWorkDTO `json:"work"`
	Certificates []portfolioCertDTO `json:"certificates"`
	ReviewLab    []portfolioLabDTO  `json:"review_lab"`
}

func toPortfolio(p app.Portfolio) portfolioDTO {
	e := p.Enrollment
	d := portfolioDTO{Login: p.User.GitHubLogin, Name: p.User.Name, AvatarURL: p.User.AvatarURL, Headline: p.Headline,
		ProgramSlug: e.Program.Slug, ProgramDays: e.Program.Days, Status: string(e.Status),
		StartDate: e.StartDate.Format(time.DateOnly), EndDate: e.EndDate.Format(time.DateOnly), DayNumber: p.DayNumber,
		Points: p.Points, Streak: streakDTO(p.Achievements.Streak), Badges: []badgeDTO{}, Work: make([]portfolioWorkDTO, len(p.Work)),
		Certificates: make([]portfolioCertDTO, len(p.Certificates)), ReviewLab: make([]portfolioLabDTO, len(p.Labs))}
	if e.Flow != nil {
		n := e.Flow.Name
		d.FlowName = &n
	}
	for _, b := range p.Achievements.Badges {
		if b.EarnedAt != nil {
			d.Badges = append(d.Badges, toBadge(b))
		}
	}
	for i, w := range p.Work {
		wd := portfolioWorkDTO{Title: w.Title, Type: w.Type, DoneAt: w.DoneAt.UTC()}
		if w.URL != "" {
			u := w.URL
			wd.URL = &u
			if domain.IsPullRequestURL(u) {
				d.PRsMerged++
			}
		}
		d.Work[i] = wd
	}
	d.TasksDone = len(p.Work)
	for i, c := range p.Certificates {
		d.Certificates[i] = portfolioCertDTO{Code: c.Code, IssuedAt: c.IssuedAt.UTC()}
	}
	for i, l := range p.Labs {
		d.ReviewLab[i] = portfolioLabDTO{Key: l.Exercise.Key, Title: l.Exercise.Title, Language: l.Exercise.Language, BestScore: l.BestScore}
	}
	return d
}

func (s *Server) publicPortfolio(c *gin.Context) {
	p, err := s.workspace.PublicPortfolio(c.Request.Context(), c.Param("login"))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, toPortfolio(p))
}
