package httpapi

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

func documentContent(title, body string) map[string]any {
	return map[string]any{"documents": []map[string]string{{"title": title, "body": body}}}
}

func studentDocumentTask(e *env, student, title string) taskDTO {
	e.t.Helper()
	var board struct {
		Items []taskDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", student, nil), 200).json(e.t, &board)
	for _, task := range board.Items {
		if task.Title == title {
			return task
		}
	}
	e.t.Fatalf("task %q not on student's board", title)
	return taskDTO{}
}

func TestTaskDocuments(t *testing.T) {
	e := newEnv(t)
	admin, student := e.login(seed.AdminLogin), e.login(seed.StudentLogin)
	enrollment := e.enrollmentOf(seed.StudentLogin)
	body := "\n# Try this\n\n```js\n  const x = 1;\n```\n\n<script>alert('example')</script>\n[Example](javascript:alert(1))\n"
	content := documentContent("  Task   guide  ", body)
	request := validTask(e.clock.Now())
	request["content"] = content
	var created taskDTO
	e.expect(e.createTask(admin, enrollment, request), 201).json(t, &created)
	want := []documentDTO{{Title: "Task guide", Body: body}}
	if !reflect.DeepEqual(created.Content.Documents, want) {
		t.Fatalf("created documents = %+v", created.Content.Documents)
	}
	mine := studentDocumentTask(e, student, created.Title)
	if !reflect.DeepEqual(mine.Content.Documents, want) {
		t.Fatalf("student documents changed: %+v", mine.Content.Documents)
	}
	// Content is data: HTML and unsafe Markdown URLs are preserved for safe client renderers.
	// Documents never grant another student access to the task or staff mutation routes.
	other := e.login(seed.Student2Login)
	otherBoard := e.expect(e.do("GET", "/v1/me/tasks", other, nil), 200)
	if strings.Contains(string(otherBoard.Body), created.ID.String()) {
		t.Fatal("another student can read the documented task")
	}
	e.expect(e.createTask(student, enrollment, request), 403)
	e.expect(e.createTask("", enrollment, request), 401)

	// Old requests and stored JSON omit documents; all responses expose [] rather than null.
	var legacy taskDTO
	e.expect(e.createTask(admin, enrollment, validTask(e.clock.Now())), 201).json(t, &legacy)
	if legacy.Content.Documents == nil || len(legacy.Content.Documents) != 0 {
		t.Fatalf("legacy documents = %+v", legacy.Content.Documents)
	}

	// Adding a lesson must not reveal a quiz's answer key to the student.
	quizRequest := quizBody(e.clock.Now())
	quizContent, ok := quizRequest["content"].(map[string]any)
	if !ok {
		t.Fatal("quiz content fixture has the wrong type")
	}
	quizContent["documents"] = []documentDTO{{Title: "Quiz preparation", Body: "Read before answering."}}
	var quiz taskDTO
	e.expect(e.createTask(admin, enrollment, quizRequest), 201).json(t, &quiz)
	quiz = studentDocumentTask(e, student, quiz.Title)
	if len(quiz.Content.Documents) != 1 || quiz.Content.Quiz == nil || quiz.Content.Quiz.Questions[0].Answer != nil {
		t.Fatalf("lesson or quiz redaction changed: %+v", quiz.Content)
	}

	bad := validTask(e.clock.Now())
	bad["content"] = documentContent("Guide", " \n\t")
	wantField(t, e.expect(e.createTask(admin, enrollment, bad), 422), "documents[0].body")
	bad["content"] = map[string]any{"documents": []map[string]any{{"title": "Guide", "body": "Lesson", "url": "https://example.com"}}}
	e.expect(e.createTask(admin, enrollment, bad), 400)
	path := "/v1/admin/enrollments/" + enrollment.String() + "/tasks"
	e.expect(e.do("POST", path, admin, "{\"content\":{\"documents\":[{\"title\":\"Guide\",\"body\":\"bad\xff\"}]}}"), 400)
}

func TestTaskDocumentSnapshots(t *testing.T) {
	e := newEnv(t)
	admin := e.login(seed.AdminLogin)
	spec := item(3, "Read the local task guide", domain.DefaultPersonaID, "self", "09:00", 120)
	delete(spec, "day")
	spec["type"] = "doc_reading"
	spec["content"] = documentContent("Lesson", "# Original\n\nThe original instructions.")
	var template templateDTO
	e.expect(e.do("POST", "/v1/admin/task-templates", admin, spec), 201).json(t, &template)
	want := append([]documentDTO{}, template.Content.Documents...)
	if len(want) != 1 {
		t.Fatal("template dropped the document")
	}
	e.expect(e.do("POST", "/v1/admin/task-templates", e.login(seed.StudentLogin), spec), 403)
	e.expect(e.do("POST", "/v1/admin/task-templates", e.login(seed.CollegeAdminLogin), spec), 403)

	flow := e.newFlow(admin, "Inline lesson flow")
	flowItem := item(3, template.Title, template.PersonaID, "self", "09:00", 120)
	flowItem["type"] = "doc_reading"
	flowItem["template_id"] = template.ID
	flowItem["content"] = template.Content
	var saved flowDetailDTO
	e.expect(e.saveDraft(admin, flow.Flow.ID, 1, []map[string]any{flowItem}), 200).json(t, &saved)
	if saved.Draft == nil || !reflect.DeepEqual(saved.Draft.Items[0].Content.Documents, want) {
		t.Fatalf("draft changed documents: %+v", saved.Draft)
	}
	e.expect(e.publish(admin, flow.Flow.ID, saved.Draft.Revision), 200)

	// Library edits cannot mutate a published flow's content snapshot.
	spec["content"] = documentContent("Edited lesson", "New instructions.")
	spec["expected_version"] = template.Version
	e.expect(e.do("PATCH", "/v1/admin/task-templates/"+template.ID.String(), admin, spec), 200)
	e.expect(e.do("PATCH", "/v1/admin/task-templates/"+template.ID.String(), admin, spec), 409)
	var detail flowDetailDTO
	e.expect(e.do("GET", "/v1/admin/flows/"+flow.Flow.ID.String(), admin, nil), 200).json(t, &detail)
	if detail.Published == nil || !reflect.DeepEqual(detail.Published.Items[0].Content.Documents, want) {
		t.Fatal("template edit changed the published lesson")
	}

	enrollment := e.enrollmentOf(seed.StudentLogin)
	e.expect(e.do("PUT", "/v1/admin/enrollments/"+enrollment.String()+"/flow", admin, map[string]any{"flow_id": flow.Flow.ID}), 200)
	student := e.login(seed.StudentLogin)
	assigned := studentDocumentTask(e, student, template.Title)
	if !assigned.FromFlow || !reflect.DeepEqual(assigned.Content.Documents, want) {
		t.Fatalf("assigned lesson = %+v", assigned.Content)
	}

	// A newly edited/published version leaves the already assigned task unchanged.
	flowItem["content"] = documentContent("Next lesson", "Updated curriculum for new assignments.")
	e.expect(e.saveDraft(admin, flow.Flow.ID, 0, []map[string]any{flowItem}), 200).json(t, &saved)
	e.expect(e.saveDraft(admin, flow.Flow.ID, 0, []map[string]any{flowItem}), 409)
	e.expect(e.publish(admin, flow.Flow.ID, saved.Draft.Revision), 200)
	assigned = studentDocumentTask(e, student, template.Title)
	if !reflect.DeepEqual(assigned.Content.Documents, want) {
		t.Fatal("publishing a new flow changed an assigned task's lesson")
	}

	invalid := item(3, "Invalid lesson", domain.DefaultPersonaID, "self", "10:00", 60)
	invalid["content"] = documentContent("", "Valid body")
	wantField(t, e.expect(e.saveDraft(admin, flow.Flow.ID, 0, []map[string]any{invalid}), 422), "items[0].documents[0].title")
}

func TestTaskDocumentBodyLimits(t *testing.T) {
	e := newEnv(t)
	admin := e.login(seed.AdminLogin)
	enrollment := e.enrollmentOf(seed.StudentLogin)
	documents := make([]documentDTO, domain.MaxDocuments)
	for i := range documents {
		documents[i] = documentDTO{Title: "Unicode lesson", Body: strings.Repeat("文", domain.DocumentBodyMax)}
	}
	content := map[string]any{"documents": documents}
	request := validTask(e.clock.Now())
	request["content"] = content
	encoded, err := json.Marshal(request)
	if err != nil || len(encoded) <= MaxBodyBytes {
		t.Fatalf("test request must exceed the ordinary limit: %d %v", len(encoded), err)
	}
	e.expect(e.createTask(admin, enrollment, request), 201)
	spec := item(3, "Large lesson", domain.DefaultPersonaID, "manual", "10:00", 60)
	delete(spec, "day")
	spec["content"] = content
	var template templateDTO
	e.expect(e.do("POST", "/v1/admin/task-templates", admin, spec), 201).json(t, &template)
	spec["expected_version"] = template.Version
	e.expect(e.do("PATCH", "/v1/admin/task-templates/"+template.ID.String(), admin, spec), 200)

	// A complete draft can exceed the individual task/template transport budget.
	flow := e.newFlow(admin, "Rich lessons draft")
	items := make([]map[string]any, 5)
	for i := range items {
		items[i] = item(i+1, "A substantial lesson", domain.DefaultPersonaID, "manual", "10:00", 60)
		items[i]["content"] = content
	}
	encoded, err = json.Marshal(items)
	if err != nil || len(encoded) <= MaxContentBodyBytes {
		t.Fatalf("draft must exceed the task budget: %d %v", len(encoded), err)
	}
	e.expect(e.saveDraft(admin, flow.Flow.ID, 1, items), 200)

	oversizedContent := `{"brief":"` + strings.Repeat("x", MaxContentBodyBytes) + `"}`
	for _, endpoint := range []struct{ method, path string }{
		{"POST", "/v1/admin/enrollments/" + enrollment.String() + "/tasks"},
		{"POST", "/v1/admin/task-templates"},
		{"PATCH", "/v1/admin/task-templates/" + template.ID.String()},
	} {
		e.expect(e.do(endpoint.method, endpoint.path, admin, oversizedContent), 413)
	}
	oversizedDraft := `{"expected_revision":2,"items":[{"brief":"` + strings.Repeat("x", MaxFlowDraftBodyBytes) + `"}]}`
	e.expect(e.do("PUT", "/v1/admin/flows/"+flow.Flow.ID.String()+"/draft", admin, oversizedDraft), 413)
	// Unrelated endpoints keep their smaller cap.
	e.expect(e.do("POST", "/v1/admin/personas", admin, `{"name":"`+strings.Repeat("x", MaxBodyBytes)+`"}`), 413)
}

// DTO defaults also cover persisted content written before documents existed.
func TestLegacyTaskDocumentsDTO(t *testing.T) {
	dto := toContent(domain.TaskContent{}, false)
	if dto.Documents == nil || len(dto.Documents) != 0 {
		t.Fatal("legacy document DTO must be []")
	}
	encoded, err := json.Marshal(dto)
	if err != nil || !strings.Contains(string(encoded), `"documents":[]`) {
		t.Fatalf("legacy JSON = %s, %v", encoded, err)
	}
}
