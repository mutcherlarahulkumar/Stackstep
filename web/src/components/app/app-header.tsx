"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type User } from "@/lib/api/schemas";
import { initials } from "@/lib/format";
import { useSession } from "@/lib/session";

import { Wordmark } from "./brand";
import { ThemeToggle } from "./theme-toggle";

const ROLE_LABEL: Record<User["role"], string> = { student: "Intern", college_admin: "College admin", admin: "Admin" };

export function AppHeader({ user, children }: { user: User; children?: ReactNode }) {
  const { signOut } = useSession();
  return (
    <header className="bg-background/85 sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-6">
      <Link href="/" className="rounded-md" aria-label="Stackstep home">
        <Wordmark />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
            <Avatar>
              {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
              <AvatarFallback>{initials(user.name, user.github_login)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="text-foreground truncate">{user.name}</span>
            <span className="text-muted-foreground truncate text-xs font-normal">
              @{user.github_login} · {ROLE_LABEL[user.role]}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut aria-hidden /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
