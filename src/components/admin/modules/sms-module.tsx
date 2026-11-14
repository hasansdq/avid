"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  MessageSquare,
  PlugZap,
  RefreshCw,
  Save,
  ScrollText,
  Search,
  Send,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ApiError, apiFetch, toastApiError } from "@/components/admin/api";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import { btnGradient, tileGradient } from "@/components/admin/shared/styles";
import type { SmsLog, SmsSettings } from "@/components/admin/types";
import { faDate, faDigits, faTime } from "@/lib/fa";

/* ------------------------------------------------------------------ */
/*  ثابت‌ها و انواع محلی                                               */
/* ------------------------------------------------------------------ */

const MAX_SMS_CHARS = 450;

/** پیش‌نویس تنظیمات پیامک (همه‌چیز رشته؛ هنگام ذخیره فقط تغییرات ارسال می‌شود) */
interface SmsDraft {
  provider: string;
  username: string;
  password: string;
  apiKey: string;
  consoleApiKey: string;
  fromNumber: string;
  otpBodyId: string;
  signature: string;
}

function toDraft(s: SmsSettings): SmsDraft {
  return {
    provider: s.provider,
    username: s.username,
    password: s.password,
    apiKey: s.apiKey,
    consoleApiKey: s.consoleApiKey,
    fromNumber: s.fromNumber,
    otpBodyId: s.otpBodyId,
    signature: s.signature,
  };
}

const PROVIDER_LABELS: Record<string, string> = {
  none: "غیرفعال (حالت نمایشی)",
  rest: "وب‌سرویس REST (پیشنهادی)",
  console: "کنسول ملی پیامک",
};

/** پاسخ POST /api/admin/sms-test */
interface SmsTestResponse {
  ok: boolean;
  delivered: boolean;
  provider: string;
  recId?: string;
  response: string;
  error?: string;
}

/** پاسخ POST /api/admin/sms-send */
interface SmsSendResponse {
  ok: boolean;
  sent: number;
  failed: number;
}

/** پاسخ GET /api/admin/sms-logs */
interface SmsLogsResponse {
  logs: SmsLog[];
  total: number;
  page: number;
  pageCount: number;
}

/** انواع پیامک (kind) */
const SMS_KINDS: Record<string, { label: string; badge: string }> = {
  manual: {
    label: "دستی",
    badge:
      "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300",
  },
  otp: {
    label: "کد تایید",
    badge:
      "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
  },
  test: {
    label: "آزمایشی",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
  system: {
    label: "سیستمی",
    badge:
      "border-foreground/15 bg-foreground/5 text-muted-foreground",
  },
};

/** سرویس ارسال (provider) */
const SMS_PROVIDER_LABELS: Record<string, string> = {
  rest: "وب‌سرویس",
  console: "کنسول",
  none: "—",
};

/** وضعیت ارسال */
const SMS_STATUS: Record<string, { label: string; badge: string }> = {
  sent: {
    label: "ارسال‌شده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  failed: {
    label: "ناموفق",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
  pending: {
    label: "در انتظار",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
};

/** کوتاه‌کردن متن با نشان ادامه */
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* ------------------------------------------------------------------ */
/*  تب ۱ — تنظیمات اتصال (ملی پیامک)                                   */
/* ------------------------------------------------------------------ */

function SettingsTab() {
  const [settings, setSettings] = useState<SmsSettings | null>(null);
  const [draft, setDraft] = useState<SmsDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* — تست اتصال — */
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SmsTestResponse | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ settings: SmsSettings }>(
        "/api/admin/sms-settings"
      );
      setSettings(data.settings);
      setDraft(toDraft(data.settings));
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const set = (patch: Partial<SmsDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  /** ذخیره — فقط فیلدهای تغییریافته ارسال می‌شوند */
  async function save() {
    if (!draft || !settings) return;
    const original = toDraft(settings);

    const next = draft.provider;
    if (next !== "none" && !/^\d{8,15}$/.test(draft.fromNumber.trim())) {
      toast.error("شماره‌ی خط فرستنده باید ۸ تا ۱۵ رقم باشد.");
      return;
    }
    if (
      next === "rest" &&
      !(
        draft.username.trim() &&
        (draft.password.trim() || draft.apiKey.trim())
      )
    ) {
      toast.error(
        "برای وب‌سرویس REST، نام کاربری و رمز عبور (یا کلید API) الزامی است."
      );
      return;
    }
    if (next === "console" && !draft.consoleApiKey.trim()) {
      toast.error("برای کنسول ملی پیامک، کلید API کنسول الزامی است.");
      return;
    }

    const payload: Record<string, string> = {};
    for (const key of Object.keys(original) as (keyof SmsDraft)[]) {
      if (draft[key] !== original[key]) payload[key] = draft[key].trim();
    }
    if (Object.keys(payload).length === 0) {
      toast.info("تغییری برای ذخیره وجود ندارد.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/admin/sms-settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast.success("تنظیمات پیامکی ذخیره شد");
      await fetchSettings();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  /** ارسال پیامک آزمایشی */
  async function runTest() {
    const phone = testPhone.replace(/[\s-]/g, "");
    if (!/^09\d{9}$/.test(phone)) {
      toast.error("شماره موبایل معتبر نیست (مثال: 09123456789).");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch<SmsTestResponse>("/api/admin/sms-test", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setTestResult(res);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        toast.warning(error.message);
      } else {
        toastApiError(error);
      }
    } finally {
      setTesting(false);
    }
  }

  if (loading || !draft) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-teal-600" />
        در حال دریافت تنظیمات پیامک...
      </div>
    );
  }

  const connected = settings && settings.provider !== "none";

  return (
    <div className="space-y-6">
      {/* — وضعیت فعلی اتصال — */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.65rem] font-black text-muted-foreground">
          وضعیت:
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
            connected
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
          )}
        >
          {connected ? (
            <PlugZap className="size-3.5" />
          ) : (
            <XCircle className="size-3.5" />
          )}
          {connected
            ? `متصل: ${settings?.provider === "rest" ? "وب‌سرویس REST" : "کنسول ملی پیامک"}`
            : "عدم اتصال (حالت نمایشی)"}
        </span>
        {settings ? (
          <span className="text-[0.65rem] font-medium text-muted-foreground">
            آخرین ذخیره: {faDate(settings.updatedAt)}
          </span>
        ) : null}
      </div>

      {/* — راهنمای اتصال — */}
      <section className="glass space-y-3 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tileGradient} shadow-lg shadow-teal-500/20`}
          >
            <Info className="size-5 text-white" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-foreground">
              راهنمای اتصال به ملی پیامک
            </h3>
            <p className="text-xs text-muted-foreground">
              مراحل دریافت کلید و راه‌اندازی وب‌سرویس
            </p>
          </div>
        </div>
        <ol className="space-y-1.5 pr-1 text-xs leading-6 text-muted-foreground">
          <li>
            ۱) روش «وب‌سرویس REST»: در پنل ملی پیامک (payamak-panel.com) وارد
            بخش «تنظیمات وب‌سرویس» شوید؛ نام کاربری پنل + رمز عبور یا «کلید
            API» مخصوص وب‌سرویس را وارد کنید (طبق مستندات رسمی، کلید API
            جایگزین رمز عبور می‌شود).
          </li>
          <li>
            ۲) روش «کنسول ملی پیامک»: در کنسول
            (console.melipayamak.com) وارد «حساب کاربری» شوید و توکن را
            دریافت کنید؛ سپس توکن را در فیلد کلید کنسول وارد کنید.
          </li>
          <li>
            ۳) شماره‌ی خط فرستنده را از بخش خطوط پنل کپی کنید (مثال:{" "}
            <span dir="ltr" className="font-bold tabular-nums">
              5000404611
            </span>
            ).
          </li>
          <li>
            ۴) برای OTP خدماتی (ارسال به لیست سیاه مخابرات)، شناسه‌ی پترن
            (BodyId) تاییدشده‌ی خود را وارد کنید؛ اگر خالی بماند، OTP با
            متد رسمی SendOTP (REST) یا ارسال ساده (کنسول) فرستاده می‌شود.
          </li>
        </ol>
        <p className="rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] px-3.5 py-2.5 text-[0.65rem] font-semibold leading-5 text-muted-foreground dark:border-white/[0.07] dark:bg-white/[0.02]">
          مستندات رسمی وب‌سرویس REST:{" "}
          <span dir="ltr" className="font-bold">
            docs.payamak-panel.com
          </span>{" "}
          — مستندات کنسول پس از ورود در
          <span dir="ltr" className="font-bold">
            {" "}console.melipayamak.com
          </span>{" "}
          قابل مشاهده است.
        </p>
      </section>

      {/* — فرم تنظیمات — */}
      <section className="glass space-y-5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tileGradient} shadow-lg shadow-teal-500/20`}
          >
            <PlugZap className="size-5 text-white" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-foreground">
              تنظیمات اتصال
            </h3>
            <p className="text-xs text-muted-foreground">
              روش اتصال و کلیدهای ملی پیامک — پس از ذخیره، اتصال را تست کنید
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-black text-foreground/90">
            روش اتصال
          </Label>
          <Select
            value={draft.provider}
            onValueChange={(v) => {
              if (v === "") return;
              set({ provider: v });
            }}
            dir="rtl"
          >
            <SelectTrigger className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm dark:bg-white/[0.04]">
              <span className="truncate">
                {PROVIDER_LABELS[draft.provider] ?? "روش اتصال را انتخاب کنید"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">غیرفعال (حالت نمایشی)</SelectItem>
              <SelectItem value="rest">وب‌سرویس REST (پیشنهادی)</SelectItem>
              <SelectItem value="console">کنسول ملی پیامک</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {draft.provider === "rest" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sms-username" className="text-xs font-black text-foreground/90">
                نام کاربری پنل
              </Label>
              <Input
                id="sms-username"
                value={draft.username}
                onChange={(e) => set({ username: e.target.value.trim() })}
                dir="ltr"
                placeholder="username"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sms-password" className="text-xs font-black text-foreground/90">
                رمز عبور پنل (یا کلید API وب‌سرویس)
              </Label>
              <Input
                id="sms-password"
                type="password"
                value={draft.password}
                onChange={(e) => set({ password: e.target.value })}
                dir="ltr"
                placeholder="••••••••"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
              <p className="text-[0.65rem] leading-5 text-muted-foreground">
                طبق مستندات رسمی، رمز عبور پنل یا «کلید API» تولیدشده در بخش
                تنظیمات وب‌سرویس — اگر حساب شما کلید API دارد، استفاده از همان
                کلید الزامی است.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sms-api-key" className="text-xs font-black text-foreground/90">
                کلید API (اختیاری — جایگزین رمز عبور)
              </Label>
              <Input
                id="sms-api-key"
                type="password"
                value={draft.apiKey}
                onChange={(e) => set({ apiKey: e.target.value.trim() })}
                dir="ltr"
                placeholder="••••••••"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
              <p className="text-[0.65rem] leading-5 text-muted-foreground">
                پنل ملی پیامک ← تنظیمات وب‌سرویس ← کلید API — نام کاربری همچنان
                لازم است؛ این کلید فقط جایگزین رمز عبور می‌شود.
              </p>
            </div>
          </div>
        )}

        {draft.provider === "console" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sms-console-key" className="text-xs font-black text-foreground/90">
                کلید API کنسول
              </Label>
              <Input
                id="sms-console-key"
                type="password"
                value={draft.consoleApiKey}
                onChange={(e) => set({ consoleApiKey: e.target.value.trim() })}
                dir="ltr"
                placeholder="••••••••"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
              <p className="text-[0.65rem] leading-5 text-muted-foreground">
                console.melipayamak.com ← حساب کاربری ← توکن/API Key
              </p>
            </div>
          </div>
        )}

        {draft.provider !== "none" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sms-from" className="text-xs font-black text-foreground/90">
                شماره‌ی خط فرستنده
              </Label>
              <Input
                id="sms-from"
                value={draft.fromNumber}
                onChange={(e) => set({ fromNumber: e.target.value.replace(/[^\d]/g, "") })}
                inputMode="numeric"
                dir="ltr"
                placeholder="5000404611"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sms-otp" className="text-xs font-black text-foreground/90">
              شناسه‌ی پترن OTP — BodyId (اختیاری)
            </Label>
            <Input
              id="sms-otp"
              value={draft.otpBodyId}
              onChange={(e) => set({ otpBodyId: e.target.value.replace(/[^\d]/g, "") })}
              inputMode="numeric"
              dir="ltr"
              placeholder="12345"
              className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms-signature" className="text-xs font-black text-foreground/90">
              امضای پیامک‌ها (اختیاری)
            </Label>
            <Input
              id="sms-signature"
              value={draft.signature}
              onChange={(e) => set({ signature: e.target.value })}
              placeholder="مثلاً: آکادمی آوید"
              className="h-11 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button
            onClick={save}
            disabled={saving}
            className={`h-10 rounded-xl px-6 text-xs ${btnGradient}`}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال ذخیره...
              </>
            ) : (
              <>
                <Save className="size-4" />
                ذخیره‌ی تنظیمات
              </>
            )}
          </Button>
        </div>
      </section>

      {/* — تست اتصال — */}
      <section className="glass space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tileGradient} shadow-lg shadow-teal-500/20`}
          >
            <Send className="size-5 text-white" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-foreground">تست اتصال</h3>
            <p className="text-xs text-muted-foreground">
              یک پیامک آزمایشی به شماره‌ی خودتان ارسال کنید تا از اتصال مطمئن
              شوید.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            placeholder="09123456789"
            aria-label="شماره موبایل برای تست"
            className="h-11 flex-1 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
          />
          <Button
            onClick={runTest}
            disabled={testing}
            className={`h-11 rounded-xl px-6 text-xs ${btnGradient}`}
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال ارسال...
              </>
            ) : (
              <>
                <Send className="size-4" />
                ارسال پیامک آزمایشی
              </>
            )}
          </Button>
        </div>

        {testResult ? (
          <div className="space-y-3 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] p-4 dark:border-white/[0.07] dark:bg-white/[0.02]">
            <div className="flex flex-wrap items-center gap-2">
              {testResult.delivered ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
                    SMS_STATUS.sent.badge
                  )}
                >
                  <CheckCircle2 className="size-3.5" />
                  پیامک تحویل شد
                </span>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
                    SMS_STATUS.failed.badge
                  )}
                >
                  <XCircle className="size-3.5" />
                  پیامک تحویل نشد
                </span>
              )}
              {testResult.recId ? (
                <span className="text-xs font-bold tabular-nums text-muted-foreground">
                  شناسه‌ی رسالت: {faDigits(testResult.recId)}
                </span>
              ) : null}
            </div>

            {testResult.error ? (
              <p className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs font-semibold leading-5 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {testResult.error}
              </p>
            ) : null}

            {testResult.response ? (
              <div className="space-y-1.5">
                <p className="text-[0.65rem] font-black text-muted-foreground">
                  پاسخ سرویس:
                </p>
                <pre
                  dir="ltr"
                  className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 text-left font-mono text-[0.65rem] leading-5 text-foreground"
                >
                  {testResult.response}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  تب ۲ — ارسال پیامک                                                 */
/* ------------------------------------------------------------------ */

function SendTab() {
  const [targets, setTargets] = useState<"one" | "all-users">("one");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const bodyText = text.trim();
    if (bodyText.length < 2) {
      toast.error("متن پیامک باید دست‌کم ۲ نویسه باشد.");
      return;
    }

    const body: Record<string, unknown> = { text: bodyText, targets };
    if (targets === "one") {
      const cleaned = phone.replace(/[\s-]/g, "");
      if (!/^09\d{9}$/.test(cleaned)) {
        toast.error("شماره موبایل معتبر نیست (مثال: 09123456789).");
        return;
      }
      body.phone = cleaned;
    }

    setSending(true);
    try {
      const res = await apiFetch<SmsSendResponse>("/api/admin/sms-send", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const message = `${faDigits(res.sent)} پیامک ارسال شد${
        res.failed ? ` — ${faDigits(res.failed)} ناموفق` : ""
      }`;
      if (res.sent === 0 && res.failed > 0) toast.error(message);
      else toast.success(message);
      setText("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        toast.warning(error.message);
      } else {
        toastApiError(error);
      }
    } finally {
      setSending(false);
    }
  }

  const counterClass =
    text.length > MAX_SMS_CHARS - 50
      ? "text-amber-600 dark:text-amber-300"
      : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <section className="glass space-y-5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tileGradient} shadow-lg shadow-teal-500/20`}
          >
            <MessageSquare className="size-5 text-white" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-foreground">
              ارسال پیامک دستی
            </h3>
            <p className="text-xs text-muted-foreground">
              ارسال متن دلخواه به یک شماره یا همه‌ی کاربران فعال سایت
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-black text-foreground/90">
              گیرندگان
            </Label>
            <Select
              value={targets}
              onValueChange={(v) => {
                if (v === "") return;
                setTargets(v as "one" | "all-users");
              }}
              dir="rtl"
            >
              <SelectTrigger className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm dark:bg-white/[0.04]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one">یک شماره مشخص</SelectItem>
                <SelectItem value="all-users">همه‌ی کاربران فعال</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targets === "one" ? (
            <div className="space-y-2">
              <Label htmlFor="send-phone" className="text-xs font-black text-foreground/90">
                شماره موبایل گیرنده
              </Label>
              <Input
                id="send-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                dir="ltr"
                placeholder="09123456789"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="send-text" className="text-xs font-black text-foreground/90">
            متن پیامک
          </Label>
          <Textarea
            id="send-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_SMS_CHARS}
            rows={5}
            placeholder="متن پیامک خود را بنویسید..."
            aria-describedby="send-counter"
            className="rounded-xl bg-foreground/[0.03] text-sm leading-7 dark:bg-white/[0.04]"
          />
          <p
            id="send-counter"
            dir="ltr"
            className={cn(
              "text-left text-[0.65rem] font-bold tabular-nums",
              counterClass
            )}
          >
            {faDigits(text.length)}/{faDigits(MAX_SMS_CHARS)}
          </p>
        </div>

        <div className="flex items-center justify-end">
          <Button
            onClick={send}
            disabled={sending}
            className={`h-10 rounded-xl px-6 text-xs ${btnGradient}`}
          >
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال ارسال...
              </>
            ) : (
              <>
                <Send className="size-4" />
                ارسال پیامک
              </>
            )}
          </Button>
        </div>
      </section>

      <p className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-[0.7rem] font-semibold leading-6 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
        <Users className="mt-0.5 size-4 shrink-0" />
        ارسال به همه‌ی کاربران، حداکثر ۵۰۰ شماره‌ی فعال را در بر می‌گیرد.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  تب ۳ — گزارش ارسال                                                 */
/* ------------------------------------------------------------------ */

function LogsTab() {
  const [logs, setLogs] = useState<SmsLog[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);

  const [kind, setKind] = useState("all");
  const [phone, setPhone] = useState("");
  const [phoneQuery, setPhoneQuery] = useState("");

  /* — جست‌وجوی شماره با تأخیر — */
  useEffect(() => {
    const t = setTimeout(() => {
      setPhoneQuery(phone.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [phone]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      if (kind !== "all") params.set("kind", kind);
      if (phoneQuery) params.set("phone", phoneQuery);
      const data = await apiFetch<SmsLogsResponse>(
        `/api/admin/sms-logs?${params.toString()}`
      );
      setLogs(data.logs);
      setTotal(data.total);
      setPageCount(data.pageCount);
      if (data.logs.length === 0 && data.page > data.pageCount) {
        setPage(data.pageCount);
      }
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, [page, kind, phoneQuery]);

  useEffect(() => {
    load();
  }, [load]);

  function changeKind(next: string) {
    setKind(next);
    setPage(1);
  }

  const showSkeleton = loading && !logs;
  const showEmpty = !showSkeleton && logs !== null && logs.length === 0;

  return (
    <div className="space-y-6">
      {/* — فیلترها — */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="جستجوی شماره موبایل..."
            aria-label="جستجوی شماره در گزارش"
            inputMode="tel"
            dir="ltr"
            className="h-11 rounded-xl bg-foreground/[0.03] pr-10 text-left text-sm dark:bg-white/[0.04]"
          />
        </div>
        <Select
          value={kind}
          onValueChange={(v) => {
            if (v === "") return;
            changeKind(v);
          }}
          dir="rtl"
        >
          <SelectTrigger
            aria-label="فیلتر نوع پیامک"
            className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm sm:w-44 dark:bg-white/[0.04]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه‌ی انواع</SelectItem>
            <SelectItem value="manual">دستی</SelectItem>
            <SelectItem value="otp">کد تایید</SelectItem>
            <SelectItem value="test">آزمایشی</SelectItem>
            <SelectItem value="system">سیستمی</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => load()}
          disabled={loading}
          aria-label="به‌روزرسانی گزارش"
          title="به‌روزرسانی"
          className="h-11 rounded-xl px-4 font-bold"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          <span className="sm:hidden">به‌روزرسانی</span>
        </Button>
      </div>

      {showSkeleton ? (
        <>
          <div className="hidden md:block">
            <TableSkeleton rows={6} cols={8} />
          </div>
          <div className="space-y-3 md:hidden" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass h-32 animate-pulse rounded-2xl" />
            ))}
          </div>
        </>
      ) : showEmpty ? (
        <EmptyState
          icon={MessageSquare}
          title="پیامکی ارسال نشده است"
          description={
            phoneQuery || kind !== "all"
              ? "با این فیلتر پیامکی ثبت نشده؛ فیلتر دیگری را امتحان کنید."
              : "هنوز از پنل پیامکی ارسالی ثبت نشده است."
          }
        />
      ) : logs ? (
        <>
          {/* — جدول دسکتاپ — */}
          <div className="glass hidden overflow-hidden rounded-2xl md:block">
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>شماره</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>سرویس</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>شناسه رسالت</TableHead>
                    <TableHead>متن</TableHead>
                    <TableHead>پاسخ سرویس</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const kindMeta =
                      log.kind in SMS_KINDS ? SMS_KINDS[log.kind] : null;
                    const statusMeta =
                      log.status in SMS_STATUS ? SMS_STATUS[log.status] : null;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {faDate(log.createdAt)}
                          </span>
                          <span className="mt-0.5 block text-[0.6rem] font-semibold tabular-nums text-muted-foreground">
                            {faTime(log.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell dir="ltr" className="text-left">
                          <span className="text-xs font-semibold tabular-nums text-foreground">
                            {faDigits(log.phone)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {kindMeta ? (
                            <span
                              className={cn(
                                "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                                kindMeta.badge
                              )}
                            >
                              {kindMeta.label}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {SMS_PROVIDER_LABELS[log.provider] ?? "—"}
                        </TableCell>
                        <TableCell>
                          {statusMeta ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                                statusMeta.badge
                              )}
                            >
                              {log.status === "sent" ? (
                                <CheckCircle2 className="size-3" />
                              ) : log.status === "failed" ? (
                                <XCircle className="size-3" />
                              ) : null}
                              {statusMeta.label}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell dir="ltr" className="text-left">
                          {log.recId ? (
                            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                              {faDigits(log.recId)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-44">
                          <span
                            className="block truncate text-xs text-muted-foreground"
                            title={log.text}
                          >
                            {truncate(log.text, 60)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-44">
                          <span
                            dir="ltr"
                            className="block truncate text-left font-mono text-[0.6rem] text-muted-foreground"
                            title={log.response}
                          >
                            {log.response ? truncate(log.response, 80) : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* — کارت‌های موبایل — */}
          <div className="space-y-3 md:hidden">
            {logs.map((log) => {
              const kindMeta =
                log.kind in SMS_KINDS ? SMS_KINDS[log.kind] : null;
              const statusMeta =
                log.status in SMS_STATUS ? SMS_STATUS[log.status] : null;
              return (
                <article key={log.id} className="glass space-y-3 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p dir="ltr" className="text-left text-sm font-bold tabular-nums text-foreground">
                        {faDigits(log.phone)}
                      </p>
                      <p className="mt-0.5 text-[0.65rem] font-semibold tabular-nums text-muted-foreground">
                        {faDate(log.createdAt)} — {faTime(log.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {statusMeta ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.6rem] font-bold",
                            statusMeta.badge
                          )}
                        >
                          {log.status === "sent" ? (
                            <CheckCircle2 className="size-3" />
                          ) : log.status === "failed" ? (
                            <XCircle className="size-3" />
                          ) : null}
                          {statusMeta.label}
                        </span>
                      ) : null}
                      {kindMeta ? (
                        <span
                          className={cn(
                            "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.6rem] font-bold",
                            kindMeta.badge
                          )}
                        >
                          {kindMeta.label}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <p className="rounded-xl bg-foreground/[0.04] px-3 py-2 text-xs leading-6 text-foreground/80">
                    {truncate(log.text, 120)}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.65rem] font-semibold text-muted-foreground">
                    <span>سرویس: {SMS_PROVIDER_LABELS[log.provider] ?? "—"}</span>
                    {log.recId ? (
                      <span className="tabular-nums">
                        شناسه رسالت: {faDigits(log.recId)}
                      </span>
                    ) : null}
                  </div>

                  {log.response ? (
                    <p
                      dir="ltr"
                      className="truncate rounded-lg bg-muted p-2 text-left font-mono text-[0.6rem] leading-5 text-muted-foreground"
                      title={log.response}
                    >
                      {truncate(log.response, 80)}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>

          {/* — صفحه‌بندی — */}
          {pageCount > 1 && (
            <nav
              aria-label="صفحه‌بندی گزارش پیامک"
              className="flex items-center justify-between gap-3"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-10 rounded-xl px-5 text-xs font-bold"
              >
                <ChevronRight className="size-4" />
                قبلی
              </Button>
              <span className="text-xs font-bold tabular-nums text-muted-foreground">
                صفحه‌ی {faDigits(page)} از {faDigits(pageCount)} — {faDigits(total)}{" "}
                پیامک
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount || loading}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="h-10 rounded-xl px-5 text-xs font-bold"
              >
                بعدی
                <ChevronLeft className="size-4" />
              </Button>
            </nav>
          )}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ماژول اصلی «پنل پیامکی»                                            */
/* ------------------------------------------------------------------ */

/**
 * ماژول «پنل پیامکی» —
 * سه تب: تنظیمات اتصال به ملی پیامک، ارسال پیامک دستی و گزارش ارسال‌ها.
 */
export function SmsModule() {
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="پنل پیامکی"
        description="اتصال به ملی پیامک، ارسال و گزارش پیامک‌ها"
      />

      <Tabs defaultValue="settings" dir="rtl">
        <TabsList className="h-11 w-full rounded-xl p-1 sm:w-fit">
          <TabsTrigger
            value="settings"
            className="rounded-lg px-4 text-xs font-bold"
          >
            <PlugZap className="size-4" />
            تنظیمات اتصال
          </TabsTrigger>
          <TabsTrigger value="send" className="rounded-lg px-4 text-xs font-bold">
            <Send className="size-4" />
            ارسال پیامک
          </TabsTrigger>
          <TabsTrigger value="logs" className="rounded-lg px-4 text-xs font-bold">
            <ScrollText className="size-4" />
            گزارش ارسال
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="send" className="mt-6">
          <SendTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-6">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
