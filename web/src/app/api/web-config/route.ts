import { connection } from "next/server";

import { type RuntimeConfig } from "@/lib/api/schemas";
import { DEFAULT_ANDROID_URL } from "@/lib/platform";

/**
 * Browser settings read at runtime, so one image serves every environment.
 */
export async function GET(): Promise<Response> {
  await connection();
  const body: RuntimeConfig = {
    wsUrl: process.env.PUBLIC_WS_URL ?? "ws://localhost:8080/v1/ws",
    androidUrl: process.env.APP_ANDROID_URL || DEFAULT_ANDROID_URL,
    iosUrl: process.env.APP_IOS_URL || null,
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
