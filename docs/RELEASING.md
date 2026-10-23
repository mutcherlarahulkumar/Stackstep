# Releasing

Versions are driven by [release-please](https://github.com/googleapis/release-please) from
Conventional Commit PR titles (enforced by `pr-title.yml`; use squash merges).

1. Merge feature PRs to `main`. release-please keeps a `chore(main): release x.y.z` PR open
   with the changelog and version bumps (`version.txt`, `web/package.json`,
   `e2e/package.json`, `mobile/pubspec.yaml`).
2. Merge that PR. `release.yml` tags `vX.Y.Z`, creates the GitHub Release, re-runs every
   CI suite against it, then attaches:

| Artifact | Where |
|---|---|
| `stackstep-api_<v>_{linux,darwin}_{amd64,arm64}.tar.gz` (+ sha256) | Release assets |
| `ghcr.io/<owner>/stackstep-api:<v>` and `stackstep-web:<v>` (amd64 + arm64, provenance attested) | GHCR |
| `stackstep_<v>.apk`, `stackstep_<v>.aab` | Release assets |
| `stackstep_<v>.ipa` (signed) or `stackstep_<v>_unsigned.ipa` | Release assets |

To rebuild artifacts for an existing tag: Actions → Release → Run workflow → `vX.Y.Z`.

### Every push to `main`: the `latest-main` pre-release

When a push doesn't cut a versioned release, the Release workflow still builds everything and
publishes it to a rolling **`latest-main`** pre-release (replaced on each push): the APK and
AAB (`stackstep_<version>-main.<run>.apk`), the iOS build, and the API binaries. Docker images
are pushed as `:main` and `:sha-<commit>`. Artifact builds don't wait on the test suites —
those run in the regular CI workflows on the same push.

**Versioned releases need one repo setting:** Settings → Actions → General → Workflow
permissions → tick **Allow GitHub Actions to create and approve pull requests**. Without it
release-please can't open its release PR; the workflow warns and ships `latest-main` instead.

### Non-blocking checks

- CodeQL runs on `main` and weekly, not on PRs, and never fails the build (code scanning may
  need enabling under Settings → Code security).
- The Flutter format check is advisory; Android and iOS CI builds don't wait for it.

## Configuration

Repository **variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Used for | Default |
|---|---|---|
| `MOBILE_API_BASE_URL` | API URL compiled into mobile builds | `https://api.stackstep.app` |
| `WEB_CONSOLE_URL` | Desktop console link shown to admins in the app | `https://stackstep.app/admin` |
| `WEB_BASE_URL` | Public web app; certificate links in the app open here | `https://stackstep.app` |

Repository **secrets** (each group is optional; without it the build still succeeds):

| Secret | Effect |
|---|---|
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Play-signed APK/AAB (otherwise debug-signed) |
| `IOS_P12_BASE64`, `IOS_P12_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `IOS_TEAM_ID` | App Store-signed IPA (otherwise unsigned) |

## Runtime configuration

Every API, web and mobile setting (including the Groq AI helper) is documented in
[`SETUP.md`](SETUP.md), with a production checklist.
