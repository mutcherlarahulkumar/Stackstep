# A projects grid with precise filter behaviour

**Estimated effort:** 90 minutes. **Prerequisite:** semantic hero and Flexbox experiments. **Artifact:** `feat/projects` PR.

## Contract
Keep the project dataset separate from rendering. Every project has a stable unique id, title, description, tags, and a real link. Start with 4–6 original examples; unfinished examples must be labelled clearly.

```js
const projects = [
  { id: "portfolio", title: "Portfolio", description: "My learning journal",
    tags: ["frontend"], url: "https://github.com/your-login/portfolio" },
];
// Visible means tag matches AND title includes the trimmed, case-insensitive query.
```

## Core work
1. Render readable cards and meaningful links. Build the unfiltered state first.
2. Add one selected tag, including “All”, and a labelled search input.
3. Specify AND behaviour: choosing frontend and searching portfolio must satisfy both.
4. Add a visible result count and an empty state with a reset action.
5. Test keyboard access, 360px width, and a long title.

## Done checks
Search ignores leading/trailing spaces and case. Reset clears both controls. Cards use stable ids; no item unexpectedly disappears when only the display order changes. An empty dataset is different from an error.

## Debugging experiment
Write the selected tag, normalized query and visible ids in a note. If combined filtering fails, evaluate each predicate separately using the same dataset. Do not patch the UI by deleting nonmatching data.

## Hand-in and feedback
Submit the PR with a small table of queries, selected tags and expected ids. Ask a reviewer to reproduce one result from your table.

**Optional stretch:** add category counts derived from the same source data. Avoid introducing a second copied list that can become stale.
