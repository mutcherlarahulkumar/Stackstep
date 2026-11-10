export type Platform = "android" | "ios" | "desktop";

/** Which store to point a visitor at, from their browser. iPads that report as a Mac count as iOS. */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  return "desktop";
}

/** Where the Android build lives: a configured link, else the latest build on GitHub. */
export const DEFAULT_ANDROID_URL =
  "https://github.com/mutcherlarahulkumar/stackstep/releases/download/latest-main/stackstep.apk";
