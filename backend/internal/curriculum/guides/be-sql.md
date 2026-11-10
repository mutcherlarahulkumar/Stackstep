# SQL you will use every day

Most backend work is reading and writing rows. A handful of SQL patterns cover nearly all of it.

## Reading

```sql
SELECT id, title, status
FROM tasks
WHERE enrollment_id = $1 AND status <> 'done'
ORDER BY due_at
LIMIT 50;
```

> [!WARNING]
> Always pass values as parameters (`$1`), never by pasting strings into SQL. String building is
> how SQL injection happens.

## Joining tables

```sql
SELECT t.title, p.name AS persona
FROM tasks t
JOIN personas p ON p.id = t.persona_id
WHERE t.enrollment_id = $1;
```

Use `LEFT JOIN` when the right side may be missing and you still want the row.

## Counting and grouping

```sql
SELECT status, count(*) AS n
FROM tasks
WHERE enrollment_id = $1
GROUP BY status;
```

## Writing safely

```sql
INSERT INTO notes (task_id, body) VALUES ($1, $2) RETURNING id;
UPDATE tasks SET status = 'in_review', version = version + 1
WHERE id = $1 AND version = $2;
```

The `version` check is optimistic locking. If someone else changed the row first, no row
matches and you can tell the user to reload.

## Transactions

Group changes that must all happen or none. If anything fails, roll back.

```sql
BEGIN;
UPDATE wallets SET credits = credits - 1 WHERE user_id = $1 AND credits > 0;
INSERT INTO credit_ledger (user_id, delta, reason) VALUES ($1, -1, 'question');
COMMIT;
```

## Indexes

An index makes lookups on a column fast, at the cost of slower writes and some space. Index
the columns you filter and join on. `EXPLAIN ANALYZE` shows whether a query uses one.

> [!TIP]
> Add a unique index for anything that must be unique, such as an email. The database enforces
> it even when two requests race.

## Check your understanding

Write the queries this task needs in your task notes, with the index each one relies on.
