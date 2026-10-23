import { describe, expect, it } from "vitest";

import { type OverviewRow, Student } from "./api/schemas";
import { lastActiveLabel, matchesFilter, sortRows } from "./overview";
import { enrollment, user } from "@/test/fixtures";

const student = () => Student.parse({ user: user(), enrollment: enrollment(), open_tasks: 0, in_review: 0 });

const row = (over: Partial<OverviewRow> & { name?: string; id?: string }): OverviewRow => {
  const s = student();
  return {
    student: { ...s, user: { ...s.user, name: over.name ?? s.user.name }, enrollment: { ...s.enrollment, id: over.id ?? s.enrollment.id } },
    released: 10,
    done: 5,
    in_review: 0,
    overdue: 0,
    completion_percent: 50,
    points: 100,
    credits: 20,
    last_active_at: null,
    inactive: false,
    certificate: null,
    ...over,
  };
};

describe("overview filters (PO7)", () => {
  it("ready means past the bar without a valid certificate", () => {
    expect(matchesFilter(row({ completion_percent: 70 }), "ready")).toBe(true);
    expect(matchesFilter(row({ completion_percent: 69 }), "ready")).toBe(false);
    expect(matchesFilter(row({ completion_percent: 90, certificate: { code: "ABCDEFGHJK23", status: "valid" } }), "ready")).toBe(false);
    expect(matchesFilter(row({ completion_percent: 90, certificate: { code: "ABCDEFGHJK23", status: "revoked" } }), "ready")).toBe(true);
    expect(matchesFilter(row({ released: 0, completion_percent: 0 }), "ready")).toBe(false);
  });

  it("inactive, overdue and certified", () => {
    expect(matchesFilter(row({ inactive: true }), "inactive")).toBe(true);
    expect(matchesFilter(row({ overdue: 2 }), "overdue")).toBe(true);
    expect(matchesFilter(row({ certificate: { code: "ABCDEFGHJK23", status: "revoked" } }), "certified")).toBe(false);
  });
});

describe("overview sorting", () => {
  it("sorts by a column, never-active as oldest, ties by name", () => {
    const a = row({ name: "Asha", id: "00000000-0000-4000-8000-000000000001", points: 10, last_active_at: new Date("2026-11-04T10:00:00Z") });
    const b = row({ name: "Ravi", id: "00000000-0000-4000-8000-000000000002", points: 10, last_active_at: null });
    const c = row({ name: "Meera", id: "00000000-0000-4000-8000-000000000003", points: 30, last_active_at: new Date("2026-11-05T10:00:00Z") });
    expect(sortRows([a, b, c], { key: "points", dir: "desc" }).map((r) => r.student.user.name)).toEqual(["Meera", "Asha", "Ravi"]);
    expect(sortRows([a, b, c], { key: "last_active", dir: "asc" }).map((r) => r.student.user.name)).toEqual(["Ravi", "Asha", "Meera"]);
    expect(sortRows([c, b, a], { key: "name", dir: "asc" }).map((r) => r.student.user.name)).toEqual(["Asha", "Meera", "Ravi"]);
  });
});

describe("last active", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("reads naturally", () => {
    expect(lastActiveLabel(null, now)).toBe("Never");
    expect(lastActiveLabel(new Date("2026-11-05T11:59:40Z"), now)).toBe("Just now");
    expect(lastActiveLabel(new Date("2026-11-05T11:15:00Z"), now)).toBe("45m ago");
    expect(lastActiveLabel(new Date("2026-11-05T02:00:00Z"), now)).toBe("10h ago");
    expect(lastActiveLabel(new Date("2026-11-04T10:00:00Z"), now)).toBe("1 day ago");
    expect(lastActiveLabel(new Date("2026-11-01T10:00:00Z"), now)).toBe("4 days ago");
  });
});
