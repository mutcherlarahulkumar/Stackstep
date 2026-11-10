# Keep state small and derive the rest

**Estimated effort:** 105 minutes. **Prerequisite:** the React component port. **Artifact:** controlled filters with predictable reset behaviour.

## Core work
1. Write the minimal state: the query and selected tag. The project dataset remains the source of truth.
2. Calculate visible projects from that data and current controls during rendering. Do not store a second copy of filtered projects in state.
3. Normalize query case and surrounding whitespace in the comparison, while preserving what the user types in the input.
4. Make reset clear both state values in one action.
5. Show the result count without moving keyboard focus unexpectedly.

```jsx
const [query, setQuery] = useState("");
const [tag, setTag] = useState("all");
const normalized = query.trim().toLowerCase();
const visible = projects.filter(project =>
  (tag === "all" || project.tags.includes(tag)) &&
  project.title.toLowerCase().includes(normalized));
```

## Done checks
Tag and search compose with AND. The empty state offers a working reset. Result count always matches displayed cards. Controls are labelled and can be used with a keyboard. Add examples for case-insensitive search, whitespace and no matches.

## Debugging experiment
If results lag one keystroke behind, inspect whether an effect is copying derived data into state. Remove the duplicate source rather than adding another synchronization effect. Explain when a genuinely expensive calculation might justify memoization; measurement comes before optimization.

## Hand-in and feedback
Submit the PR with a state diagram and expected visible ids for three scenarios. Ask the reviewer to invent a sequence of reset/filter actions that might expose inconsistent state.

**Optional stretch:** make a polite result-count announcement that does not repeat the whole card list.
