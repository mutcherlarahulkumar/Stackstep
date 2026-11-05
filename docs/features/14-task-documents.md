# Feature 14 — Task documents inside the app

Task documents are authored Markdown stored with a task, library template, or flow item.
Students read them inside the web or mobile app. They do not need an external Markdown
viewer, a public document host, or another account to read the assignment.

## Content and authoring

- `content.documents` is an optional array of `{title, body}`. Existing tasks without this
  field continue to work and decode as an empty list.
- Any task type may carry up to five documents. Titles contain 1–80 Unicode characters
  after whitespace normalization. Bodies contain up to 20,000 Unicode characters and
  cannot be blank. Markdown whitespace is preserved; invalid text and control characters
  are rejected.
- Documents travel with the task content through library → flow draft → published flow →
  assigned task. Editing a library document never rewrites a published or assigned copy.
- Authors can write and preview Markdown. The web editor also imports `.md` and `.markdown`
  files locally; it does not upload a document to an external service.
- The task brief also supports Markdown. Resources remain separately named supplemental
  links; they are not a prerequisite for reading an authored lesson.

## Reading

The task detail lists its documents. Opening one keeps the student inside the app and
returning restores the task. The reader supports headings, paragraphs, lists, code blocks,
quotes, tables, and checklists. Long code and wide tables must scroll within the reader
rather than making the entire screen wider. The reader supports phone widths and dark mode.

Markdown is content, never executable HTML. Raw HTML, scripts, remote images, and unsafe
link schemes must not execute or load. Authored documents are rendered from the task
payload; the server does not fetch arbitrary URLs to produce previews.

## Bounds and edge cases

| # | Case | Expected | Coverage |
|---|---|---|---|
| TD1 | Existing task has no `documents` | Empty document list; existing task actions work | Client decoder tests; browser regressions |
| TD2 | Title/body blank, title too long, body over 20,000 characters, or six documents | Field-specific validation; no partial save | Domain and client validation tests |
| TD3 | Multibyte Unicode, code indentation, and newlines | Count characters consistently and preserve Markdown | Domain/client document tests |
| TD4 | Create template, copy to flow, publish, then assign | Student receives the document snapshot | API and browser integration tests |
| TD5 | Edit a source template after assigning | Assigned content stays unchanged | API snapshot tests |
| TD6 | Student tries to author another student's task | Existing role and enrollment authorization applies | API authorization tests |
| TD7 | Valid rich document opens and closes | Internal reader; no popup or external navigation | Browser and mobile reader tests |
| TD8 | HTML, JavaScript links, or remote images in Markdown | Inert text or removed content; no script or image request | Markdown and browser tests |
| TD9 | Empty, oversized, invalid, or failed file import | Readable error; existing authored text preserved | Editor/import tests |
| TD10 | Phone width, dark mode, long code, or wide table | Readable document; internal scrolling; controls remain reachable | Reader tests and visual review |
| TD11 | Missing document data or malformed response | Strict client decoding rejects malformed content | Web/mobile model tests |
| TD12 | Document-bearing request or complete flow exceeds transport cap | Bounded 413 response; ordinary limits stay in place | API request-size tests |

The native Flutter tests must be run with the pinned SDK before claiming mobile runtime
verification. Web browser emulation is not evidence that the native app passed its tests.
