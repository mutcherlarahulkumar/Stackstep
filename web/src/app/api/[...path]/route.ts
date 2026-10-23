import { type NextRequest } from "next/server";

/**
 * Same-origin proxy to the Go API. Keeping the API on the web origin means the refresh
 * token can be an HttpOnly, SameSite=Lax cookie and the browser never needs CORS.
 * The target is read at request time, so one build works in every environment.
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function target(): string {
  const url = process.env.API_INTERNAL_URL;
  if (!url) throw new Error("API_INTERNAL_URL is not set");
  return url.replace(/\/+$/, "");
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  // Only the versioned API is exposed; nothing else on the backend is reachable from here.
  if (path[0] !== "v1" || path.some((p) => p === ".." || p === "." || p.includes("/"))) {
    return Response.json({ error: { code: "not_found", message: "Route not found." } }, { status: 404 });
  }
  const url = `${target()}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  const forwardedFor = req.headers.get("x-forwarded-for");
  const clientIp = forwardedFor?.split(",")[0]?.trim();
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  headers.set("x-forwarded-host", req.headers.get("host") ?? "");
  headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      redirect: "manual", // OAuth redirects go back to the browser untouched
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return Response.json({ error: { code: "internal", message: "API unavailable." } }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie" && key.toLowerCase() !== "content-encoding") {
      out.set(key, value);
    }
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export { proxy as GET, proxy as POST };
