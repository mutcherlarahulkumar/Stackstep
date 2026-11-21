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
| `WEB_BASE_URL` | `https://stackstep.app` | Public web app; certificate verification links open here |

Layout: `lib/api` (typed models, client, realtime), `lib/core` (config, theme, session),
`lib/features/*` (screens + controllers), `lib/ui` (shared components).

## App icon and launch screen

The launcher icons (Android and iOS) and launch images are drawn from the brand mark in
`web/src/app/icon.svg`. To regenerate them after a logo change, run from `mobile/`:

```sh
python3 tool/brand_icons.py   # needs Pillow
```

The Android adaptive icon (with a themed, one-colour version for Android 13) is a vector in
`android/app/src/main/res/drawable/ic_launcher_*.xml`. Launch screens follow light and dark mode.
