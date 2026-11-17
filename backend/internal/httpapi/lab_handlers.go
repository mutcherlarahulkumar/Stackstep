package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/reviewlab"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// ---- Review lab (feature 27) ----

type labRecordDTO struct {
	Attempts  int        `json:"attempts"`
	BestScore *int       `json:"best_score"`
	Passed    bool       `json:"passed"`
	LastAt    *time.Time `json:"last_at"`
}

func toLabRecord(r store.LabSummary) labRecordDTO {
	d := labRecordDTO{Attempts: r.Attempts, Passed: r.Passed}
	if r.Attempts > 0 {
		b := r.BestScore
		d.BestScore = &b
	}
	if r.LastAt != nil {
		t := r.LastAt.UTC()
		d.LastAt = &t
	}
	return d
}

type labSummaryDTO struct {
	Key        string               `json:"key"`
	Title      string               `json:"title"`
	Summary    string               `json:"summary"`
	Language   string               `json:"language"`
	Difficulty reviewlab.Difficulty `json:"difficulty"`
	Number     int                  `json:"number"`
	Author     string               `json:"author"`
	Files      int                  `json:"files"`
	Additions  int                  `json:"additions"`
	Deletions  int                  `json:"deletions"`
	Issues     int                  `json:"issues"`
	Record     labRecordDTO         `json:"record"`
}

func toLabSummary(ex reviewlab.Exercise, r store.LabSummary) labSummaryDTO {
	d := labSummaryDTO{Key: ex.Key, Title: ex.Title, Summary: ex.Summary, Language: ex.Language, Difficulty: ex.Difficulty,
		Number: ex.Number, Author: ex.Author, Files: len(ex.Files), Issues: len(ex.Issues), Record: toLabRecord(r)}
	for _, f := range ex.Files {
		d.Additions += f.Additions
		d.Deletions += f.Deletions
	}
	return d
}

type labLineDTO struct {
	Kind reviewlab.LineKind `json:"kind"`
	Old  *int               `json:"old"`
	New  *int               `json:"new"`
	Text string             `json:"text"`
}

type labFileDTO struct {
	Path      string       `json:"path"`
	Language  string       `json:"language"`
	Status    string       `json:"status"`
	Additions int          `json:"additions"`
	Deletions int          `json:"deletions"`
	Lines     []labLineDTO `json:"lines"`
}

type labCommitDTO struct {
	SHA     string `json:"sha"`
	Message string `json:"message"`
}

type labCommentDTO struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Side string `json:"side"`
	Body string `json:"body"`
}

type labHitDTO struct {
	ID          string             `json:"id"`
	Path        string             `json:"path"`
	From        int                `json:"from"`
	To          int                `json:"to"`
	Severity    reviewlab.Severity `json:"severity"`
	Title       string             `json:"title"`
	Explanation string             `json:"explanation"`
	Found       bool               `json:"found"`
	Comment     *int               `json:"comment"`
}

type labReviewDTO struct {
	ID             uuid.UUID         `json:"id"`
	TaskID         *uuid.UUID        `json:"task_id"`
	Verdict        reviewlab.Verdict `json:"verdict"`
	Summary        string            `json:"summary"`
	Comments       []labCommentDTO   `json:"comments"`
	Score          int               `json:"score"`
	Found          int               `json:"found"`
	Total          int               `json:"total"`
	Noise          int               `json:"noise"`
	NoisePenalty   int               `json:"noise_penalty"`
	ApprovePenalty int               `json:"approve_penalty"`
	Passed         bool              `json:"passed"`
	Issues         []labHitDTO       `json:"issues"`
	CreatedAt      time.Time         `json:"created_at"`
}

func toLabReview(r app.LabReview) labReviewDTO {
	d := labReviewDTO{ID: r.Attempt.ID, TaskID: r.Attempt.TaskID, Verdict: r.Attempt.Verdict, Summary: r.Attempt.Summary,
		Comments: make([]labCommentDTO, len(r.Attempt.Comments)), Score: r.Result.Score, Found: r.Result.Found, Total: r.Result.Total,
		Noise: r.Result.Noise, NoisePenalty: r.Result.NoisePenalty, ApprovePenalty: r.Result.ApprovePenalty, Passed: r.Result.Passed,
		Issues: make([]labHitDTO, len(r.Result.Hits)), CreatedAt: r.Attempt.CreatedAt.UTC()}
	for i, c := range r.Attempt.Comments {
		d.Comments[i] = labCommentDTO(c)
	}
	for i, h := range r.Result.Hits {
		hd := labHitDTO{ID: h.Issue.ID, Path: h.Issue.Path, From: h.Issue.From, To: h.Issue.To, Severity: h.Issue.Severity,
			Title: h.Issue.Title, Explanation: h.Issue.Explanation, Found: h.Found}
		if h.Comment >= 0 {
			c := h.Comment
			hd.Comment = &c
		}
		d.Issues[i] = hd
	}
	return d
}

type labExerciseDTO struct {
	labSummaryDTO
	Branch     string         `json:"branch"`
	Base       string         `json:"base"`
	Body       string         `json:"body"`
	Commits    []labCommitDTO `json:"commits"`
	FileDiffs  []labFileDTO   `json:"file_diffs"`
	LastReview *labReviewDTO  `json:"last_review"`
}

func toLabExercise(d app.LabDetail) labExerciseDTO {
	ex := d.Exercise
	out := labExerciseDTO{labSummaryDTO: toLabSummary(ex, d.Record), Branch: ex.Branch, Base: ex.Base, Body: ex.Body,
		Commits: make([]labCommitDTO, len(ex.Commits)), FileDiffs: make([]labFileDTO, len(ex.Files))}
	for i, c := range ex.Commits {
		out.Commits[i] = labCommitDTO(c)
	}
	for i, f := range ex.Files {
		fd := labFileDTO{Path: f.Path, Language: f.Language, Status: f.Status, Additions: f.Additions, Deletions: f.Deletions,
			Lines: make([]labLineDTO, len(f.Lines))}
		for j, l := range f.Lines {
			ld := labLineDTO{Kind: l.Kind, Text: l.Text}
			if l.Old > 0 {
				o := l.Old
				ld.Old = &o
			}
			if l.New > 0 {
				n := l.New
				ld.New = &n
			}
			fd.Lines[j] = ld
		}
		out.FileDiffs[i] = fd
	}
	if d.Last != nil {
		r := toLabReview(*d.Last)
		out.LastReview = &r
	}
	return out
}

func (s *Server) labLibrary(c *gin.Context) {
	entries, err := s.workspace.LabLibrary(c.Request.Context(), currentUser(c))
	if err != nil {
		s.fail(c, err)
		return
	}
	out := make([]labSummaryDTO, len(entries))
	for i, e := range entries {
		out[i] = toLabSummary(e.Exercise, e.Record)
	}
	c.JSON(http.StatusOK, gin.H{"items": out})
}

func (s *Server) labExercise(c *gin.Context) {
	d, err := s.workspace.LabExercise(c.Request.Context(), currentUser(c), c.Param("key"))
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toLabExercise(d))
}

type labReviewReq struct {
	TaskID          *uuid.UUID        `json:"task_id"`
	ExpectedVersion int               `json:"expected_version"`
	Verdict         reviewlab.Verdict `json:"verdict"`
	Summary         string            `json:"summary"`
	Comments        []labCommentDTO   `json:"comments"`
}

type labOutcomeDTO struct {
	Review labReviewDTO `json:"review"`
	Task   *taskDTO     `json:"task"`
}

func (s *Server) submitLabReview(c *gin.Context) {
	var req labReviewReq
	if err := decode(c, &req); err != nil {
		s.fail(c, err)
		return
	}
	in := app.LabReviewInput{TaskID: req.TaskID, ExpectedVersion: req.ExpectedVersion, Verdict: req.Verdict, Summary: req.Summary,
		Comments: make([]reviewlab.Comment, len(req.Comments))}
	for i, cm := range req.Comments {
		in.Comments[i] = reviewlab.Comment(cm)
	}
	out, err := s.workspace.SubmitLabReview(c.Request.Context(), currentUser(c), c.Param("key"), in)
	if err != nil {
		s.fail(c, err)
		return
	}
	d := labOutcomeDTO{Review: toLabReview(out.Review)}
	if out.Task != nil {
		t := toTask(*out.Task, false)
		d.Task = &t
	}
	c.JSON(http.StatusCreated, d)
}
