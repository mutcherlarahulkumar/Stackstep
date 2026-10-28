"use client";

import { ArrowRight, BadgeCheck, LogOut, Menu } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { type Me } from "@/lib/api/schemas";
import { initials } from "@/lib/format";
import { homeFor, useSession } from "@/lib/session";

import { GitHubMark, Wordmark } from "../app/brand";
import { ThemeToggle } from "../app/theme-toggle";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#colleges", label: "For colleges" },
  { href: "#faq", label: "FAQ" },
];

/** Where the signed-in person's button goes, and what it says. */
export function destination(me: Me): { href: string; label: string } {
  const href = homeFor(me);
  if (href === "/admin") return { href, label: "Open admin console" };
  return { href, label: me.enrollment ? "Open workspace" : "Continue application" };
}

/**
 * The public site's top bar. It knows whether you're signed in: a signed-in visitor gets a
 * button back to their workspace and their avatar, never "Sign in". Verify is always one tap away.
 */
export function SiteNav() {
  return (
    <header className="bg-background/75 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="mr-2 rounded-md" aria-label="Stackstep home">
          <Wordmark />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-3 py-1.5 text-sm font-medium transition-colors">
              {l.label}
            </a>
          ))}
          <Link href="/verify" className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-3 py-1.5 text-sm font-medium transition-colors" data-testid="nav-verify">
            Verify a certificate
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm" className="md:hidden" data-testid="nav-verify-phone">
            <Link href="/verify">
              <BadgeCheck data-icon="inline-start" aria-hidden /> Verify
            </Link>
          </Button>
          <ThemeToggle />
          <Account />
          <PhoneMenu />
        </div>
      </div>
    </header>
  );
}

function Account() {
  const { state, signOut } = useSession();
  if (state.status === "loading") return <Skeleton className="h-8 w-24 rounded-md" aria-label="Checking your session" />;
  if (state.status === "signed_out") {
    return (
      <Button asChild size="sm" variant="outline" data-testid="nav-sign-in">
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }
  const { me } = state;
  const go = destination(me);
  return (
    <>
      <Button asChild size="sm" className="hidden sm:inline-flex" data-testid="nav-open-app">
        <Link href={go.href}>
          {go.label} <ArrowRight data-icon="inline-end" aria-hidden />
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2" aria-label={`Account: ${me.user.name}`} data-testid="nav-avatar">
          <Avatar className="size-8">
            {me.user.avatar_url ? <AvatarImage src={me.user.avatar_url} alt="" /> : null}
            <AvatarFallback>{initials(me.user.name, me.user.github_login)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate">{me.user.name}</span>
            <span className="text-muted-foreground truncate text-xs font-normal">@{me.user.github_login}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={go.href}>
              <ArrowRight aria-hidden /> {go.label}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut aria-hidden /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function PhoneMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
          <Menu aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {LINKS.map((l) => (
          <DropdownMenuItem key={l.href} asChild>
            <a href={l.href}>{l.label}</a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/verify">
            <BadgeCheck aria-hidden /> Verify a certificate
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The hero's main button: start with GitHub, or go back to where you were. */
export function PrimaryCta({ size = "lg" }: { size?: "lg" | "default" }) {
  const { state } = useSession();
  const cls = size === "lg" ? "h-11 px-5 text-base" : "";
  if (state.status === "signed_in") {
    const go = destination(state.me);
    return (
      <Button asChild size={size} className={cls} data-testid="hero-open-app">
        <Link href={go.href}>
          {go.label} <ArrowRight data-icon="inline-end" aria-hidden />
        </Link>
      </Button>
    );
  }
  return (
    <Button asChild size={size} className={cls} data-testid="hero-start">
      <Link href="/login">
        <GitHubMark /> Start with GitHub
      </Link>
    </Button>
  );
}
