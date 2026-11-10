# HTTP essentials for frontend developers

Every time your app loads data or saves a form, it speaks HTTP. Knowing the basics makes bugs
in the network tab easy to read.

## A request and a response

A request has a **method**, a **URL**, **headers** and sometimes a **body**. The response has a
**status code**, headers and a body.

```http
POST /api/tasks HTTP/1.1
Content-Type: application/json
Authorization: Bearer eyJ...

{"title": "Fix the navbar"}
```

```http
HTTP/1.1 201 Created
Content-Type: application/json

{"id": "t_123", "title": "Fix the navbar"}
```

## Methods say what you want

| Method | Use it to | Safe to repeat? |
|---|---|---|
| GET | Read something | Yes |
| POST | Create something or run an action | No |
| PUT | Replace something | Yes |
| PATCH | Change part of something | Usually |
| DELETE | Remove something | Yes |

## Status codes tell you what happened

- **2xx** worked. `200 OK`, `201 Created`, `204 No Content`.
- **4xx** the request was wrong. `400` bad input, `401` not signed in, `403` not allowed,
  `404` not found, `409` conflict, `422` failed validation, `429` slow down.
- **5xx** the server failed. Retry later, and tell the user kindly.

> [!TIP]
> Map status codes to messages people understand. "That email is already in use" beats
> "Error 409".

## Headers you will meet

- `Content-Type` says what the body is, usually `application/json`.
- `Authorization` carries your token.
- `Cache-Control` says how long a response may be reused.

## CORS in one paragraph

Browsers block a page from reading responses from another origin unless that server allows it
with `Access-Control-Allow-Origin`. If you see a CORS error, the fix is on the server, or you
call your own backend which then calls the other service.

> [!WARNING]
> Never put secret API keys in frontend code. Anything shipped to the browser can be read by
> anyone.

## Use the network tab

Open dev tools, then Network, then reload. Click a request to see its method, status, headers,
payload and response. Most "the button does nothing" bugs are visible here in seconds.

## Check your understanding

In your task notes, pick one request your app makes and write down its method, URL, status
and what the response means.
