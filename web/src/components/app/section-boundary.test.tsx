import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SectionBoundary } from "./section-boundary";

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error("boom");
  return <p>Loaded</p>;
}

function Page() {
  const [n] = useState(0);
  return (
    <div>
      <p>Header still works {n}</p>
      <SectionBoundary label="Your board">
        <Flaky />
      </SectionBoundary>
    </div>
  );
}

describe("SectionBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps a crash inside its section, shows friendly copy, and recovers on Try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<Page />);
    expect(screen.getByText(/Header still works/)).toBeTruthy();
    expect(screen.getByText(/Your board hit a problem/)).toBeTruthy();
    expect(screen.queryByText("boom")).toBeNull(); // never the raw error

    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(screen.getByText("Loaded")).toBeTruthy();
  });
});
