"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  KeyRound,
  Loader2,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { apiFetch } from "@/components/admin/api";
import { btnGradient } from "@/components/admin/shared/styles";
import { LogoMark } from "@/components/admin/shared/logo-mark";
import { cn } from "@/lib/utils";
import { faDigits } from "@/lib/fa";

/** پاسخ مرحله‌ی اول POST /api/auth/login */
interface LoginStep1Result {
  ok: boolean;
  username: string;
  /** true یعنی تایید دومرحله‌ای فعال است و مرحله‌ی دوم (کد پیامکی) لازم است */
  twoFactor?: boolean;
  /** حالت نمایشی: کد پیامکی واقعاً ارسال نشده و برای تست برگردانده شده است */
  demo?: boolean;
  devCode?: string;
}

/** پاسخ POST /api/auth/login/verify */
interface LoginVerifyResult {
  ok: boolean;
  username: string;
}

/**
 * صفحه‌ی ورود به پنل — دو مرحله‌ای:
 *  مرحله‌ی ۱: نام کاربری + رمز عبور + چک‌باکس «من ربات نیستم»
 *  مرحله‌ی ۲ (فقط اگر تایید دومرحله‌ای پیامکی فعال باشد): کد ۶ رقمی
 *  پیامکی به شماره‌ی موبایل مدیر.
 * اگر دومرحله‌ای غیرفعال باشد (پیش‌فرض)، همان مرحله‌ی اول وارد می‌کند.
 */
export function LoginScreen({
  onSuccess,
}: {
  onSuccess: (username: string) => void;
}) {
  // — مرحله‌ی ۱ —
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notRobot, setNotRobot] = useState(false);
  const [pending, setPending] = useState(false);

  // — مرحله‌ی ۲ (تایید دومرحله‌ای پیامکی) —
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [otpCode, setOtpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // شمارش معکوس ارسال مجدد کد
  useEffect(() => {
    if (step !== "otp") return;
    if (resendIn <= 0 && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    if (!timerRef.current && resendIn > 0) {
      timerRef.current = setInterval(() => {
        setResendIn((c) => {
          if (c <= 1) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [step, resendIn > 0]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!notRobot) {
      toast.error("لطفاً گزینه‌ی «من ربات نیستم» را فعال کنید.");
      return;
    }
    setPending(true);
    try {
      const res = await apiFetch<LoginStep1Result>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });

      // — تایید دومرحله‌ای فعال → مرحله‌ی دوم (کد پیامکی) —
      if (res.twoFactor) {
        setStep("otp");
        setOtpCode("");
        setResendIn(60);
        setDemoCode(res.devCode ?? null);
        if (res.demo) {
          toast.info("حالت نمایشی: سرویس پیامکی متصل نیست — کد نمایش داده شد.");
        } else {
          toast.success("کد تایید پیامکی به شماره‌ی موبایل مدیر ارسال شد.");
        }
        setPending(false);
        return;
      }

      // — ورود مستقیم (دومرحله‌ای غیرفعال) —
      toast.success(`خوش آمدید، ${res.username}`);
      onSuccess(res.username);
    } catch (error) {
      if (error instanceof Error && error.message) {
        toast.error(error.message);
      } else {
        toast.error("ورود ناموفق بود. لطفاً دوباره تلاش کنید.");
      }
      setPending(false);
    }
  }

  /** بازگشت به مرحله‌ی اول (بازنشانی وضعیت مرحله‌ی دوم) */
  function backToCredentials() {
    setStep("credentials");
    setOtpCode("");
    setDemoCode(null);
    setResendIn(0);
  }

  /** ارسال مجدد کد — همان مسیر مرحله‌ی اول (نام کاربری و رمز دوباره تایید و کد نو صادر می‌شود) */
  async function handleResend() {
    if (pending || resendIn > 0) return;
    setPending(true);
    try {
      const res = await apiFetch<LoginStep1Result>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (res.twoFactor) {
        setOtpCode("");
        setResendIn(60);
        setDemoCode(res.devCode ?? null);
        toast.success("کد تایید جدید ارسال شد.");
      } else {
        // غیرمنتظره: دومرحله‌ای همین الان غیرفعال شده — مستقیم وارد می‌شویم
        toast.success(`خوش آمدید، ${res.username}`);
        onSuccess(res.username);
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message) toast.error(error.message);
    } finally {
      setPending(false);
    }
  }

  /** تایید کد پیامکی (مرحله‌ی دوم) */
  async function handleVerifyOtp() {
    if (verifying) return;
    if (otpCode.length !== 6) {
      toast.error("کد تایید ۶ رقمی را کامل وارد کنید.");
      return;
    }
    setVerifying(true);
    try {
      const res = await apiFetch<LoginVerifyResult>("/api/auth/login/verify", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password,
          code: otpCode,
        }),
      });
      toast.success(`خوش آمدید، ${res.username}`);
      onSuccess(res.username);
    } catch (error) {
      if (error instanceof Error && error.message) {
        toast.error(error.message);
      } else {
        toast.error("تایید کد ناموفق بود. دوباره تلاش کنید.");
      }
      setVerifying(false);
    }
  }

  return (
    <div className="bg-grid-tech relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* هاله‌ی نور فیروزه‌ای */}
      <div className="pointer-events-none absolute -top-32 right-1/2 h-96 w-96 translate-x-1/2 rounded-full bg-teal-500/20 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-violet-500/10 blur-[120px]" />

      <div className="relative w-full max-w-md">
        <div className="glass gradient-border rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <LogoMark className="size-14" iconClassName="size-7" />
            <div className="space-y-1">
              <h1 className="text-xl font-black text-foreground">
                پنل مدیریت آوید
              </h1>
              <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                {step === "otp" ? (
                  <>
                    <Smartphone className="size-4 text-teal-600 dark:text-teal-300" />
                    مرحله‌ی دوم: تایید پیامکی
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-4 text-teal-600 dark:text-teal-300" />
                    برای ادامه وارد شوید
                  </>
                )}
              </p>
            </div>
          </div>

          {step === "credentials" ? (
            /* ————— مرحله‌ی ۱: نام کاربری + رمز + من ربات نیستم ————— */
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-username">نام کاربری</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted-foreground" />
                  <Input
                    id="login-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    required
                    disabled={pending}
                    className="ps-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">رمز عبور</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    disabled={pending}
                    className="ps-10"
                  />
                </div>
              </div>

              {/* ——— من ربات نیستم — همان زبان بصری فرم پیش‌ثبت‌نام سایت ——— */}
              <div
                className={cn(
                  "flex select-none items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors",
                  notRobot
                    ? "border-teal-500/40 bg-teal-500/[0.06]"
                    : "border-foreground/[0.08] bg-foreground/[0.03] hover:border-foreground/[0.14] dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/[0.14]"
                )}
              >
                <label
                  htmlFor="login-not-robot"
                  className="flex cursor-pointer items-center gap-3"
                >
                  <Checkbox
                    id="login-not-robot"
                    checked={notRobot}
                    onCheckedChange={(v) => setNotRobot(v === true)}
                    disabled={pending}
                    className="size-5"
                  />
                  <span className="text-sm font-bold text-foreground/90">
                    {notRobot ? "تأیید شد — انسان هستم" : "من ربات نیستم"}
                  </span>
                </label>

                {/* نشان امنیتی آوید */}
                <div className="flex select-none items-center gap-3">
                  <span className="hidden h-9 w-px bg-foreground/[0.08] sm:block dark:bg-white/[0.08]" />
                  <div className="flex flex-col items-center gap-0.5">
                    <Bot
                      className={cn(
                        "size-5 transition-colors duration-300",
                        notRobot
                          ? "text-teal-600 dark:text-teal-300"
                          : "text-muted-foreground"
                      )}
                    />
                    <span className="text-[0.55rem] font-black tracking-widest text-muted-foreground">
                      AVID
                    </span>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={pending || !username.trim() || !password}
                className={`h-11 w-full rounded-xl text-sm ${btnGradient}`}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {pending ? "در حال ورود..." : "ورود به پنل"}
              </Button>
            </form>
          ) : (
            /* ————— مرحله‌ی ۲: کد تایید پیامکی ————— */
            <div className="mt-8 space-y-5">
              <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-4 text-center dark:border-white/[0.08] dark:bg-white/[0.03]">
                <p className="flex items-center justify-center gap-2 text-sm font-bold text-foreground">
                  <MessageSquare className="size-4 text-teal-600 dark:text-teal-300" />
                  کد ۶ رقمی به شماره‌ی موبایل مدیر ارسال شد
                </p>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  اعتبار کد ۵ دقیقه است. در صورت نرسیدن پیامک، پس از ۶۰ ثانیه
                  می‌توانید کد جدید بگیرید.
                </p>

                {/* حالت نمایشی — نمایش کد برای تست (بدون سرویس پیامکی) */}
                {demoCode ? (
                  <p
                    dir="ltr"
                    className="mt-3 inline-block rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm font-black tracking-[0.2em] text-amber-600 dark:text-amber-300"
                  >
                    {faDigits(demoCode)}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-otp" className="text-center">
                  کد تایید
                </Label>
                <div dir="ltr" className="flex justify-center">
                  <InputOTP
                    id="login-otp"
                    maxLength={6}
                    value={otpCode}
                    onChange={setOtpCode}
                    disabled={verifying}
                    autoFocus
                    containerClassName="gap-1.5"
                  >
                    <InputOTPGroup className="gap-1.5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="size-11 rounded-lg text-base font-black first:rounded-l-lg last:rounded-r-lg"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>

              <Button
                type="button"
                onClick={() => void handleVerifyOtp()}
                disabled={verifying || otpCode.length !== 6}
                className={`h-11 w-full rounded-xl text-sm ${btnGradient}`}
              >
                {verifying ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {verifying ? "در حال تایید..." : "تایید و ورود به پنل"}
              </Button>

              <div className="flex items-center justify-between gap-3 text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={backToCredentials}
                  disabled={verifying}
                  className="h-9 gap-2 rounded-lg px-3 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  <ArrowRight className="size-4" />
                  بازگشت به مرحله‌ی اول
                </Button>
                {resendIn > 0 ? (
                  <span className="text-xs font-bold text-muted-foreground">
                    ارسال مجدد تا {faDigits(resendIn)} ثانیه
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void handleResend()}
                    disabled={verifying}
                    className="h-9 gap-2 rounded-lg px-3 text-xs font-bold text-teal-700 hover:text-teal-600 dark:text-teal-300"
                  >
                    <RotateCcw className="size-4" />
                    ارسال مجدد کد
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
