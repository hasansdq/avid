"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Clock,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { ImageUrlField } from "@/components/admin/shared/image-url-field";
import { parseChatAvatarMode, type ChatAvatarMode } from "@/lib/chat";
import { btnGradient, tileGradient } from "@/components/admin/shared/styles";
import type {
  ChatConversationDetail,
  ChatConversationListItem,
  ChatMessage,
  ChatSettings,
} from "@/components/admin/types";
import { faDate, faDigits, faTime } from "@/lib/fa";
import {
  useChatSocket,
  type ActivityEvent,
} from "@/components/chat/use-chat-socket";

/* ------------------------------------------------------------------ */
/*  ابزارهای کمکی                                                      */
/* ------------------------------------------------------------------ */

/** نام نمایشی بازدیدکننده یا «کاربر مهمان» + کد کوتاه */
function visitorLabel(item: {
  displayName: string;
  visitorToken: string;
}): { name: string; code: string } {
  const code = item.visitorToken.slice(-4);
  return {
    name: item.displayName.trim() || "کاربر مهمان",
    code: `#${code}`,
  };
}

/** تاریخ نسبت به اکنون: امروز فقط ساعت، غیر آن تاریخ شمسی */
function smartDate(value: string): string {
  const d = new Date(value);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? faTime(d) : faDate(d);
}

/* ------------------------------------------------------------------ */
/*  حباب پیام (نمای مدیر — پیام مدیر سمت چپ، بازدیدکننده سمت راست)     */
/* ------------------------------------------------------------------ */

function AdminMessageBubble({ message }: { message: ChatMessage }) {
  const isBot = message.sender === "bot";
  const isAdmin = message.sender === "admin";

  return (
    <div className={cn("flex w-full", isAdmin ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.83rem] leading-6 shadow-sm",
          isAdmin
            ? "rounded-bl-md bg-gradient-to-br from-teal-500 to-emerald-600 text-white"
            : isBot
              ? "rounded-br-md border border-violet-500/25 bg-violet-500/[0.07] text-foreground"
              : "rounded-br-md border border-foreground/[0.07] bg-foreground/[0.05] text-foreground dark:border-white/[0.08] dark:bg-white/[0.07]"
        )}
      >
        {isBot ? (
          <span className="mb-1 flex items-center gap-1 text-[0.62rem] font-bold text-violet-600 dark:text-violet-300">
            <Bot className="size-3" />
            پیام خودکار چت‌بات
          </span>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <span
          className={cn(
            "mt-1 block text-left text-[0.6rem] tabular-nums",
            isAdmin ? "text-white/70" : "text-muted-foreground"
          )}
        >
          {faTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  تب گفتگوها — صندوق ورودی                                            */
/* ------------------------------------------------------------------ */

function ConversationsTab() {
  const [list, setList] = useState<ChatConversationListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatConversationDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [visitorTyping, setVisitorTyping] = useState(false);

  const selectedIdRef = useRef<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTypingEmit = useRef(0);

  const refreshList = useCallback(async () => {
    try {
      const data = await apiFetch<ChatConversationListItem[]>(
        "/api/chat/admin/conversations"
      );
      setList(data);
    } catch (error) {
      toastApiError(error);
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    setThreadLoading(true);
    try {
      const data = await apiFetch<ChatConversationDetail>(
        `/api/chat/admin/conversations/${id}`
      );
      setThread(data);
      setList((prev) =>
        prev?.map((c) => (c.id === id ? { ...c, unreadForAdmin: 0 } : c)) ?? prev
      );
    } catch (error) {
      toastApiError(error);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  /* — اتصال بلادرنگ — */

  /** نوسازی لیست با فاصله‌ی کوتاه (جلوگیری از اسپم در پیام‌های پشت‌سرهم) */
  const scheduleListRefresh = useCallback(() => {
    if (listRefreshTimer.current) return;
    listRefreshTimer.current = setTimeout(() => {
      listRefreshTimer.current = null;
      void refreshList();
    }, 400);
  }, [refreshList]);

  const socket = useChatSocket({
    onActivity: (data: ActivityEvent) => {
      scheduleListRefresh();
      if (
        data.conversationId === selectedIdRef.current &&
        data.kind !== "read"
      ) {
        void loadThread(data.conversationId);
      }
    },
    onTyping: (data) => {
      if (data.who !== "visitor") return;
      if (data.conversationId !== selectedIdRef.current) return;
      setVisitorTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setVisitorTyping(false), 3000);
    },
  });

  useEffect(() => {
    socket.subscribeAdmin();
  }, [socket]);

  /* عضویت در اتاق گفتگوی باز */
  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!selectedId) return;
    socket.openConversation(selectedId);
    return () => {
      socket.closeConversation(selectedId);
    };
  }, [selectedId, socket]);

  /* بارگذاری اولیه + polling پشتیبان هنگام قطع سوکت */
  useEffect(() => {
    void refreshList();
    const iv = setInterval(() => {
      if (!socket.isConnected()) void refreshList();
    }, 8000);
    return () => clearInterval(iv);
  }, [refreshList, socket]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (listRefreshTimer.current) clearTimeout(listRefreshTimer.current);
    };
  }, []);

  /* اسکرول به آخرین پیام گفتگو */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length, visitorTyping, selectedId]);

  const totalUnread = useMemo(
    () => (list ?? []).reduce((sum, c) => sum + c.unreadForAdmin, 0),
    [list]
  );

  const handleSelect = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setThread(null);
    setVisitorTyping(false);
    void loadThread(id);
  };

  /** بازگشت به لیست گفتگوها (نمای تک‌ستونی موبایل/تبلت) */
  const backToList = () => {
    setSelectedId(null);
    setThread(null);
    setVisitorTyping(false);
  };

  const handleReplyChange = (value: string) => {
    setReply(value);
    if (
      selectedId &&
      value.trim() &&
      Date.now() - lastTypingEmit.current > 1500
    ) {
      lastTypingEmit.current = Date.now();
      socket.emitTyping(selectedId, "admin");
    }
  };

  const sendReply = async () => {
    const content = reply.trim();
    if (!content || !selectedId || sending) return;
    setSending(true);
    try {
      const data = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/admin/conversations/${selectedId}/messages`,
        { method: "POST", body: JSON.stringify({ content }) }
      );
      setReply("");
      setThread((prev) =>
        prev ? { ...prev, messages: [...prev.messages, data.message] } : prev
      );
      setList((prev) =>
        prev?.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                lastMessageAt: new Date(data.message.createdAt).toISOString(),
                lastMessagePreview: content.slice(0, 120),
              }
            : c
        ) ?? prev
      );
      socket.emitActivity(selectedId, "admin-message");
    } catch (error) {
      toastApiError(error);
    } finally {
      setSending(false);
    }
  };

  const deleteConversation = async (id: string) => {
    await apiFetch(`/api/chat/admin/conversations/${id}`, { method: "DELETE" });
    if (selectedId === id) {
      setSelectedId(null);
      setThread(null);
    }
    await refreshList();
    toast.success("گفتگو حذف شد.");
  };

  const selected = list?.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* — لیست گفتگوها (در نمای تک‌ستونی وقتی گفتگو باز است پنهان) — */}
      <div
        className={cn(
          "glass flex max-h-[560px] flex-col overflow-hidden rounded-2xl lg:max-h-[calc(100vh-16rem)]",
          selectedId ? "hidden lg:flex" : "flex"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-black text-foreground">
            <Inbox className="size-4 text-teal-600 dark:text-teal-300" />
            گفتگوها
            {totalUnread > 0 ? (
              <Badge className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
                {faDigits(totalUnread)} جدید
              </Badge>
            ) : null}
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refreshList()}
            aria-label="نوسازی لیست"
            className="size-8 rounded-lg text-muted-foreground"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {list === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-teal-600" />
              در حال دریافت گفتگوها...
            </div>
          ) : list.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <MessageSquare className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                هنوز هیچ بازدیدکننده‌ای پیامی نفرستاده است.
                <br />
                پیام‌های جدید به‌صورت بلادرنگ اینجا نمایش داده می‌شوند.
              </p>
            </div>
          ) : (
            list.map((c) => {
              const { name, code } = visitorLabel(c);
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  className={cn(
                    "mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition-colors",
                    active
                      ? "bg-teal-500/[0.12] ring-1 ring-teal-500/30"
                      : "hover:bg-foreground/[0.04]"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white",
                      tileGradient,
                      active ? "" : "opacity-80"
                    )}
                  >
                    {name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[0.8rem] font-bold text-foreground">
                        {name}
                        <span className="ms-1 font-mono text-[0.6rem] font-medium text-muted-foreground">
                          {code}
                        </span>
                      </span>
                      <span className="shrink-0 text-[0.62rem] tabular-nums text-muted-foreground">
                        {smartDate(c.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[0.7rem] text-muted-foreground">
                        {c.lastMessagePreview || "بدون پیام"}
                      </span>
                      {c.unreadForAdmin > 0 ? (
                        <span className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[0.6rem] font-black text-white">
                          {faDigits(c.unreadForAdmin)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* — رشته‌ی گفتگوی انتخاب‌شده (در نمای تک‌ستونی فقط وقتی انتخاب شده) — */}
      <div
        className={cn(
          "glass flex max-h-[560px] min-h-[420px] flex-col overflow-hidden rounded-2xl lg:max-h-[calc(100vh-16rem)]",
          selectedId ? "flex" : "hidden lg:flex"
        )}
      >
        {!selectedId || !selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04]">
              <UserRound className="size-7 text-muted-foreground" strokeWidth={1.8} />
            </span>
            <p className="text-sm font-black text-foreground">گفتگویی انتخاب نشده</p>
            <p className="max-w-xs text-xs leading-6 text-muted-foreground">
              از لیست کنار یک گفتگو را انتخاب کنید تا پیام‌های آن بازدیدکننده را
              ببینید و پاسخ دهید.
            </p>
          </div>
        ) : (
          <>
            {/* دکمه بازگشت به لیست — فقط نمای تک‌ستونی موبایل/تبلت */}
            <div className="border-b border-border lg:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={backToList}
                className="h-9 rounded-lg px-3 text-xs font-bold text-teal-700 hover:bg-teal-500/10 dark:text-teal-300"
              >
                <ArrowRight className="size-4" />
                بازگشت به گفتگوها
              </Button>
            </div>

            {/* سربرگ گفتگو */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-xl text-sm font-black text-white",
                  tileGradient
                )}
              >
                {visitorLabel(selected).name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-black text-foreground">
                  {visitorLabel(selected).name}
                  <span className="ms-1 font-mono text-[0.65rem] font-medium text-muted-foreground">
                    {visitorLabel(selected).code}
                  </span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                  <Clock className="size-3" />
                  شروع گفتگو: {faDate(selected.createdAt)}
                </p>
              </div>
              <ConfirmDelete
                title="حذف گفتگو"
                description="این گفتگو و همه‌ی پیام‌های آن برای همیشه حذف می‌شود. مطمئن هستید؟"
                onConfirm={() => deleteConversation(selected.id)}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف گفتگو"
                  title="حذف گفتگو"
                  className="size-9 rounded-lg text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </Button>
              </ConfirmDelete>
            </div>

            {/* پیام‌ها */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-2.5 overflow-y-auto p-4"
              aria-live="polite"
            >
              {threadLoading || !thread ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-teal-600" />
                  در حال دریافت پیام‌ها...
                </div>
              ) : thread.messages.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  این گفتگو پیامی ندارد.
                </p>
              ) : (
                thread.messages.map((m) => (
                  <AdminMessageBubble key={m.id} message={m} />
                ))
              )}

              {visitorTyping ? (
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
              ) : null}
            </div>

            {/* فرم پاسخ */}
            <form
              className="flex items-center gap-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void sendReply();
              }}
            >
              <label htmlFor="admin-chat-reply" className="sr-only">
                متن پاسخ
              </label>
              <Input
                id="admin-chat-reply"
                value={reply}
                onChange={(e) => handleReplyChange(e.target.value)}
                placeholder="پاسخ خود را بنویسید..."
                autoComplete="off"
                maxLength={2000}
                className="h-10 flex-1 rounded-xl bg-foreground/[0.03] text-[0.83rem] dark:bg-white/[0.04]"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!reply.trim() || sending}
                aria-label="ارسال پاسخ"
                className={cn(
                  "size-10 shrink-0 rounded-xl",
                  btnGradient
                )}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4 -scale-x-100" />
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  انتخاب نحوه‌ی نمایش تصویر پروفایل چت‌بات (دو حالت)                 */
/* ------------------------------------------------------------------ */

function AvatarModeSelector({
  mode,
  avatar,
  onChange,
}: {
  mode: ChatAvatarMode;
  avatar: string;
  onChange: (mode: ChatAvatarMode) => void;
}) {
  const options: Array<{
    value: ChatAvatarMode;
    title: string;
    description: string;
  }> = [
    {
      value: "circle",
      title: "حالت دایره‌ای",
      description:
        "همان نمایش کنونی: تصویر با برش مربع ۱:۱ داخل قاب دایره‌ای با حاشیه و سایه نمایش داده می‌شود.",
    },
    {
      value: "custom",
      title: "حالت دلخواه",
      description:
        "تصویر آزاد و بدون قاب: بدون استروک، حاشیه و سایه؛ بدون برش ۱:۱ — اگر تصویر بزرگ باشد فقط ارتفاع به اندازه‌ی پروفایل تنظیم می‌شود و عرض اصل تصویر تغییر نمی‌کند؛ پس‌زمینه‌ی شفاف همان‌گونه شفاف می‌ماند.",
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="نحوه‌ی نمایش تصویر پروفایل چت‌بات"
      className="grid gap-3 sm:grid-cols-2"
    >
      {options.map((opt) => {
        const selected = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex flex-col gap-3 rounded-xl border p-4 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60",
              selected
                ? "border-teal-500/60 bg-teal-500/[0.06] shadow-md shadow-teal-500/10"
                : "border-border bg-foreground/[0.02] hover:border-foreground/25"
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-black text-foreground">
                {opt.title}
              </span>
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  selected ? "border-teal-500 bg-teal-500" : "border-muted-foreground/40"
                )}
                aria-hidden
              >
                {selected ? (
                  <span className="size-1.5 rounded-full bg-white" />
                ) : null}
              </span>
            </span>
            {/* پیش‌نمایش مصورِ همان حالت با تصویر فعلی چت‌بات */}
            <span className="flex h-14 items-end gap-2">
              {opt.value === "circle" ? (
                avatar.trim() ? (
                  <img
                    src={avatar.trim()}
                    alt=""
                    className="size-14 rounded-full border-2 border-background object-cover shadow-xl shadow-black/25"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 shadow-xl shadow-teal-500/30">
                    <MessageSquare className="size-6 text-teal-950" strokeWidth={2.2} />
                  </span>
                )
              ) : avatar.trim() ? (
                <img
                  src={avatar.trim()}
                  alt=""
                  className="block h-auto max-h-14 w-auto select-none"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              ) : (
                <span className="text-[0.65rem] font-bold leading-5 text-muted-foreground">
                  (بدون تصویر — دکمه‌ی دایره‌ای پیش‌فرض سایت نمایش داده می‌شود)
                </span>
              )}
            </span>
            <span className="text-[0.68rem] leading-5 text-muted-foreground">
              {opt.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  تب تنظیمات چت‌بات                                                   */
/* ------------------------------------------------------------------ */

interface ChatSettingsDraft {
  botName: string;
  botTitle: string;
  botAvatar: string;
  botAvatarMode: ChatAvatarMode;
  welcomeMessage: string;
  autoOpen: boolean;
  isActive: boolean;
}

function toDraft(s: ChatSettings): ChatSettingsDraft {
  return {
    botName: s.botName,
    botTitle: s.botTitle,
    botAvatar: s.botAvatar,
    botAvatarMode: parseChatAvatarMode(s.botAvatarMode),
    welcomeMessage: s.welcomeMessage,
    autoOpen: s.autoOpen,
    isActive: s.isActive,
  };
}

function BotSettingsTab() {
  const [draft, setDraft] = useState<ChatSettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const settings = await apiFetch<ChatSettings>("/api/chat/admin/settings");
        setDraft(toDraft(settings));
      } catch (error) {
        toastApiError(error);
      }
    })();
  }, []);

  if (!draft) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-teal-600" />
        در حال دریافت تنظیمات چت‌بات...
      </div>
    );
  }

  const set = (patch: Partial<ChatSettingsDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await apiFetch<ChatSettings>("/api/chat/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          botName: draft.botName.trim(),
          botTitle: draft.botTitle.trim(),
          botAvatar: draft.botAvatar.trim(),
          botAvatarMode: draft.botAvatarMode,
          welcomeMessage: draft.welcomeMessage.trim(),
          autoOpen: draft.autoOpen,
          isActive: draft.isActive,
        }),
      });
      setDraft(toDraft(saved));
      toast.success("تنظیمات چت‌بات ذخیره شد.");
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      {/* — فرم تنظیمات — */}
      <div className="glass space-y-6 rounded-2xl p-5 sm:p-6">
        <ImageUrlField
          id="chat-bot-avatar"
          label="تصویر پروفایل چت‌بات"
          value={draft.botAvatar}
          onChange={(v) => set({ botAvatar: v })}
          section="chat"
          hint="آدرس تصویر (داخلی مثل /images/chat/bot-avatar.png یا لینک خارجی). این تصویر روی دکمه‌ی شناور چت سایت و سربرگ پنجره‌ی چت نمایش داده می‌شود و با تغییر آن، دکمه‌ی چت سایت هم به‌روز می‌شود. تصویر پیش‌فرض: بیزینس‌من حرفه‌ای. نحوه‌ی نمایش تصویر (دایره‌ای یا دلخواه) در گزینه‌ی پایین این فیلد تعیین می‌شود."
          previewClassName="size-20 rounded-2xl"
          previewAlt="پروفایل چت‌بات"
        />

        {/* — نحوه‌ی نمایش تصویر پروفایل (دو حالت) — */}
        <div className="space-y-2">
          <Label>نحوه‌ی نمایش تصویر پروفایل چت‌بات</Label>
          <AvatarModeSelector
            mode={draft.botAvatarMode}
            avatar={draft.botAvatar}
            onChange={(m) => set({ botAvatarMode: m })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="chat-bot-name">نام چت‌بات</Label>
            <Input
              id="chat-bot-name"
              value={draft.botName}
              onChange={(e) => set({ botName: e.target.value })}
              placeholder="پشتیبان آوید"
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chat-bot-title">عنوان / سمت</Label>
            <Input
              id="chat-bot-title"
              value={draft.botTitle}
              onChange={(e) => set({ botTitle: e.target.value })}
              placeholder="پشتیبانی آکادمی آوید"
              maxLength={80}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="chat-welcome">پیام خوش‌آمدگویی</Label>
          <Textarea
            id="chat-welcome"
            value={draft.welcomeMessage}
            onChange={(e) => set({ welcomeMessage: e.target.value })}
            placeholder="سلام 👋 به آکادمی آوید خوش آمدید..."
            rows={5}
            maxLength={1000}
            className="leading-7"
          />
          <p className="text-[0.7rem] leading-5 text-muted-foreground">
            این پیام به‌صورت خودکار در حباب خوش‌آمدگویی بالای دکمه‌ی چت نمایش داده
            می‌شود و با اولین پیام کاربر در تاریخچه ذخیره می‌شود. (حداکثر ۱۰۰۰ کاراکتر)
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-foreground/[0.02] px-4 py-3">
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold text-foreground">نمایش خودکار خوش‌آمدگویی</p>
              <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                حباب پیام خوش‌آمدگویی (نه پنجره‌ی کامل چت) هنگام ورود بازدیدکننده
                نمایش داده شود — برای هر IP یک بار در شبانه‌روز
              </p>
            </div>
            <Switch
              checked={draft.autoOpen}
              onCheckedChange={(v) => set({ autoOpen: v })}
              aria-label="نمایش خودکار خوش‌آمدگویی"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-foreground/[0.02] px-4 py-3">
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold text-foreground">فعال بودن چت</p>
              <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                در صورت خاموش بودن، دکمه‌ی چت از سایت حذف می‌شود
              </p>
            </div>
            <Switch
              checked={draft.isActive}
              onCheckedChange={(v) => set({ isActive: v })}
              aria-label="فعال بودن چت"
            />
          </div>
        </div>

        <div className="flex justify-start border-t border-border pt-4">
          <Button
            onClick={() => void save()}
            disabled={saving}
            className={cn("h-10 rounded-xl px-6", btnGradient)}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            ذخیره تنظیمات
          </Button>
        </div>
      </div>

      {/* — پیش‌نمایش چت‌بات — */}
      <div className="glass h-fit rounded-2xl p-5">
        <p className="mb-4 text-xs font-black text-muted-foreground">
          پیش‌نمایش ویجت چت برای بازدیدکننده
        </p>
        <div
          dir="rtl"
          className="overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        >
          <div className="flex items-center gap-3 border-b border-border bg-gradient-to-l from-teal-500/10 to-emerald-500/10 px-3 py-2.5">
            {draft.botAvatar.trim() ? (
              draft.botAvatarMode === "custom" ? (
                <img
                  src={draft.botAvatar.trim()}
                  alt={draft.botName || "چت‌بات"}
                  className="block h-auto max-h-9 w-auto select-none"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <img
                  src={draft.botAvatar.trim()}
                  alt={draft.botName || "چت‌بات"}
                  className="size-9 rounded-xl border border-foreground/10 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )
            ) : (
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600">
                <Bot className="size-4 text-teal-950" />
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-black text-foreground">
                {draft.botName || "چت‌بات"}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[0.62rem] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {draft.botTitle || "پشتیبانی آنلاین"}
              </p>
            </div>
          </div>
          <div className="space-y-2 p-3">
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-br-md border border-foreground/[0.07] bg-foreground/[0.05] px-3 py-2 text-[0.75rem] leading-6 text-foreground dark:border-white/[0.08] dark:bg-white/[0.07]">
                <p className="whitespace-pre-wrap break-words">
                  {draft.welcomeMessage || "پیام خوش‌آمدگویی..."}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[70%] rounded-2xl rounded-bl-md bg-gradient-to-br from-teal-500 to-emerald-600 px-3 py-2 text-[0.75rem] leading-6 text-white">
                سلام، وقتتون بخیر! 👋
              </div>
            </div>
          </div>
        </div>
        {/* — پیش‌نمایش دکمه‌ی شناور (پایین صفحات سایت) در حالتِ انتخابی — */}
        <div className="mt-5 rounded-2xl border border-border bg-foreground/[0.02] p-4">
          <p className="mb-3 text-[0.65rem] font-black text-muted-foreground">
            پیش‌نمایش دکمه‌ی شناور (پایین صفحات سایت)
          </p>
          <div dir="ltr" className="flex items-end gap-3">
            {draft.botAvatar.trim() ? (
              draft.botAvatarMode === "custom" ? (
                <img
                  src={draft.botAvatar.trim()}
                  alt=""
                  className="block h-auto max-h-14 w-auto select-none"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              ) : (
                <img
                  src={draft.botAvatar.trim()}
                  alt=""
                  className="size-14 rounded-full border-2 border-background object-cover shadow-xl shadow-black/25"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              )
            ) : (
              <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 shadow-xl shadow-teal-500/30">
                <MessageSquare className="size-6 text-teal-950" strokeWidth={2.2} />
              </span>
            )}
            <span className="text-[0.62rem] leading-4 text-muted-foreground">
              {draft.botAvatarMode === "custom"
                ? "حالت دلخواه: تصویر بدون قاب/سایه/برش — ارتفاع حداکثر اندازه‌ی پروفایل، عرض اصل تصویر"
                : "حالت دایره‌ای: قاب دایره‌ای ۱:۱ با حاشیه و سایه"}
            </span>
          </div>
        </div>
        <p className="mt-3 text-[0.65rem] leading-5 text-muted-foreground">
          پاسخ‌های شما از تب «گفتگوها» به‌صورت بلادرنگ برای کاربر ارسال می‌شود.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ماژول اصلی                                                          */
/* ------------------------------------------------------------------ */

export function ChatModule() {
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="مدیریت چت"
        description="گفتگوهای بلادرنگ با بازدیدکنندگان سایت + پیکربندی چت‌بات پشتیبانی"
      />

      <Tabs defaultValue="conversations" dir="rtl">
        <TabsList className="h-11 rounded-xl p-1">
          <TabsTrigger value="conversations" className="rounded-lg px-4 text-xs font-bold">
            گفتگوها
          </TabsTrigger>
          <TabsTrigger value="bot" className="rounded-lg px-4 text-xs font-bold">
            تنظیمات چت‌بات
          </TabsTrigger>
        </TabsList>
        <TabsContent value="conversations" className="mt-4">
          <ConversationsTab />
        </TabsContent>
        <TabsContent value="bot" className="mt-4">
          <BotSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
