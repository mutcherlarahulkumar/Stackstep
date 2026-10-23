# Working on Stackstep

Read `docs/PLAN.md` first. Build one vertical slice at a time: backend → mobile → web → E2E.

## Non-negotiables

- **Typed end to end.** `api/openapi.yaml` is the contract. Go enums are named string types
  with `Valid()`; TS parses every response with Zod (`web/src/lib/api/schemas.ts`); Dart
  decodes through `JsonReader` and throws on unknown enums. `scripts/check-contract.mjs`
  (CI: API contract) fails on enum drift — update all three when the contract changes.
- **No `any`** (lint error), no `!` non-null assertions in app code, exhaustive `switch`es.
- **Every edge case is a row** in the feature spec (`docs/features/*.md`) with a test.
- **Errors**: one envelope, closed `code` set; UIs map codes to copy (`messageFor`) and
  never show server messages.
- **UI**: compose our components (`web/src/components/app`, `mobile/lib/ui`) on shadcn
  primitives. Every screen has loading, empty, error and offline states, works in dark
  mode, at phone width, and with a keyboard/screen reader. Capture screenshots with
  `e2e/scripts/screenshots.mjs` and review them before calling UI work done.
- **Admins**: full console on desktop web only; task allocation also on phones and the app.

## Commands

`make check` (everything), `make up` (Docker stack), `make e2e`. Backend integration tests
need `TEST_DATABASE_URL`. Web: `pnpm check`. Mobile: `flutter analyze && flutter test`.

## Tools

- shadcn MCP / `pnpm dlx shadcn@latest add <component>` (style `radix-nova`, see
  `web/components.json`). Flutter: `shadcn_ui` package docs ship in its `skills/` folder.
- Orshot MCP for generated imagery (certificates, OG images, store screenshots).
