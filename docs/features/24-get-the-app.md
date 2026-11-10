# Feature 24 — Get the app

A public page at `/download` that helps anyone install the phone app.

- A hero with the phone held in a hand. It tilts upright as you scroll.
- A scrolling tour. The phone stays put while four steps scroll past (chats, board,
  calendar, live classes) and its screen follows the step you are reading.
- The page detects the visitor's device and leads with the right button.
  - Android gets **Download for Android**. It points at our own `/download/stackstep.apk`,
    which redirects to `APP_ANDROID_URL` (default: the latest CI build). The page never names
    or links the code host.
  - iPhone gets **Get it on iPhone** when `APP_IOS_URL` is set. Otherwise it gets the steps
    to add the web app to the home screen (a web manifest and home screen icon ship).
  - Desktops get both buttons and a QR code that opens the page on their phone.
- Install steps for each platform, in tabs, opened on the visitor's own platform.
- Troubleshooting questions and answers, with the visitor's platform first.
- Linked from the site nav, the home page feature grid and both footers.
- The links come from `/api/web-config` (`APP_IOS_URL`; Android is always `/download/stackstep.apk`), so the page itself
  is static and the right button shows as soon as the device is known.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| DL1 | Android, iPhone, iPad reporting as a Mac, desktop | Each detected correctly | web `platform.test.ts` |
| DL2 | Desktop visitor | Both buttons and the QR code; tabs open on Android | E2E `download.spec.ts` |
| DL3 | Android phone | One Download for Android button pointing at the APK; Android tab and questions first | E2E `download.spec.ts` |
| DL4 | iPhone with no `APP_IOS_URL` | The button leads to the Add to Home Screen steps | E2E `download.spec.ts` |
| DL6 | Android download link | Our own address, redirecting to the build; no GitHub link or text on the page | E2E `download.spec.ts` |
| DL5 | Phone width | No sideways scrolling; the tour phone shrinks and stays visible | E2E `download.spec.ts` |
