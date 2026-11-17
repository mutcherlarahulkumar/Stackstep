import { Bot, UsersRound } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type PersonaColor } from "@/lib/api/schemas";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Persona accents; the Flutter app uses the same palette. */
export const PERSONA_BG: Record<PersonaColor, string> = {
  violet: "bg-violet-600",
  blue: "bg-blue-600",
  emerald: "bg-emerald-700",
  amber: "bg-amber-700",
  rose: "bg-rose-600",
  cyan: "bg-cyan-700",
  slate: "bg-slate-600",
};

export const PERSONA_DOT: Record<PersonaColor, string> = PERSONA_BG;

type Size = "sm" | "default" | "lg";

export function PersonaAvatar({
  persona,
  size = "default",
  className,
}: {
  persona: { name: string; color: PersonaColor; team?: boolean };
  size?: Size;
  className?: string;
}) {
  if (persona.team) return <TeamAvatar size={size} className={className} />;
  return (
    // Decorative: the persona's name is always shown next to it, so initials would only repeat it.
    <Avatar size={size} className={className} aria-hidden>
      <AvatarFallback className={cn("font-medium text-white", PERSONA_BG[persona.color])}>{initials(persona.name, "?")}</AvatarFallback>
    </Avatar>
  );
}

export function PersonAvatar({ name, login, url, size = "default" }: { name: string; login: string; url: string | null; size?: Size }) {
  return (
    <Avatar size={size}>
      {url ? <AvatarImage src={url} alt="" /> : null}
      <AvatarFallback>{initials(name, login)}</AvatarFallback>
    </Avatar>
  );
}

/** The team room: everyone at once. */
export function TeamAvatar({ size = "default", className }: { size?: Size; className?: string }) {
  return (
    <Avatar size={size} className={className} aria-hidden>
      <AvatarFallback className="bg-gradient-to-br from-sky-600 to-indigo-600 text-white">
        <UsersRound className="size-[55%]" aria-hidden />
      </AvatarFallback>
    </Avatar>
  );
}

/** Stackbot, the team room's AI teammate. */
export function BotAvatar({ size = "default", className }: { size?: Size; className?: string }) {
  return (
    <Avatar size={size} className={className} aria-hidden>
      <AvatarFallback className="bg-gradient-to-br from-cyan-600 to-teal-600 text-white">
        <Bot className="size-[55%]" aria-hidden />
      </AvatarFallback>
    </Avatar>
  );
}
