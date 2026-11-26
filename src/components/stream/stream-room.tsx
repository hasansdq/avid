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
  RotateCcw,
  Send,
  ShieldAlert,
  Square,
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
    if (!stream) return;

    // پخش خودکار: مرورگر بدون تعامل کاربر اجازه‌ی «با صدا» پخش نمی‌دهد؛
    // در آن حالت اول بی‌صدا پخش می‌شود و با اولین کلیک/لمس، صدا وصل می‌شود
    // (الگوی استاندارد پخش زنده — وگرنه تصویر استاد سیاه می‌ماند).
    let gesture: (() => void) | null = null;

    const armGesture = () => {
      gesture = () => {
        el.muted = muted;
        void el.play().catch(() => {});
      };
      window.addEventListener("click", gesture, { once: true });
      window.addEventListener("touchstart", gesture, { once: true });
    };

    if (el.muted && !muted) {
      // بی‌صدایی از اتصال قبلی (بازسازی MediaStream بعد از رسیده‌های دیرهنگام)
      // — پخش را ادامه بده و همچنان منتظر اولین تعامل برای وصل صدا بمان
      void el.play().catch(() => {});
      armGesture();
    } else {
      el.play().catch(() => {
        if (el.muted) return;
        el.muted = true;
        el.play().catch(() => {});
        armGesture();
      });
    }

    return () => {
      if (gesture) {
        window.removeEventListener("click", gesture);
        window.removeEventListener("touchstart", gesture);
      }
    };
  }, [stream, muted]);

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

/** Media status is independent of chat/signaling connectivity. */
function MediaFeedback({ room }: { room: UseStreamRoom }) {
  const error = room.mediaError || room.remotePublishers.find((p) => p.state === "error")?.error;
  const connecting = room.remotePublishers.some((p) => p.state === "connecting");
  if (!error && !connecting) return null;
  return (
    <div role={error ? "alert" : "status"}
      className="absolute left-3 right-3 top-14 z-30 rounded-xl bg-black/80 p-3 text-center text-xs leading-6 text-white">
      {error || "در انتظار دریافت صدا و تصویر…"}
      {error ? <button type="button" onClick={() => void room.retryMedia()}
        className="ms-3 rounded-lg bg-teal-600 px-3 py-1 font-bold text-white">
        تلاش دوباره برای اتصال رسانه
      </button> : null}
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

/** آیا در حال حاضر صفحه موبایل است؟ (هم‌ارز زیر md — برای نمایش افقی پیش‌فرض) */
function useIsMobile(): boolean {
  const [isMobile, setMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
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
            "rounded-lg px-2 py-1.5 text-[0.6rem] font-black transition-colors sm:px-2.5 sm:text-[0.65rem]",
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

/**
 * محتوای مشترک پنل گفتگو/حاضران — تب‌ها + دکمه‌ی بستن (ضربدر).
 * در حالت عادی موبایل به‌صورت صفحه‌ی شناور پایین، در دسکتاپ ستون کناری
 * و در نمایش افقی موبایل کارت شناور داخل قاب چرخیده دیده می‌شود.
 */
function PanelBody({
  room,
  myName,
  tab,
  onTab,
  onClose,
}: {
  room: UseStreamRoom;
  myName: string;
  tab: "chat" | "people";
  onTab: (tab: "chat" | "people") => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1 border-b border-border p-2">
        <button
          type="button"
          onClick={() => onTab("chat")}
          aria-pressed={tab === "chat"}
          className={cn(
            "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-black transition-colors",
            tab === "chat"
              ? "bg-foreground/[0.06] text-foreground dark:bg-white/[0.06]"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquare className="size-4" />
          گفتگو
        </button>
        <button
          type="button"
          onClick={() => onTab("people")}
          aria-pressed={tab === "people"}
          className={cn(
            "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-black transition-colors",
            tab === "people"
              ? "bg-foreground/[0.06] text-foreground dark:bg-white/[0.06]"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="size-4" />
          حاضران
        </button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          aria-label="بستن پنل"
          title="بستن"
          className="size-9 shrink-0 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-2">
        {tab === "chat" ? (
          <ChatPanel room={room} myName={myName} />
        ) : (
          <PeoplePanel room={room} />
        )}
      </div>
    </>
  );
}

/**
 * دکمه‌ی آیکونیِ فشرده برای نوار پایین نمایش افقی — تُن‌های رنگی نقش‌آگاه.
 */
function LandscapeToolButton({
  icon: Icon,
  onClick,
  title,
  tone = "glass",
  strokeWidth,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
  title: string;
  tone?: "glass" | "primary" | "danger" | "amber";
  strokeWidth?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl backdrop-blur-md transition-colors",
        tone === "primary" &&
          "bg-gradient-to-l from-teal-400 to-emerald-600 text-teal-950 shadow-lg shadow-teal-500/25",
        tone === "amber" && "bg-amber-500/90 text-amber-950 hover:bg-amber-500",
        tone === "danger" && "bg-red-500/90 text-white hover:bg-red-500",
        tone === "glass" && "bg-black/60 text-white hover:bg-black/80"
      )}
    >
      <Icon className="size-5" strokeWidth={strokeWidth} />
    </button>
  );
}

/** پایان جلسه با تایید — مشترک بین نوار افقی و کنترل‌های عادی استاد */
function confirmEndStream(room: UseStreamRoom) {
  if (window.confirm("جلسه برای همه‌ی دانشجوها پایان می‌یابد. مطمئن هستید؟")) {
    void room.endStream();
  }
}

/** کنترل‌های استاد در نوار پایین قاب افقی — فقط آیکون، تک‌ردیفی */
function HostLandscapeControls({ room }: { room: UseStreamRoom }) {
  if (room.roomStatus === "ended") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 px-2 text-[0.65rem] font-black text-white/70">
        <PhoneOff className="size-4" />
        این جلسه پایان یافته است.
      </span>
    );
  }

  if (!room.publishing) {
    return (
      <>
        <LandscapeToolButton
          icon={Video}
          tone="primary"
          title="شروع پخش (دوربین + صدا)"
          onClick={() =>
            void room
              .startBroadcast("av")
              .catch((e: Error) =>
                toast.error(e.message, {
                  description:
                    "می‌توانید کلاس را فقط با صدا یا اشتراک صفحه شروع کنید.",
                })
              )
          }
        />
        <LandscapeToolButton
          icon={Mic}
          title="شروع فقط با صدا"
          onClick={() =>
            void room.startBroadcast("audio").catch((e: Error) =>
              toast.error(e.message)
            )
          }
        />
        <LandscapeToolButton
          icon={MonitorUp}
          title="شروع فقط با اشتراک صفحه"
          onClick={() =>
            void room.toggleScreenShare().catch((e: Error) =>
              toast.error(e.message)
            )
          }
        />
        <LandscapeToolButton
          icon={PhoneOff}
          tone="danger"
          title="پایان جلسه"
          onClick={() => confirmEndStream(room)}
        />
      </>
    );
  }

  return (
    <>
      <LandscapeToolButton
        icon={room.micMuted ? MicOff : Mic}
        tone={room.micMuted ? "danger" : "glass"}
        title={room.micMuted ? "وصل کردن میکروفون" : "قطع میکروفون"}
        onClick={room.toggleMic}
      />
      {room.localStream && room.localStream.getVideoTracks().length > 0 ? (
        <LandscapeToolButton
          icon={VideoOff}
          title={room.camOff ? "وصل کردن دوربین" : "قطع دوربین"}
          onClick={room.toggleCam}
        />
      ) : null}
      <LandscapeToolButton
        icon={MonitorUp}
        title={room.screenSharing ? "توقف اشتراک صفحه" : "اشتراک صفحه"}
        onClick={() =>
          void room.toggleScreenShare().catch((e: Error) =>
            toast.error(e.message)
          )
        }
      />
      <LandscapeToolButton
        icon={Square}
        tone="amber"
        strokeWidth={2.4}
        title="توقف پخش"
        onClick={room.stopPublishing}
      />
      <LandscapeToolButton
        icon={PhoneOff}
        tone="danger"
        title="پایان جلسه"
        onClick={() => confirmEndStream(room)}
      />
    </>
  );
}

/** کنترل‌های دانشجو در نوار پایین قاب افقی — کیفیت + درخواست/قطع رسانه */
function StudentLandscapeControls({ room }: { room: UseStreamRoom }) {
  return (
    <>
      <QualityPicker room={room} />
      {room.roomStatus !== "ended" ? (
        !room.granted && !room.publishing ? (
          <LandscapeToolButton
            icon={Video}
            tone="primary"
            title="درخواست تصویر و گفتگو"
            onClick={room.requestMedia}
          />
        ) : room.publishing ? (
          <LandscapeToolButton
            icon={Square}
            tone="amber"
            strokeWidth={2.4}
            title="قطع تصویر و صدای من"
            onClick={room.stopPublishing}
          />
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[0.6rem] font-black text-emerald-300">
            <UserCheck className="size-3.5" />
            اجازه‌ی شما تایید شد
          </span>
        )
      ) : null}
    </>
  );
}

/**
 * نمایش افقی تمام‌صفحه — پیش‌فرض «همه‌ی نقش‌ها» در موبایل
 * (استاد/مدار/دانشجو) به‌صورت خودکار فعال است.
 * ویدئو با چرخش CSS افقی می‌شود (iOS) یا با قفل چرخش اندروید مستقیم
 * تمام‌صفحه می‌شود؛ در پرتره همیشه با دکمه «نمایش عمودی» می‌توان به
 * حالت عادی برگشت. کنترل‌های نقش (پخش استاد / کیفیت و درخواست رسانه‌ی
 * دانشجو) در نوار پایین قاب افقی است و پنل گفتگو/حاضران هم داخل قاب
 * باز می‌شود تا در حالت افقی درست خوانده شود. تپ روی صحنه هم
 * تمام‌صفحه‌ی واقعی + قفل افقی اندروید را فعال می‌کند.
 */
function LandscapeOverlay({
  room,
  isHost,
  myName,
  onExit,
  onLeave,
  onTogglePanel,
  panelTab,
}: {
  room: UseStreamRoom;
  isHost: boolean;
  myName: string;
  onExit: () => void;
  onLeave: () => void;
  onTogglePanel: (tab: "chat" | "people") => void;
  panelTab: "chat" | "people" | null;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [fsState, setFsState] = React.useState<
    "none" | "landscape" | "portrait"
  >("none");

  React.useEffect(() => {
    const update = () => {
      if (!document.fullscreenElement) {
        setFsState("none");
        return;
      }
      const t =
        typeof screen !== "undefined" && screen.orientation
          ? screen.orientation.type
          : "";
      // اندروید: چرخش قفل‌شده‌ی افقی → محتوا مستقیم تمام‌صفحه؛
      // iOS پرتره: چرخش CSS افقی می‌سازد.
      setFsState(t.startsWith("landscape") ? "landscape" : "portrait");
    };
    document.addEventListener("fullscreenchange", update);
    screen.orientation?.addEventListener?.("change", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      screen.orientation?.removeEventListener?.("change", update);
    };
  }, []);

  async function toggleRealFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await wrapRef.current?.requestFullscreen?.();
        try {
          await getOrientation()?.lock?.("landscape");
        } catch {
          /* iOS پشتیبانی نمی‌کند — چرخش CSS فعال می‌ماند */
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

  /** خروج از حالت افقی — تمام‌صفحه‌ی واقعی هم بسته می‌شود */
  async function exitLandscape() {
    if (document.fullscreenElement) {
      try {
        getOrientation()?.unlock?.();
      } catch {
        /* noop */
      }
      try {
        await document.exitFullscreen?.();
      } catch {
        /* noop */
      }
    }
    onExit();
  }

  /**
   * تپ روی صحنه → تمام‌صفحه‌ی واقعی + قفل افقی (اندروید) — requestFullscreen
   * به ژست کاربر نیاز دارد و تپ روی ویدئو همین ژست را فراهم می‌کند.
   * کلیک روی دکمه‌ها/فرم/پنل نادیده گرفته می‌شود.
   */
  function handleStageTap(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest("button, input, textarea, form, a, [data-panel]")) return;
    void toggleRealFullscreen();
  }

  // ناشر اصلی: برای دانشجو استاد، برای استاد/مدار دانشجوی اجازه‌گرفته؛
  // بعدِ آن پیش‌نمایش خودِ استاد نمایش داده می‌شود.
  const hostPublisher =
    room.remotePublishers.find((p) => p.role === "host") ??
    room.remotePublishers.find((p) => p.main) ??
    room.remotePublishers[0] ??
    null;
  const otherPublishers = room.remotePublishers.filter(
    (p) => p !== hostPublisher
  );

  const rotated = fsState !== "landscape";

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-40 bg-black"
      role="dialog"
      aria-label="نمایش افقی تمام‌صفحه‌ی کلاس"
    >
      <div
        className={cn(rotated ? "absolute top-0 left-0" : "size-full")}
        style={
          rotated
            ? {
                // چرخش CSS — صحنه افقی تمام‌صفحه در گوشی عمودی
                width: "100dvh",
                height: "100dvw",
                transformOrigin: "top left",
                transform: "translateX(100dvw) rotate(90deg)",
              }
            : undefined
        }
      >
        <div className="relative size-full bg-black" onClick={handleStageTap}>
          <MediaFeedback room={room} />
          {/* — ویدئوی اصلی — */}
          {hostPublisher?.main ? (
            <VideoTile
              stream={hostPublisher.main}
              className="size-full rounded-none"
              label={
                hostPublisher.name
                  ? `${hostPublisher.name} — ${isHost ? "دانشجو" : "استاد"}`
                  : isHost
                    ? "دانشجو"
                    : "استاد"
              }
            />
          ) : isHost && room.localStream ? (
            <VideoTile
              stream={room.localStream}
              muted
              className="size-full rounded-none"
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
              className="absolute bottom-16 end-2 z-10 aspect-video w-[22%] min-w-24 border border-white/20 shadow-xl"
              label="دوربین استاد"
            />
          ) : null}

          {/* — نشان اشتراک صفحه‌ی فعال (استاد) — */}
          {isHost && room.screenSharing ? (
            <span className="absolute bottom-16 start-2 z-10 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[0.65rem] font-black text-white backdrop-blur-sm">
              <MonitorUp className="size-3.5" />
              اشتراک صفحه فعال است
            </span>
          ) : null}

          {/* — نوار دانشجویان در حال پخش + پیش‌نمایش خودم — */}
          {otherPublishers.some((p) => p.main) ||
          (!isHost && room.publishing && room.localStream) ? (
            <div className="absolute top-2 start-2 z-10 flex max-w-[55%] items-center gap-1.5 overflow-x-auto rounded-xl bg-black/40 p-1.5 backdrop-blur-md">
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
            </div>
          ) : null}

          {/* — نوار ابزار بالای صحنه (در قاب افقی) — */}
          <div className="absolute top-2 end-2 z-10 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onTogglePanel("chat")}
              aria-label="گفتگو"
              title="گفتگوی کلاس"
              aria-pressed={panelTab === "chat"}
              className={cn(
                "flex size-10 items-center justify-center rounded-xl backdrop-blur-md transition-colors",
                panelTab === "chat"
                  ? "bg-teal-400 text-teal-950"
                  : "bg-black/60 text-white hover:bg-black/80"
              )}
            >
              <MessageSquare className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => onTogglePanel("people")}
              aria-label="حاضران"
              title="حاضران کلاس"
              aria-pressed={panelTab === "people"}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-xl backdrop-blur-md transition-colors",
                panelTab === "people"
                  ? "bg-teal-400 text-teal-950"
                  : "bg-black/60 text-white hover:bg-black/80"
              )}
            >
              <Users className="size-5" />
              {isHost && room.mediaRequests.length > 0 ? (
                <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[0.55rem] font-black tabular-nums text-white">
                  {faDigits(room.mediaRequests.length)}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => void toggleRealFullscreen()}
              aria-label="تمام‌صفحه‌ی واقعی"
              title="تمام‌صفحه (قفل افقی اندروید)"
              className="flex size-10 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black/80"
            >
              {fsState === "none" ? (
                <Maximize className="size-5" />
              ) : (
                <Minimize className="size-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void exitLandscape()}
              aria-label="نمایش عمودی (خروج از حالت افقی)"
              title="بازگشت به نمایش عمودی"
              className="flex size-10 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black/80"
            >
              <RotateCcw className="size-5" />
            </button>
            <button
              type="button"
              onClick={onLeave}
              aria-label="خروج از کلاس"
              title="خروج از کلاس"
              className="flex size-10 items-center justify-center rounded-xl bg-black/60 text-red-400 backdrop-blur-md transition-colors hover:bg-red-500/20 hover:text-red-300"
            >
              <LogOut className="size-5" />
            </button>
          </div>

          {/* — نوار کنترل نقش در پایین قاب افقی — */}
          <div className="absolute bottom-2 inset-x-2 z-20 flex items-center gap-1.5 overflow-x-auto rounded-xl bg-black/40 p-1.5 backdrop-blur-md">
            {isHost ? (
              <HostLandscapeControls room={room} />
            ) : (
              <StudentLandscapeControls room={room} />
            )}
            {room.connStatus !== "connected" ? (
              <span
                title={room.connError ?? undefined}
                className="ms-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-2 text-[0.6rem] font-black text-amber-300"
              >
                {room.connStatus === "error" ? (
                  <ShieldAlert className="size-3.5 text-red-400" />
                ) : (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {room.connStatus === "error" ? "خطای اتصال" : "اتصال..."}
              </span>
            ) : null}
          </div>

          {/* — پنل گفتگو/حاضران داخل قاب افقی (درست‌جهت برای بیننده) — */}
          {panelTab !== null ? (
            <div
              data-panel
              className="absolute inset-y-2 start-2 z-30 flex w-72 max-w-[60%] flex-col overflow-hidden rounded-2xl border border-white/15 bg-card/95 shadow-2xl backdrop-blur-md"
            >
              <PanelBody
                room={room}
                myName={myName}
                tab={panelTab}
                onTab={onTogglePanel}
                onClose={() => onTogglePanel(panelTab)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VideoStage({
  room,
  isHost,
  myName,
  onMaximize,
}: {
  room: UseStreamRoom;
  isHost: boolean;
  myName: string;
  /** موبایل دانشجو: دکمه‌ی بزرگ‌نمایی به نمایش افقی می‌رود نه تمام‌صفحه‌ی واقعی */
  onMaximize?: () => void;
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

  // ناشر اصلی: اولین ناشرِ دارای رسانه — ناشرِ تازه‌قطع‌شده (تب بسته‌شده که هنوز
  // از اتاق پاک نشده) رسانه‌ای ندارد و نباید تصویر اصلی را بخواباند؛ سپس
  // اولین ناشر؛ بقیه (دانشجویان اجازه‌گرفته) در نوار پایین می‌روند.
  const hostPublisher =
    room.remotePublishers.find((p) => p.role === "host") ??
    room.remotePublishers.find((p) => p.main) ??
    room.remotePublishers[0] ??
    null;
  const otherPublishers = room.remotePublishers.filter(
    (p) => p !== hostPublisher
  );

  const stageBody = (
    <>
      {/* — ویدئوی اصلی: استاد — */}
      <MediaFeedback room={room} />
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

      {/* — کنترل تمام‌صفحه (همه‌ی نقش‌ها؛ موبایل → نمایش افقی) — */}
      <button
        type="button"
        onClick={() => {
          if (onMaximize) onMaximize();
          else void toggleFullscreen();
        }}
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
    </div>
  );
}

/* ————————————————— اتاق کلاس ————————————————— */

/**
 * صفحه‌ی کلاس آنلاین — نمای مشترک استاد و دانشجو:
 *  • استاد: شروع پخش صدا/تصویر، اشتراک صفحه، اخراج/اجازه، پایان جلسه
 *  • دانشجو: تماشا با کیفیت دلخواه (بهینه برای سرعت کم)، چت، درخواست
 *    تصویر و گفتگو
 *
 * موبایل: نمایش افقی تمام‌صفحه برای «همه‌ی نقش‌ها» (استاد/مدار/دانشجو)
 * به‌صورت خودکار فعال است — کنترل‌های نقش در نوار پایین قاب افقی
 * قرار دارد و با دکمه‌ی «نمایش عمودی» می‌توان به نمای عادی برگشت.
 *
 * پنل گفتگو/حاضران به‌صورت پیش‌فرض بسته است؛ کلیدهای آن‌ها زیر هدر صفحه
 * قرار دارد و با ضربدر بسته می‌شوند. در موبایل پنل به‌صورت صفحه‌ی شناور
 * پایین و در دسکتاپ ستون کناری است.
 */
export function StreamRoom({ session }: { session: StreamSession }) {
  const router = useRouter();
  const room = useStreamRoom({
    streamId: session.stream.id,
    role: session.role === "host" ? "host" : "student",
  });
  const isHost = session.role === "host";
  const isMobile = useIsMobile();
  const myName = session.me?.name ?? "کاربر";

  /** پنل گفتگو/حاضران — پیش‌فرض بسته */
  const [sidePanel, setSidePanel] = React.useState<"chat" | "people" | null>(
    null
  );
  /** نمایش افقی تمام‌صفحه — پیش‌فرض روشن برای دانشجویان موبایل */
  const [landscapeOn, setLandscapeOn] = React.useState(true);
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
      <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[0.65rem] font-black text-red-600 dark:text-red-300">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-red-500" />
        </span>
        زنده
      </span>
    ) : room.roomStatus === "ended" ? (
      <span className="rounded-full border border-border bg-foreground/[0.04] px-2.5 py-1 text-[0.65rem] font-black text-muted-foreground dark:bg-white/[0.04]">
        پایان‌یافته
      </span>
    ) : (
      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-black text-amber-700 dark:text-amber-300">
        در انتظار شروع
      </span>
    );

  /** نمایش افقی تمام‌صفحه — همه‌ی نقش‌ها (استاد/مدار/دانشجو) در موبایل
   * به‌صورت خودکار فعال؛ کنترل‌های نقش داخل قاب افقی در دسترس است */
  const showLandscape = isMobile && landscapeOn;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* — سربرگ — */}
      <header className="flex items-center gap-2 border-b border-border bg-card/70 px-3 py-2.5 backdrop-blur-md sm:gap-3 sm:px-6 sm:py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-md shadow-teal-500/20 sm:size-10">
          <Radio className="size-4 text-teal-950 sm:size-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8rem] font-black text-foreground sm:text-base">
            {session.stream.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6rem] font-bold text-muted-foreground sm:text-[0.65rem]">
            {statusBadge}
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {faDigits(room.users.filter((u) => u.role === "student").length)}{" "}
              دانشجو
            </span>
            {room.connStatus !== "connected" ? (
              room.connStatus === "error" ? (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-300">
                  <span className="size-1.5 rounded-full bg-red-500" />
                  خطای اتصال
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-300">
                  <Loader2 className="size-3 animate-spin" />
                  اتصال...
                </span>
              )
            ) : null}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            room.leaveRoom();
            router.push("/panel");
          }}
          aria-label="خروج از کلاس"
          title="خروج از کلاس"
          className="size-9 shrink-0 rounded-xl p-0 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-400/10 dark:hover:text-red-300 sm:h-9 sm:w-auto sm:px-3 sm:text-xs sm:font-bold"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">خروج از کلاس</span>
        </Button>
      </header>

      {/* — نوار ابزار: گفتگو / حاضران (پنل‌ها پیش‌فرض بسته‌اند) + وضعیت اتصال — */}
      <nav
        aria-label="ابزارهای کلاس"
        className="flex items-center gap-1.5 border-b border-border bg-card/50 px-3 py-1.5 backdrop-blur-md sm:px-6"
      >
        <button
          type="button"
          onClick={() => setSidePanel(sidePanel === "chat" ? null : "chat")}
          aria-pressed={sidePanel === "chat"}
          aria-label="گفتگوی کلاس"
          title="گفتگو"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[0.65rem] font-black transition-colors",
            sidePanel === "chat"
              ? "bg-gradient-to-l from-teal-400 to-emerald-600 text-teal-950 shadow-md shadow-teal-500/20"
              : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]"
          )}
        >
          <MessageSquare className="size-4" />
          <span className="hidden sm:inline">گفتگو</span>
        </button>
        <button
          type="button"
          onClick={() => setSidePanel(sidePanel === "people" ? null : "people")}
          aria-pressed={sidePanel === "people"}
          aria-label="حاضران کلاس"
          title="حاضران"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[0.65rem] font-black transition-colors",
            sidePanel === "people"
              ? "bg-gradient-to-l from-teal-400 to-emerald-600 text-teal-950 shadow-md shadow-teal-500/20"
              : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]"
          )}
        >
          <Users className="size-4" />
          <span className="hidden sm:inline">حاضران</span>
          {isHost && room.mediaRequests.length > 0 ? (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[0.55rem] font-black tabular-nums text-white">
              {faDigits(room.mediaRequests.length)}
            </span>
          ) : null}
        </button>

        {/* خطای اتصال — در همه‌ی اندازه‌ها دیده می‌شود */}
        {room.connStatus === "error" && room.connError ? (
          <span
            title={room.connError}
            className="ms-auto flex min-w-0 items-center gap-1.5 truncate rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[0.6rem] font-black text-red-600 dark:text-red-300"
          >
            <ShieldAlert className="size-3.5 shrink-0" />
            <span className="truncate">{room.connError}</span>
          </span>
        ) : null}
      </nav>

      {/* — بدنه — */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:items-start">
        {/* — صحنه + کنترل‌ها — */}
        <main className="flex min-w-0 flex-1 flex-col gap-3">
          {/* موبایل + نمایش افقی: صحنه‌ی عادی حذف می‌شود تا صدای
              ویدئو دوبار پخش نشود (صحنه‌ی افقی کامل روبه‌رو است) */}
          {showLandscape ? null : (
            <VideoStage
              room={room}
              isHost={isHost}
              myName={myName}
              onMaximize={
                isMobile ? () => setLandscapeOn(true) : undefined
              }
            />
          )}

          {/* — کنترل‌های استاد — */}
          {isHost ? (
            <div className="flex flex-nowrap items-center justify-between gap-1.5 rounded-2xl border border-border bg-card/70 p-2 backdrop-blur-md sm:flex-wrap sm:justify-start sm:gap-2 sm:p-3">
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
                    aria-label="شروع پخش (دوربین + صدا)"
                    title="شروع پخش (دوربین + صدا)"
                    className="size-11 shrink-0 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-600 p-0 text-teal-950 shadow-lg shadow-teal-500/25 sm:h-10 sm:w-auto sm:px-5 sm:text-xs sm:font-black"
                  >
                    <Video className="size-5 sm:size-4" />
                    <span className="hidden sm:inline">
                      شروع پخش (دوربین + صدا)
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void room
                        .startBroadcast("audio")
                        .catch((e: Error) => toast.error(e.message))
                    }
                    aria-label="فقط صدا"
                    title="شروع فقط با صدا"
                    className="size-11 shrink-0 rounded-xl p-0 sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-bold"
                  >
                    <Mic className="size-5 sm:size-4" />
                    <span className="hidden sm:inline">فقط صدا</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void room
                        .toggleScreenShare()
                        .catch((e: Error) => toast.error(e.message))
                    }
                    aria-label="فقط اشتراک صفحه"
                    title="شروع فقط با اشتراک صفحه"
                    className="size-11 shrink-0 rounded-xl p-0 sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-bold"
                  >
                    <MonitorUp className="size-5 sm:size-4" />
                    <span className="hidden sm:inline">فقط اشتراک صفحه</span>
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
                    aria-label="پایان جلسه"
                    title="پایان جلسه"
                    className="size-11 shrink-0 rounded-xl p-0 sm:ms-auto sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-black"
                  >
                    <PhoneOff className="size-5 sm:size-4" />
                    <span className="hidden sm:inline">پایان جلسه</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={room.micMuted ? "destructive" : "outline"}
                    onClick={room.toggleMic}
                    aria-label={room.micMuted ? "وصل کردن میکروفون" : "قطع میکروفون"}
                    title={room.micMuted ? "وصل کردن میکروفون" : "قطع میکروفون"}
                    className="size-11 shrink-0 rounded-xl p-0 sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-bold"
                  >
                    {room.micMuted ? (
                      <MicOff className="size-5 sm:size-4" />
                    ) : (
                      <Mic className="size-5 sm:size-4" />
                    )}
                    <span className="hidden sm:inline">
                      {room.micMuted ? "میکروفون قطع" : "قطع میکروفون"}
                    </span>
                  </Button>
                  {room.localStream && room.localStream.getVideoTracks().length > 0 ? (
                    <Button
                      variant="outline"
                      onClick={room.toggleCam}
                      aria-label={room.camOff ? "وصل کردن دوربین" : "قطع دوربین"}
                      title={room.camOff ? "وصل کردن دوربین" : "قطع دوربین"}
                      className="size-11 shrink-0 rounded-xl p-0 sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-bold"
                    >
                      <VideoOff className="size-5 sm:size-4" />
                      <span className="hidden sm:inline">
                        {room.camOff ? "وصل دوربین" : "قطع دوربین"}
                      </span>
                    </Button>
                  ) : null}
                  <Button
                    variant={room.screenSharing ? "default" : "outline"}
                    onClick={() =>
                      void room
                        .toggleScreenShare()
                        .catch((e: Error) => toast.error(e.message))
                    }
                    aria-label={room.screenSharing ? "توقف اشتراک صفحه" : "اشتراک صفحه"}
                    title={room.screenSharing ? "توقف اشتراک صفحه" : "اشتراک صفحه"}
                    className="size-11 shrink-0 rounded-xl p-0 sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-bold"
                  >
                    <MonitorUp className="size-5 sm:size-4" />
                    <span className="hidden sm:inline">
                      {room.screenSharing ? "توقف اشتراک صفحه" : "اشتراک صفحه"}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={room.stopPublishing}
                    aria-label="توقف پخش"
                    title="توقف پخش"
                    className="size-11 shrink-0 rounded-xl p-0 text-amber-600 dark:text-amber-300 sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-bold"
                  >
                    <Square className="size-5 sm:size-4" strokeWidth={2.4} />
                    <span className="hidden sm:inline">توقف پخش</span>
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
                    aria-label="پایان جلسه"
                    title="پایان جلسه"
                    className="size-11 shrink-0 rounded-xl p-0 sm:ms-auto sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-black"
                  >
                    <PhoneOff className="size-5 sm:size-4" />
                    <span className="hidden sm:inline">پایان جلسه</span>
                  </Button>
                </>
              )}
            </div>
          ) : (
            /* — کنترل‌های دانشجو — */
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-card/70 p-2 backdrop-blur-md sm:flex-wrap sm:p-3">
              <QualityPicker room={room} />
              {room.roomStatus !== "ended" ? (
                !room.granted && !room.publishing ? (
                  <Button
                    onClick={room.requestMedia}
                    aria-label="درخواست تصویر و گفتگو"
                    title="درخواست تصویر و گفتگو"
                    className="size-11 shrink-0 rounded-xl p-0 sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-black"
                  >
                    <Video className="size-5 sm:size-4" />
                    <span className="hidden sm:inline">
                      درخواست تصویر و گفتگو
                    </span>
                  </Button>
                ) : room.publishing ? (
                  <Button
                    variant="outline"
                    onClick={room.stopPublishing}
                    aria-label="قطع تصویر و صدای من"
                    title="قطع تصویر و صدای من"
                    className="size-11 shrink-0 rounded-xl p-0 text-amber-600 dark:text-amber-300 sm:h-10 sm:w-auto sm:px-4 sm:text-xs sm:font-bold"
                  >
                    <Square className="size-5 sm:size-4" strokeWidth={2.4} />
                    <span className="hidden sm:inline">
                      قطع تصویر و صدای من
                    </span>
                  </Button>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[0.65rem] font-black text-emerald-700 dark:text-emerald-300">
                    <UserCheck className="size-3.5" />
                    اجازه‌ی شما تایید شد
                  </span>
                )
              ) : null}
              <span className="ms-auto hidden shrink-0 items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground sm:flex">
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

        {/* — پنل کنار: چت / کاربران (پیش‌فرض بسته — با کلید زیر هدر باز می‌شود) — */}
        {sidePanel !== null && !showLandscape ? (
          <aside className="fixed inset-x-2 bottom-2 z-50 flex max-h-[70dvh] flex-col rounded-2xl border border-border bg-card shadow-2xl backdrop-blur-md lg:static lg:inset-auto lg:z-auto lg:h-auto lg:min-h-[36rem] lg:w-80 lg:max-h-none lg:shadow-none">
            <PanelBody
              room={room}
              myName={myName}
              tab={sidePanel}
              onTab={(tab) => setSidePanel(tab)}
              onClose={() => setSidePanel(null)}
            />
          </aside>
        ) : null}
      </div>

      {/* — نمایش افقی تمام‌صفحه — همه‌ی نقش‌ها در موبایل — */}
      {showLandscape ? (
        <LandscapeOverlay
          room={room}
          isHost={isHost}
          myName={myName}
          onExit={() => setLandscapeOn(false)}
          onLeave={() => {
            room.leaveRoom();
            router.push("/panel");
          }}
          onTogglePanel={(tab) =>
            setSidePanel((prev) => (prev === tab ? null : tab))
          }
          panelTab={sidePanel}
        />
      ) : null}
    </div>
  );
}
