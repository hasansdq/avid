"use client";

import * as React from "react";
import Image from "next/image";
import { Headset, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { faDigits, faTime } from "@/lib/fa";
import {
  useChatSocket,
  type ActivityEvent,
} from "@/components/chat/use-chat-socket";

/** نمای یک پیام چت در سمت کاربر */
export interface ChatMessageView {
  id: string;
  sender: "visitor" | "admin" | "bot";
  senderName?: string;
  content: string;
  createdAt: string;
}

interface PublicChatSettings {
  botName: string;
  botTitle: string;
  botAvatar: string;
  welcomeMessage: string;
  autoOpen: boolean;
  isActive: boolean;
}

interface BootstrapResponse {
  settings: PublicChatSettings;
  conversation: {
    id: string;
    messages: ChatMessageView[];
    /** تیکت امضاشده برای عضویت در اتاق همین گفتگو (سرویس رله چت) */
    ticket?: string;
  } | null;
  /** فقط برای نخستین بازدید هر IP در هر شبانه‌روز true است (کل سایت) */
  showWelcome?: boolean;
}

/* ---------------- آواتار چت‌بات با جایگزین گرادیانی ---------------- */

function BotAvatar({
  src,
  alt,
  className = "size-11",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const trimmed = src.trim();

  if (!trimmed || failed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25",
          className
        )}
        aria-hidden
      >
        <Headset className="size-1/2 text-teal-950" strokeWidth={2} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-2xl border border-foreground/10 shadow-lg shadow-black/10",
        className
      )}
    >
      <Image
        src={trimmed}
        alt={alt}
        fill
        sizes="76px"
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/* ---------------- آواتار دکمه‌ی شناور (تصویر پروفایل پشتیبان) ---------------- */

/**
 * تصویر پروفایل پشتیبان روی دکمه‌ی دایره‌ای چت —
 * با تغییر «تصویر چت‌بات» در پنل مدیریت، همین دکمه هم به‌روز می‌شود
 * (تنظیمات در هر بارگذاری صفحه از سرور خوانده می‌شود).
 */
function ChatFabAvatar({
  src,
  alt,
  open,
}: {
  src: string;
  alt: string;
  open: boolean;
}) {
  const [failed, setFailed] = React.useState(false);
  const trimmed = src.trim();

  // اگر مدیر تصویر را عوض کرد، وضعیت خطای تصویر قبلی ریست می‌شود
  React.useEffect(() => {
    setFailed(false);
  }, [trimmed]);

  if (!trimmed || failed) {
    return (
      <span className="relative flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 shadow-xl shadow-teal-500/30">
        {open ? (
          <X className="size-6 text-teal-950" strokeWidth={2.2} />
        ) : (
          <MessageCircle className="size-6 text-teal-950" strokeWidth={2.2} />
        )}
      </span>
    );
  }

  return (
    <span className="relative block size-14 overflow-hidden rounded-full border-2 border-background shadow-xl shadow-black/25">
      <Image
        src={trimmed}
        alt={alt}
        fill
        sizes="56px"
        className="object-cover"
        onError={() => setFailed(true)}
      />
      {open ? (
        <span className="absolute inset-0 flex items-center justify-center bg-teal-950/60">
          <X className="size-6 text-white" strokeWidth={2.2} />
        </span>
      ) : null}
    </span>
  );
}

/* ---------------- حباب پیام ---------------- */

function MessageBubble({ message }: { message: ChatMessageView }) {
  const isVisitor = message.sender === "visitor";

  return (
    <div
      className={cn(
        "flex w-full",
        // در RTL: پیام کاربر به سمت چپ (انتهای محور) و پیام پشتیبانی به سمت راست
        isVisitor ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.83rem] leading-6 shadow-sm",
          isVisitor
            ? "rounded-bl-md bg-gradient-to-br from-teal-500 to-emerald-600 text-white dark:text-teal-50"
            : "rounded-br-md border border-foreground/[0.07] bg-foreground/[0.05] text-foreground dark:border-white/[0.08] dark:bg-white/[0.07]"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <span
          className={cn(
            "mt-1 block text-left text-[0.6rem] tabular-nums",
            isVisitor ? "text-white/70" : "text-muted-foreground"
          )}
        >
          {faTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

/* ---------------- نشانگر تایپ ---------------- */

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-br-md border border-foreground/[0.07] bg-foreground/[0.05] px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.07]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-teal-500 dark:bg-teal-300"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------- ویجت اصلی چت ---------------- */

export function ChatWidget() {
  const [settings, setSettings] = React.useState<PublicChatSettings | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  // تیکت عضویت در اتاق گفتگو — همراه شناسه از API خوانده/نو می‌شود
  const [ticket, setTicket] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [adminTyping, setAdminTyping] = React.useState(false);
  // نمایش خودکار «حباب» خوش‌آمدگویی (پنجره‌ی چت باز نمی‌شود) —
  // سرور فقط برای نخستین بازدید هر IP در هر شبانه‌روز مجاز می‌داند.
  const [welcomeVisible, setWelcomeVisible] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const typingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmit = React.useRef(0);

  /* — بارگذاری اولیه — */
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/bootstrap");
        const data = (await res.json()) as BootstrapResponse;
        if (cancelled || !data?.settings) return;
        setSettings(data.settings);
        if (data.conversation) {
          setConversationId(data.conversation.id);
          setTicket(data.conversation.ticket ?? null);
          setMessages(data.conversation.messages ?? []);
        }
        // نمایش خودکار حباب خوش‌آمدگویی — پنجره‌ی چت باز نمی‌شود؛
        // با دکمه‌ی «ادامه چت» یا کلیک روی تصویر پشتیبان باز می‌شود.
        if (
          data.showWelcome &&
          data.settings.isActive &&
          data.settings.autoOpen &&
          data.settings.welcomeMessage?.trim()
        ) {
          setWelcomeVisible(true);
        }
      } catch {
        /* چت در دسترس نیست — ساکت رد می‌شود */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* — اتصال بلادرنگ — */
  const socket = useChatSocket({
    onActivity: (data: ActivityEvent) => {
      if (!conversationId || data.conversationId !== conversationId) return;
      if (data.kind === "visitor-message") return; // پیام خودم؛ محلی اضافه شده است
      if (data.kind === "admin-message") {
        if (!open) setUnread((u) => u + 1);
        void refreshMessages();
      }
    },
    onTyping: (data) => {
      if (!conversationId || data.conversationId !== conversationId) return;
      if (data.who !== "admin") return;
      setAdminTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setAdminTyping(false), 3000);
    },
  });

  /* عضویت در اتاق گفتگو پس از مشخص شدن شناسه (کوکی ممکن است بعد از اتصال ست
     شده باشد — تیکت امضاشده مالکیت را نزد سرویس رله اثبات می‌کند) */
  React.useEffect(() => {
    if (conversationId) socket.subscribeVisitor(conversationId, ticket ?? undefined);
  }, [conversationId, ticket, socket]);

  /* نوسازی پیام‌ها از سرور */
  const refreshMessages = React.useCallback(async () => {
    try {
      const res = await fetch("/api/chat/messages");
      const data = await res.json();
      if (data?.conversation) {
        setConversationId(data.conversation.id);
        setMessages(data.conversation.messages ?? []);
      }
    } catch {
      /* بی‌صدا */
    }
  }, []);

  /* اسکرول به آخرین پیام */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, adminTyping, open]);

  React.useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, []);

  /* پیام‌های قابل نمایش: اگر گفتغویی نیست، پیام خوش‌آمدگویی به‌صورت محلی نشان داده می‌شود */
  const visibleMessages: ChatMessageView[] = React.useMemo(() => {
    if (messages.length > 0) return messages;
    if (settings?.welcomeMessage?.trim() && conversationId === null) {
      return [
        {
          id: "welcome",
          sender: "bot",
          senderName: settings.botName,
          content: settings.welcomeMessage.trim(),
          createdAt: new Date().toISOString(),
        },
      ];
    }
    return [];
  }, [messages, settings, conversationId]);

  /* چت غیرفعال است؟ (بعد از همه‌ی هوک‌ها تا ترتیب رندر ثابت بماند) */
  if (settings && !settings.isActive) return null;

  const toggleOpen = () => {
    setOpen((v) => !v);
    setUnread(0);
    setError(null);
    // با باز شدن پنل، حباب خوش‌آمدگویی کنار می‌رود
    setWelcomeVisible(false);
  };

  /* کلیک روی «ادامه چت»: حباب بسته و پنجره‌ی کامل چت باز می‌شود */
  const openWelcomeChat = () => {
    setWelcomeVisible(false);
    setUnread(0);
    setError(null);
    setOpen(true);
  };

  /* بستن دستی حباب خوش‌آمدگویی */
  const dismissWelcome = () => setWelcomeVisible(false);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (
      conversationId &&
      value.trim() &&
      Date.now() - lastTypingEmit.current > 1500
    ) {
      lastTypingEmit.current = Date.now();
      socket.emitTyping(conversationId, "visitor");
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setError(null);
    setSending(true);

    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        sender: "visitor",
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "خطا در ارسال پیام");
      }

      if (data.created || !conversationId) {
        // اولین پیام: تاریخچه (خوش‌آمدگویی + این پیام) از سرور خوانده می‌شود
        setConversationId(data.conversationId);
        setTicket(data.ticket ?? null);
        await refreshMessages();
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? (data.message as ChatMessageView) : m))
        );
      }
      socket.emitActivity(data.conversationId, "visitor-message");
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
      setError(e instanceof Error ? e.message : "خطا در ارسال پیام");
    } finally {
      setSending(false);
    }
  };

  const botName = settings?.botName ?? "پشتیبان";
  const botTitle = settings?.botTitle ?? "پشتیبانی آنلاین";
  const botAvatar = settings?.botAvatar ?? "";
  const welcomeText = settings?.welcomeMessage?.trim() ?? "";

  return (
    <div
      dir="ltr"
      className="fixed bottom-4 left-4 z-[45] flex flex-col items-start gap-3"
    >
      {/* — پنل گفتگو — */}
      {open ? (
        <div
          dir="rtl"
          role="dialog"
          aria-label="گفتگوی پشتیبانی آنلاین"
          className="chat-pop flex h-[min(30rem,calc(100dvh-11.5rem))] max-h-[calc(100dvh-11.5rem)] min-h-[22rem] w-[min(22.5rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-border bg-background/95 shadow-2xl shadow-black/25 backdrop-blur-xl dark:border-white/10 dark:bg-[#050b09]/95"
        >
          {/* سربرگ */}
          <div className="flex items-center gap-3 border-b border-border bg-gradient-to-l from-teal-500/10 to-emerald-500/10 px-4 py-3 dark:border-white/[0.08]">
            <BotAvatar src={botAvatar} alt={botName} className="size-11" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-black text-foreground">
                {botName}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                {botTitle}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleOpen}
              aria-label="بستن پنجره چت"
              className="size-9 rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <X className="size-4.5" />
            </Button>
          </div>

          {/* پیام‌ها */}
          <div
            ref={scrollRef}
            aria-live="polite"
            className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-4"
          >
            {!settings ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-teal-600" />
                در حال اتصال...
              </div>
            ) : (
              <>
                {visibleMessages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
                {adminTyping ? <TypingDots /> : null}
              </>
            )}
          </div>

          {/* خطا */}
          {error ? (
            <p className="mx-4 mb-1 rounded-lg bg-red-500/10 px-3 py-1.5 text-[0.7rem] font-semibold text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}

          {/* فرم ارسال */}
          <form
            className="flex items-center gap-2 border-t border-border p-3 dark:border-white/[0.08]"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <label htmlFor="avid-chat-input" className="sr-only">
              متن پیام
            </label>
            <Input
              id="avid-chat-input"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="پیام خود را بنویسید..."
              autoComplete="off"
              maxLength={2000}
              className="h-10 flex-1 rounded-xl bg-foreground/[0.03] text-[0.83rem] dark:bg-white/[0.04]"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sending}
              aria-label="ارسال پیام"
              className="size-10 shrink-0 rounded-xl border-0 bg-gradient-to-l from-teal-400 to-emerald-500 text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:brightness-110 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4 -scale-x-100" />
              )}
            </Button>
          </form>
        </div>
      ) : null}

      {/* — حباب خوش‌آمدگویی خودکار (پنجره‌ی کامل چت باز نمی‌شود) — */}
      {!open && welcomeVisible && welcomeText ? (
        <div className="chat-pop flex w-[min(20rem,calc(100vw-2rem))] flex-col items-start gap-2.5">
          {/* دکمه‌ی «ادامه چت» — بالای حباب، هم‌تراز با دکمه‌ی چت */}
          <button
            type="button"
            dir="rtl"
            onClick={openWelcomeChat}
            className="flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-l from-teal-400 to-emerald-500 px-4 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 focus-visible:ring-offset-2 active:scale-95"
          >
            <MessageCircle className="size-4" strokeWidth={2.4} />
            ادامه چت
          </button>

          {/* حباب حاوی پیام خوش‌آمدگویی */}
          <div
            dir="rtl"
            className="relative w-full rounded-2xl rounded-bl-md border border-border bg-background/95 p-3.5 pl-9 pr-4 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-white/10 dark:bg-[#050b09]/95"
          >
            {/* دنباله‌ی حباب به سمت تصویر پشتیبان (پایین-چپ) */}
            <span
              aria-hidden
              className="absolute -bottom-[6px] left-4 size-3.5 rotate-45 rounded-[3px] border-b border-r border-border bg-background dark:border-white/10 dark:bg-[#050b09]"
            />
            {/* بستن دستی حباب */}
            <button
              type="button"
              onClick={dismissWelcome}
              aria-label="بستن پیام خوش‌آمدگویی"
              className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
            >
              <X className="size-3.5" strokeWidth={2.4} />
            </button>
            <p
              role="status"
              className="max-h-44 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words text-[0.8rem] leading-6 text-foreground"
            >
              {welcomeText}
            </p>
          </div>
        </div>
      ) : null}

      {/* — دکمه شناور ثابت (پایین-چپ، با اسکرول حرکت نمی‌کند): تصویر پروفایل پشتیبان — */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label={open ? "بستن چت پشتیبانی" : "گفتگو با پشتیبانی"}
        className="relative flex size-14 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 focus-visible:ring-offset-2 active:scale-95"
      >
        {!open ? (
          <span
            aria-hidden
            className="absolute -inset-1 animate-ping rounded-full bg-teal-400/30 [animation-duration:2.4s]"
          />
        ) : null}
        <ChatFabAvatar src={botAvatar} alt={botName} open={open} />
        {!open && unread > 0 ? (
          <span className="absolute -end-1 -top-1 z-10 flex min-w-5 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[0.65rem] font-black text-white">
            {unread > 9 ? "۹+" : faDigits(unread)}
          </span>
        ) : null}
      </button>
    </div>
  );
}
