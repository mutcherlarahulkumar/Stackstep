import { type Author, type Reaction, type ReactionEmoji } from "@/lib/api/schemas";

export const REACTION_GLYPH: Record<ReactionEmoji, { glyph: string; label: string }> = {
  thumbs_up: { glyph: "👍", label: "Thumbs up" },
  heart: { glyph: "❤️", label: "Heart" },
  party: { glyph: "🎉", label: "Celebrate" },
  laugh: { glyph: "😂", label: "Laugh" },
  thinking: { glyph: "🤔", label: "Thinking" },
  eyes: { glyph: "👀", label: "Looking" },
};

/** Chips to show under a message: each emoji once, with how many sides left it and whether we did. */
export function reactionChips(reactions: readonly Reaction[], side: Author): { emoji: ReactionEmoji; count: number; mine: boolean }[] {
  const out = new Map<ReactionEmoji, { emoji: ReactionEmoji; count: number; mine: boolean }>();
  for (const r of reactions) {
    const c = out.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    c.count++;
    c.mine ||= r.by === side;
    out.set(r.emoji, c);
  }
  return [...out.values()];
}
