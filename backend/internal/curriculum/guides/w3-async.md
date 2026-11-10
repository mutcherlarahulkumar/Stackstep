# Promises, async and await

JavaScript runs one thing at a time, but it doesn't wait around. Network calls, timers and file
reads finish later, and promises are how you deal with "later".

## A promise is a value that arrives later

A promise is pending, then either fulfilled with a value or rejected with an error.

```js
const response = fetch("/api/tasks"); // a Promise, not the data
response.then((r) => r.json()).then((tasks) => console.log(tasks));
```

## async and await read like normal code

`await` pauses the async function until the promise settles, without blocking the page.

```js
async function loadTasks() {
  const r = await fetch("/api/tasks");
  if (!r.ok) throw new Error(`Request failed with ${r.status}`);
  return r.json();
}
```

> [!WARNING]
> `fetch` only rejects on network failure. A 404 or 500 still resolves. Always check `r.ok`.

## Handle errors where you can do something about them

```js
try {
  const tasks = await loadTasks();
  render(tasks);
} catch (err) {
  showError("We couldn't load your tasks. Try again.");
}
```

Show people a clear message and a way to retry. Never swallow an error silently.

## Run independent work in parallel

Awaiting one call after another is slow when they don't depend on each other.

```js
// One after the other, slow
const user = await getUser();
const tasks = await getTasks();

// Together, faster
const [user2, tasks2] = await Promise.all([getUser(), getTasks()]);
```

> [!TIP]
> Use `Promise.allSettled` when you want every result even if some fail.

## Common mistakes

- Forgetting `await`, then using a promise as if it were the data.
- Using `await` inside `forEach`, which doesn't wait. Use `for...of` or `Promise.all`.
- Not handling the loading state, so the page shows stale or empty content.

## Check your understanding

In your task notes, write what this prints and in which order, then run it to check.

```js
console.log("a");
setTimeout(() => console.log("b"), 0);
Promise.resolve().then(() => console.log("c"));
console.log("d");
```
