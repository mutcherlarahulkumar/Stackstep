import { describe, expect, it } from "vitest";

import { firstWorkingDay, parseRoster, splitCsvLine, startsCaption, statusMoves, validLogin, zoneTime } from "./people";

describe("GitHub logins", () => {
  it("follows GitHub's rules", () => {
    for (const ok of ["a", "asha-dev", "@Asha-Dev", "A1"]) expect(validLogin(ok)).toBe(true);
    for (const bad of ["", "-a", "a-", "a--b", "a_b", "a b", "x".repeat(40)]) expect(validLogin(bad)).toBe(false);
  });
});

describe("roster CSV (PI3)", () => {
  it("splits quoted cells", () => {
    expect(splitCsvLine('asha-dev,"Rao, Asha",a@x.io')).toEqual(["asha-dev", "Rao, Asha", "a@x.io"]);
    expect(splitCsvLine('x,"say ""hi""",')).toEqual(["x", 'say "hi"', ""]);
  });

  it("reads a header in any order, with aliases and a BOM", () => {
    const rows = parseRoster("﻿Email,GitHub Username,Full Name\nasha@x.io,@asha-dev,Asha Rao\n\nravi@x.io,ravi-dev,Ravi\n");
    expect(rows).toEqual([
      { line: 2, github_login: "asha-dev", name: "Asha Rao", email: "asha@x.io", problem: null },
      { line: 4, github_login: "ravi-dev", name: "Ravi", email: "ravi@x.io", problem: null },
    ]);
  });

  it("works without a header and flags bad rows", () => {
    const rows = parseRoster("asha-dev,Asha\nAsha-Dev\nnot valid\n,No Login\nok-one,One,broken-email");
    expect(rows.map((r) => r.problem)).toEqual([null, "Appears twice", "Not a valid GitHub username", "Missing GitHub username", "Email looks wrong"]);
  });
});

describe("status moves", () => {
  it("mirrors the server", () => {
    expect(statusMoves("active")).toEqual(["paused", "completed", "cancelled"]);
    expect(statusMoves("paused")).toContain("active");
    expect(statusMoves("completed")).toEqual([]);
  });
});

describe("rolling start (RS3, RS6)", () => {
  it("day 1 is the next calendar day in the student's zone", () => {
    // 23:30 UTC on 4 November is already 5 November in India.
    const late = new Date(Date.UTC(2026, 10, 4, 23, 30));
    expect(firstWorkingDay("UTC", late)).toBe("Thursday 5 November");
    expect(firstWorkingDay("Asia/Kolkata", late)).toBe("Friday 6 November");
  });
  it("names tomorrow, or the date further out", () => {
    const now = new Date(2026, 10, 4, 22, 0);
    expect(startsCaption("2026-11-05", now)).toBe("Starts tomorrow");
    expect(startsCaption("2026-11-09", now)).toBe("Starts Mon 9 Nov");
  });
});

describe("zoneTime (AS1)", () => {
  it("finds the instant a local time happens in a zone", () => {
    expect(zoneTime("2026-11-11", 0, "Asia/Kolkata").toISOString()).toBe("2026-11-10T18:30:00.000Z");
    expect(zoneTime("2026-11-11", 18, "Asia/Kolkata").toISOString()).toBe("2026-11-11T12:30:00.000Z");
    expect(zoneTime("2026-03-09", 18, "America/New_York").toISOString()).toBe("2026-03-09T22:00:00.000Z");
  });
});

