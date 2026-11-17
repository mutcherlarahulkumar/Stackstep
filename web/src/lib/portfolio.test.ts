import { describe, expect, it } from "vitest";

import { cleanHeadline, linkLabel, portfolioPath, programName, statusLine } from "./portfolio";

describe("portfolio (PF)", () => {
  it("labels the internship", () => {
    expect(programName({ program_days: 30, program_slug: "frontend-30" })).toBe("30-day Frontend engineering internship");
    expect(statusLine({ status: "active", day_number: 4, program_days: 30 })).toBe("Day 4 of 30");
    expect(statusLine({ status: "active", day_number: 0, program_days: 30 })).toBe("Starting soon");
    expect(statusLine({ status: "completed", day_number: 30, program_days: 30 })).toBe("Completed");
  });

  it("labels links and paths", () => {
    expect(linkLabel("https://github.com/asha/app/pull/3")).toBe("View pull request");
    expect(linkLabel("https://dev.to/asha/post")).toBe("View on dev.to");
    expect(linkLabel("nope")).toBe("View");
    expect(portfolioPath("asha-dev")).toBe("/p/asha-dev");
    expect(cleanHeadline("  Frontend   intern ")).toBe("Frontend intern");
  });
});
