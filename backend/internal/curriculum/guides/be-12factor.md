# The Twelve-Factor App, in practice

The Twelve-Factor methodology describes apps that deploy cleanly anywhere and scale without
drama. You don't need to memorise all twelve. These are the ones you'll feel every week.

## Config lives in the environment

Anything that changes between local, staging and production (URLs, keys, feature flags) comes
from environment variables, never from code.

```go
dbURL := os.Getenv("DATABASE_URL")
if dbURL == "" {
    log.Fatal("DATABASE_URL is required")
}
```

> [!WARNING]
> Never commit secrets. Keep a `.env.example` with placeholder values and add `.env` to
> `.gitignore`.

## Dependencies are declared and locked

`go.mod` and `go.sum`, or `package.json` and the lockfile, list exactly what the app needs. A
fresh clone plus one install command should build.

## Processes are stateless

Don't keep user sessions or uploads in memory or on the local disk. Put them in the database,
a cache or object storage, so any instance can serve any request and instances can come and go.

## Logs are a stream

Write logs to standard output, one event per line, ideally structured.

```go
slog.Info("task handed in", "task", id, "user", userID)
```

The platform collects and ships them. Your app never manages log files.

## Build, release, run are separate

Build an artifact once, combine it with config to make a release, then run it. The same build
goes to staging and production.

## Dev and prod stay close

Use the same database engine and versions locally as in production. "It worked on SQLite" is
how surprises happen.

> [!TIP]
> Docker Compose is an easy way to run the same Postgres locally that you run in production.

## Disposability

Start fast and shut down gracefully. On a stop signal, stop taking new work, finish what's in
flight, then exit.

## Check your understanding

In your task notes, list every setting your service reads from the environment and what it
does when one is missing.
