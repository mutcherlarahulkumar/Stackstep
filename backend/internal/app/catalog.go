package app

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

var (
	errAdminOnly = apperr.New(apperr.CodeForbidden, "Only platform admins can change the catalog.")
	errStaffOnly = apperr.New(apperr.CodeForbidden, "Admins only.")
	errStale     = apperr.New(apperr.CodeVersionConflict, "This was changed by someone else. Reload and try again.")
)

func requireAdmin(u domain.User) error {
	if u.Role != domain.RoleAdmin {
		return errAdminOnly
	}
	return nil
}

func requireStaff(u domain.User) error {
	if !u.Role.IsStaff() {
		return errStaffOnly
	}
	return nil
}

// personaChecker returns a func reporting whether a persona id is active, loading all at once.
func (w *Workspace) personaChecker(ctx context.Context, q store.Q, ids []uuid.UUID) (func(uuid.UUID) bool, error) {
	active, err := store.ActivePersonaIDs(ctx, q, ids)
	if err != nil {
		return nil, err
	}
	return func(id uuid.UUID) bool { return active[id] }, nil
}

// ---- Personas ----

// Personas lists personas for any staff member.
func (w *Workspace) Personas(ctx context.Context, u domain.User, includeArchived bool) ([]domain.Persona, error) {
	if err := requireStaff(u); err != nil {
		return nil, err
	}
	return store.ListPersonas(ctx, w.Store.Pool, includeArchived)
}

// CreatePersona adds a manager persona.
func (w *Workspace) CreatePersona(ctx context.Context, u domain.User, in domain.PersonaInput) (domain.Persona, error) {
	if err := requireAdmin(u); err != nil {
		return domain.Persona{}, err
	}
	v, fields := domain.ValidatePersona(in)
	if len(fields) > 0 {
		return domain.Persona{}, apperr.Validation(fields)
	}
	p, err := store.InsertPersona(ctx, w.Store.Pool, v, w.Clock.Now())
	if errors.Is(err, store.ErrDuplicate) {
		return domain.Persona{}, apperr.Validation(map[string]string{"name": "A persona with this name already exists."})
	}
	return p, err
}

// UpdatePersona edits or archives a persona.
func (w *Workspace) UpdatePersona(ctx context.Context, u domain.User, id uuid.UUID, in domain.PersonaInput, archived bool, expectedVersion int) (domain.Persona, error) {
	if err := requireAdmin(u); err != nil {
		return domain.Persona{}, err
	}
	v, fields := domain.ValidatePersona(in)
	if archived && id == domain.DefaultPersonaID {
		fields["archived"] = "The default team lead can't be archived; manual tasks use it."
	}
	if len(fields) > 0 {
		return domain.Persona{}, apperr.Validation(fields)
	}
	p, err := store.UpdatePersona(ctx, w.Store.Pool, id, v, archived, expectedVersion, w.Clock.Now())
	switch {
	case errors.Is(err, store.ErrDuplicate):
		return domain.Persona{}, apperr.Validation(map[string]string{"name": "A persona with this name already exists."})
	case errors.Is(err, store.ErrNotFound):
		if _, getErr := store.GetPersona(ctx, w.Store.Pool, id); getErr == nil {
			return domain.Persona{}, errStale
		}
		return domain.Persona{}, errNotFound
	}
	return p, err
}

// ---- Task library ----

// Templates lists library entries for any staff member.
func (w *Workspace) Templates(ctx context.Context, u domain.User, f store.TemplateFilter) ([]domain.Template, string, error) {
	if err := requireStaff(u); err != nil {
		return nil, "", err
	}
	f.Search = domain.NormalizeText(f.Search)
	if len([]rune(f.Search)) > domain.SearchQueryMaxLen {
		return nil, "", apperr.Validation(map[string]string{"q": "Search can be at most 100 characters."})
	}
	limit := f.Limit
	f.Limit = limit + 1
	rows, err := store.ListTemplates(ctx, w.Store.Pool, f)
	if err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		key, err := store.TemplateSortKey(ctx, w.Store.Pool, last.ID)
		if err != nil {
			return nil, "", err
		}
		next = store.EncodeCursor(store.Cursor{Key: key, ID: last.ID})
	}
	return rows, next, nil
}

func (w *Workspace) validateSpec(ctx context.Context, in domain.TaskSpecInput) (domain.TaskSpec, error) {
	ok, err := w.personaChecker(ctx, w.Store.Pool, []uuid.UUID{in.PersonaID})
	if err != nil {
		return domain.TaskSpec{}, err
	}
	spec, fields := domain.ValidateTaskSpec(in, "", ok)
	if len(fields) > 0 {
		return domain.TaskSpec{}, apperr.Validation(fields)
	}
	return spec, nil
}

// CreateTemplate adds a library entry.
func (w *Workspace) CreateTemplate(ctx context.Context, u domain.User, in domain.TaskSpecInput) (domain.Template, error) {
	if err := requireAdmin(u); err != nil {
		return domain.Template{}, err
	}
	spec, err := w.validateSpec(ctx, in)
	if err != nil {
		return domain.Template{}, err
	}
	return store.InsertTemplate(ctx, w.Store.Pool, spec, u.ID, w.Clock.Now())
}

// UpdateTemplate edits or archives a library entry. Flows keep their own copies.
func (w *Workspace) UpdateTemplate(ctx context.Context, u domain.User, id uuid.UUID, in domain.TaskSpecInput, archived bool, expectedVersion int) (domain.Template, error) {
	if err := requireAdmin(u); err != nil {
		return domain.Template{}, err
	}
	spec, err := w.validateSpec(ctx, in)
	if err != nil {
		return domain.Template{}, err
	}
	t, err := store.UpdateTemplate(ctx, w.Store.Pool, id, spec, archived, expectedVersion, w.Clock.Now())
	if errors.Is(err, store.ErrNotFound) {
		if _, getErr := store.GetTemplate(ctx, w.Store.Pool, id); getErr == nil {
			return domain.Template{}, errStale
		}
		return domain.Template{}, errNotFound
	}
	return t, err
}

// ---- Flows ----

// FlowDetail is a flow with its draft and published versions.
type FlowDetail struct {
	Flow      domain.Flow
	Draft     *domain.FlowVersion
	Published *domain.FlowVersion
}

// Flows lists flows for any staff member.
func (w *Workspace) Flows(ctx context.Context, u domain.User, includeArchived bool) ([]store.FlowSummary, error) {
	if err := requireStaff(u); err != nil {
		return nil, err
	}
	return store.ListFlows(ctx, w.Store.Pool, includeArchived)
}

func (w *Workspace) flowDetail(ctx context.Context, q store.Q, id uuid.UUID, lock bool) (FlowDetail, error) {
	f, err := store.GetFlow(ctx, q, id, lock)
	if errors.Is(err, store.ErrNotFound) {
		return FlowDetail{}, errNotFound
	}
	if err != nil {
		return FlowDetail{}, err
	}
	d := FlowDetail{Flow: f}
	for _, st := range []domain.FlowVersionStatus{domain.FlowDraft, domain.FlowPublished} {
		v, err := store.FlowVersionByStatus(ctx, q, id, st)
		if errors.Is(err, store.ErrNotFound) {
			continue
		}
		if err != nil {
			return FlowDetail{}, err
		}
		if st == domain.FlowDraft {
			d.Draft = &v
		} else {
			d.Published = &v
		}
	}
	return d, nil
}

// Flow returns one flow with its versions.
func (w *Workspace) Flow(ctx context.Context, u domain.User, id uuid.UUID) (FlowDetail, error) {
	if err := requireStaff(u); err != nil {
		return FlowDetail{}, err
	}
	return w.flowDetail(ctx, w.Store.Pool, id, false)
}

// CreateFlow adds a flow with an empty draft.
func (w *Workspace) CreateFlow(ctx context.Context, u domain.User, in domain.FlowInput) (FlowDetail, error) {
	if err := requireAdmin(u); err != nil {
		return FlowDetail{}, err
	}
	v, fields := domain.ValidateFlow(in)
	if len(fields) > 0 {
		return FlowDetail{}, apperr.Validation(fields)
	}
	return w.newFlow(ctx, u, v, nil)
}

func (w *Workspace) newFlow(ctx context.Context, u domain.User, in domain.FlowInput, items []domain.FlowItem) (FlowDetail, error) {
	now := w.Clock.Now()
	var out FlowDetail
	err := w.Store.Tx(ctx, func(q store.Q) error {
		f, err := store.InsertFlow(ctx, q, in, u.ID, now)
		if errors.Is(err, store.ErrDuplicate) {
			return apperr.Validation(map[string]string{"name": "A flow with this name already exists."})
		}
		if err != nil {
			return err
		}
		draft, err := store.InsertFlowVersion(ctx, q, f.ID, items, now)
		if err != nil {
			return err
		}
		out = FlowDetail{Flow: f, Draft: &draft}
		return nil
	})
	return out, err
}

// UpdateFlow edits metadata. The length can only change while nothing has been published.
func (w *Workspace) UpdateFlow(ctx context.Context, u domain.User, id uuid.UUID, in domain.FlowInput, archived bool, expectedVersion int) (domain.Flow, error) {
	if err := requireAdmin(u); err != nil {
		return domain.Flow{}, err
	}
	v, fields := domain.ValidateFlow(in)
	if len(fields) > 0 {
		return domain.Flow{}, apperr.Validation(fields)
	}
	var out domain.Flow
	err := w.Store.Tx(ctx, func(q store.Q) error {
		d, err := w.flowDetail(ctx, q, id, true)
		if err != nil {
			return err
		}
		if v.Days != d.Flow.Days {
			if d.Published != nil {
				return apperr.Validation(map[string]string{"days": "A published flow's length can't change. Duplicate it instead."})
			}
			if d.Draft != nil {
				for _, it := range d.Draft.Items {
					if it.Day > v.Days {
						return apperr.Validation(map[string]string{"days": fmt.Sprintf("The draft has tasks on day %d. Move them first.", it.Day)})
					}
				}
			}
		}
		out, err = store.UpdateFlow(ctx, q, id, v, archived, expectedVersion, w.Clock.Now())
		switch {
		case errors.Is(err, store.ErrDuplicate):
			return apperr.Validation(map[string]string{"name": "A flow with this name already exists."})
		case errors.Is(err, store.ErrNotFound):
			return errStale
		}
		return err
	})
	return out, err
}

// SaveDraft replaces the draft's items. expectedRevision 0 means "start a new draft from the
// published version"; otherwise it must match the current draft's revision.
func (w *Workspace) SaveDraft(ctx context.Context, u domain.User, flowID uuid.UUID, expectedRevision int, items []domain.FlowItemInput) (FlowDetail, error) {
	if err := requireAdmin(u); err != nil {
		return FlowDetail{}, err
	}
	if expectedRevision < 0 {
		return FlowDetail{}, apperr.Validation(map[string]string{"expected_revision": "Must be 0 or more."})
	}
	var out FlowDetail
	err := w.Store.Tx(ctx, func(q store.Q) error {
		d, err := w.flowDetail(ctx, q, flowID, true)
		if err != nil {
			return err
		}
		ids := make([]uuid.UUID, 0, len(items))
		for _, it := range items {
			ids = append(ids, it.Spec.PersonaID)
		}
		ok, err := w.personaChecker(ctx, q, ids)
		if err != nil {
			return err
		}
		valid, fields := domain.ValidateDraftItems(items, d.Flow.Days, ok)
		if len(fields) > 0 {
			return apperr.Validation(fields)
		}
		draft := d.Draft
		switch {
		case draft == nil && expectedRevision == 0:
			var from []domain.FlowItem
			if d.Published != nil {
				from = d.Published.Items
			}
			v, err := store.InsertFlowVersion(ctx, q, flowID, from, w.Clock.Now())
			if err != nil {
				return err
			}
			draft = &v
		case draft == nil || draft.Revision != expectedRevision:
			return errStale
		}
		if _, err := store.ReplaceDraftItems(ctx, q, draft.ID, draft.Revision, valid); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				return errStale
			}
			return err
		}
		out, err = w.flowDetail(ctx, q, flowID, false)
		return err
	})
	return out, err
}

// PublishFlow freezes the draft as the new published version.
func (w *Workspace) PublishFlow(ctx context.Context, u domain.User, flowID uuid.UUID, expectedRevision int) (FlowDetail, error) {
	if err := requireAdmin(u); err != nil {
		return FlowDetail{}, err
	}
	var out FlowDetail
	err := w.Store.Tx(ctx, func(q store.Q) error {
		d, err := w.flowDetail(ctx, q, flowID, true)
		if err != nil {
			return err
		}
		if d.Draft == nil {
			return apperr.Validation(map[string]string{"draft": "There are no unpublished changes."})
		}
		if d.Draft.Revision != expectedRevision {
			return errStale
		}
		if len(d.Draft.Items) == 0 {
			return apperr.Validation(map[string]string{"items": "Add at least one task before publishing."})
		}
		ids := make([]uuid.UUID, 0, len(d.Draft.Items))
		for _, it := range d.Draft.Items {
			ids = append(ids, it.Spec.PersonaID)
		}
		ok, err := w.personaChecker(ctx, q, ids)
		if err != nil {
			return err
		}
		for i, it := range d.Draft.Items {
			if !ok(it.Spec.PersonaID) {
				return apperr.Validation(map[string]string{fmt.Sprintf("items[%d].persona_id", i): "This persona was archived. Pick another."})
			}
		}
		if _, err := store.PublishDraft(ctx, q, flowID, d.Draft.ID, expectedRevision, w.Clock.Now()); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				return errStale
			}
			return err
		}
		out, err = w.flowDetail(ctx, q, flowID, false)
		return err
	})
	return out, err
}

// DuplicateFlow copies a flow's latest items (draft, else published) into a new flow.
func (w *Workspace) DuplicateFlow(ctx context.Context, u domain.User, sourceID uuid.UUID, in domain.FlowInput) (FlowDetail, error) {
	if err := requireAdmin(u); err != nil {
		return FlowDetail{}, err
	}
	src, err := w.flowDetail(ctx, w.Store.Pool, sourceID, false)
	if err != nil {
		return FlowDetail{}, err
	}
	in.Days = src.Flow.Days
	if in.Description == "" {
		in.Description = src.Flow.Description
	}
	v, fields := domain.ValidateFlow(in)
	if len(fields) > 0 {
		return FlowDetail{}, apperr.Validation(fields)
	}
	var items []domain.FlowItem
	switch {
	case src.Draft != nil:
		items = src.Draft.Items
	case src.Published != nil:
		items = src.Published.Items
	}
	return w.newFlow(ctx, u, v, items)
}

// AssignResult is the outcome for one enrollment.
type AssignResult struct {
	EnrollmentID uuid.UUID
	Generated    int
	Skipped      int
	Cancelled    int
	Err          *apperr.Error
}

// AssignFlow puts one enrollment on a flow's published version and schedules its tasks.
func (w *Workspace) AssignFlow(ctx context.Context, u domain.User, enrollmentID, flowID uuid.UUID) (AssignResult, error) {
	if err := requireStaff(u); err != nil {
		return AssignResult{}, err
	}
	res := w.assignOne(ctx, u, enrollmentID, flowID)
	if res.Err != nil {
		return AssignResult{}, res.Err
	}
	return res, nil
}

// BulkAssign assigns a flow to many enrollments; each succeeds or fails on its own.
func (w *Workspace) BulkAssign(ctx context.Context, u domain.User, flowID uuid.UUID, enrollmentIDs []uuid.UUID) ([]AssignResult, error) {
	if err := requireStaff(u); err != nil {
		return nil, err
	}
	if err := validateIDList(enrollmentIDs, domain.MaxBulkAssign, "enrollment_ids", "students"); err != nil {
		return nil, err
	}
	out := make([]AssignResult, 0, len(enrollmentIDs))
	for _, id := range enrollmentIDs {
		out = append(out, w.assignOne(ctx, u, id, flowID))
	}
	return out, nil
}

func validateIDList(ids []uuid.UUID, maxN int, field, noun string) error {
	if len(ids) == 0 {
		return apperr.Validation(map[string]string{field: "Pick at least one of the " + noun + "."})
	}
	if len(ids) > maxN {
		return apperr.Validation(map[string]string{field: fmt.Sprintf("Pick at most %d %s at once.", maxN, noun)})
	}
	sorted := slices.Clone(ids)
	slices.SortFunc(sorted, func(a, b uuid.UUID) int { return slices.Compare(a[:], b[:]) })
	if len(slices.Compact(sorted)) != len(ids) {
		return apperr.Validation(map[string]string{field: "The list has duplicates."})
	}
	return nil
}

func (w *Workspace) assignOne(ctx context.Context, u domain.User, enrollmentID, flowID uuid.UUID) AssignResult {
	res := AssignResult{EnrollmentID: enrollmentID}
	fail := func(err error) AssignResult {
		if e, ok := apperr.As(err); ok {
			res.Err = e
		} else {
			w.Log.ErrorContext(ctx, "assign flow", "err", err, "enrollment", enrollmentID)
			res.Err = apperr.New(apperr.CodeInternal, "Something went wrong on our side.")
		}
		return res
	}
	e, err := w.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return fail(err)
	}
	if e.Status != domain.EnrollmentActive {
		return fail(apperr.New(apperr.CodeEnrollmentNotActive, "This internship is "+string(e.Status)+"."))
	}
	err = w.Store.Tx(ctx, func(q store.Q) error {
		r, err := ApplyFlow(ctx, q, e, flowID, u.ID, w.Clock.Now())
		res.Generated, res.Skipped, res.Cancelled = r.Generated, r.Skipped, r.Cancelled
		return err
	})
	if err != nil {
		return fail(err)
	}
	return res
}

// ApplyFlow puts an enrollment on a flow's published version inside q: it cancels the old
// flow's unreleased tasks, schedules the new ones with their announcements and records the
// version. Callers check scope and enrollment status first.
func ApplyFlow(ctx context.Context, q store.Q, e domain.Enrollment, flowID, actor uuid.UUID, now time.Time) (AssignResult, error) {
	res := AssignResult{EnrollmentID: e.ID}
	if err := store.LockEnrollmentChat(ctx, q, e.ID); err != nil {
		return res, err
	}
	f, err := store.GetFlow(ctx, q, flowID, false)
	if errors.Is(err, store.ErrNotFound) {
		return res, apperr.New(apperr.CodeNotFound, "Flow not found.")
	}
	if err != nil {
		return res, err
	}
	if f.ArchivedAt != nil {
		return res, apperr.Validation(map[string]string{"flow_id": "This flow is archived."})
	}
	if f.Days != e.Program.Days {
		return res, apperr.Validation(map[string]string{"flow_id": fmt.Sprintf("This flow lasts %d days but the internship lasts %d.", f.Days, e.Program.Days)})
	}
	pub, err := store.FlowVersionByStatus(ctx, q, flowID, domain.FlowPublished)
	if errors.Is(err, store.ErrNotFound) {
		return res, apperr.Validation(map[string]string{"flow_id": "Publish this flow before assigning it."})
	}
	if err != nil {
		return res, err
	}
	if res.Cancelled, err = store.CancelUnreleasedFlowTasks(ctx, q, e.ID, actor, now); err != nil {
		return res, err
	}
	releases, skipped := domain.Materialize(pub.Items, e, now)
	res.Skipped = skipped
	for _, r := range releases {
		itemID := r.Item.ID
		s := r.Item.Spec
		task, err := insertAnnouncedTask(ctx, q, e, actor, domain.ValidatedTask{
			Type: s.Type, Title: s.Title, Brief: s.Brief, PersonaID: s.PersonaID, ReviewMode: s.ReviewMode,
			ScheduledFor: r.ScheduledFor, DueAt: r.DueAt, FlowItemID: &itemID,
		}, now)
		if err != nil {
			return res, err
		}
		if !task.ScheduledFor.After(now) {
			if err := store.Notify(ctx, q, store.Event{Kind: store.EventTask, ID: task.ID, EnrollmentID: e.ID}); err != nil {
				return res, err
			}
		}
	}
	res.Generated = len(releases)
	return res, store.SetEnrollmentFlow(ctx, q, e.ID, pub.ID)
}
