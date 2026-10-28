# Feature 16 — Public home page

`/` is the public front door: what Stackstep is, how it works, every feature, what colleges
get, a certificate check and an FAQ (including the no-refund policy).

## Decisions

- **Signed-in visitors are not redirected away from `/`.** People open the home page on
  purpose (to read the FAQ, share the link, verify a certificate), so it stays viewable. The
  navbar knows the session instead: "Open workspace", "Open admin console" or "Continue
  application" plus the avatar menu (with Sign out). It never says "Sign in" to a signed-in
  person. `/login` still sends signed-in people straight home.
- **Verify is in the top bar** (and on phones as a "Verify" button), plus a code box on the page.
  No account is needed.
- **Motion**: the hero chat plays once (CSS only), cards float, sections fade up as they scroll
  into view. All of it stops for `prefers-reduced-motion`.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| HM1 | Signed out | "Sign in" and "Start with GitHub" | E2E `home.spec.ts` |
| HM2 | Verify without an account | top-bar link (desktop and phone) opens `/verify`; the home code box checks the format, then opens `/verify/CODE` | E2E `home.spec.ts` |
| HM3 | Signed in | no "Sign in"; the button says where it goes (workspace, admin console, or continue application) and goes there | E2E `home.spec.ts` |
| HM4 | Session still loading | a neutral placeholder, never a flash of "Sign in" | manual (screenshots) |
