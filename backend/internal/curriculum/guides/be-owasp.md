# The OWASP Top 10 for API developers

The OWASP API Security Top 10 lists the mistakes attackers exploit most. Most are about
trusting the client too much.

## 1. Broken object level authorization

The client asks for `/tasks/123`. Does this user own task 123? Check, on every request.

```go
task, err := store.GetTask(ctx, id)
if task.OwnerID != user.ID {
    return notFound() // don't reveal that it exists
}
```

> [!CAUTION]
> This is the number one API vulnerability. Changing an ID in a URL should never show someone
> else's data.

## 2. Broken authentication

Use short-lived access tokens, rotate refresh tokens, rate limit sign-in and never put tokens
in URLs.

## 3. Broken property level authorization

Don't bind the whole request body to your model. A user sending `"role": "admin"` should not
become an admin. Accept only the fields each endpoint allows.

## 4. Unrestricted resource consumption

Cap page sizes, upload sizes, request rates and expensive operations. Unbounded lists and
uploads are an easy way to knock a service over.

## 5. Broken function level authorization

Admin endpoints must check the role on the server. Hidden buttons protect nothing.

## 6 to 10, briefly

- **Sensitive business flows.** Rate limit and verify flows like sign-ups and payments.
- **Server-side request forgery.** Never fetch arbitrary URLs a user gives you without checks.
- **Security misconfiguration.** No debug endpoints in production, tight CORS, secure headers.
- **Improper inventory.** Know every endpoint and version you run, and retire old ones.
- **Unsafe consumption of APIs.** Validate data from other services as carefully as user input.

> [!TIP]
> Write a test for each permission rule. "A student can't read another student's task" is one
> line of test and catches the worst bug there is.

## Check your understanding

For this task's endpoints, list in your task notes who may call each one and how the server
checks it.
