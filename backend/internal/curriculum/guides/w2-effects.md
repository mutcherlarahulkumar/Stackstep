# Effects, and when you don't need one

`useEffect` lets a component sync with something outside React, such as a network request, a
timer or a browser API. It is often reached for when it isn't needed, and those extra effects
cause flicker, loops and stale data.

## What an effect is for

An effect runs after React has updated the screen. Use it to talk to systems React doesn't
control.

```tsx
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(id); // clean up when the component leaves
}, []);
```

> [!IMPORTANT]
> Every effect that subscribes or starts something must return a cleanup function. Without it
> you leak timers, sockets and listeners.

## You don't need an effect to transform data

If something can be computed from props or state, compute it while rendering.

```tsx
// Avoid
const [fullName, setFullName] = useState("");
useEffect(() => setFullName(first + " " + last), [first, last]);

// Prefer
const fullName = first + " " + last;
```

If the computation is expensive, wrap it in `useMemo` instead of an effect.

## You don't need an effect for user events

Code that should run because the user clicked belongs in the click handler, not in an effect
that watches state.

```tsx
function handleSubmit() {
  save(form);
  toast("Saved");
}
```

## Fetching data

Fetching in an effect works, but you must handle the race where an old request finishes after
a new one.

```tsx
useEffect(() => {
  let ignore = false;
  fetch(`/api/tasks?q=${query}`)
    .then((r) => r.json())
    .then((data) => {
      if (!ignore) setTasks(data);
    });
  return () => {
    ignore = true;
  };
}, [query]);
```

> [!TIP]
> In real apps a data library such as TanStack Query handles caching, retries and races for you.

## The dependency array

List every value from the component that the effect reads. If the list feels wrong, the effect
is usually doing too much. Split it or move the logic out.

## Check your understanding

Find one effect in your code. In your task notes, say whether it syncs with something outside
React. If it doesn't, rewrite it without an effect.
