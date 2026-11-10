import { connection } from "next/server";

/** Where the APK is hosted when APP_ANDROID_URL isn't set: the latest build from CI. */
const BUILD_URL =
  "https://github.com/mutcherlarahulkumar/stackstep/releases/download/latest-main/stackstep.apk";

/**
 * The Android download. The page links here, so visitors see our address and the file's
 * real home can change (a versioned build, a bucket, the Play Store) without touching the page.
 */
export async function GET(): Promise<Response> {
  await connection();
  const target = process.env.APP_ANDROID_URL || BUILD_URL;
  return new Response(null, {
    status: 302,
    headers: { location: target, "cache-control": "no-store" },
  });
}
