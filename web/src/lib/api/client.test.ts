import { describe, expect, it, vi } from "vitest";

import { flowJson, json, LEAD_ID, MANAGER_ID, tokens } from "@/test/fixtures";

import { ApiClient } from "./client";
import { ApiError, NetworkError } from "./errors";

const path = (input: RequestInfo | URL) => new URL(String(input), "http://web.test").pathname;

describe("ApiClient", () => {
  it("shares one refresh between concurrent calls", async () => {
    let refreshes = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (path(input) === "/api/v1/auth/refresh") {
        refreshes++;
        await gate;
        return json(tokens());
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-1");
      return json({ items: [] });
    });
    const api = new ApiClient({ fetch: fetchMock });
    const calls = [api.myTasks(), api.myTasks(), api.myTasks()];
    release();
    await Promise.all(calls);
    expect(refreshes).toBe(1);
  });

  it("refreshes once on 401 and retries", async () => {
    let first = true;
    const api = new ApiClient({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        if (path(input) === "/api/v1/auth/refresh") return json(tokens());
        if (first) {
          first = false;
          return json({ error: { code: "unauthenticated", message: "x" } }, 401);
        }
        return json({ items: [] });
      }),
    });
    await expect(api.myTasks()).resolves.toEqual([]);
  });

  it("reports an expired session once refresh is rejected", async () => {
    const expired = vi.fn();
    const api = new ApiClient({ fetch: vi.fn(async () => json({ error: { code: "unauthenticated", message: "x" } }, 401)) });
    api.setSessionExpiredHandler(expired);
    expect(await api.restore()).toBe(false);
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalled();
  });

  it("parses the error envelope into typed fields", async () => {
    const api = new ApiClient({
      fetch: vi.fn(async (input: RequestInfo | URL) =>
        path(input) === "/api/v1/auth/refresh"
          ? json(tokens())
          : json({ error: { code: "validation_failed", message: "no", fields: { title: "Too short" } } }, 422),
      ),
    });
    const err = await api.createTask("e", {
        type: "feature",
        persona_id: null,
        review_mode: "manual",
        title: "ab",
        brief: "",
        scheduled_for: null,
        due_at: new Date(),
        content: { resources: [], quiz: null },
      }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("validation_failed");
    expect((err as ApiError).fields.title).toBe("Too short");
  });

  it("treats gateway errors, dropped connections and contract drift as network errors", async () => {
    const api = new ApiClient({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const p = path(input);
        if (p === "/api/v1/auth/refresh") return json(tokens());
        if (p === "/api/v1/me") return new Response("bad gateway", { status: 502 });
        if (p === "/api/v1/me/tasks") return json({ items: [{ id: "not-a-task" }] });
        throw new TypeError("Failed to fetch");
      }),
    });
    await expect(api.me()).rejects.toBeInstanceOf(NetworkError);
    await expect(api.myTasks()).rejects.toBeInstanceOf(NetworkError);
    await expect(api.messages(LEAD_ID)).rejects.toBeInstanceOf(NetworkError);
  });

  it("sends the web client header and never sends credentials cross-origin", async () => {
    let seen: RequestInit | undefined;
    const api = new ApiClient({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (path(input) === "/api/v1/auth/refresh") return json(tokens());
        seen = init;
        return json({ items: [] });
      }),
    });
    await api.myTasks();
    expect(new Headers(seen?.headers).get("X-Client")).toBe("web");
    expect(seen?.credentials).toBe("same-origin");
  });

  it("encodes thread paths and saves drafts with PUT", async () => {
    const calls: { url: string; method: string | undefined; body: unknown }[] = [];
    const api = new ApiClient({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const p = path(input);
        if (p === "/api/v1/auth/refresh") return json(tokens());
        calls.push({ url: p, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (p.endsWith("/read")) return new Response(null, { status: 204 });
        return json({ flow: flowJson(), draft: null, published: null });
      }),
    });
    await api.staffMarkRead("e/1", MANAGER_ID);
    await api.saveDraft("f-1", 0, []);
    expect(calls[0]?.url).toBe(`/api/v1/admin/threads/e%2F1/${MANAGER_ID}/read`);
    expect(calls[1]).toEqual({ url: "/api/v1/admin/flows/f-1/draft", method: "PUT", body: { expected_revision: 0, items: [] } });
  });
});
