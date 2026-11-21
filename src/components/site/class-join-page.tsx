"use client";

import * as React from "react";
import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Loader2,
  MessageSquareText,
  Phone,
  School,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  UserRoundPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { faDigits } from "@/lib/fa";
import { isValidNationalId, normalizeNationalId } from "@/lib/national-id";

/** اطلاعات کلاس از صفحه‌ی سرور — null یعنی لینک نامعتبر/کلاس حذف شده */
export interface JoinClassInfo {
  slug: string;
  title: string;
  description: string;
  membersCount: number;
}

/* ————————————— پاسخ API‌ها ————————————— */

/** پاسخ GET /api/user/session */
interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/** پاسخ POST /api/user/phone/request */
interface PhoneRequestResult {
  ok?: boolean;
  exists?: boolean;
  demo?: boolean;
  devCode?: string;
  error?: string;
}

/** پاسخ POST /api/user/phone/verify */
interface PhoneVerifyResult {
  ok?: boolean;
  isNew?: boolean;
  user?: SessionUser;
  pendingToken?: string;
  error?: string;
}

/** پاسخ POST /api/user/phone/register */
interface PhoneRegisterResult {
  ok?: boolean;
  isNew?: boolean;
  user?: SessionUser;
  error?: string;
}

/** پاسخ POST /api/classes/join */
interface ClassJoinResult {
  ok?: boolean;
  alreadyMember?: boolean;
  classTitle?: string;
  error?: string;
}

/** مرحله‌ی جاری فرم دعوت (کد در همان مرحله‌ی «phone» با پرچم otpSent نمایش داده می‌شود) */
type Stage = "phone" | "profile" | "done";

/**
 * ClassJoinPage — صفحه‌ی دعوت عضویت در کلاس (/join/{slug})
 *
 * کاربر با کلیک روی لینک دعوت کلاس به این صفحه می‌رسد و با پر کردن فرم
 * ثبت‌نام (تایید شماره موبایل و — برای شماره‌های جدید — مشخصات) عضو کلاس
 * می‌شود. کاربر ثبت‌نام‌شده‌ی سایت هم می‌تواند با تایید دوباره‌ی شماره
 * (یا دکمه‌ی عضویت در حالت واردشده) عضو کلاس‌های دیگری شود — تعداد کلاس‌های
 * هر کاربر محدودیتی ندارد. لیست کلاس‌ها در پنل کاربر نمایش داده نمی‌شود.
 */
export function ClassJoinPage({
  classInfo,
  settings,
}: {
  classInfo: JoinClassInfo | null;
  settings: SiteSettings;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);

  // — کاربر واردشده (بررسی نشست در ورود به صفحه) —
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [sessionChecked, setSessionChecked] = React.useState(false);

  // — مرحله‌ی فرم —
  const [stage, setStage] = React.useState<Stage>("phone");

  // — تایید شماره موبایل —
  const [phone, setPhone] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [otpError, setOtpError] = React.useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = React.useState(false);
  const [verifyingOtp, setVerifyingOtp] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  const [phoneExists, setPhoneExists] = React.useState<boolean | null>(null);

  // — تکمیل ثبت‌نام (شماره‌های جدید) —
  const [pendingToken, setPendingToken] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [nationalId, setNationalId] = React.useState("");
  const [registering, setRegistering] = React.useState(false);

  // — عضویت و نتیجه —
  const [joining, setJoining] = React.useState(false);
  const [joinResult, setJoinResult] = React.useState<
    { alreadyMember: boolean } | null
  >(null);

  /* — بررسی نشست: کاربر واردشده مستقیم دکمه‌ی عضویت می‌بیند — */
  React.useEffect(() => {
    fetch("/api/user/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user: SessionUser | null } | null) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => undefined)
      .finally(() => setSessionChecked(true));
  }, []);

  /* — شمارش معکوس ارسال مجدد کد — */
  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /* ————————————— عضویت در کلاس ————————————— */

  async function joinClass(): Promise<boolean> {
    if (!classInfo) return false;
    setJoining(true);
    try {
      const res = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: classInfo.slug }),
      });
      const data = (await res.json().catch(() => ({}))) as ClassJoinResult;
      if (!res.ok) {
        toast.error(
          data.error || "خطا در ثبت عضویت. لطفاً دوباره تلاش کنید."
        );
        return false;
      }
      setJoinResult({ alreadyMember: !!data.alreadyMember });
      setStage("done");
      if (data.alreadyMember) {
        toast.success("شما از قبل عضو این کلاس هستید.");
      } else {
        toast.success(`شما عضو کلاس «${classInfo.title}» شدید.`);
      }
      return true;
    } catch {
      toast.error("ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.");
      return false;
    } finally {
      setJoining(false);
    }
  }

  /* ————————————— مرحله‌ی ۱: ارسال کد ————————————— */

  async function handleRequestOtp() {
    const cleanPhone = phone.replace(/[\s-]/g, "");
    if (!/^09\d{9}$/.test(cleanPhone)) {
      toast.error("شماره موبایل معتبر وارد کنید (مثال: ۰۹۱۲۳۴۵۶۷۸۹).");
      return;
    }

    setSendingOtp(true);
    setDevCode(null);
    setOtpError(null);
    try {
      const res = await fetch("/api/user/phone/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneRequestResult;
      if (!res.ok) {
        setOtpError(
          typeof data.error === "string" && data.error.trim()
            ? data.error
            : "خطا در ارسال کد تایید. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      setPhoneExists(!!data.exists);
      setOtpSent(true);
      setResendIn(60);
      setOtpCode("");
      if (data.devCode) {
        setDevCode(String(data.devCode));
        toast.info("حالت نمایشی: سامانه پیامکی متصل نیست", {
          description: "کد تایید در کادر نارنجی داخل فرم نمایش داده شده است.",
        });
      } else {
        toast.success("کد تایید پیامکی ارسال شد.", {
          description: "کد ۵ دقیقه معتبر است.",
        });
      }
    } catch {
      setOtpError(
        "ارتباط با سرور برقرار نشد؛ لطفاً اتصال خود را بررسی و دوباره تلاش کنید."
      );
    } finally {
      setSendingOtp(false);
    }
  }

  /* ————————————— مرحله‌ی ۱: تایید کد ————————————— */

  async function handleVerifyOtp() {
    const cleanPhone = phone.replace(/[\s-]/g, "");
    const code = otpCode.replace(/\D/g, "");
    if (code.length !== 6) {
      toast.error("کد تایید ۶ رقمی را کامل وارد کنید.");
      return;
    }

    setVerifyingOtp(true);
    try {
      const res = await fetch("/api/user/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, code }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneVerifyResult;
      if (!res.ok) {
        toast.error(data.error || "خطا در تایید کد.");
        return;
      }

      // — حساب موجود → عضویت مستقیم —
      if (data.user) {
        setUser(data.user);
        setDevCode(null);
        await joinClass();
        return;
      }

      // — شماره جدید → تکمیل مشخصات —
      setPendingToken(data.pendingToken ?? "");
      setStage("profile");
      setDevCode(null);
      toast.success("شماره موبایل شما تایید شد.", {
        description: "برای ساخت حساب کاربری، مشخصات خود را کامل کنید.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در تایید کد.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  /* ————————————— مرحله‌ی ۲: تکمیل ثبت‌نام ————————————— */

  async function handleRegister() {
    if (!pendingToken) {
      setStage("phone");
      setOtpSent(false);
      toast.error("تایید شماره موبایل را دوباره انجام دهید.");
      return;
    }
    if (firstName.trim().length < 2) {
      toast.error("لطفاً نام خود را کامل وارد کنید.");
      return;
    }
    if (lastName.trim().length < 2) {
      toast.error("لطفاً نام خانوادگی خود را کامل وارد کنید.");
      return;
    }
    const cleanNationalId = normalizeNationalId(nationalId);
    if (cleanNationalId !== "" && !isValidNationalId(cleanNationalId)) {
      toast.error("کد ملی ۱۰ رقمی معتبر وارد کنید یا این فیلد را خالی بگذارید.");
      return;
    }

    setRegistering(true);
    try {
      const res = await fetch("/api/user/phone/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          ...(cleanNationalId !== "" ? { nationalId: cleanNationalId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneRegisterResult;

      // توکن نیمه‌کاره منقضی → بازگشت به مرحله‌ی اول
      if (res.status === 410) {
        resetToPhoneStep();
        toast.error(
          data.error ||
            "مهلت تکمیل ثبت‌نام گذشته است؛ دوباره کد تایید دریافت کنید."
        );
        return;
      }
      if (!res.ok) {
        toast.error(data.error || "خطا در تکمیل ثبت‌نام.");
        return;
      }

      setUser(data.user ?? null);
      setPendingToken("");
      await joinClass();
    } catch {
      toast.error("خطا در تکمیل ثبت‌نام. لطفاً دوباره تلاش کنید.");
    } finally {
      setRegistering(false);
    }
  }

  /** بازگشت به مرحله‌ی شماره (نام‌ها حفظ می‌شوند) */
  function resetToPhoneStep() {
    setStage("phone");
    setPendingToken("");
    setOtpSent(false);
    setOtpCode("");
    setDevCode(null);
    setPhoneExists(null);
    setOtpError(null);
    setResendIn(0);
  }

  /* ————————————— رندر ————————————— */

  const brand = (
    <a href="/" className="flex items-center gap-3" aria-label="بازگشت به صفحه اصلی">
      {settings.logoUrl && !logoFailed ? (
        <Image
          src={settings.logoUrl}
          alt={settings.siteName}
          width={44}
          height={44}
          onError={() => setLogoFailed(true)}
          className="size-11 rounded-2xl border border-foreground/10 bg-background object-cover shadow-lg"
        />
      ) : (
        <span className="relative flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25">
          <GraduationCap className="size-6 text-teal-950" strokeWidth={2.2} />
          <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-violet-400 shadow shadow-violet-500/40">
            <Sparkles className="size-2 text-violet-950" />
          </span>
        </span>
      )}
      <span className="leading-tight">
        <span className="block text-lg font-black tracking-tight text-foreground">
          {settings.siteName}
        </span>
        <span className="block text-[0.65rem] font-medium text-muted-foreground">
          {settings.tagline}
        </span>
      </span>
    </a>
  );

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background">
      {/* پس‌زمینه‌ی تزئینی نرم */}
      <div className="pointer-events-none absolute inset-0 -z-[1]">
        <div className="absolute -top-32 right-1/4 size-[26rem] rounded-full bg-teal-500/[0.08] blur-[130px] dark:bg-teal-400/[0.06]" />
        <div className="absolute -bottom-40 left-1/4 size-[26rem] rounded-full bg-violet-500/[0.07] blur-[130px] dark:bg-violet-400/[0.05]" />
      </div>

      {/* هدر مینیمال */}
      <header className="px-4 pt-5">
        <nav className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] px-4 backdrop-blur-md md:px-6 dark:border-white/[0.06] dark:bg-white/[0.02]">
          {brand}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              asChild
              variant="outline"
              className="hidden h-10 rounded-xl border-foreground/[0.12] bg-foreground/[0.04] px-4 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 sm:inline-flex dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
            >
              <a href="/">
                <ArrowRight className="size-4" />
                بازگشت به سایت
              </a>
            </Button>
          </div>
        </nav>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pt-10 pb-24 md:py-14">
        {!classInfo ? (
          /* ————— لینک نامعتبر ————— */
          <div className="w-full max-w-md text-center">
            <div className="glass flex flex-col items-center gap-4 rounded-3xl p-8">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-red-500/10">
                <XCircle className="size-8 text-red-600 dark:text-red-300" />
              </span>
              <h1 className="text-xl font-black text-foreground">
                کلاس یافت نشد
              </h1>
              <p className="text-sm leading-7 text-muted-foreground">
                این لینک دعوت معتبر نیست — ممکن است کلاس حذف شده یا شناسه‌ی لینک
                توسط مدیر تغییر کرده باشد.
              </p>
              <Button asChild variant="outline" className="rounded-xl">
                <a href="/">
                  <ArrowRight className="size-4" />
                  بازگشت به صفحه اصلی
                </a>
              </Button>
            </div>
          </div>
        ) : stage === "done" && joinResult ? (
          /* ————— عضویت موفق ————— */
          <div className="w-full max-w-md text-center">
            <div className="glass flex flex-col items-center gap-4 rounded-3xl p-8">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-300" />
              </span>
              <h1 className="text-xl font-black leading-8 text-foreground">
                {joinResult.alreadyMember
                  ? "شما از قبل عضو این کلاس هستید"
                  : "عضویت با موفقیت ثبت شد"}
              </h1>
              <p className="text-sm leading-7 text-muted-foreground">
                {joinResult.alreadyMember ? (
                  <>
                    شما عضو کلاس{" "}
                    <span className="font-black text-foreground">
                      «{classInfo.title}»
                    </span>{" "}
                    هستید.
                  </>
                ) : (
                  <>
                    شما عضو کلاس{" "}
                    <span className="font-black text-foreground">
                      «{classInfo.title}»
                    </span>{" "}
                    شدید — خوش آمدید!
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  asChild
                  className="h-11 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25"
                >
                  <a href="/panel">
                    <User className="size-4" />
                    ورود به پنل کاربر
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-xl">
                  <a href="/">
                    <ArrowRight className="size-4" />
                    بازگشت به سایت
                  </a>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ————— فرم ثبت‌نام دعوت ————— */
          <div className="w-full max-w-xl">
            <div className="mb-8 text-center">
              <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                <School className="size-3.5" />
                دعوت به عضویت در کلاس
              </span>
              <h1 className="mt-4 text-3xl font-black leading-[1.3] tracking-tight text-foreground md:text-4xl">
                <span className="text-gradient">{classInfo.title}</span>
              </h1>
            </div>

            <div className="glass rounded-3xl p-6 sm:p-8">
              {/* — کاربر واردشده: دکمه‌ی عضویت مستقیم — */}
              {user && sessionChecked && stage !== "profile" ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 dark:border-emerald-400/25 dark:bg-emerald-400/[0.05]">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md shadow-emerald-500/20">
                      <ShieldCheck className="size-5 text-white" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-foreground">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {faDigits(user.phone)}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => void joinClass()}
                    disabled={joining}
                    className="min-h-13 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 py-3.5 text-base font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] disabled:opacity-60"
                  >
                    {joining ? (
                      <>
                        <Loader2 className="size-5 animate-spin" />
                        در حال ثبت عضویت...
                      </>
                    ) : (
                      <>
                        <UserRoundPlus className="size-5 shrink-0" />
                        <span className="leading-6">عضویت در کلاس «{classInfo.title}»</span>
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  {/* ————— مرحله‌ی ۱: تایید شماره موبایل (و کد پیامکی) ————— */}
                  {stage === "phone" ? (
                    <div className="space-y-5">
                      {!sessionChecked ? (
                        <p className="flex select-none items-center gap-2 rounded-xl border border-dashed border-foreground/15 bg-foreground/[0.02] px-3.5 py-3 text-[0.7rem] font-bold text-muted-foreground dark:border-white/15 dark:bg-white/[0.02]">
                          <Loader2 className="size-4 shrink-0 animate-spin" />
                          در حال بررسی حساب کاربری شما...
                        </p>
                      ) : null}

                      {otpError ? (
                        <div
                          className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300"
                          role="alert"
                        >
                          <p className="flex min-w-0 items-start gap-3 leading-6">
                            <XCircle className="size-5 shrink-0" />
                            {otpError}
                          </p>
                          <button
                            type="button"
                            onClick={handleRequestOtp}
                            disabled={sendingOtp}
                            className="inline-flex select-none items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-black text-red-700 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/30 dark:text-red-300 dark:hover:bg-red-400/10"
                          >
                            {sendingOtp ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Send className="size-3.5" />
                            )}
                            {sendingOtp
                              ? "در حال ارسال مجدد..."
                              : "ارسال مجدد کد پیامکی"}
                          </button>
                        </div>
                      ) : null}

                      {/* شماره موبایل */}
                      <div className="space-y-2">
                        <Label
                          htmlFor="join-phone"
                          className="text-sm font-bold text-foreground/90"
                        >
                          شماره موبایل
                        </Label>
                        <div className="relative">
                          <Phone className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="join-phone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="09123456789"
                            dir="ltr"
                            inputMode="tel"
                            className="h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-right placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40"
                            disabled={otpSent || sendingOtp}
                          />
                        </div>
                        <p className="select-none text-[0.65rem] font-semibold leading-5 text-muted-foreground">
                          {otpSent
                            ? phoneExists
                              ? "این شماره در آوید ثبت شده — پس از تایید کد مستقیماً عضو کلاس می‌شوید."
                              : "شماره جدید — پس از تایید کد، مشخصات شما برای ثبت‌نام گرفته می‌شود."
                            : "با تایید شماره موبایل، عضویت شما در کلاس ثبت می‌شود."}
                        </p>
                      </div>

                      {otpSent ? (
                        /* — کد تایید پیامکی — */
                        <div className="space-y-3 rounded-2xl border border-teal-500/30 bg-teal-500/[0.05] p-4 dark:border-teal-400/25 dark:bg-teal-400/[0.04]">
                          <div className="flex items-center justify-between gap-2">
                            <Label
                              htmlFor="join-otp"
                              className="flex items-center gap-2 text-sm font-bold text-foreground/90"
                            >
                              <KeyRound className="size-4 text-teal-600 dark:text-teal-300" />
                              کد تایید پیامکی
                            </Label>
                            <span className="select-none text-[0.65rem] font-bold text-muted-foreground">
                              ارسال‌شده به {faDigits(phone.replace(/[\s-]/g, ""))}
                            </span>
                          </div>

                          <Input
                            id="join-otp"
                            value={otpCode}
                            onChange={(e) =>
                              setOtpCode(
                                e.target.value.replace(/\D/g, "").slice(0, 6)
                              )
                            }
                            placeholder="—— ——"
                            dir="ltr"
                            inputMode="numeric"
                            autoFocus
                            className="h-14 rounded-xl border-teal-500/30 bg-background text-center text-lg font-black tracking-[0.6em] tabular-nums placeholder:tracking-[0.6em] focus-visible:ring-teal-500/40 dark:border-teal-400/30 dark:bg-white/[0.04]"
                          />

                          {devCode ? (
                            <p
                              className="flex select-none items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-[0.7rem] font-bold leading-5 text-amber-700 dark:border-amber-400/35 dark:bg-amber-400/10 dark:text-amber-300"
                              role="note"
                            >
                              <MessageSquareText className="size-4 shrink-0" />
                              حالت نمایشی: سامانه پیامکی متصل نیست؛ کد تایید شما{" "}
                              <span dir="ltr" className="font-black tabular-nums">
                                {faDigits(devCode)}
                              </span>{" "}
                              است.
                            </p>
                          ) : (
                            <p className="flex select-none items-center gap-2 text-[0.65rem] font-semibold leading-5 text-muted-foreground">
                              <Clock3 className="size-3.5 shrink-0" />
                              کد ۵ دقیقه معتبر است.
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-3">
                            <Button
                              type="button"
                              onClick={() => void handleVerifyOtp()}
                              disabled={
                                verifyingOtp ||
                                otpCode.replace(/\D/g, "").length !== 6
                              }
                              className="h-11 flex-1 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-4 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01] disabled:opacity-60"
                            >
                              {verifyingOtp ? (
                                <>
                                  <Loader2 className="size-4 animate-spin" />
                                  در حال تایید...
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="size-4" />
                                  تایید و عضویت
                                </>
                              )}
                            </Button>
                            <button
                              type="button"
                              onClick={() => {
                                setOtpSent(false);
                                setOtpCode("");
                                setDevCode(null);
                                setPhoneExists(null);
                              }}
                              className="select-none text-xs font-bold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                            >
                              ویرایش شماره
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={handleRequestOtp}
                              disabled={resendIn > 0 || sendingOtp}
                              className="select-none text-xs font-bold text-teal-700 underline-offset-4 transition-colors hover:text-teal-800 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline dark:text-teal-300 dark:hover:text-teal-200"
                            >
                              {resendIn > 0
                                ? `ارسال مجدد کد (${faDigits(resendIn)} ثانیه)`
                                : "ارسال مجدد کد"}
                            </button>
                            <span className="select-none text-[0.6rem] font-semibold text-muted-foreground/70">
                              تا ۵ تلاش برای هر کد
                            </span>
                          </div>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          onClick={handleRequestOtp}
                          disabled={sendingOtp || !sessionChecked}
                          className="h-13 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 py-3.5 text-base font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] hover:shadow-teal-400/40 disabled:opacity-60"
                        >
                          {sendingOtp ? (
                            <>
                              <Loader2 className="size-5 animate-spin" />
                              در حال ارسال کد...
                            </>
                          ) : (
                            <>
                              <MessageSquareText className="size-5" />
                              دریافت کد تایید پیامکی
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ) : stage === "profile" ? (
                    /* ————— مرحله‌ی ۲: تکمیل ثبت‌نام ————— */
                    <div className="space-y-5">
                      {/* شماره تاییدشده */}
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3 dark:border-emerald-400/25 dark:bg-emerald-400/[0.06]">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md shadow-emerald-500/20">
                            <ShieldCheck
                              className="size-5 text-white"
                              strokeWidth={2.4}
                            />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                              شماره موبایل تایید شد
                            </p>
                            <p
                              className="text-sm font-black tabular-nums text-foreground"
                              dir="ltr"
                            >
                              {faDigits(phone.replace(/[\s-]/g, ""))}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label
                            htmlFor="join-first"
                            className="text-sm font-bold text-foreground/90"
                          >
                            نام
                          </Label>
                          <Input
                            id="join-first"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="مثلاً: زهرا"
                            maxLength={40}
                            className="h-12 rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label
                            htmlFor="join-last"
                            className="text-sm font-bold text-foreground/90"
                          >
                            نام خانوادگی
                          </Label>
                          <Input
                            id="join-last"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="مثلاً: محمدی"
                            maxLength={40}
                            className="h-12 rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="join-nid"
                          className="text-sm font-bold text-foreground/90"
                        >
                          کد ملی (اختیاری)
                        </Label>
                        <Input
                          id="join-nid"
                          value={nationalId}
                          onChange={(e) => setNationalId(e.target.value)}
                          placeholder="۱۰ رقم کد ملی — در صورت تمایل"
                          dir="ltr"
                          inputMode="numeric"
                          maxLength={12}
                          className="h-12 rounded-xl"
                        />
                      </div>

                      <Button
                        type="button"
                        onClick={() => void handleRegister()}
                        disabled={registering}
                        className="h-13 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 py-3.5 text-base font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] disabled:opacity-60"
                      >
                        {registering ? (
                          <>
                            <Loader2 className="size-5 animate-spin" />
                            در حال تکمیل ثبت‌نام...
                          </>
                        ) : (
                          <>
                            <UserRoundPlus className="size-5" />
                            تکمیل ثبت‌نام و عضویت در کلاس
                          </>
                        )}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {/* راهنمای زیر فرم */}
            <p className="mt-6 flex select-none items-start justify-center gap-2 text-center text-[0.7rem] font-semibold leading-6 text-muted-foreground">
              <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              عضویت در کلاس‌ها فقط از طریق لینک دعوت انجام می‌شود؛ شما می‌توانید
              با لینک کلاس‌های دیگر هم عضو شوید.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
