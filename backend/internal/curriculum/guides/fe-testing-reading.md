# Test the way people use your app

A good test fails when the app breaks for a user and passes when it works, whatever happens
inside. Tests tied to implementation details break every time you refactor and catch little.

## Test behaviour, not internals

Query the page the way a person would, by role, label and text, not by class names or
component state.

```tsx
render(<LoginForm />);
await user.type(screen.getByLabelText("Email"), "asha@example.com");
await user.click(screen.getByRole("button", { name: "Sign in" }));
expect(await screen.findByText("Welcome back")).toBeInTheDocument();
```

> [!TIP]
> If you can't find an element by role or label, real users with screen readers probably can't
> either. Fix the markup, then the test.

## The testing trophy

- **Static checks** (TypeScript, ESLint) catch typos for free.
- **Unit tests** cover small pure functions, such as formatting and validation.
- **Integration tests** render a component with its children and check behaviour. Most of your
  confidence comes from here.
- **End-to-end tests** drive a real browser through the most important journeys.

## Arrange, act, assert

Keep each test in three clear parts. Set up the state, do one thing, check the result.

```ts
it("hides done tasks when the filter is on", async () => {
  render(<Board tasks={[open, done]} />);                 // arrange
  await user.click(screen.getByLabelText("Hide done"));    // act
  expect(screen.queryByText(done.title)).toBeNull();       // assert
});
```

## Test the unhappy paths

Empty lists, slow networks, errors and invalid input are where bugs live. Write a test for the
error message, not just the success.

> [!IMPORTANT]
> A test that never fails is worthless. Break the code on purpose once and watch the test go
> red before you trust it.

## Check your understanding

Write one test for this task that would have caught a real bug. In your task notes, say which
bug and how you made the test fail first.
