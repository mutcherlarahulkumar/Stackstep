import { describe, expect, it } from "vitest";

import { ApiError, NetworkError } from "./api/errors";
import { landed } from "./landed";

describe("landed", () => {
  it("returns the write's result", async () => {
    expect(await landed(async () => 1, async () => 2, [])).toBe(1);
  });
  it("treats a timed-out write that reached the server as done", async () => {
    let checks = 0;
    const r = await landed(
      async () => {
        throw new NetworkError("timeout");
      },
      async () => (++checks === 2 ? "saved" : null),
      [0, 0],
    );
    expect(r).toBe("saved");
  });
  it("still fails when the write never landed", async () => {
    await expect(landed(async () => Promise.reject(new NetworkError("down")), async () => null, [0])).rejects.toBeInstanceOf(NetworkError);
  });
  it("doesn't second-guess real API errors", async () => {
    let checked = false;
    const err = new ApiError(422, "validation_failed", "x");
    await expect(landed(async () => Promise.reject(err), async () => ((checked = true), 1), [0])).rejects.toBe(err);
    expect(checked).toBe(false);
  });
});
