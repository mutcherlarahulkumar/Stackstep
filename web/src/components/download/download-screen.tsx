"use client";

import {
  Apple,
  ArrowDown,
  CalendarDays,
  ChevronDown,
  Download,
  Globe,
  LifeBuoy,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  SquareKanban,
  Video,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { detectPlatform, type Platform } from "@/lib/platform";
import { qrPath } from "@/lib/qr";
import { cn } from "@/lib/utils";

import { Reveal } from "../home/reveal";
import { SiteNav } from "../home/site-nav";
import { PhoneInHand, SCREEN_COUNT } from "./phone";

export type AppLinks = { android: string; ios: string | null };

const noop = () => () => undefined;
function usePlatform(): Platform | null {
  return useSyncExternalStore(
    noop,
    () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => null,
  );
}

/** 0 at the top of the page, 1 once the hero has scrolled away. Drives the phone's tilt. */
function useHeroScroll(): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setP(Math.min(1, window.scrollY / Math.max(1, window.innerHeight))),
      );
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return p;
}

const STORY: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MessageCircle,
    title: "Your team, in your pocket",
    body: "Your lead, PM and teammates message you like a real job. Reply, react and get nudged when a review lands.",
  },
  {
    icon: SquareKanban,
    title: "Your board, wherever you are",
    body: "See what is due, hand in work and keep notes. Surprise tasks show up the moment they land.",
  },
  {
    icon: CalendarDays,
    title: "A calendar that plans your day",
    body: "Every task sits on a timeline with the time it arrives, so you can plan the week ahead.",
  },
  {
    icon: Video,
    title: "Live classes, one tap away",
    body: "Join from your invite, watch the shared screen, raise your hand and ask in Q&A.",
  },
];

const ANDROID_STEPS = [
  {
    t: "Download the app",
    b: "Tap Download for Android. Your browser saves stackstep.apk to your phone.",
  },
  {
    t: "Open the file",
    b: "Open it from the download notification, or from Files, then Downloads.",
  },
  {
    t: "Allow the install once",
    b: "If Android asks, allow your browser to install unknown apps, then go back.",
  },
  {
    t: "Install and sign in",
    b: "Tap Install, then Open. Sign in with GitHub and your workspace is ready.",
  },
];
const IOS_STORE_STEPS = [
  {
    t: "Open the link",
    b: "Tap Get it on iPhone. It opens the App Store or TestFlight.",
  },
  {
    t: "Install TestFlight if asked",
    b: "Beta builds come through Apple's free TestFlight app. Install it, then come back to the link.",
  },
  { t: "Install Stackstep", b: "Tap Install or Accept, then Open." },
  {
    t: "Sign in",
    b: "Sign in with GitHub. Your chats, board and calendar sync with the web.",
  },
];
const IOS_WEB_STEPS = [
  {
    t: "Open Stackstep in Safari",
    b: "The iPhone app is on its way. Until then, the web app works on iPhone with everything you need.",
  },
  {
    t: "Tap Share",
    b: "It is the square with an arrow at the bottom of Safari.",
  },
  {
    t: "Add to Home Screen",
    b: "Scroll the menu, tap Add to Home Screen, then Add.",
  },
  {
    t: "Open it like an app",
    b: "Tap the Stackstep icon on your home screen and sign in with GitHub.",
  },
];

const FAQ: { q: string; a: ReactNode; for?: Platform }[] = [
  {
    q: "Android says the app might be harmful or blocks the install",
    a: "Play Protect warns about every app installed from outside the Play Store. Tap More details, then Install anyway. The file comes straight from our official GitHub release, and you can check it against the SHA256 checksum published next to it.",
    for: "android",
  },
  {
    q: "It says App not installed",
    a: "Usually an older Stackstep build is in the way, or the phone is short on space. Uninstall the old app, free up 100 MB or so, then open the file again. If the download was cut short, download it again.",
    for: "android",
  },
  {
    q: "I can't find the downloaded file",
    a: "Open the Files app and look in Downloads, or pull down the notification shade and tap the finished download. In Chrome you can also open the menu, then Downloads.",
    for: "android",
  },
  {
    q: "There is no Install unknown apps setting",
    a: "On most phones it is in Settings, then Apps, then your browser, then Install unknown apps. On Samsung look under Settings, Apps, the three dots menu, Special access. Search Settings for unknown if you can't spot it.",
    for: "android",
  },
  {
    q: "Untrusted developer or the app won't open on iPhone",
    a: "Install from the link on this page only. TestFlight builds open without any extra trust step. If TestFlight says the beta is full or expired, use the web app from Safari while we publish the next build.",
    for: "ios",
  },
  {
    q: "Add to Home Screen is missing",
    a: "It only appears in Safari, not in other browsers on iPhone. Open this page in Safari, tap Share, then scroll down the list of actions.",
    for: "ios",
  },
  {
    q: "Sign in with GitHub doesn't come back to the app",
    a: "Finish the GitHub page in the browser it opens, then switch back to Stackstep. If it still shows the sign in screen, close the app fully and open it again. Your session is saved once GitHub approves.",
  },
  {
    q: "I don't get notifications",
    a: "Allow notifications for Stackstep in your phone's settings, and turn off battery saving for the app on Android. Everything also lands in your in-app Mail, so nothing is lost.",
  },
  {
    q: "Is my progress the same on the web and the app?",
    a: "Yes. It is one account. Chats, tasks, notes and your calendar sync instantly between the app and the web.",
  },
  {
    q: "Do I have to install the app?",
    a: "No. The web app does everything, and staff tools live on the web. The app is handy for replying on the go.",
  },
];

export function DownloadScreen({ links }: { links: AppLinks }) {
  const platform = usePlatform();
  const p = useHeroScroll();
  const [tab, setTab] = useState<"android" | "ios" | null>(null);
  const shownTab = tab ?? (platform === "ios" ? "ios" : "android");
  const iosSteps = links.ios ? IOS_STORE_STEPS : IOS_WEB_STEPS;

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <SiteNav />
      <main id="main" className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative">
          <div
            className="bg-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
            aria-hidden
          />
          <div
            className="from-primary/25 pointer-events-none absolute top-24 right-0 -z-10 size-[520px] rounded-full bg-gradient-to-br to-fuchsia-400/10 blur-3xl"
            aria-hidden
          />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
            <div className="flex flex-col items-start">
              <p className="animate-enter bg-primary/10 text-primary mb-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium">
                <Smartphone className="size-3.5" aria-hidden /> The Stackstep
                app
              </p>
              <h1 className="animate-enter max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl [animation-delay:80ms]">
                Your internship,{" "}
                <span className="animate-pan bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent dark:from-violet-400 dark:via-fuchsia-300 dark:to-violet-400">
                  in your hand.
                </span>
              </h1>
              <p className="animate-enter text-muted-foreground mt-6 max-w-lg text-lg text-pretty [animation-delay:160ms]">
                Reply to your team, hand in work, plan your week and join live
                classes from your phone. Everything stays in sync with the web.
              </p>
              <div
                className="animate-enter mt-9 flex w-full flex-col gap-4 [animation-delay:240ms] sm:w-auto"
                data-testid="download-ctas"
              >
                <Ctas
                  platform={platform}
                  links={links}
                  onIos={() => setTab("ios")}
                />
              </div>
              <p className="animate-enter text-muted-foreground mt-5 flex items-center gap-1.5 text-sm [animation-delay:320ms]">
                <ShieldCheck className="size-4" aria-hidden /> Free, built from
                our public GitHub releases
              </p>
            </div>
            <div className="relative">
              <PhoneInHand
                screen={0}
                scale={0.82}
                className="sm:hidden"
                style={{
                  transform: `rotateY(${-14 + p * 14}deg) rotateZ(${-4 + p * 4}deg)`,
                }}
              />
              <PhoneInHand
                screen={0}
                className="max-sm:hidden"
                style={{
                  transform: `rotateY(${-14 + p * 14}deg) rotateZ(${-4 + p * 4}deg) translateY(${p * 40}px)`,
                }}
              />
            </div>
          </div>
          <a
            href="#tour"
            className="text-muted-foreground hover:text-foreground mx-auto mb-6 flex w-fit flex-col items-center gap-1 text-xs"
          >
            Scroll to see it in action
            <ArrowDown className="size-4 animate-bounce" aria-hidden />
          </a>
        </section>

        <Tour />

        {/* Install steps */}
        <section
          id="install"
          aria-labelledby="install-h"
          className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-24 sm:px-6"
        >
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2
              id="install-h"
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Install in under a minute
            </h2>
            <p className="text-muted-foreground mt-3 text-lg">
              Pick your phone. We picked it for you if we could tell.
            </p>
          </Reveal>
          <Tabs
            value={shownTab}
            onValueChange={(v) => setTab(v === "ios" ? "ios" : "android")}
            className="mt-10"
          >
            <TabsList className="mx-auto">
              <TabsTrigger value="android" data-testid="install-android">
                <AndroidMark className="size-4" /> Android
              </TabsTrigger>
              <TabsTrigger value="ios" data-testid="install-ios">
                <Apple aria-hidden /> iPhone
              </TabsTrigger>
            </TabsList>
            <TabsContent value="android" className="mt-8">
              <Steps steps={ANDROID_STEPS} />
              <div className="mt-8 flex justify-center">
                <Button asChild size="lg" className="h-11 px-6">
                  <a href={links.android} download>
                    <Download data-icon="inline-start" aria-hidden /> Download
                    for Android
                  </a>
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="ios" className="mt-8">
              <Steps steps={iosSteps} />
              <div className="mt-8 flex justify-center">
                {links.ios ? (
                  <Button asChild size="lg" className="h-11 px-6">
                    <a href={links.ios} target="_blank" rel="noreferrer">
                      <Apple data-icon="inline-start" aria-hidden /> Get it on
                      iPhone
                    </a>
                  </Button>
                ) : (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-11 px-6"
                  >
                    <Link href="/login">
                      <Globe data-icon="inline-start" aria-hidden /> Open the
                      web app
                    </Link>
                  </Button>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>

        {/* Troubleshooting */}
        <section
          id="help"
          aria-labelledby="help-h"
          className="bg-muted/30 border-y"
        >
          <div className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
            <Reveal className="text-center">
              <span className="bg-primary/10 text-primary mx-auto mb-4 grid size-12 place-items-center rounded-full">
                <LifeBuoy className="size-5" aria-hidden />
              </span>
              <h2
                id="help-h"
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Something not working?
              </h2>
              <p className="text-muted-foreground mt-3 text-lg">
                The fixes for what usually goes wrong, starting with your phone.
              </p>
            </Reveal>
            <div
              className="mt-10 flex flex-col gap-3"
              data-testid="download-faq"
            >
              {[...FAQ]
                .sort((a, b) => rank(a.for, platform) - rank(b.for, platform))
                .map((f, i) => (
                  <Reveal key={f.q} i={i % 4}>
                    <details className="group bg-card rounded-xl border px-5 py-4 open:shadow-sm">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-2">
                          {f.for ? (
                            <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-[11px] font-medium">
                              {f.for === "ios" ? "iPhone" : "Android"}
                            </span>
                          ) : null}
                          {f.q}
                        </span>
                        <ChevronDown
                          className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
                          aria-hidden
                        />
                      </summary>
                      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                        {f.a}
                      </p>
                    </details>
                  </Reveal>
                ))}
            </div>
            <p className="text-muted-foreground mt-8 text-center text-sm">
              Still stuck? Sign in on the web and ask your team lead in chat, or
              check the{" "}
              <a
                href="https://github.com/mutcherlarahulkumar/stackstep/releases"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                release notes
              </a>
              .
            </p>
          </div>
        </section>
      </main>
      <footer className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm sm:flex-row sm:px-6">
        <nav
          aria-label="Footer"
          className="flex flex-wrap justify-center gap-x-5 gap-y-2"
        >
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <Link href="/verify" className="hover:text-foreground">
            Verify a certificate
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </nav>
        <span>© Stackstep</span>
      </footer>
    </div>
  );
}

const rank = (f: Platform | undefined, p: Platform | null) =>
  f === undefined ? 1 : f === p || p === "desktop" || p === null ? 0 : 2;

/** The download buttons, led by the visitor's own phone; desktops get a QR code to scan. */
function Ctas({
  platform,
  links,
  onIos,
}: {
  platform: Platform | null;
  links: AppLinks;
  onIos: () => void;
}) {
  const android = (
    <Button asChild size="lg" className="h-12 px-6 text-base" key="a">
      <a href={links.android} download data-testid="download-android">
        <AndroidMark className="size-5" /> Download for Android
      </a>
    </Button>
  );
  const ios = links.ios ? (
    <Button
      asChild
      size="lg"
      variant={platform === "ios" ? "default" : "outline"}
      className="h-12 px-6 text-base"
      key="i"
    >
      <a
        href={links.ios}
        target="_blank"
        rel="noreferrer"
        data-testid="download-ios"
      >
        <Apple data-icon="inline-start" aria-hidden /> Get it on iPhone
      </a>
    </Button>
  ) : (
    <Button
      asChild
      size="lg"
      variant={platform === "ios" ? "default" : "outline"}
      className="h-12 px-6 text-base"
      key="i"
    >
      <a href="#install" onClick={onIos} data-testid="download-ios">
        <Apple data-icon="inline-start" aria-hidden /> On iPhone? Add it to your
        home screen
      </a>
    </Button>
  );
  if (platform === "android") {
    return (
      <>
        {android}
        <p className="text-muted-foreground text-sm">
          We spotted an Android phone. One tap and it downloads.
        </p>
      </>
    );
  }
  if (platform === "ios") {
    return (
      <>
        {ios}
        <p className="text-muted-foreground text-sm">We spotted an iPhone.</p>
      </>
    );
  }
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex flex-col gap-3">
        {android}
        {ios}
      </div>
      {platform === "desktop" ? (
        <QrCard url={`${window.location.origin}/download`} />
      ) : null}
    </div>
  );
}

function QrCard({ url }: { url: string }) {
  const { d, size } = qrPath(url);
  return (
    <div
      className="bg-card flex items-center gap-3 rounded-xl border p-3 shadow-sm"
      data-testid="download-qr"
    >
      <svg
        viewBox={`-2 -2 ${size + 4} ${size + 4}`}
        className="size-24 shrink-0 rounded-md bg-white"
        role="img"
        aria-label="QR code that opens this page on your phone"
      >
        <path d={d} fill="#18181b" />
      </svg>
      <p className="text-muted-foreground max-w-[9rem] text-sm">
        Scan with your phone camera to download there.
      </p>
    </div>
  );
}

/** The app tour: the phone stays put while the story scrolls past and its screen follows. */
function Tour() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting)
            setActive(Number((e.target as HTMLElement).dataset.step ?? 0));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <section
      id="tour"
      aria-label="What the app does"
      className="relative mx-auto w-full max-w-6xl scroll-mt-16 px-4 sm:px-6"
    >
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-16">
        <div className="bg-background sticky top-16 z-10 -mx-4 flex justify-center px-4 py-2 backdrop-blur lg:top-20 lg:order-2 lg:mx-0 lg:h-[calc(100dvh-6rem)] lg:items-center lg:bg-transparent lg:backdrop-blur-none">
          <PhoneInHand
            screen={Math.min(active, SCREEN_COUNT - 1)}
            scale={0.5}
            className="lg:hidden"
            style={{ transform: `rotateY(${active % 2 === 0 ? -8 : 8}deg)` }}
          />
          <PhoneInHand
            screen={Math.min(active, SCREEN_COUNT - 1)}
            className="max-lg:hidden"
            style={{ transform: `rotateY(${active % 2 === 0 ? -8 : 8}deg)` }}
          />
        </div>
        <ol className="flex flex-col lg:order-1">
          {STORY.map((s, i) => (
            <li
              key={s.title}
              ref={(n) => {
                refs.current[i] = n;
              }}
              data-step={i}
              data-testid={`tour-step-${i}`}
              className={cn(
                "flex min-h-[60vh] flex-col justify-center py-10 transition-opacity duration-500 lg:min-h-[85vh]",
                active === i ? "opacity-100" : "opacity-35",
              )}
            >
              <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                <s.icon className="size-5" aria-hidden />
              </span>
              <p className="text-primary text-sm font-semibold">Step {i + 1}</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                {s.title}
              </h2>
              <p className="text-muted-foreground mt-3 max-w-md text-lg">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Steps({ steps }: { steps: { t: string; b: string }[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <Reveal
          as="li"
          key={s.t}
          i={i}
          className="bg-card relative rounded-2xl border p-5 shadow-sm"
        >
          <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-full text-sm font-semibold">
            {i + 1}
          </span>
          <h3 className="mt-4 font-semibold">{s.t}</h3>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            {s.b}
          </p>
        </Reveal>
      ))}
    </ol>
  );
}

function AndroidMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      aria-hidden
      fill="currentColor"
    >
      <path d="M17.6 9.48l1.84-3.18a.38.38 0 00-.66-.38l-1.86 3.22a11.4 11.4 0 00-9.84 0L5.22 5.92a.38.38 0 10-.66.38L6.4 9.48A10.8 10.8 0 001 18h22a10.8 10.8 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  );
}
