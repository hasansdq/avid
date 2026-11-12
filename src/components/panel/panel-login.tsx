"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowRight,
  Clock3,
  GraduationCap,
  KeyRound,
  Loader2,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { faDigits } from "@/lib/fa";

/** مدت شمارش معکوس ارسال مجدد کد (ثانیه) */
const RESEND_SECONDS = 120;

/**
 * PanelLogin — ورود دو مرحله‌ای پنل کاربر با پیامک OTP.
 *
 * مرحله‌ی ۱: شماره موبایل → POST /api/panel/otp/request
 *   · 404 → حساب موجود نیست؛ لینک به فرم ثبت‌نام دوره‌ها
 *   · 429/403/… → نمایش متن خطای سرور
 *   · موفق → مرحله‌ی ۲ (+ جعبه‌ی کد نمایشی در حالت دمو)
 * مرحله‌ی ۲: کد ۶ رقمی → POST /api/panel/otp/verify → onLoggedIn()
 */
export function PanelLogin({
  settings,
  onLoggedIn,
}: {
  settings: SiteSettings;
  onLoggedIn: () => void;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);
  const [step, setStep] = React.useState<1 | 2>(1);

  const [phone, setPhone] = React.useState("");
  const [phoneError, setPhoneError] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [needRegister, setNeedRegister] = React.useState(false);

  const [code, setCode] = React.useState("");
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);

  // شمارش معکوس ارسال مجدد کد
  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /* ————————————————— مرحله‌ی ۱: درخواست کد ————————————————— */

  async function requestCode() {
    const cleanPhone = phone.replace(/[\s-]/g, "");
    if (!/^09\d{9}$/.test(cleanPhone)) {
      setPhoneError("شماره موبایل معتبر نیست (مثال: 09123456789)");
      return;
    }

    setPhoneError("");
    setFormError("");
    setNeedRegister(false);
    setSending(true);
    try {
      const res = await fetch("/api/panel/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        demo?: boolean;
        devCode?: string;
      };

      if (!res.ok) {
        if (res.status === 404) {
          // حساب موجود نیست — راهنمایی به فرم ثبت‌نام دوره‌ها
          setNeedRegister(true);
          setFormError(
            "حسابی با این شماره یافت نشد؛ ابتدا از طریق فرم ثبت‌نام دوره‌ها حساب خود را بسازید."
          );
          return;
        }
        throw new Error(data.error || "خطا در ارسال کد تایید.");
      }

      setStep(2);
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

  /* ————————————————— مرحله‌ی ۲: تایید کد و ورود ————————————————— */

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
      const res = await fetch("/api/panel/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, code: cleanCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          data.error || "کد تایید اشتباه است؛ دوباره تلاش کنید."
        );
      }

      toast.success("خوش آمدید!", { description: "ورود با موفقیت انجام شد." });
      onLoggedIn();
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

  /** بازگشت به مرحله‌ی ۱ برای ویرایش شماره */
  function editPhone() {
    setStep(1);
    setCode("");
    setDevCode(null);
    setFormError("");
    setNeedRegister(false);
  }

  const inputClass =
    "h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-right placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 1) void requestCode();
        else void verifyCode();
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
            پنل کاربران {settings.siteName}
          </h1>
          <p className="text-xs text-muted-foreground">
            {step === 1
              ? "برای ورود، شماره موبایل خود را وارد کنید"
              : "کد تایید پیامکی ارسال‌شده را وارد کنید"}
          </p>
        </div>
        <Sparkles className="mr-auto size-5 shrink-0 text-violet-600 dark:text-violet-300" />
      </div>

      {/* — نشان مراحل دوم — */}
      <ol
        className="relative mt-5 flex items-center gap-2"
        aria-label="مراحل ورود"
      >
        <LoginStep
          index={1}
          label="شماره موبایل"
          state={step === 1 ? "current" : "done"}
        />
        <span className="h-px flex-1 bg-foreground/[0.1] dark:bg-white/[0.1]" />
        <LoginStep
          index={2}
          label="کد تایید"
          state={step === 2 ? "current" : "todo"}
        />
      </ol>

      <div className="relative mt-6 space-y-5">
        {/* — خطای کلی (حساب موجود نیست / محدودیت ارسال / کد اشتباه / ...) — */}
        {formError ? (
          <div
            className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300"
            role="alert"
          >
            <XCircle className="size-5 shrink-0" />
            <div className="min-w-0 space-y-2 leading-6">
              <p>{formError}</p>
              {needRegister ? (
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-black text-red-700 underline-offset-4 transition-colors hover:bg-red-500/10 hover:underline dark:border-red-400/30 dark:text-red-300 dark:hover:bg-red-400/10"
                >
                  <ArrowRight className="size-3.5" />
                  رفتن به ثبت‌نام
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ————————————————— مرحله‌ی ۱: شماره موبایل ————————————————— */}
        {step === 1 ? (
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
                autoFocus
                aria-invalid={!!phoneError}
                className={inputClass}
                disabled={sending}
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
                شماره‌ای که با آن در آوید ثبت‌نام کرده‌اید را وارد کنید.
              </p>
            )}

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
          </div>
        ) : (
          /* ————————————————— مرحله‌ی ۲: کد تایید ————————————————— */
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
                disabled={verifying || code.replace(/\D/g, "").length !== 6}
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
                    ورود به پنل
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
          state === "current"
            ? "text-foreground"
            : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </li>
  );
}
