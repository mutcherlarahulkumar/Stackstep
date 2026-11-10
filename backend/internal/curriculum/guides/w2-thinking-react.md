# Thinking in React

React asks you to describe what the screen should look like for a given state, and it works
out the changes. The hard part is not the syntax. It is deciding what your components are and
where each piece of state lives.

## Step 1. Break the design into components

Draw boxes around the parts of the design. Each box that has one job becomes a component. A
product list might become `FilterableList`, `SearchBar`, `List` and `ListRow`.

> [!TIP]
> If a box does two unrelated things, split it. If two boxes always change together, they
> might be one.

## Step 2. Build a static version first

Render the UI from props with no state at all. Data flows down from parent to child. This
version should look right before anything is interactive.

```tsx
function ListRow({ task }: { task: Task }) {
  return (
    <li>
      {task.title} <span>{task.status}</span>
    </li>
  );
}
```

## Step 3. Find the minimal state

State is anything that changes over time and cannot be computed from something else. Ask of
each piece of data.

- Is it passed in from a parent? Then it is a prop, not state.
- Does it stay the same over time? Then it is not state.
- Can you compute it from other state or props? Then it is not state.

```tsx
const [query, setQuery] = useState("");
const [onlyOpen, setOnlyOpen] = useState(false);
// Derived, so not state.
const shown = tasks.filter((t) => t.title.includes(query) && (!onlyOpen || t.status !== "done"));
```

> [!WARNING]
> Storing derived values in state (like `shown` above) is the most common React bug. The copy
> goes stale when the inputs change.

## Step 4. Decide where state lives

Put each piece of state in the closest common parent of every component that reads it. If the
search box and the list both need `query`, it lives in their shared parent.

## Step 5. Let children change it

Pass the setter down as a callback. The child calls it, the parent's state changes, and React
re-renders everything that depends on it.

```tsx
<SearchBar query={query} onQueryChange={setQuery} />
<List tasks={shown} />
```

## Check your understanding

In your task notes, sketch the component tree for this task's feature and mark which component
owns each piece of state, with one sentence on why.
