# Release a version someone else can reproduce

**Estimated effort:** 90 minutes. **Prerequisite:** reviewed capstone changes, a committed lockfile, passing tests and a production build script. Your earlier React projects use Vite; reuse that setup. **Artifact:** a release-checklist PR and a working local production demo. Hosting is optional.

**Problem:** a development server working in a folder full of cached dependencies does not prove a release can be rebuilt. Verify only committed files in a separate clean directory, and explain how to return to the prior version.

## Core work: Define the candidate · 15 minutes

Create `chore/capstone-release`. Add `docs/capstone/release.md` with a proposed version such as `v0.1.0`, the primary journey, known limitations and a checklist for installation, tests, production build, smoke checks and rollback. Record the current candidate commit with `git rev-parse HEAD`.

For this local app, say plainly: data lives in browser storage; there is no real login, cloud backup or cross-device sync. If no configuration is read, state “no environment variables required.” If configuration exists, document its public names and non-secret examples; never put a credential in a browser app or Git. Do not invent an `.env` dependency simply for the checklist.

## Verify a clean checkout · 25 minutes

Commit your intended release files first. A clone does not include uncommitted changes. From your capstone repository:

```sh
git status --short
release_dir=$(mktemp -d)
git clone --no-hardlinks . "$release_dir/capstone"
cd "$release_dir/capstone"
npm ci
npm run
npm run build
```

This is a local clone; it needs no hosting account and changes nothing in the original checkout. `npm ci` assumes the `package-lock.json` committed by the earlier Vite setup. If you deliberately use another lockfile/package manager, use its frozen-lockfile equivalent throughout. Run the same automated test command recorded on day 12/19; `npm run` lists scripts, not test results. Record how many tests actually ran. Fix a missing tracked file or undeclared dependency in your original branch, commit it, and verify a fresh clone again.

## Smoke-test the production output · 20 minutes

For the existing Vite project, start its preview from the clean clone:

```sh
npm run preview -- --host 127.0.0.1 --port 4173
```

Open the address the command reports. Exercise the primary journey, reload and one documented failure case. A preview is a local production-build demo, not a public deployment or production-grade server. Confirm the expected version/data and test deep links if your app uses them.

Storage is scoped by origin: data at the development port will not automatically appear at port 4173. Use fresh, non-sensitive test data. Do not diagnose that expected separation as data loss.

## Hand-in and feedback: Document rollback and submit · 30 minutes

Record the last known-good commit, or state that this is the first release. A local rollback rehearsal can use a second clean clone and `git switch --detach <known-good-commit>`, followed by the same install/test/build/preview steps. Replace the placeholder with a verified commit. Stop your current preview before using its port again. This leaves your working branch intact.

Returning to an older build does not restore browser data. If you changed the stored schema, explain compatibility or recovery before claiming rollback works. Do not use `git reset --hard` on your working repository as a release procedure.

Open a PR containing the checklist, exact commands/results and known limitations. Submit its link and ask a reviewer to repeat the clean install and primary journey. Create/push a release tag only after your project's review/merge process allows it.

## Done checks

 committed files rebuild, tests execute, the production output works locally and rollback limitations are explicit. **Reflection:** which missing assumption did the clean clone expose?

**Optional stretch:** Rehearse one documented rollback on a disposable copy and record what it restores. Skip this when the core timebox is used.
