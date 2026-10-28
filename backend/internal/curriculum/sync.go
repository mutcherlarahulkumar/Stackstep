package curriculum

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// ErrNoAdmin means the database has no platform admin to own the content yet.
var ErrNoAdmin = errors.New("no platform admin yet: run the \"Database · seed admins\" workflow first, then this one")

// Result says what a sync changed.
type Result struct {
	PersonasCreated, PersonasUpdated                       int
	TemplatesCreated, TemplatesUpdated, TemplatesUnchanged int
	Flows                                                  []FlowResult
}

// FlowResult is what happened to one flow.
type FlowResult struct {
	Name    string
	Version int    // the published version after the sync
	Status  string // created, updated, unchanged or skipped
	Note    string
}

// Sync loads the curriculum into the database. Running it again changes nothing unless the
// content changed: then the library templates are updated and each changed flow gets a new
// published version. Students already on a flow keep the version they started with.
func Sync(ctx context.Context, q store.Q, now time.Time) (Result, error) {
	var res Result
	var admin uuid.UUID
	// A real admin owns the content, so flushing the demo seed never takes the curriculum with it.
	err := q.QueryRow(ctx, `SELECT id FROM users WHERE role = 'admin'
		ORDER BY (lower(github_login) = ANY($1)), created_at, id LIMIT 1`, demoLogins()).Scan(&admin)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return res, ErrNoAdmin
		}
		return res, fmt.Errorf("find admin: %w", err)
	}

	if err := syncPersonas(ctx, q, now, &res); err != nil {
		return res, err
	}
	items, err := Templates()
	if err != nil {
		return res, err
	}
	specs := map[string]domain.TaskSpec{}
	for _, it := range items {
		spec, err := it.Spec()
		if err != nil {
			return res, err
		}
		specs[it.Key] = spec
		if err := syncTemplate(ctx, q, it.Key, spec, admin, now, &res); err != nil {
			return res, fmt.Errorf("template %s: %w", it.Key, err)
		}
	}
	for _, f := range Flows() {
		fr, err := syncFlow(ctx, q, f, specs, admin, now)
		if err != nil {
			return res, fmt.Errorf("flow %s: %w", f.Name, err)
		}
		res.Flows = append(res.Flows, fr)
	}
	return res, nil
}

func syncPersonas(ctx context.Context, q store.Q, now time.Time, res *Result) error {
	for _, p := range Personas() {
		var clash uuid.UUID
		err := q.QueryRow(ctx, `SELECT id FROM personas WHERE lower(name) = lower($1) AND id <> $2`, p.Name, p.ID).Scan(&clash)
		if err == nil {
			return fmt.Errorf("a different persona is already called %q (id %s); rename it in Setup, then Personas, and run again", p.Name, clash)
		}
		if p.ID == TeamLead {
			// Created by the migrations and maybe renamed by an admin: only restore it if it's gone.
			tag, err := q.Exec(ctx, `INSERT INTO personas (id, name, title, color, auto_reply, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $6) ON CONFLICT (id) DO NOTHING`, p.ID, p.Name, p.Title, string(p.Color), p.AutoReply, now)
			if err != nil {
				return fmt.Errorf("persona %s: %w", p.Name, err)
			}
			res.PersonasCreated += int(tag.RowsAffected())
			continue
		}
		var inserted bool
		err = q.QueryRow(ctx, `INSERT INTO personas (id, name, title, color, auto_reply, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $6)
			ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, title = EXCLUDED.title, color = EXCLUDED.color,
				auto_reply = EXCLUDED.auto_reply, archived_at = NULL, version = personas.version + 1, updated_at = EXCLUDED.updated_at
				WHERE (personas.name, personas.title, personas.color, personas.auto_reply) IS DISTINCT FROM
					(EXCLUDED.name, EXCLUDED.title, EXCLUDED.color, EXCLUDED.auto_reply) OR personas.archived_at IS NOT NULL
			RETURNING (xmax = 0)`, p.ID, p.Name, p.Title, string(p.Color), p.AutoReply, now).Scan(&inserted)
		switch {
		case err == nil && inserted:
			res.PersonasCreated++
		case err == nil:
			res.PersonasUpdated++
		case errors.Is(err, pgx.ErrNoRows):
			// unchanged
		default:
			return fmt.Errorf("persona %s: %w", p.Name, err)
		}
	}
	return nil
}

func syncTemplate(ctx context.Context, q store.Q, key string, spec domain.TaskSpec, admin uuid.UUID, now time.Time, res *Result) error {
	id := TemplateID(key)
	existing, err := store.GetTemplate(ctx, q, id)
	switch {
	case errors.Is(err, store.ErrNotFound):
		if _, err := store.InsertTemplateWithID(ctx, q, id, spec, admin, now); err != nil {
			return err
		}
		res.TemplatesCreated++
		return nil
	case err != nil:
		return err
	}
	if sameSpec(existing.Spec, spec) {
		res.TemplatesUnchanged++
		return nil
	}
	if _, err := store.UpdateTemplate(ctx, q, id, spec, existing.ArchivedAt != nil, existing.Version, now); err != nil {
		return err
	}
	res.TemplatesUpdated++
	return nil
}

func syncFlow(ctx context.Context, q store.Q, f Flow, specs map[string]domain.TaskSpec, admin uuid.UUID, now time.Time) (FlowResult, error) {
	fr := FlowResult{Name: f.Name}
	meta, errs := domain.ValidateFlow(domain.FlowInput{Name: f.Name, Stream: f.Stream, Description: f.Description, Days: f.Days})
	if len(errs) > 0 {
		return fr, fmt.Errorf("invalid flow: %v", errs)
	}
	want := make([]domain.FlowItem, 0, 4*f.Days)
	for _, d := range f.Plan {
		for pos, it := range d.Items {
			id := TemplateID(it.Key)
			want = append(want, domain.FlowItem{Day: d.N, Position: pos, TemplateID: &id, Spec: specs[it.Key]})
		}
	}

	existing, err := store.GetFlow(ctx, q, f.ID, true)
	switch {
	case errors.Is(err, store.ErrNotFound):
		if _, err := store.InsertFlowWithID(ctx, q, f.ID, meta, admin, now); err != nil {
			if errors.Is(err, store.ErrDuplicate) {
				return fr, fmt.Errorf("another flow is already named %q; rename it in Setup, then Flows, and run again", f.Name)
			}
			return fr, err
		}
		fr.Status = "created"
	case err != nil:
		return fr, err
	default:
		if existing.Name != meta.Name || existing.Stream != meta.Stream || existing.Description != meta.Description || existing.ArchivedAt != nil {
			if _, err := store.UpdateFlow(ctx, q, f.ID, meta, false, existing.Version, now); err != nil {
				return fr, err
			}
		}
	}

	published, err := store.FlowVersionByStatus(ctx, q, f.ID, domain.FlowPublished)
	switch {
	case err == nil && sameItems(published.Items, want):
		fr.Version, fr.Status = published.Number, "unchanged"
		return fr, nil
	case err != nil && !errors.Is(err, store.ErrNotFound):
		return fr, err
	}
	if _, err := store.FlowVersionByStatus(ctx, q, f.ID, domain.FlowDraft); err == nil {
		fr.Status = "skipped"
		fr.Note = "an admin has an unpublished draft of this flow; publish or discard it in Setup, then Flows, and run again"
		if published.Number > 0 {
			fr.Version = published.Number
		}
		return fr, nil
	} else if !errors.Is(err, store.ErrNotFound) {
		return fr, err
	}
	draft, err := store.InsertFlowVersion(ctx, q, f.ID, want, now)
	if err != nil {
		return fr, err
	}
	v, err := store.PublishDraft(ctx, q, f.ID, draft.ID, draft.Revision, now)
	if err != nil {
		return fr, err
	}
	if fr.Status == "" {
		fr.Status = "updated"
	}
	fr.Version = v.Number
	return fr, nil
}

// canonical is a spec as stable JSON: the database stores JSON with its own spacing, so
// practice test data is compacted before comparing.
func canonical(s domain.TaskSpec) string {
	if s.Content.Resources == nil {
		s.Content.Resources = []domain.Resource{}
	}
	if s.Content.Practice != nil {
		p := *s.Content.Practice
		tests := make([]domain.PracticeTest, len(p.Tests))
		for i, t := range p.Tests {
			tests[i] = domain.PracticeTest{Args: compact(t.Args), Expected: compact(t.Expected)}
		}
		p.Tests = tests
		s.Content.Practice = &p
	}
	b, _ := json.Marshal(s)
	return string(b)
}

func compact(raw json.RawMessage) json.RawMessage {
	var b bytes.Buffer
	if err := json.Compact(&b, raw); err != nil {
		return raw
	}
	return b.Bytes()
}

func sameSpec(a, b domain.TaskSpec) bool { return canonical(a) == canonical(b) }

func sameItems(have, want []domain.FlowItem) bool {
	if len(have) != len(want) {
		return false
	}
	for i := range have {
		h, w := have[i], want[i]
		if h.Day != w.Day || h.Position != w.Position || (h.TemplateID == nil) != (w.TemplateID == nil) ||
			(h.TemplateID != nil && *h.TemplateID != *w.TemplateID) || !sameSpec(h.Spec, w.Spec) {
			return false
		}
	}
	return true
}

func demoLogins() []string {
	out := make([]string, len(seed.DemoLogins))
	for i, l := range seed.DemoLogins {
		out[i] = strings.ToLower(l)
	}
	return out
}
