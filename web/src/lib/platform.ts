export type Platform = "android" | "ios" | "desktop";

/** Which store to point a visitor at, from their browser. iPads that report as a Mac count as iOS. */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  return "desktop";
}

/** Our own address for the Android build. It redirects to wherever the file is hosted. */
export const ANDROID_DOWNLOAD_PATH = "/download/stackstep.apk";
