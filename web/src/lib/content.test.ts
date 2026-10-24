import { describe, expect, it } from "vitest";

import { Task } from "./api/schemas";
import { cleanContent, contentForEdit, releaseLabel, validateContent, validateSubmission, validUrl } from "./content";
import { task } from "@/test/fixtures";

const q = (prompt: string, options: string[], answer: number) => ({ prompt, options, answer });

describe("task content", () => {
  it("links: http(s) with a host, no credentials or spaces (R1)", () => {
    for (const ok of ["https://go.dev/doc", "http://localhost:3000/x"]) expect(validUrl(ok)).toBe(true);
    for (const bad of ["javascript:alert(1)", "ftp://x.org", "https://", "go.dev", "https://a b.com", "https://u:p@x.com"]) expect(validUrl(bad)).toBe(false);
    const e = validateContent({ resources: [{ title: "", url: "https://go.dev" }, { title: "x", url: "nope" }], rubric: [], quiz: null, practice: null }, "dsa");
    expect(e["resources[0].title"]).toBeTruthy();
    expect(e["resources[1].url"]).toBeTruthy();
    expect(validateContent({ resources: Array.from({ length: 6 }, () => ({ title: "a", url: "https://a.dev" })), quiz: null, practice: null, rubric: [] }, "dsa").resources).toBeTruthy();
  });

  it("quizzes mirror the server's rules (Q1)", () => {
    expect(validateContent({ resources: [], rubric: [], quiz: null, practice: null }, "quiz").quiz).toBeTruthy();
    expect(validateContent({ resources: [], rubric: [], quiz: { pass_percent: 70, questions: [q("Ok?", ["a", "b"], 0)] }, practice: null }, "dsa").quiz).toBeTruthy();
    const e = validateContent(
      {
        resources: [],
        rubric: [],
        quiz: {
          pass_percent: 0,
          questions: [q("?", ["a", "b"], 0), q("One option?", ["a"], 0), q("Dupes?", ["Yes", "yes"], 0), q("Range?", ["a", "b"], 2)],
        },
        practice: null,
      },
      "quiz",
    );
    expect(e["quiz.pass_percent"]).toBeTruthy();
    expect(e["quiz.questions[0].prompt"]).toBeTruthy();
    expect(e["quiz.questions[1].options"]).toBeTruthy();
    expect(e["quiz.questions[2].options"]).toBeTruthy();
    expect(e["quiz.questions[3].answer"]).toBeTruthy();
    expect(validateContent({ resources: [], rubric: [], quiz: { pass_percent: 70, questions: [q("What is 2 + 2?", ["3", "4"], 1)] }, practice: null }, "quiz")).toEqual({});
  });

  it("practice pads: DSA only, JS names, JSON tests (DP1, DP3)", () => {
    const p = { function_name: "twoSum", starter: "", tests: [{ args: "[ [2,7], 9 ]", expected: "[0,1]" }] };
    expect(validateContent({ resources: [], rubric: [], quiz: null, practice: p }, "dsa")).toEqual({});
    expect(validateContent({ resources: [], rubric: [], quiz: null, practice: p }, "feature").practice).toBeTruthy();
    const e = validateContent(
      { resources: [], rubric: [], quiz: null, practice: { function_name: "return", starter: "", tests: [{ args: "{}", expected: "nope" }] } },
      "dsa",
    );
    expect(e["practice.function_name"]).toBeTruthy();
    expect(e["practice.tests[0].args"]).toBeTruthy();
    expect(e["practice.tests[0].expected"]).toBeTruthy();
    expect(validateContent({ resources: [], rubric: [], quiz: null, practice: { ...p, tests: [] } }, "dsa")["practice.tests"]).toBeTruthy();
  });

  it("rubrics: admin-reviewed only, 3–120 characters, no duplicates (RB1)", () => {
    const base = { resources: [], quiz: null, practice: null };
    expect(validateContent({ ...base, rubric: ["Tests pass", "README explains setup"] }, "feature", "manual")).toEqual({});
    expect(validateContent({ ...base, rubric: ["Tests pass"] }, "feature", "self").rubric).toBeTruthy();
    expect(validateContent({ ...base, rubric: ["Tests pass"] }, "quiz", "self").rubric).toBeTruthy();
    const e = validateContent({ ...base, rubric: ["ok", "Tests pass", "tests  pass"] }, "feature", "manual");
    expect(e["rubric[0]"]).toBeTruthy();
    expect(e["rubric[2]"]).toBeTruthy();
  });

  it("hand-ins: links for code, link or note for the rest (S1)", () => {
    expect(validateSubmission({ url: "", note: "" }, "feature", true).url).toBeTruthy();
    expect(validateSubmission({ url: "", note: "" }, "dsa", true).note).toBeTruthy();
    expect(validateSubmission({ url: "", note: "Hash map" }, "dsa", true)).toEqual({});
    expect(validateSubmission({ url: "", note: "" }, "standup", false)).toEqual({});
    expect(validateSubmission({ url: "github.com/x", note: "" }, "feature", true).url).toMatch(/https/);
    expect(validateSubmission({ url: "https://x.dev", note: "x".repeat(4001) }, "feature", true).note).toBeTruthy();
  });

  it("students' quiz view has no answers; editing turns them into -1", () => {
    const t = Task.parse(task({ type: "quiz", content: { resources: [], rubric: [], quiz: { pass_percent: 70, questions: [{ prompt: "Ok?", options: ["a", "b"], answer: null }] } } }));
    expect(t.content.quiz?.questions[0]?.answer).toBeNull();
    expect(contentForEdit(t.content).quiz?.questions[0]?.answer).toBe(-1);
    expect(cleanContent({ resources: [{ title: " Pro  Git ", url: " https://git-scm.com " }], rubric: [], quiz: null, practice: null }).resources[0]).toEqual({ title: "Pro Git", url: "https://git-scm.com" });
  });

  it("surprise windows read as a range (W1)", () => {
    expect(releaseLabel("10:00", 0)).toBe("10:00");
    expect(releaseLabel("10:00", 240)).toBe("10:00–14:00");
    expect(releaseLabel("09:30", 90)).toBe("09:30–11:00");
  });
});
