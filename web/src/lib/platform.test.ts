import { describe, expect, it } from "vitest";

import { detectPlatform } from "./platform";

describe("detectPlatform (DL1)", () => {
  it("knows Android, iPhone, iPad and desktops", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile",
      ),
    ).toBe("android");
    expect(
      detectPlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      ),
    ).toBe("ios");
    expect(
      detectPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
        5,
      ),
    ).toBe("ios");
    expect(
      detectPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
        0,
      ),
    ).toBe("desktop");
    expect(
      detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126"),
    ).toBe("desktop");
  });
});
