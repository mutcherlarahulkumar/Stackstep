// A stand-in for Groq's chat completions API so E2E can exercise the AI helper offline.
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

http
  .createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      const ok = Array.isArray(parsed.messages) && parsed.messages[0]?.role === "system";
      res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: answer }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 60 } }));
    });
  })
  .listen(port, () => console.log(`fake groq on :${port}`));
