# Stackstep web (Next.js)

Student workspace (chat + board) and the admin console. UI is shadcn/ui ("radix-nova" style,
zinc + violet) with our own components in `src/components/app`, `workspace` and `admin`.

```bash
cp .env.example .env.local   # API on :8080
pnpm install
pnpm dev                     # http://localhost:3000
pnpm check                   # lint + typecheck + unit tests
```

- `/api/*` is a same-origin proxy to the Go API (`src/app/api/[...path]/route.ts`), so the
  refresh token stays in an HttpOnly cookie and the browser needs no CORS.
- `/api/web-config` hands the browser runtime settings (WebSocket URL, dev login).
- Every response is parsed with Zod (`src/lib/api/schemas.ts`) before use.
- Admin console is desktop-only (≥ 1024 px); smaller screens get a prompt and `/admin/assign`.
- Add components with `pnpm dlx shadcn@latest add <name>` (style is set in `components.json`).
