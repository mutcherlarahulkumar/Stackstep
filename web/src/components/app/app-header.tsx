"use client";

import { Bell, BellOff, FileText, LogOut, ShieldCheck, Compass, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { type ReactNode } from "react";
import { toast } from "sonner";

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
import { useNotificationToggle } from "@/lib/use-notifications";
import { initials } from "@/lib/format";
import { useSession } from "@/lib/session";

import { Wordmark } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { startTour, useTourAvailable } from "../help/tour";

const ROLE_LABEL: Record<User["role"], string> = { student: "Intern", college_admin: "College admin", admin: "Admin" };

export function AppHeader({ user, children }: { user: User; children?: ReactNode }) {
  const { signOut } = useSession();
  const notifications = useNotificationToggle();
  const tour = useTourAvailable();
  const { resolvedTheme, setTheme } = useTheme();
  const toggleNotifications = async () => {
    const next = await notifications.toggle();
    if (next === "on") toast.success("Notifications on. You'll hear about messages and reviews while Stackstep is in the background.");
    else if (next === "blocked") toast.error("Your browser blocks notifications for Stackstep. Allow them in the site settings, then try again.");
    else toast("Notifications off.");
  };
  return (
    <header className="bg-background/85 sticky top-0 z-40 print:hidden flex h-14 items-center gap-3 border-b px-4 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-6">
      <Link href="/" className="flex shrink-0 items-center rounded-md" aria-label="Stackstep home">
        <Wordmark className="[&>span:last-child]:max-sm:sr-only" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <span className="max-sm:hidden">
        <ThemeToggle />
      </span>
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
          {notifications.state === "unsupported" ? null : (
            <DropdownMenuItem onSelect={() => void toggleNotifications()} data-testid="toggle-notifications">
              {notifications.state === "on" ? <Bell aria-hidden /> : <BellOff aria-hidden />}
              <span className="flex flex-col">
                Notifications: {notifications.state === "on" ? "on" : notifications.state === "blocked" ? "blocked" : "off"}
                <span className="text-muted-foreground text-xs">While this tab is in the background</span>
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="sm:hidden" onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            <Sun className="dark:hidden" aria-hidden />
            <Moon className="hidden dark:block" aria-hidden /> {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          {tour ? (
            <DropdownMenuItem onSelect={() => startTour()} data-testid="menu-tour">
              <Compass aria-hidden /> Take the tour
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href="/privacy" target="_blank">
              <ShieldCheck aria-hidden /> Privacy
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/terms" target="_blank">
              <FileText aria-hidden /> Terms
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut aria-hidden /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
