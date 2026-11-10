import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { outline, Prose, readingMinutes, slug } from "./prose";

describe("Prose (RD1–RD3)", () => {
  it("renders callouts, safe new-tab links and inert HTML and images", () => {
    const md = [
      "## Hello world",
      "> [!TIP]",
      "> Keep commits small.",
      "",
      "[MDN](https://developer.mozilla.org) and [bad](javascript:alert(1))",
      "",
      "<script>alert(1)</script>",
      "![x](https://example.com/x.png)",
    ].join("\n");
    const { container } = render(<Prose>{md}</Prose>);
    const tip = screen.getByRole("note", { name: "Tip" }).textContent;
    expect(tip).toContain("Keep commits small.");
    expect(tip).not.toContain("[!TIP]");
    const link = screen.getByRole("link", { name: /MDN/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("h2#hello-world")).not.toBeNull();
  });

  it("builds an outline outside code fences and estimates reading time", () => {
    const md = "# Intro\n\n```\n## not a heading\n```\n\n### Step one\n\n## Wrap up";
    expect(outline(md)).toEqual([
      { id: "intro", text: "Intro", depth: 2 },
      { id: "step-one", text: "Step one", depth: 3 },
      { id: "wrap-up", text: "Wrap up", depth: 2 },
    ]);
    expect(readingMinutes("word ".repeat(660))).toBe(3);
    expect(slug("What’s next? Ship it!")).toBe("whats-next-ship-it");
  });
});
