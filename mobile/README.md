# Stackstep mobile (Flutter)

Student chat + task board, and task allocation for admins. Built on
[shadcn_ui](https://pub.dev/packages/shadcn_ui) with our own components in `lib/ui/`.

```bash
flutter pub get
# iOS simulator / desktop host: API on localhost:8080. Android emulator uses 10.0.2.2 automatically.
flutter run --dart-define=API_BASE_URL=http://localhost:8080
flutter analyze && flutter test
```

| `--dart-define` | Default | Purpose |
|---|---|---|
| `API_BASE_URL` | `http://localhost:8080` (`10.0.2.2` on Android) | Go API |
| `WEB_CONSOLE_URL` | `https://stackstep.app/admin` | Link admins copy to open the desktop console |
| `DEV_LOGIN` | `false` (always on in debug) | Show seeded-user sign-in for QA builds |

Layout: `lib/api` (typed models, client, realtime), `lib/core` (config, theme, session),
`lib/features/*` (screens + controllers), `lib/ui` (shared components).
