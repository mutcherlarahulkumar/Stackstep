"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Eraser,
  Hand,
  Highlighter,
  Megaphone,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  MousePointer2,
  PenLine,
  PhoneOff,
  Radio,
  SmilePlus,
  ThumbsUp,
  Users,
  Video,
  CircleHelp,
  Check,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { messageFor } from "@/lib/api/errors";
import { REACTION_EMOJIS, type ClassDetail, type Me } from "@/lib/api/schemas";
import { type RoomFrame, type Stroke } from "@/lib/classroom/frames";
import { PresenterMedia, ViewerMedia } from "@/lib/classroom/media";
import {
  connectRoom,
  roomUrl,
  type ClosedReason,
  type RoomSocket,
  type RoomStatus,
} from "@/lib/classroom/socket";
import {
  emptyRoom,
  handsUp,
  roomReducer,
  type RoomAction,
  type RoomState,
} from "@/lib/classroom/state";
import { REACTION_GLYPH } from "@/lib/reactions";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { ConsentScreen } from "../app/consent-screen";
import { FullPageLoader } from "../app/guard";
import { PersonAvatar } from "../app/persona-avatar";
import { EmptyState, ErrorState } from "../app/state";
import { INK, Stage, type Tool } from "./stage";

/** Signed in as anyone: students and staff both come to a class. */
function SignedIn({ children }: { children: (me: Me) => React.ReactNode }) {
  const { state } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (state.status === "signed_out") router.replace("/login");
  }, [router, state.status]);
  if (state.status !== "signed_in") return <FullPageLoader />;
  if (state.me.account.consent_required) return <ConsentScreen me={state.me} />;
  return children(state.me);
}

export function ClassRoomScreen({ id }: { id: string }) {
  return <SignedIn>{(me) => <Lobby id={id} me={me} />}</SignedIn>;
}

const when = (d: Date) =>
  d.toLocaleString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });

function Lobby({ id, me }: { id: string; me: Me }) {
  const { api } = useSession();
  const q = useQuery({
    queryKey: ["class", id],
    queryFn: () => api.liveClass(id),
    refetchInterval: 20_000,
  });
  const [joined, setJoined] = useState(false);
  const back = me.user.role === "student" ? "/workspace" : "/admin/classes";
  if (q.isPending) return <FullPageLoader />;
  if (q.isError) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <ErrorState
          message={messageFor(q.error)}
          onRetry={() => void q.refetch()}
        />
      </main>
    );
  }
  const c = q.data;
  if (joined)
    return <LiveRoom detail={c} onLeave={() => setJoined(false)} back={back} />;
  const closed = c.status === "ended" || c.status === "cancelled";
  return (
    <main className="from-primary/10 grid min-h-dvh place-items-center bg-gradient-to-b to-transparent p-4">
      <div
        className="bg-card w-full max-w-lg rounded-3xl border p-6 shadow-xl sm:p-8"
        data-testid="class-lobby"
      >
        <Link
          href={back}
          className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
        <div className="flex items-center gap-2">
          {c.status === "live" ? (
            <Badge className="gap-1.5 bg-rose-600 text-white">
              <span
                className="size-1.5 animate-pulse rounded-full bg-white"
                aria-hidden
              />{" "}
              Live now
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5">
              <CalendarClock className="size-3.5" aria-hidden />{" "}
              {c.status === "scheduled"
                ? "Scheduled"
                : c.status === "ended"
                  ? "Ended"
                  : "Cancelled"}
            </Badge>
          )}
          {c.in_room > 0 ? (
            <span className="text-muted-foreground text-xs">
              {c.in_room} in the room
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance">
          {c.title}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {when(c.starts_at)} · {c.duration_minutes} minutes · with{" "}
          {c.host_name}
        </p>
        {c.description ? (
          <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap">
            {c.description}
          </p>
        ) : null}
        <ul className="text-muted-foreground mt-6 space-y-2 text-sm">
          <li className="flex gap-2">
            <Video
              className="text-primary mt-0.5 size-4 shrink-0"
              aria-hidden
            />{" "}
            {c.role === "host"
              ? "Share your screen and draw on it to teach."
              : "Watch the shared screen and hear the host."}
          </li>
          <li className="flex gap-2">
            <CircleHelp
              className="text-primary mt-0.5 size-4 shrink-0"
              aria-hidden
            />{" "}
            Ask questions, upvote others and chat. Nothing is recorded or kept
            after the class.
          </li>
          <li className="flex gap-2">
            <Hand className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />{" "}
            {c.role === "host"
              ? "Let students speak when they raise a hand."
              : "Raise your hand to speak; a host turns your mic on."}
          </li>
        </ul>
        <Button
          className="mt-8 w-full"
          size="lg"
          disabled={closed}
          onClick={() => setJoined(true)}
          data-testid="class-join"
        >
          {closed
            ? c.status === "ended"
              ? "This class has ended"
              : "This class was cancelled"
            : c.role === "host"
              ? "Open the room"
              : "Join the class"}
        </Button>
        {!closed && c.status === "scheduled" && c.role === "student" ? (
          <p className="text-muted-foreground mt-3 text-center text-xs">
            You can wait in the room; the class starts when the host arrives.
          </p>
        ) : null}
      </div>
    </main>
  );
}

const reasonText: Record<ClosedReason, string> = {
  not_invited: "You're not invited to this class.",
  closed: "This class has ended.",
  full: "The room is full right now. Try again in a minute.",
  unauthenticated: "Your session ended. Sign in again to rejoin.",
  left: "You left the class.",
};

function LiveRoom({
  detail,
  onLeave,
  back,
}: {
  detail: ClassDetail;
  onLeave: () => void;
  back: string;
}) {
  const { api, config } = useSession();
  const [s, dispatch] = useReducer(
    (st: RoomState, f: RoomAction) => roomReducer(st, f),
    emptyRoom,
  );
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [closedReason, setClosedReason] = useState<ClosedReason | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(INK[0]);
  const [tab, setTab] = useState("chat");
  const socket = useRef<RoomSocket | null>(null);
  const presenter = useRef<PresenterMedia | null>(null);
  const viewer = useRef<ViewerMedia | null>(null);
  const me_ = useRef<string>("");
  const ice = detail.ice_servers;
  const host = detail.role === "host";

  const send = useCallback(
    (f: Record<string, unknown>) => socket.current?.send(f) ?? false,
    [],
  );
  const signal = useCallback(
    (to: string, data: unknown) => void send({ type: "signal", to, data }),
    [send],
  );

  const onFrame = useCallback(
    (f: RoomFrame) => {
      dispatch(f);
      switch (f.type) {
        case "welcome":
          me_.current = f.you.id;
          if (!presenter.current) {
            viewer.current ??= new ViewerMedia(ice, signal);
            viewer.current.onStream = setRemote;
          }
          break;
        case "signal":
          if (presenter.current)
            void presenter.current.onSignal(f.from, f.data);
          else void viewer.current?.onSignal(f.from, f.data);
          break;
        case "peer_joined":
          if (presenter.current) void presenter.current.addViewer(f.peer.id);
          break;
        case "peer_left":
          presenter.current?.removeViewer(f.peer_id);
          break;
        case "peer":
          presenter.current?.allowVoice(f.peer.id, f.peer.mic);
          if (f.peer.id === me_.current && !f.peer.mic && !presenter.current) {
            void viewer.current?.setMic(false);
            setMicOn(false);
          }
          break;
        case "presenter":
          if (f.presenter !== me_.current && presenter.current) {
            // Another host took over.
            presenter.current.close();
            presenter.current = null;
            setPresenting(false);
            setLocalScreen(null);
            setMicOn(false);
            viewer.current = new ViewerMedia(ice, signal);
            viewer.current.onStream = setRemote;
          }
          if (!f.presenter) viewer.current?.presenterGone();
          break;
        case "promoted":
          toast.success("Sent to every invitee's mail as an announcement");
          break;
        case "error":
          toast.error(f.error);
          break;
        case "ended":
          toast("The host ended the class");
          break;
        default:
          break;
      }
    },
    [ice, signal],
  );

  useEffect(() => {
    if (!config) return;
    const sock = connectRoom({
      url: roomUrl(config.wsUrl, detail.id),
      token: () => api.accessTokenForSocket(),
      onFrame,
      onStatus: (st, reason) => {
        setStatus(st);
        if (reason) setClosedReason(reason);
      },
    });
    socket.current = sock;
    return () => {
      sock.close();
      presenter.current?.close();
      viewer.current?.close();
      presenter.current = null;
      viewer.current = null;
    };
  }, [api, config, detail.id, onFrame]);

  const startPresenting = async () => {
    viewer.current?.close();
    viewer.current = null;
    setRemote(null);
    const p = new PresenterMedia(ice, signal);
    presenter.current = p;
    p.onScreenEnded = () => setLocalScreen(null);
    setPresenting(true);
    send({ type: "present", on: true });
    for (const peer of s.peers)
      if (peer.id !== me_.current) await p.addViewer(peer.id);
    for (const peer of s.peers) p.allowVoice(peer.id, peer.mic);
    try {
      await p.setMic(true);
      setMicOn(true);
    } catch {
      toast.error("Microphone blocked. Allow it in the browser to be heard.");
    }
  };
  const stopPresenting = () => {
    send({ type: "present", on: false });
    presenter.current?.close();
    presenter.current = null;
    setPresenting(false);
    setLocalScreen(null);
    setMicOn(false);
    setDrawing(false);
    viewer.current = new ViewerMedia(ice, signal);
    viewer.current.onStream = setRemote;
  };
  const toggleScreen = async () => {
    const p = presenter.current;
    if (!p) return;
    if (localScreen) {
      p.stopScreen();
      setLocalScreen(null);
      return;
    }
    try {
      setLocalScreen(await p.startScreen());
    } catch {
      toast.error("Screen sharing was cancelled or blocked.");
    }
  };
  const toggleMic = async () => {
    try {
      if (presenter.current) await presenter.current.setMic(!micOn);
      else await viewer.current?.setMic(!micOn);
      setMicOn(!micOn);
    } catch {
      toast.error("Microphone blocked. Allow it in the browser and try again.");
    }
  };
  const onStroke = (st: Stroke) => {
    dispatch({ type: "draw", stroke: st });
    send({ type: "draw", stroke: st });
  };
  const onLaser = (x: number, y: number) => {
    const st: Stroke = {
      id: `l${Date.now()}`,
      tool: "laser",
      color: "#ef4444",
      width: 0.004,
      points: [[x, y]],
    };
    dispatch({ type: "draw", stroke: st });
    send({ type: "draw", stroke: st });
  };

  const you = s.you;
  const canSpeak = presenting || !!you?.mic;
  const presenterPeer = s.peers.find((p) => p.id === s.presenter);
  const hands = handsUp(s);

  if (s.ended || status === "closed") {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <EmptyState
          icon={Radio}
          title={
            s.ended
              ? "The class has ended"
              : reasonText[closedReason ?? "closed"]
          }
        >
          Thanks for joining. Anything a host turned into an announcement is
          waiting in your mail.
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild variant="outline">
              <Link href={back}>Back</Link>
            </Button>
            {closedReason === "full" ? (
              <Button onClick={onLeave}>Try again</Button>
            ) : null}
          </div>
        </EmptyState>
      </main>
    );
  }

  return (
    <div
      className="flex h-dvh flex-col bg-zinc-900 text-zinc-100"
      data-testid="class-room"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3 sm:px-5">
        <Button
          variant="ghost"
          size="icon"
          className="text-zinc-300 hover:bg-white/10 hover:text-white"
          onClick={onLeave}
          aria-label="Leave the class"
        >
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{detail.title}</h1>
          <p className="truncate text-xs text-zinc-400">
            {status === "live"
              ? presenterPeer
                ? `${presenterPeer.name} is presenting`
                : "Waiting for a host to present"
              : status === "reconnecting"
                ? "Reconnecting…"
                : "Connecting…"}
          </p>
        </div>
        <Badge className="gap-1.5 bg-rose-600 text-white">
          <span
            className="size-1.5 animate-pulse rounded-full bg-white"
            aria-hidden
          />{" "}
          Live
        </Badge>
        <span className="hidden items-center gap-1 text-xs text-zinc-400 sm:flex">
          <Users className="size-3.5" aria-hidden /> {s.peers.length}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          aria-label="Stage"
          className="flex min-h-[45vh] min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4"
        >
          <div className="min-h-0 flex-1">
            <Stage
              stream={presenting ? localScreen : remote}
              local={presenting}
              strokes={s.strokes}
              laser={s.laser}
              bursts={s.bursts}
              drawing={presenting && drawing && !!localScreen}
              tool={tool}
              color={color}
              onStroke={onStroke}
              onLaser={onLaser}
              onBurstDone={(key) => dispatch({ type: "burst_done", key })}
              waiting={
                presenting
                  ? "You're live. Your voice is on. Share your screen to show slides or code."
                  : presenterPeer
                    ? `${presenterPeer.name} is talking. The screen appears here when they share it.`
                    : host
                      ? "Start presenting to share your screen and voice."
                      : "Waiting for the host to start. Say hi in the chat meanwhile."
              }
            />
          </div>
          {presenting && drawing && localScreen ? (
            <div
              className="flex flex-wrap items-center justify-center gap-2"
              role="toolbar"
              aria-label="Drawing tools"
            >
              {(
                [
                  ["pen", PenLine, "Pen"],
                  ["highlight", Highlighter, "Highlighter"],
                  ["laser", MousePointer2, "Laser pointer"],
                ] as const
              ).map(([t, Icon, label]) => (
                <Button
                  key={t}
                  size="icon-sm"
                  variant={tool === t ? "default" : "secondary"}
                  onClick={() => setTool(t)}
                  aria-label={label}
                  aria-pressed={tool === t}
                >
                  <Icon aria-hidden />
                </Button>
              ))}
              <span className="mx-1 h-5 w-px bg-white/20" aria-hidden />
              {INK.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Ink ${c}`}
                  aria-pressed={color === c}
                  className={cn(
                    "size-6 rounded-full ring-2 ring-offset-2 ring-offset-zinc-900 transition-transform",
                    color === c ? "scale-110 ring-white" : "ring-transparent",
                  )}
                  style={{ background: c }}
                />
              ))}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => send({ type: "clear" })}
              >
                <Eraser data-icon="inline-start" aria-hidden /> Clear
              </Button>
            </div>
          ) : null}
          <Controls
            host={host}
            presenting={presenting}
            sharing={!!localScreen}
            micOn={micOn}
            canSpeak={canSpeak}
            hand={!!you?.hand}
            drawing={drawing}
            onPresent={() =>
              void (presenting ? stopPresenting() : startPresenting())
            }
            onScreen={() => void toggleScreen()}
            onMic={() => void toggleMic()}
            onHand={() => send({ type: "hand", on: !you?.hand })}
            onDraw={() => setDrawing((d) => !d)}
            onReact={(e) => send({ type: "react", emoji: e })}
            onLeave={onLeave}
            onEnd={() => send({ type: "end" })}
          />
        </section>
        <aside
          aria-label="Class panel"
          className="flex h-[45vh] min-h-0 shrink-0 flex-col border-t border-white/10 bg-zinc-950/60 lg:h-auto lg:w-[24rem] lg:border-t-0 lg:border-l"
        >
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <TabsList className="m-2 grid grid-cols-3 bg-white/5">
              <TabsTrigger
                value="chat"
                className="data-[state=active]:bg-white/15 data-[state=active]:text-white text-zinc-300"
              >
                <MessageSquare data-icon="inline-start" aria-hidden /> Chat
              </TabsTrigger>
              <TabsTrigger
                value="qa"
                className="data-[state=active]:bg-white/15 data-[state=active]:text-white text-zinc-300"
                data-testid="tab-qa"
              >
                Q&amp;A{" "}
                {s.questions.filter((x) => !x.answered).length ? (
                  <span className="ml-1 tabular-nums">
                    {s.questions.filter((x) => !x.answered).length}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="people"
                className="data-[state=active]:bg-white/15 data-[state=active]:text-white text-zinc-300"
                data-testid="tab-people"
              >
                People{" "}
                {hands.length ? (
                  <Hand
                    className="ml-1 size-3.5 text-amber-400"
                    aria-label={`${hands.length} hands up`}
                  />
                ) : null}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
              <ChatPane s={s} host={host} send={send} />
            </TabsContent>
            <TabsContent value="qa" className="flex min-h-0 flex-1 flex-col">
              <QuestionsPane s={s} host={host} send={send} />
            </TabsContent>
            <TabsContent
              value="people"
              className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
            >
              <PeoplePane s={s} host={host} send={send} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

function RoomButton({
  label,
  active,
  danger,
  children,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          data-testid={testId}
          className={cn(
            "grid size-11 place-items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 [&_svg]:size-5",
            danger
              ? "bg-rose-600 text-white hover:bg-rose-500"
              : active
                ? "bg-white text-zinc-900"
                : "bg-white/10 text-white hover:bg-white/20",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Controls(p: {
  host: boolean;
  presenting: boolean;
  sharing: boolean;
  micOn: boolean;
  canSpeak: boolean;
  hand: boolean;
  drawing: boolean;
  onPresent: () => void;
  onScreen: () => void;
  onMic: () => void;
  onHand: () => void;
  onDraw: () => void;
  onReact: (e: (typeof REACTION_EMOJIS)[number]) => void;
  onLeave: () => void;
  onEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2 sm:gap-3"
      role="toolbar"
      aria-label="Class controls"
    >
      <RoomButton
        label={
          p.canSpeak
            ? p.micOn
              ? "Mute your mic"
              : "Turn your mic on"
            : "Raise your hand to speak"
        }
        active={p.micOn}
        onClick={p.onMic}
        disabled={!p.canSpeak}
        testId="class-mic"
      >
        {p.micOn ? <Mic aria-hidden /> : <MicOff aria-hidden />}
      </RoomButton>
      {p.host ? (
        <>
          <RoomButton
            label={p.presenting ? "Stop presenting" : "Start presenting"}
            active={p.presenting}
            onClick={p.onPresent}
            testId="class-present"
          >
            <Radio aria-hidden />
          </RoomButton>
          <RoomButton
            label={p.sharing ? "Stop sharing your screen" : "Share your screen"}
            active={p.sharing}
            onClick={p.onScreen}
            disabled={!p.presenting}
            testId="class-share"
          >
            {p.sharing ? <MonitorX aria-hidden /> : <MonitorUp aria-hidden />}
          </RoomButton>
          <RoomButton
            label={p.drawing ? "Stop drawing" : "Draw on the screen"}
            active={p.drawing}
            onClick={p.onDraw}
            disabled={!p.sharing}
            testId="class-draw"
          >
            <PenLine aria-hidden />
          </RoomButton>
        </>
      ) : (
        <RoomButton
          label={p.hand ? "Lower your hand" : "Raise your hand"}
          active={p.hand}
          onClick={p.onHand}
          testId="class-hand"
        >
          <Hand aria-hidden />
        </RoomButton>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="React"
            className="grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 [&_svg]:size-5"
            data-testid="class-react"
          >
            <SmilePlus aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto rounded-full p-1">
          <div className="flex">
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={REACTION_GLYPH[e].label}
                className="grid size-10 place-items-center rounded-full text-2xl transition-transform hover:scale-125"
                onClick={() => {
                  setOpen(false);
                  p.onReact(e);
                }}
              >
                {REACTION_GLYPH[e].glyph}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {p.host ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="h-11 rounded-full bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-500"
              data-testid="class-end"
            >
              End class
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>End the class for everyone?</AlertDialogTitle>
              <AlertDialogDescription>
                Everyone leaves the room and the chat and questions are gone.
                Promote anything worth keeping to an announcement first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep going</AlertDialogCancel>
              <AlertDialogAction
                onClick={p.onEnd}
                data-testid="class-end-confirm"
              >
                End class
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <RoomButton label="Leave the class" danger onClick={p.onLeave}>
          <PhoneOff aria-hidden />
        </RoomButton>
      )}
    </div>
  );
}

type PaneProps = {
  s: typeof emptyRoom;
  host: boolean;
  send: (f: Record<string, unknown>) => boolean;
};

function useBottom(dep: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

function Composer({
  placeholder,
  onSend,
  max,
  testId,
}: {
  placeholder: string;
  onSend: (body: string) => boolean;
  max: number;
  testId: string;
}) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (onSend(text.trim())) setText("");
    else toast.error("Not connected. Trying again…");
  };
  return (
    <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, max))}
        placeholder={placeholder}
        aria-label={placeholder}
        className="border-white/15 bg-white/5 text-white placeholder:text-zinc-500"
        data-testid={testId}
      />
      <Button type="submit" size="sm" disabled={!text.trim()}>
        Send
      </Button>
    </form>
  );
}

function ChatPane({ s, host, send }: PaneProps) {
  const list = useBottom(s.chat.length);
  return (
    <>
      <div
        ref={list}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2"
        role="log"
        aria-label="Class chat"
        data-testid="class-chat"
      >
        {s.chat.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No messages yet. Say hello.
          </p>
        ) : null}
        {s.chat.map((m) => (
          <div key={m.id} className="group/line text-sm">
            <p className="flex items-center gap-2 text-xs text-zinc-400">
              <span
                className={cn(
                  "font-medium",
                  m.role === "host" ? "text-violet-300" : "text-zinc-200",
                )}
              >
                {m.name}
              </span>
              {m.role === "host" ? (
                <span className="rounded bg-violet-500/20 px-1 text-[10px] text-violet-200">
                  Host
                </span>
              ) : null}
              <span>
                {m.at.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {host ? (
                <button
                  type="button"
                  className="ml-auto rounded px-1 text-zinc-400 opacity-0 group-hover/line:opacity-100 hover:text-white focus-visible:opacity-100"
                  onClick={() => send({ type: "promote", id: m.id })}
                  aria-label="Send as an announcement"
                  title="Send as an announcement"
                >
                  <Megaphone className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </p>
            <p className="mt-0.5 break-words whitespace-pre-wrap text-zinc-100">
              {m.body}
            </p>
          </div>
        ))}
      </div>
      <Composer
        placeholder="Message everyone"
        max={500}
        onSend={(body) => send({ type: "chat", body })}
        testId="class-chat-input"
      />
    </>
  );
}

function QuestionsPane({ s, host, send }: PaneProps) {
  const [voted, setVoted] = useState<Set<string>>(new Set());
  return (
    <>
      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2"
        data-testid="class-questions"
      >
        {s.questions.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No questions yet. Ask one below, it stays at the top while people
            upvote it.
          </p>
        ) : null}
        {s.questions.map((q) => (
          <div
            key={q.id}
            className={cn(
              "rounded-xl border border-white/10 bg-white/5 p-3",
              q.answered && "opacity-60",
            )}
          >
            <p className="text-sm break-words text-zinc-100">{q.body}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              <span>{q.name}</span>
              {q.answered ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <Check className="size-3.5" aria-hidden /> Answered
                </span>
              ) : null}
              <div className="ml-auto flex items-center gap-1">
                {!host && !q.answered ? (
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                      voted.has(q.id)
                        ? "border-violet-400 bg-violet-500/20 text-white"
                        : "border-white/15 hover:bg-white/10",
                    )}
                    aria-pressed={voted.has(q.id)}
                    aria-label={`Upvote, ${q.votes} so far`}
                    onClick={() => {
                      const on = !voted.has(q.id);
                      send({ type: "vote", id: q.id, on });
                      setVoted((v) => {
                        const n = new Set(v);
                        if (on) n.add(q.id);
                        else n.delete(q.id);
                        return n;
                      });
                    }}
                  >
                    <ThumbsUp className="size-3" aria-hidden /> {q.votes}
                  </button>
                ) : (
                  <span className="tabular-nums">{q.votes} votes</span>
                )}
                {host ? (
                  <>
                    <button
                      type="button"
                      className="rounded-full border border-white/15 px-2 py-0.5 hover:bg-white/10"
                      onClick={() =>
                        send({ type: "answer", id: q.id, on: !q.answered })
                      }
                    >
                      {q.answered ? "Reopen" : "Answered"}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-white/15 px-2 py-0.5 hover:bg-white/10"
                      onClick={() => send({ type: "promote", id: q.id })}
                      aria-label="Send as an announcement"
                    >
                      <Megaphone className="size-3" aria-hidden />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      <Composer
        placeholder="Ask a question"
        max={300}
        onSend={(body) => send({ type: "ask", body })}
        testId="class-ask-input"
      />
    </>
  );
}

function PeoplePane({ s, host, send }: PaneProps) {
  const people = [...s.peers].sort(
    (a, b) =>
      Number(b.hand) - Number(a.hand) ||
      (a.role === b.role
        ? a.name.localeCompare(b.name)
        : a.role === "host"
          ? -1
          : 1),
  );
  return (
    <ul className="space-y-1 pt-1" data-testid="class-people">
      {people.map((p) => (
        <li
          key={p.id}
          className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5"
        >
          <PersonAvatar
            name={p.name}
            login={p.login}
            url={p.avatar_url ?? null}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              {p.name}
              {p.id === s.you?.id ? (
                <span className="text-zinc-500"> (you)</span>
              ) : null}
            </p>
            <p className="text-xs text-zinc-500">
              {p.role === "host"
                ? p.id === s.presenter
                  ? "Host, presenting"
                  : "Host"
                : p.mic
                  ? "Can speak"
                  : "Listening"}
            </p>
          </div>
          {p.hand ? (
            <Hand className="size-4 text-amber-400" aria-label="Hand raised" />
          ) : null}
          {host && p.role === "student" ? (
            <Button
              size="xs"
              variant={p.mic ? "secondary" : "outline"}
              className="border-white/15 bg-transparent text-white hover:bg-white/10"
              onClick={() => send({ type: "allow_mic", to: p.id, on: !p.mic })}
              data-testid={`allow-mic-${p.login}`}
            >
              {p.mic ? "Mute" : "Let speak"}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
