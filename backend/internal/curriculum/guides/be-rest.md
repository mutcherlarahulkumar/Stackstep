# Designing a REST API people enjoy using

An API is a user interface for programmers. Predictable names, clear errors and honest status
codes save every client hours.

## Resources and URLs

Name things as nouns, in the plural, and nest only when one truly belongs to another.

```text
GET    /tasks              list tasks
POST   /tasks              create a task
GET    /tasks/{id}         read one
PATCH  /tasks/{id}         change part of one
DELETE /tasks/{id}         remove one
GET    /tasks/{id}/notes   notes that belong to a task
```

> [!TIP]
> Actions that aren't plain create, read, update or delete can be sub-resources, such as
> `POST /tasks/{id}/hand-in`.

## Status codes that mean something

Return `201` with the created resource, `204` when there's nothing to say, `404` when it isn't
there, `409` when the request conflicts with the current state and `422` when validation fails.

## One error shape everywhere

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Some fields need fixing.",
    "fields": { "title": "Keep the title under 120 characters." }
  }
}
```

Clients can map the `code` to their own copy and show `fields` next to the inputs.

## Pagination

Never return an unbounded list. Cursor pagination stays fast and correct when rows are added.

```json
{ "items": [...], "next_cursor": "eyJpZCI6..." }
```

## Validate at the edge

Reject unknown fields, check lengths and formats, and trim text before it reaches your business
logic. Never trust the client.

> [!WARNING]
> Check authorization on every request, for every resource. "The UI hides the button" is not
> security.

## Versioning

Put the version in the path (`/v1/`). Add fields freely, but never rename or remove one inside
a version. Clients should ignore fields they don't know.

## Check your understanding

In your task notes, design the endpoints for this task's feature with method, path, request,
response and the error cases.
