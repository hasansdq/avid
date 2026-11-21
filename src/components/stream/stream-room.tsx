"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  LogOut,
  Maximize,
  MessageSquare,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  PhoneOff,
  Radio,
  Send,
  ShieldAlert,
  UserCheck,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { faDigits, faTime } from "@/lib/fa";
import {
  useStreamRoom,
  type UseStreamRoom,
} from "@/components/stream/use-stream-room";
import type {
  QualityMode,
  StreamSession,
} from "@/components/stream/types";

/* ————————————————— عناصر ویدئو ————————————————— */

/** ویدئو با اتصال srcObject — muted برای پیش‌نمایش محلی */
function VideoTile({
  stream,
  muted = false,
  className,
  label,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  label?: string;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) el.play().catch(() => {});
  }, [stream]);

  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-black", className)}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className="size-full object-contain"
        dir="ltr"
      />
      {label ? (
        <span className="absolute bottom-1.5 start-1.5 max-w-[85%] truncate rounded-lg bg-black/60 px-2 py-0.5 text-[0.6rem] font-bold text-white backdrop-blur-sm">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** وضعیت خالی صحنه‌ی ویدئو */
function StagePlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-white/[0.06]">
        <Icon className="size-8 text-white/70" strokeWidth={1.8} />
      </span>
      <p className="text-sm font-black text-white/90">{title}</p>
      {description ? (
        <p className="max-w-xs text-xs leading-6 text-white/60">{description}</p>
      ) : null}
    </div>
  );
}

/* ————————————————— چت ————————————————— */

function ChatPanel({
  room,
  myName,
}: {
  room: UseStreamRoom;
  myName: string;
}) {
  const [text, setText] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const messages = room.chat;

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend() {
    const clean = text.trim();
    if (!clean) return;
    room.sendChat(clean);
    setText("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ScrollArea className="min-h-0 flex-1 rounded-xl" dir="rtl">
        <div className="flex flex-col gap-1.5 p-2">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-xs font-bold text-muted-foreground">
              هنوز پیامی ارسال نشده است.
            </p>
          ) : null}
          {messages.map((m, i) => {
            const mine = m.name === myName && m.role === (room.me?.role ?? "student");
            return (
              <div
                key={`${m.ts}-${i}`}
                className={cn(
                  "flex flex-col rounded-xl border px-3 py-2",
                  m.role === "host"
                    ? "border-teal-500/30 bg-teal-500/[0.06]"
                    : mine
                      ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                      : "border-border bg-foreground/[0.03]"
                )}
              >
                <span className="flex items-center gap-1.5 text-[0.65rem] font-black text-muted-foreground">
                  {m.role === "host" ? (
                    <Radio className="size-3 text-teal-600 dark:text-teal-300" />
                  ) : null}
                  {m.name}
                  <span className="ms-auto font-semibold tabular-nums opacity-70">
                    {faTime(new Date(m.ts))}
                  </span>
                </span>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs font-medium leading-6 text-foreground">
                  {m.text}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="پیام خود را بنویسید..."
          className="h-10 rounded-xl text-xs"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="ارسال پیام"
          className="size-10 shrink-0 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-600 text-teal-950 shadow-lg shadow-teal-500/25"
          disabled={!text.trim() || room.connStatus !== "connected"}
        >
          <Send className="size-4 -scale-x-100" />
        </Button>
      </form>
    </div>
  );
}

/* ————————————————— فهرست کاربران (کنترل استاد) ————————————————— */

function PeoplePanel({ room }: { room: UseStreamRoom }) {
  const isHost = room.me?.role === "host";
  const students = room.users.filter((u) => u.role === "student");
  const host = room.users.find((u) => u.role === "host");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* درخواست‌های تصویر/صدا — فقط استاد */}
      {isHost && room.mediaRequests.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-2.5">
          <p className="mb-2 flex items-center gap-1.5 text-[0.65rem] font-black text-amber-700 dark:text-amber-300">
            <UserCheck className="size-3.5" />
            درخواست تصویر و گفتگو ({faDigits(room.mediaRequests.length)})
          </p>
          <div className="flex flex-col gap-1.5">
            {room.mediaRequests.map((r) => (
              <div
                key={r.userId}
                className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-background/60 p-2"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-bold">
                  {r.name}
                </span>
                <Button
                  size="sm"
                  onClick={() => room.respondMedia(r.userId, true)}
                  className="h-8 rounded-lg bg-emerald-600 px-3 text-[0.65rem] font-black text-white hover:bg-emerald-600/90"
                >
                  <Check className="size-3.5" />
                  تایید
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => room.respondMedia(r.userId, false)}
                  className="h-8 rounded-lg px-3 text-[0.65rem] font-bold"
                >
                  <X className="size-3.5" />
                  رد
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* استاد */}
      {host ? (
        <div className="flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/[0.06] p-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600">
            <Radio className="size-4 text-teal-950" />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-black">
            {host.name}
            <span className="ms-1.5 text-[0.6rem] font-bold text-teal-600 dark:text-teal-300">
              استاد
            </span>
          </span>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 rounded-xl" dir="rtl">
        <div className="flex flex-col gap-1.5 p-2">
          {students.length === 0 ? (
            <p className="py-8 text-center text-xs font-bold text-muted-foreground">
              هنوز دانشجویی وارد نشده است.
            </p>
          ) : null}
          {students.map((u) => {
            const isPublishing = room.remotePublishers.some(
              (p) => p.userId === u.userId && p.state === "live"
            );
            return (
              <div
                key={u.userId ?? u.name}
                className="flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.02] p-2.5 dark:bg-white/[0.02]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-xs font-black dark:bg-white/[0.06]">
                  {u.name.trim().charAt(0) || "؟"}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold">
                  {u.name}
                  {isPublishing ? (
                    <span className="ms-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[0.55rem] font-black text-violet-700 dark:text-violet-300">
                      در حال پخش
                    </span>
                  ) : null}
                </span>
                {isHost && u.userId ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {isPublishing ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => room.revokeMedia(u.userId as string)}
                        aria-label={`بازپس‌گیری اجازه‌ی ${u.name}`}
                        title="بازپس‌گیری اجازه‌ی تصویر و صدا"
                        className="size-8 rounded-lg text-amber-600 hover:bg-amber-500/10 dark:text-amber-300"
                      >
                        <VideoOff className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void room.kickUser(u.userId as string)}
                      aria-label={`اخراج ${u.name}`}
                      title="اخراج از کلاس"
                      className="size-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <ShieldAlert className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ————————————————— انتخاب کیفیت (دانشجو) ————————————————— */

const QUALITY_OPTIONS: Array<{
  mode: QualityMode;
  label: string;
  hint: string;
}> = [
  { mode: "full", label: "کیفیت معمول", hint: "صدا + تصویر" },
  { mode: "low", label: "کم‌مصرف", hint: "صدا + تصویر سبک" },
  { mode: "audio", label: "فقط صدا", hint: "کمترین اینترنت" },
];

function QualityPicker({ room }: { room: UseStreamRoom }) {
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-border bg-foreground/[0.03] p-1 dark:bg-white/[0.03]"
      role="radiogroup"
      aria-label="کیفیت دریافت کلاس"
    >
      {QUALITY_OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          role="radio"
          aria-checked={room.quality === opt.mode}
          title={opt.hint}
          onClick={() => room.setQuality(opt.mode)}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-[0.65rem] font-black transition-colors",
            room.quality === opt.mode
              ? "bg-gradient-to-l from-teal-400 to-emerald-500 text-teal-950 shadow-md shadow-teal-500/20"
              : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ————————————————— صحنه‌ی اصلی + تمام‌صفحه‌ی افقی موبایل ————————————————— */

/** قفل چرخش صفحه — در iOS پشتیبانی نمی‌شود و CSS جایگزین می‌شود */
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
  unlock?: () => void;
};

function getOrientation(): LockableOrientation | null {
  if (typeof screen === "undefined" || !screen.orientation) return null;
  return screen.orientation as LockableOrientation;
}

function VideoStage({
  room,
  isHost,
  myName,
}: {
  room: UseStreamRoom;
  isHost: boolean;
  myName: string;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [fsState, setFsState] = React.useState<
    "normal" | "locked" | "rotated"
  >("normal");

  React.useEffect(() => {
    const update = () => {
      if (!document.fullscreenElement) {
        setFsState("normal");
        return;
      }
      const t =
        typeof screen !== "undefined" && screen.orientation
          ? screen.orientation.type
          : "";
      // اگر چرخش قفل شد (اندروید) ویدئو خودش افقی است؛ در پرتره‌ی قفل‌نشده
      // (iOS) کل صحنه با CSS می‌چرخد تا تجربه‌ی «تمام‌صفحه‌ی افقی» ساخته شود.
      setFsState(t.startsWith("landscape") ? "locked" : "rotated");
    };
    document.addEventListener("fullscreenchange", update);
    screen.orientation?.addEventListener?.("change", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      screen.orientation?.removeEventListener?.("change", update);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await wrapRef.current?.requestFullscreen?.();
        try {
          await getOrientation()?.lock?.("landscape");
        } catch {
          /* پشتیبانی نشده (iOS) — چرخش CSS جایگزین می‌شود */
        }
      } else {
        try {
          getOrientation()?.unlock?.();
        } catch {
          /* noop */
        }
        await document.exitFullscreen?.();
      }
    } catch {
      toast.error("حالت تمام‌صفحه در این مرورگر در دسترس نیست.");
    }
  }

  const fullscreen = fsState !== "normal";

  // ناشر اصلی: استاد (یا اولین ناشر)؛ ناشرهای دیگر (دانشجویان اجازه‌گرفته)
  const hostPublisher = room.remotePublishers[0] ?? null;
  const otherPublishers = room.remotePublishers.slice(1);

  const stageBody = (
    <>
      {/* — ویدئوی اصلی: استاد — */}
      {hostPublisher?.main ? (
        <VideoTile
          stream={hostPublisher.main}
          className="size-full"
          label={
            hostPublisher.name
              ? `${hostPublisher.name} — استاد`
              : "استاد"
          }
        />
      ) : isHost && room.localStream ? (
        <VideoTile
          stream={room.localStream}
          muted
          className="size-full"
          label="پیش‌نمایش شما (استاد)"
        />
      ) : isHost ? (
        <StagePlaceholder
          icon={Video}
          title="برای شروع کلاس، دکمه‌ی «شروع پخش» را بزنید"
          description="صدا و تصویر شما برای دانشجوها پخش می‌شود."
        />
      ) : room.roomStatus === "live" || room.hostOnline ? (
        <div className="flex size-full items-center justify-center">
          <Loader2 className="size-10 animate-spin text-white/70" />
        </div>
      ) : room.roomStatus === "scheduled" ? (
        <StagePlaceholder
          icon={Radio}
          title="کلاس هنوز شروع نشده است"
          description="در انتظار ورود استاد — چت کلاس فعال است."
        />
      ) : (
        <StagePlaceholder
          icon={PhoneOff}
          title="این جلسه پایان یافته است"
        />
      )}

      {/* — دوربین استاد هنگام اشتراک صفحه (PiP) — */}
      {hostPublisher?.pip ? (
        <VideoTile
          stream={hostPublisher.pip}
          className="absolute bottom-2 end-2 z-10 aspect-video w-[22%] min-w-24 border border-white/20 shadow-xl"
          label="دوربین استاد"
        />
      ) : null}

      {/* — پیش‌نمایش صفحه‌ی اشتراک استاد روی ویدئوی خودش — */}
      {isHost && room.screenSharing ? (
        <span className="absolute top-2 start-2 z-10 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[0.65rem] font-black text-white backdrop-blur-sm">
          <MonitorUp className="size-3.5" />
          اشتراک صفحه فعال است
        </span>
      ) : null}

      {/* — نوار دانشجویان در حال پخش + پیش‌نمایش خودم — */}
      {(otherPublishers.length > 0 || (room.publishing && !isHost)) && !fullscreen ? (
        <div className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 overflow-x-auto rounded-xl bg-black/40 p-2 backdrop-blur-md">
          {otherPublishers
            .filter((p) => p.main)
            .map((p) => (
              <VideoTile
                key={p.socketId}
                stream={p.main}
                className="aspect-video w-28 shrink-0"
                label={p.name || "دانشجو"}
              />
            ))}
          {!isHost && room.publishing && room.localStream ? (
            <VideoTile
              stream={room.localStream}
              muted
              className="aspect-video w-28 shrink-0 border border-emerald-400/40"
              label="شما"
            />
          ) : null}
          {!isHost && room.granted && !room.publishing ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap px-2 text-[0.65rem] font-black text-emerald-300">
              <Check className="size-3.5" />
              اجازه‌ی شما تایید شد — تصویر و گفتگوی شما پخش می‌شود
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative min-w-0 overflow-hidden bg-black",
        fullscreen
          ? "flex size-full items-center justify-center [&:fullscreen]:size-full"
          : "aspect-video w-full rounded-2xl"
      )}
    >
      <div
        className="relative size-full"
        style={
          fsState === "rotated"
            ? {
                // چرخش CSS جایگزین قفل چرخش مرورگر — صحنه را افقی می‌کند
                width: "100vh",
                height: "100vw",
                transform: "translateX(100vw) rotate(90deg)",
                transformOrigin: "top left",
              }
            : undefined
        }
      >
        {stageBody}
      </div>

      {/* — کنترل تمام‌صفحه (دانشجو) — */}
      {!isHost ? (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={fullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه افقی"}
          title={fullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه (افقی)"}
          className="absolute top-2 end-2 z-20 flex size-10 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black/80"
        >
          {fullscreen ? (
            <Minimize className="size-5" />
          ) : (
            <Maximize className="size-5" />
          )}
        </button>
      ) : null}
    </div>
  );
}

/* ————————————————— اتاق کلاس ————————————————— */

/**
 * صفحه‌ی کلاس آنلاین — نمای مشترک استاد و دانشجو:
 *  • استاد: شروع پخش صدا/تصویر، اشتراک صفحه، اخراج/اجازه، پایان جلسه
 *  • دانشجو: تماشا با کیفیت دلخواه (بهینه برای سرعت کم)، چت، درخواست
 *    تصویر و گفتگو، تمام‌صفحه‌ی افقی موبایل
 */
export function StreamRoom({ session }: { session: StreamSession }) {
  const router = useRouter();
  const room = useStreamRoom({
    streamId: session.stream.id,
    role: session.role === "host" ? "host" : "student",
  });
  const isHost = session.role === "host";
  const myName = session.me?.name ?? "کاربر";
  const [sideTab, setSideTab] = React.useState<"chat" | "people">("chat");
  const [autoStartTried, setAutoStartTried] = React.useState(false);

  // دانشجو: با دریافت اجازه، دوربین/میکروفون خودش وصل می‌شود
  React.useEffect(() => {
    if (isHost || !room.granted || room.publishing || autoStartTried) return;
    setAutoStartTried(true);
    void room
      .startBroadcast("av")
      .then(() => toast.success("اجازه‌ی استاد دریافت شد — تصویر و صدای شما پخش می‌شود."))
      .catch(() => {
        toast.error("اتصال دوربین/میکروفون ناموفق بود؛ دسترسی مرورگر را بررسی کنید.");
      });
  }, [isHost, room, room.granted, room.publishing, autoStartTried]);

  /* — اخراج — */
  if (room.kicked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-400 to-rose-600 shadow-lg shadow-red-500/25">
            <ShieldAlert className="size-8 text-white" strokeWidth={2.2} />
          </span>
          <h1 className="mt-5 text-xl font-black text-foreground">
            شما از کلاس اخراج شدید
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            استاد شما را از این کلاس آنلاین اخراج کرد. تا پایان این جلسه امکان
            بازگشت ندارید.
          </p>
          <Button asChild className="mt-6 h-11 w-full rounded-xl font-bold">
            <Link href="/panel">بازگشت به پنل کاربر</Link>
          </Button>
        </div>
      </div>
    );
  }

  const statusBadge =
    room.roomStatus === "live" ? (
      <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[0.65rem] font-black text-red-600 dark:text-red-300">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-red-500" />
        </span>
        زنده
      </span>
    ) : room.roomStatus === "ended" ? (
      <span className="rounded-full border border-border bg-foreground/[0.04] px-3 py-1 text-[0.65rem] font-black text-muted-foreground dark:bg-white/[0.04]">
        پایان‌یافته
      </span>
    ) : (
      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[0.65rem] font-black text-amber-700 dark:text-amber-300">
        در انتظار شروع
      </span>
    );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* — سربرگ — */}
      <header className="flex items-center gap-3 border-b border-border bg-card/70 px-4 py-3 backdrop-blur-md sm:px-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-md shadow-teal-500/20">
          <Radio className="size-5 text-teal-950" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-foreground sm:text-base">
            {session.stream.title}
          </p>
          <p className="flex items-center gap-2 text-[0.65rem] font-bold text-muted-foreground">
            {statusBadge}
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {faDigits(room.users.filter((u) => u.role === "student").length)}{" "}
              دانشجو
            </span>
            {room.connStatus !== "connected" ? (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-300">
                <Loader2 className="size-3 animate-spin" />
                اتصال...
              </span>
            ) : null}
          </p>
        </div>
        {room.connStatus === "error" && room.connError ? (
          <span className="hidden max-w-48 truncate text-[0.65rem] font-bold text-destructive sm:block">
            {room.connError}
          </span>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => {
            room.leaveRoom();
            router.push("/panel");
          }}
          className="h-9 rounded-xl px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-400/10 dark:hover:text-red-300"
        >
          <LogOut className="size-4" />
          خروج از کلاس
        </Button>
      </header>

      {/* — بدنه — */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:items-start">
        {/* — صحنه + کنترل‌ها — */}
        <main className="flex min-w-0 flex-1 flex-col gap-3">
          <VideoStage room={room} isHost={isHost} myName={myName} />

          {/* — کنترل‌های استاد — */}
          {isHost ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-md">
              {room.roomStatus === "ended" ? (
                <span className="flex items-center gap-2 px-2 text-xs font-black text-muted-foreground">
                  <PhoneOff className="size-4" />
                  این جلسه پایان یافته است.
                </span>
              ) : !room.publishing ? (
                <>
                  <Button
                    onClick={() =>
                      void room
                        .startBroadcast("av")
                        .catch((e: Error) => {
                          toast.error(e.message, {
                            description:
                              "می‌توانید کلاس را فقط با صدا یا اشتراک صفحه شروع کنید.",
                          });
                        })
                    }
                    className="h-10 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-600 px-5 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25"
                  >
                    <Video className="size-4" />
                    شروع پخش (دوربین + صدا)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void room
                        .startBroadcast("audio")
                        .catch((e: Error) => toast.error(e.message))
                    }
                    className="h-10 rounded-xl px-4 text-xs font-bold"
                  >
                    <Mic className="size-4" />
                    فقط صدا
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void room
                        .toggleScreenShare()
                        .catch((e: Error) => toast.error(e.message))
                    }
                    className="h-10 rounded-xl px-4 text-xs font-bold"
                  >
                    <MonitorUp className="size-4" />
                    فقط اشتراک صفحه
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          "جلسه برای همه‌ی دانشجوها پایان می‌یابد. مطمئن هستید؟"
                        )
                      ) {
                        void room.endStream();
                      }
                    }}
                    className="ms-auto h-10 rounded-xl px-4 text-xs font-black"
                  >
                    <PhoneOff className="size-4" />
                    پایان جلسه
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={room.micMuted ? "destructive" : "outline"}
                    onClick={room.toggleMic}
                    aria-label={room.micMuted ? "وصل کردن میکروفون" : "قطع میکروفون"}
                    className="h-10 rounded-xl px-4 text-xs font-bold"
                  >
                    {room.micMuted ? (
                      <MicOff className="size-4" />
                    ) : (
                      <Mic className="size-4" />
                    )}
                    {room.micMuted ? "میکروفون قطع" : "قطع میکروفون"}
                  </Button>
                  {room.localStream && room.localStream.getVideoTracks().length > 0 ? (
                    <Button
                      variant="outline"
                      onClick={room.toggleCam}
                      aria-label={room.camOff ? "وصل کردن دوربین" : "قطع دوربین"}
                      className="h-10 rounded-xl px-4 text-xs font-bold"
                    >
                      <VideoOff className="size-4" />
                      {room.camOff ? "وصل دوربین" : "قطع دوربین"}
                    </Button>
                  ) : null}
                  <Button
                    variant={room.screenSharing ? "default" : "outline"}
                    onClick={() =>
                      void room
                        .toggleScreenShare()
                        .catch((e: Error) => toast.error(e.message))
                    }
                    className="h-10 rounded-xl px-4 text-xs font-bold"
                  >
                    <MonitorUp className="size-4" />
                    {room.screenSharing ? "توقف اشتراک صفحه" : "اشتراک صفحه"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={room.stopPublishing}
                    className="h-10 rounded-xl px-4 text-xs font-bold text-amber-600 dark:text-amber-300"
                  >
                    <VideoOff className="size-4" />
                    توقف پخش
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          "جلسه برای همه‌ی دانشجوها پایان می‌یابد. مطمئن هستید؟"
                        )
                      ) {
                        void room.endStream();
                      }
                    }}
                    className="ms-auto h-10 rounded-xl px-4 text-xs font-black"
                  >
                    <PhoneOff className="size-4" />
                    پایان جلسه
                  </Button>
                </>
              )}
            </div>
          ) : (
            /* — کنترل‌های دانشجو — */
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-md">
              <QualityPicker room={room} />
              {room.roomStatus !== "ended" ? (
                !room.granted && !room.publishing ? (
                  <Button
                    onClick={room.requestMedia}
                    className="h-10 rounded-xl px-4 text-xs font-black"
                  >
                    <Video className="size-4" />
                    درخواست تصویر و گفتگو
                  </Button>
                ) : room.publishing ? (
                  <Button
                    variant="outline"
                    onClick={room.stopPublishing}
                    className="h-10 rounded-xl px-4 text-xs font-bold text-amber-600 dark:text-amber-300"
                  >
                    <VideoOff className="size-4" />
                    قطع تصویر و صدای من
                  </Button>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[0.65rem] font-black text-emerald-700 dark:text-emerald-300">
                    <UserCheck className="size-3.5" />
                    اجازه‌ی شما تایید شد
                  </span>
                )
              ) : null}
              <span className="ms-auto flex items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
                {room.roomStatus === "ended" ? (
                  <>
                    <PhoneOff className="size-3.5" />
                    جلسه پایان یافت
                  </>
                ) : room.quality === "audio" ? (
                  <>
                    <MessageSquare className="size-3.5" />
                    حالت فقط‌صدا — کمترین مصرف اینترنت
                  </>
                ) : null}
              </span>
            </div>
          )}
        </main>

        {/* — پنل کنار: چت / کاربران — */}
        <aside className="flex h-[22rem] min-w-0 shrink-0 flex-col rounded-2xl border border-border bg-card/70 backdrop-blur-md lg:h-auto lg:min-h-[36rem] lg:w-80">
          <div className="flex items-center gap-1 border-b border-border p-2">
            <button
              type="button"
              onClick={() => setSideTab("chat")}
              aria-pressed={sideTab === "chat"}
              className={cn(
                "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-black transition-colors",
                sideTab === "chat"
                  ? "bg-foreground/[0.06] text-foreground dark:bg-white/[0.06]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="size-4" />
              گفتگو
            </button>
            <button
              type="button"
              onClick={() => setSideTab("people")}
              aria-pressed={sideTab === "people"}
              className={cn(
                "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-black transition-colors",
                sideTab === "people"
                  ? "bg-foreground/[0.06] text-foreground dark:bg-white/[0.06]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="size-4" />
              حاضران
              {isHost && room.mediaRequests.length > 0 ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[0.55rem] font-black tabular-nums text-white">
                  {faDigits(room.mediaRequests.length)}
                </span>
              ) : null}
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-2">
            {sideTab === "chat" ? (
              <ChatPanel room={room} myName={myName} />
            ) : (
              <PeoplePanel room={room} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
