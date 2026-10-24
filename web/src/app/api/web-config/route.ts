import { connection } from "next/server";

import { type RuntimeConfig } from "@/lib/api/schemas";

/**
 * Browser settings read at runtime, so one image serves every environment.
 */
export async function GET(): Promise<Response> {
  await connection();
  const body: RuntimeConfig = {
    wsUrl: process.env.PUBLIC_WS_URL ?? "ws://localhost:8080/v1/ws",
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
