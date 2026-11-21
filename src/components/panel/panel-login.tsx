"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowRight,
  Clock3,
  GraduationCap,
  IdCard,
  KeyRound,
  Loader2,
  MessageSquareText,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  XCircle,
} from "lucide-react";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { faDigits } from "@/lib/fa";
import {
  isValidNationalId,
  normalizeNationalId,
  toEnDigits,
} from "@/lib/national-id";

/** مدت شمارش معکوس ارسال مجدد کد (ثانیه) */
const RESEND_SECONDS = 120;

/** پاسخ POST /api/user/phone/request */
interface PhoneRequestResult {
  ok?: boolean;
  exists?: boolean;
  demo?: boolean;
  devCode?: string;
  error?: string;
  smsFailed?: boolean;
}

/** پاسخ POST /api/user/phone/verify */
interface PhoneVerifyResult {
  ok?: boolean;
  isNew?: boolean;
  user?: { firstName: string; lastName: string; phone: string };
  pendingToken?: string;
  error?: string;
}

/** پاسخ POST /api/user/phone/register */
interface PhoneRegisterResult {
  ok?: boolean;
  isNew?: boolean;
  user?: { firstName: string; lastName: string; phone: string };
  error?: string;
}

/**
 * PanelLogin — کارت یکپارچه‌ی «ورود / ثبت‌نام» با پیامک OTP.
 *
 * یک فرم دو مرحله‌ای (بدون فرم/زبانه‌ی جدا برای ورود و ثبت‌نام):
 *  • مرحله‌ی ۱ — تایید شماره موبایل:
 *      شماره → POST /api/user/phone/request (کد ارسال می‌شود؛ پاسخ
 *      «exists» راهنمای مسیر را نشان می‌دهد)
 *      کد ۶ رقمی → POST /api/user/phone/verify
 *        ↳ شماره از قبل ثبت شده → نشست ست می‌شود و مستقیم وارد پنل می‌شود
 *        ↳ شماره ثبت نشده → توکن نیمه‌کاره صادر و به مرحله‌ی ۲ می‌رود
 *  • مرحله‌ی ۲ — ثبت‌نام (فقط شماره‌های جدید):
 *      نام + نام خانوادگی + کد ملی (اختیاری)
 *      → POST /api/user/phone/register (توکن یک‌بارمصرف)
 *      → onLoggedIn() — ورود به پنل کاربر
 */
export function PanelLogin({
  settings,
  onLoggedIn,
}: {
  settings: SiteSettings;
  onLoggedIn: () => void;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);
  /** مرحله‌ی جاری: ۱ = تایید شماره موبایل · ۲ = ثبت‌نام (شماره‌های جدید) */
  const [step, setStep] = React.useState<1 | 2>(1);

  // — مرحله‌ی ۱: شماره و کد —
  const [phone, setPhone] = React.useState("");
  const [phoneError, setPhoneError] = React.useState("");
  const [formError, setFormError] = React.useState("");
  /** شماره در سیستم ثبت شده؟ (پاسخ درخواست کد — راهنمای مسیر) */
  const [phoneExists, setPhoneExists] = React.useState<boolean | null>(null);

  const [code, setCode] = React.useState("");
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [codeSent, setCodeSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  /** ارسال کد شکست خورده؟ — دکمه‌ی «ارسال مجدد» در جعبه‌ی خطا */
  const [smsRetry, setSmsRetry] = React.useState(false);

  // — مرحله‌ی ۲: ثبت‌نام —
  const [pendingToken, setPendingToken] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [nameError, setNameError] = React.useState("");
  const [nationalId, setNationalId] = React.useState("");
  const [nationalIdError, setNationalIdError] = React.useState("");
  const [registering, setRegistering] = React.useState(false);

  // شمارش معکوس ارسال مجدد کد
  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /** پاک‌کردن خطاهای نمایشی */
  function clearErrors() {
    setPhoneError("");
    setNameError("");
    setNationalIdError("");
    setFormError("");
  }

  /* ————————————————— مرحله‌ی ۱: درخواست کد ————————————————— */

  async function requestCode() {
    const cleanPhone = phone.replace(/[\s-]/g, "");
    if (!/^09\d{9}$/.test(cleanPhone)) {
      setPhoneError("شماره موبایل معتبر نیست (مثال: 09123456789)");
      return;
    }

    clearErrors();
    setSmsRetry(false);
    setSending(true);
    try {
      const res = await fetch("/api/user/phone/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneRequestResult;

      if (!res.ok) {
        // شکست ارسال پیامک — علامت‌گذاری برای دکمه‌ی ارسال مجدد
        if (data.smsFailed) setSmsRetry(true);
        throw new Error(data.error || "خطا در ارسال کد تایید.");
      }

      setPhoneExists(!!data.exists);
      setCodeSent(true);
      setCode("");
      setResendIn(RESEND_SECONDS);
      if (data.demo && data.devCode) {
        setDevCode(String(data.devCode));
        toast.info("حالت نمایشی: سامانه پیامکی متصل نیست", {
          description: "کد تایید در کادر نارنجی داخل فرم نمایش داده شده است.",
        });
      } else {
        setDevCode(null);
        toast.success("کد تایید پیامکی ارسال شد.", {
          description: "کد ۵ دقیقه معتبر است.",
        });
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "خطا در ارسال کد تایید."
      );
    } finally {
      setSending(false);
    }
  }

  /* ————————————————— مرحله‌ی ۱: تایید کد ————————————————— */

  async function verifyCode() {
    const cleanPhone = phone.replace(/[\s-]/g, "");
    const cleanCode = code.replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      setFormError("کد تایید ۶ رقمی را کامل وارد کنید.");
      return;
    }

    setFormError("");
    setVerifying(true);
    try {
      const res = await fetch("/api/user/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, code: cleanCode }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneVerifyResult;
      if (!res.ok) {
        throw new Error(data.error || "کد تایید اشتباه است؛ دوباره تلاش کنید.");
      }

      // — شماره از قبل ثبت شده: ورود مستقیم به پنل —
      if (data.user) {
        toast.success("خوش آمدید!", {
          description: "ورود با موفقیت انجام شد.",
        });
        onLoggedIn();
        return;
      }

      // — شماره جدید: رفتن به مرحله‌ی ثبت‌نام (بدون از دست رفتن کد تایید) —
      setPendingToken(data.pendingToken ?? "");
      setStep(2);
      setDevCode(null);
      toast.success("شماره موبایل شما تایید شد.", {
        description: "برای ساخت حساب، مشخصات خود را کامل کنید.",
      });
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "کد تایید اشتباه است؛ دوباره تلاش کنید."
      );
    } finally {
      setVerifying(false);
    }
  }

  /* ————————————————— مرحله‌ی ۲: تکمیل ثبت‌نام ————————————————— */

  async function submitRegistration() {
    if (firstName.trim().length < 2) {
      setNameError("لطفاً نام خود را کامل وارد کنید.");
      return;
    }
    if (lastName.trim().length < 2) {
      setNameError("لطفاً نام خانوادگی خود را کامل وارد کنید.");
      return;
    }
    // کد ملی اختیاری — اگر چیزی وارد شده باشد باید معتبر باشد
    const cleanNid = normalizeNationalId(nationalId);
    if (cleanNid !== "" && !isValidNationalId(cleanNid)) {
      setNationalIdError(
        "کد ملی ۱۰ رقمی معتبر وارد کنید یا این فیلد را خالی بگذارید."
      );
      return;
    }

    clearErrors();
    setRegistering(true);
    try {
      const res = await fetch("/api/user/phone/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          // کد ملی اختیاری — فقط وقتی پر شده ارسال می‌شود
          ...(cleanNid !== "" ? { nationalId: cleanNid } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneRegisterResult;

      // توکن نیمه‌کاره منقضی شده → بازگشت به مرحله‌ی اول برای کد جدید
      if (res.status === 410) {
        setStep(1);
        setCodeSent(false);
        setCode("");
        setDevCode(null);
        setPendingToken("");
        setPhoneExists(null);
        setResendIn(0);
        setFormError(
          data.error ||
            "مهلت تکمیل ثبت‌نام گذشته است؛ دوباره کد تایید دریافت کنید."
        );
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || "خطا در تکمیل ثبت‌نام.");
      }

      toast.success("ثبت‌نام شما تکمیل شد؛ خوش آمدید!", {
        description:
          "حساب کاربری شما ساخته شد. هر زمان که بخواهید می‌توانید از پنل، دوره انتخاب کنید.",
      });
      onLoggedIn();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "خطا در تکمیل ثبت‌نام."
      );
    } finally {
      setRegistering(false);
    }
  }

  /** بازگشت به مرحله‌ی ۱ برای ویرایش شماره */
  function editPhone() {
    setStep(1);
    setCode("");
    setDevCode(null);
    clearErrors();
    setSmsRetry(false);
  }

  const inputClass =
    "h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-right placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40";
  const plainInputClass =
    "h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] text-right placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 1) {
          if (codeSent) void verifyCode();
          else void requestCode();
        } else {
          void submitRegistration();
        }
      }}
      className="gradient-border relative w-full max-w-md rounded-[1.75rem] bg-card/85 p-7 shadow-2xl shadow-black/10 backdrop-blur-xl dark:bg-[#08110e]/80 dark:shadow-black/30 md:p-9"
      noValidate
    >
      <div className="pointer-events-none absolute -top-20 left-1/2 size-44 -translate-x-1/2 rounded-full bg-teal-400/10 blur-[80px]" />

      {/* سربرگ: لوگو + عنوان */}
      <div className="relative flex items-center gap-3 border-b border-foreground/[0.07] pb-6 dark:border-white/[0.07]">
        {settings.logoUrl && !logoFailed ? (
          <Image
            src={settings.logoUrl}
            alt={settings.siteName}
            width={44}
            height={44}
            onError={() => setLogoFailed(true)}
            className="size-11 shrink-0 rounded-2xl border border-foreground/10 bg-background object-cover shadow-lg"
          />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25">
            <GraduationCap className="size-6 text-teal-950" strokeWidth={2.2} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black tracking-tight text-foreground">
            ورود / ثبت‌نام
          </h1>
          <p className="text-xs text-muted-foreground">
            {step === 1
              ? codeSent
                ? "کد تایید پیامکی ارسال‌شده را وارد کنید"
                : "شماره موبایل خود را وارد کنید"
              : "مشخصات شما را برای ساخت حساب کاربری وارد کنید"}
          </p>
        </div>
        <Sparkles className="mr-auto size-5 shrink-0 text-violet-600 dark:text-violet-300" />
      </div>

      {/* — نشان مراحل — */}
      <ol
        className="relative mt-5 flex items-center gap-2"
        aria-label="مراحل ورود / ثبت‌نام"
      >
        <LoginStep
          index={1}
          label="تایید شماره موبایل"
          state={step === 1 ? "current" : "done"}
        />
        <span className="h-px flex-1 bg-foreground/[0.1] dark:bg-white/[0.1]" />
        <LoginStep
          index={2}
          label="ثبت‌نام (شماره‌های جدید)"
          state={step === 2 ? "current" : "todo"}
        />
      </ol>

      <div className="relative mt-6 space-y-5">
        {/* — خطای کلی (محدودیت ارسال / کد اشتباه / انقضای توکن / ...) — */}
        {formError ? (
          <div
            className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300"
            role="alert"
          >
            <XCircle className="size-5 shrink-0" />
            <div className="min-w-0 space-y-2 leading-6">
              <p>{formError}</p>
              {/* شکست ارسال پیامک — ارسال مجدد همان‌جا */}
              {smsRetry && step === 1 ? (
                <button
                  type="button"
                  onClick={() => void requestCode()}
                  disabled={sending}
                  className="inline-flex select-none items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-black text-red-700 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/30 dark:text-red-300 dark:hover:bg-red-400/10"
                >
                  {sending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  {sending ? "در حال ارسال مجدد..." : "ارسال مجدد کد پیامکی"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          /* ————————————————— مرحله‌ی ۱: تایید شماره موبایل ————————————————— */
          <div className="space-y-5">
            {/* شماره موبایل */}
            <div className="space-y-2">
              <Label
                htmlFor="panel-phone"
                className="text-sm font-bold text-foreground/90"
              >
                شماره موبایل
              </Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="panel-phone"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/[^\d\s-]/g, ""));
                    if (phoneError) setPhoneError("");
                  }}
                  placeholder="09123456789"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus={!codeSent}
                  aria-invalid={!!phoneError}
                  className={inputClass}
                  disabled={sending || codeSent}
                />
              </div>
              {phoneError ? (
                <p
                  className="select-none text-xs font-bold leading-5 text-red-600 dark:text-red-300"
                  role="alert"
                >
                  {phoneError}
                </p>
              ) : (
                <p className="select-none text-[0.65rem] font-semibold leading-5 text-muted-foreground">
                  {codeSent
                    ? phoneExists
                      ? "این شماره در آوید ثبت شده — پس از تایید کد، مستقیم وارد پنل می‌شوید."
                      : "شماره جدید — پس از تایید کد، مشخصات شما برای ساخت حساب گرفته می‌شود."
                    : "شماره موبایل شما با کد پیامکی تایید می‌شود؛ اگر از قبل ثبت شده باشید مستقیم وارد پنل می‌شوید."}
                </p>
              )}
            </div>

            {codeSent ? (
              /* — کد تایید پیامکی — */
              <div className="space-y-3 rounded-2xl border border-teal-500/30 bg-teal-500/[0.05] p-4 dark:border-teal-400/25 dark:bg-teal-400/[0.04]">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="panel-otp"
                    className="flex items-center gap-2 text-sm font-bold text-foreground/90"
                  >
                    <KeyRound className="size-4 text-teal-600 dark:text-teal-300" />
                    کد تایید
                  </Label>
                  <span className="select-none text-[0.65rem] font-bold text-muted-foreground">
                    ارسال‌شده به {faDigits(phone.replace(/[\s-]/g, ""))}
                  </span>
                </div>

                <Input
                  id="panel-otp"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                    if (formError) setFormError("");
                  }}
                  placeholder="—— ——"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
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
                    type="submit"
                    disabled={
                      verifying || code.replace(/\D/g, "").length !== 6
                    }
                    className="h-11 flex-1 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-4 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01] disabled:opacity-60"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        در حال بررسی...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4" />
                        تایید و ادامه
                      </>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={editPhone}
                    className="select-none text-xs font-bold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    ویرایش شماره
                  </button>
                </div>

                {/* ارسال مجدد / شمارش معکوس */}
                <div className="flex items-center justify-between gap-2">
                  {resendIn > 0 ? (
                    <p className="flex select-none items-center gap-1.5 text-[0.7rem] font-semibold text-muted-foreground">
                      <Clock3 className="size-3.5 shrink-0" />
                      ارسال مجدد کد تا {faDigits(resendIn)} ثانیه دیگر
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void requestCode()}
                      disabled={sending}
                      className="select-none text-xs font-bold text-teal-700 underline-offset-4 transition-colors hover:text-teal-800 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline dark:text-teal-300 dark:hover:text-teal-200"
                    >
                      ارسال مجدد کد
                    </button>
                  )}
                  <span className="select-none text-[0.6rem] font-semibold text-muted-foreground/70">
                    تا ۵ تلاش برای هر کد
                  </span>
                </div>
              </div>
            ) : (
              <Button
                type="submit"
                disabled={sending}
                className="h-13 mt-2 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 py-3.5 text-base font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] hover:shadow-teal-400/40 disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    در حال ارسال...
                  </>
                ) : (
                  <>
                    <MessageSquareText className="size-5" />
                    دریافت کد تایید
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          /* ————————————————— مرحله‌ی ۲: ثبت‌نام ————————————————— */
          <div className="space-y-5">
            {/* شماره تاییدشده — بدون نیاز به کد دوباره */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3 dark:border-emerald-400/25 dark:bg-emerald-400/[0.06]">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md shadow-emerald-500/20">
                  <ShieldCheck className="size-5 text-white" strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">
                    شماره موبایل شما تایید شد
                  </p>
                  <p className="flex items-center gap-1.5 text-[0.65rem] font-bold text-emerald-700 dark:text-emerald-300">
                    <Phone className="size-3" />
                    <span dir="ltr" className="tabular-nums">
                      {faDigits(phone.replace(/[\s-]/g, ""))}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={editPhone}
                className="flex select-none items-center gap-1.5 rounded-xl border border-foreground/[0.1] px-3 py-2 text-[0.7rem] font-bold text-muted-foreground transition-colors hover:border-teal-500/30 hover:text-teal-700 dark:border-white/10 dark:hover:border-teal-400/30 dark:hover:text-teal-300"
              >
                <Phone className="size-3.5" />
                تغییر شماره
              </button>
            </div>

            {/* نام و نام خانوادگی */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="panel-firstName"
                  className="text-sm font-bold text-foreground/90"
                >
                  نام
                </Label>
                <Input
                  id="panel-firstName"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (nameError) setNameError("");
                  }}
                  placeholder="مثلاً: سارا"
                  autoComplete="given-name"
                  autoFocus
                  aria-invalid={!!nameError}
                  className={plainInputClass}
                  disabled={registering}
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="panel-lastName"
                  className="text-sm font-bold text-foreground/90"
                >
                  نام خانوادگی
                </Label>
                <Input
                  id="panel-lastName"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (nameError) setNameError("");
                  }}
                  placeholder="مثلاً: محمدی"
                  autoComplete="family-name"
                  aria-invalid={!!nameError}
                  className={plainInputClass}
                  disabled={registering}
                />
              </div>
            </div>
            {nameError ? (
              <p
                className="select-none text-xs font-bold leading-5 text-red-600 dark:text-red-300"
                role="alert"
              >
                {nameError}
              </p>
            ) : null}

            {/* کد ملی (اختیاری) */}
            <div className="space-y-2">
              <Label
                htmlFor="panel-nationalId"
                className="flex items-center gap-2 text-sm font-bold text-foreground/90"
              >
                <IdCard className="size-4 text-teal-600 dark:text-teal-300" />
                کد ملی
                <span className="text-[0.65rem] font-semibold text-muted-foreground">
                  (اختیاری)
                </span>
              </Label>
              <div className="relative">
                <IdCard className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="panel-nationalId"
                  value={nationalId}
                  onChange={(e) => {
                    setNationalId(
                      toEnDigits(e.target.value)
                        .replace(/\D/g, "")
                        .slice(0, 10)
                    );
                    if (nationalIdError) setNationalIdError("");
                  }}
                  placeholder="1234567891"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={!!nationalIdError}
                  className="h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-center font-black tabular-nums placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40"
                  disabled={registering}
                />
              </div>
              {nationalIdError ? (
                <p
                  className="select-none text-xs font-bold leading-5 text-red-600 dark:text-red-300"
                  role="alert"
                >
                  {nationalIdError}
                </p>
              ) : (
                <p className="select-none text-[0.65rem] font-semibold leading-5 text-muted-foreground">
                  با ثبت کد ملی، گواهی‌نامه‌های شما با استعلام کد ملی قابل
                  بررسی و دانلود خواهد بود.
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={registering}
              className="h-13 mt-2 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 py-3.5 text-base font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] hover:shadow-teal-400/40 disabled:opacity-60"
            >
              {registering ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  در حال ساخت حساب...
                </>
              ) : (
                <>
                  <UserRoundPlus className="size-5" />
                  تکمیل ثبت‌نام و ورود
                </>
              )}
            </Button>
          </div>
        )}

        {/* بازگشت به سایت */}
        <p className="pt-1 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground underline-offset-4 transition-colors hover:text-teal-600 hover:underline dark:hover:text-teal-300"
          >
            <ArrowRight className="size-3.5" />
            بازگشت به سایت
          </Link>
        </p>
      </div>
    </form>
  );
}

/* ————————————————— نشان مرحله‌ی ورود ————————————————— */

function LoginStep({
  index,
  label,
  state,
}: {
  index: number;
  label: string;
  state: "todo" | "current" | "done";
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "flex size-6 select-none items-center justify-center rounded-full border text-[0.65rem] font-black tabular-nums transition-colors",
          state === "current" &&
            "border-teal-500/50 bg-teal-500/15 text-teal-700 dark:border-teal-400/50 dark:bg-teal-400/15 dark:text-teal-300",
          state === "done" &&
            "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-300",
          state === "todo" &&
            "border-foreground/15 bg-foreground/[0.03] text-muted-foreground dark:border-white/15 dark:bg-white/[0.03]"
        )}
        aria-current={state === "current" ? "step" : undefined}
      >
        {faDigits(index)}
      </span>
      <span
        className={cn(
          "select-none text-[0.7rem] font-bold",
          state === "current" ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </li>
  );
}
