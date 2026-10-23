import { describe, expect, it } from "vitest";

import { parseRoster, splitCsvLine, statusMoves, validLogin } from "./people";

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
