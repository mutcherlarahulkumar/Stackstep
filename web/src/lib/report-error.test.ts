import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, NetworkError } from "./api/errors";
import { errorSummary, reportError } from "./report-error";

afterEach(() => vi.restoreAllMocks());

describe("crash reports", () => {
  it("sends a crash once to the API log, with where it happened", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const err = new TypeError("x is undefined");
    reportError(err, "page", "abc");
    reportError(err, "page", "abc");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/client-errors");
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    expect(body).toMatchObject({ where: "page", message: "TypeError: x is undefined", digest: "abc" });
    expect(Object.keys(body).sort()).toEqual(["digest", "message", "path", "release", "stack", "where"]);
  });
  it("leaves request failures alone; screens already explain them", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    reportError(new NetworkError("timeout"), "page");
    reportError(new ApiError(500, "internal", "x"), "page");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("summarises any thrown value", () => {
    expect(errorSummary(new RangeError("Invalid time value"))).toBe("RangeError: Invalid time value");
    expect(errorSummary("boom")).toBe("boom");
  });
});
