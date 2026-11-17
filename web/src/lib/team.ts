import { type Message, type Persona } from "./api/schemas";

/** The reserved team room conversation (migration 0017). */
export const TEAM_PERSONA_ID = "00000000-0000-4000-8000-0000000000f0";

export const BOT = { name: "Stackbot", title: "AI teammate" } as const;

export type Speaker = { kind: "bot" } | { kind: "persona"; persona: Persona } | { kind: "unknown" };

/** Who said a team room message: a persona, Stackbot (no speaker) or someone since removed. */
export function speakerOf(m: Message, members: readonly Persona[]): Speaker {
  if (m.speaker_id === null) return { kind: "bot" };
  const p = members.find((x) => x.id === m.speaker_id);
  return p ? { kind: "persona", persona: p } : { kind: "unknown" };
}

/** Key for grouping consecutive bubbles by the same speaker. */
export function speakerKey(m: Message | null): string {
  if (!m) return "";
  return m.author === "student" ? "student" : (m.speaker_id ?? "bot");
}

/** The word being typed after an "@" at the end of the text, or null. */
export function mentionQuery(text: string): string | null {
  const m = /(^|\s)@([\p{L}\p{N}]*)$/u.exec(text);
  return m ? (m[2] ?? "") : null;
}

/** Members whose first name, full name or title starts with the query. */
export function mentionMatches(query: string, members: readonly Persona[]): Persona[] {
  const q = query.toLowerCase();
  return members.filter((p) => {
    const first = p.name.split(/\s+/)[0] ?? "";
    return [first, p.name, p.title].some((s) => s.toLowerCase().startsWith(q));
  });
}

/** Replaces the "@query" being typed with "@FirstName ". */
export function insertMention(text: string, p: Persona): string {
  const first = p.name.split(/\s+/)[0] ?? p.name;
  return text.replace(/@([\p{L}\p{N}]*)$/u, `@${first} `);
}

/** Splits a message into plain text and @mentions, so mentions can be highlighted. */
export function splitMentions(body: string): { text: string; mention: boolean }[] {
  const out: { text: string; mention: boolean }[] = [];
  const re = /(^|[^\p{L}\p{N}@])(@[\p{L}\p{N}]+)/gu;
  let last = 0;
  for (const m of body.matchAll(re)) {
    const start = (m.index ?? 0) + (m[1]?.length ?? 0);
    if (start > last) out.push({ text: body.slice(last, start), mention: false });
    out.push({ text: m[2] ?? "", mention: true });
    last = start + (m[2]?.length ?? 0);
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}
