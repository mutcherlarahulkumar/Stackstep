import { connection } from "next/server";

import { type RuntimeConfig } from "@/lib/api/schemas";

/**
 * Browser settings read at runtime, so one image serves every environment.
 * DEV_LOGIN only shows the panel; the API itself refuses dev login when APP_ENV=production.
 */
export async function GET(): Promise<Response> {
  await connection();
  const body: RuntimeConfig = {
    wsUrl: process.env.PUBLIC_WS_URL ?? "ws://localhost:8080/v1/ws",
    devLogin: process.env.DEV_LOGIN === "true",
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
