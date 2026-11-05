// A stand-in for Groq's chat completions API (AI helper, AI team lead, review drafts) and for
// GitHub's pull request API (review drafts), so E2E runs offline.
// Usage: node scripts/fake-groq.mjs [port]  (then GROQ_BASE_URL=http://localhost:<port>)
import http from "node:http";

const port = Number(process.argv[2] ?? 8099);
const answer = [
  "**What's going on**",
  "The list is computed once, so changing the status doesn't recompute it.",
  "",
  "**Hints**",
  "1. Look at where `shown` is calculated.",
  "2. What should happen when `status` changes?",
  "",
  "**Try this next**",
  "Log `status` inside the render and watch when it runs.",
  "",
  "**Asking tip**",
  "Clear question. Adding the framework version would help next time.",
].join("\n");

const leadReply = "Thanks! A mentor will review it soon. While you wait, read your own diff once more.";

const reviewDraft = {
  decision: "request_changes",
  summary: "The hand-in covers the task, but nothing shows the filter was tested.",
  note: "Nice work on the filter.\n\n- Add a test that picks a status and checks the list.",
  rubric: [true, false],
};

http
  .createServer((req, res) => {
    // GitHub stand-in for review drafts (GITHUB_API_BASE_URL): any PR reads as a small change.
    const pr = req.method === "GET" ? /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/.exec(req.url ?? "") : null;
    if (pr) {
      if (req.headers.accept === "application/vnd.github.diff") {
        res.writeHead(200, { "content-type": "text/plain" }).end("diff --git a/list.tsx b/list.tsx\n+const shown = tasks.filter((t) => t.status === status);\n");
      } else {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ title: "Add status filter", body: "", state: "open", additions: 1, deletions: 0, changed_files: 1 }));
      }
      return;
    }
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      const ok = Array.isArray(parsed.messages) && parsed.messages[0]?.role === "system";
      const system = ok ? String(parsed.messages[0].content) : "";
      // The AI team lead and review drafts share this endpoint; answer each in its own shape.
      const content = system.includes("You draft code-review feedback")
        ? JSON.stringify(reviewDraft)
        : system.includes("in the team chat")
          ? leadReply
          : answer;
      res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 60 } }));
    });
  })
  .listen(port, () => console.log(`fake groq on :${port}`));
