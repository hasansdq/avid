"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  User,
  Phone,
  Loader2,
  Send,
  Check,
  Sparkles,
  GraduationCap,
  Bot,
  Wallet,
  Banknote,
  CalendarClock,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  Armchair,
  UsersRound,
  MessageSquareText,
  KeyRound,
  LogOut,
  Clock3,
  ChevronLeft,
  ArrowRight,
  Globe,
  MapPin,
  TicketPercent,
  BadgePercent,
} from "lucide-react";
import type { Course } from "@prisma/client";
import { useEnrollStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { faDigits, faDate } from "@/lib/fa";
import type { AvailabilityMap, GroupAvailability } from "@/lib/availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * دوره به‌همراه قالب اقساط آن — صفحات سرور، دوره‌ها را با
 * installmentTemplate (تعداد و سررسید اقساط) به فرم می‌رسانند.
 */
export type PublicCourse = Course & {
  installmentTemplate?: { index: number; dueDate: Date | string }[];
};

/** پاسخ GET /api/payment/config — مبالغ شهریه از رکورد خود دوره می‌آید */
interface PaymentConfig {
  enabled: boolean;
  gateway: "none" | "zarinpal" | "payping" | "test";
  installmentCount: number;
}

/** پاسخ POST /api/discount-codes/validate */
interface DiscountValidation {
  ok: true;
  code: string;
  paymentType: "cash" | "installment" | "both";
  valueType: "percent" | "amount";
  value: number;
  discountAmount: number;
  baseAmount: number;
  finalAmount: number;
}

/** پاسخ GET /api/user/session */
interface SessionUser {
  firstName: string;
  lastName: string;
  phone: string;
}

const GATEWAY_LABELS: Record<string, string> = {
  zarinpal: "زرین‌پال",
  payping: "پی‌پینگ",
  test: "درگاه آزمایشی",
};

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

type PayMethod = "cash" | "installment";

/* ————————————————— مرحله‌ی فرم ————————————————— */

/** مرحله‌ی جاری: ۱ = ثبت‌نام و تایید شماره · ۲ = انتخاب دوره · ۳ = پرداخت و تکمیل */
type Stage = 1 | 2 | 3;

/**
 * EnrollForm — فرم سه‌مرحله‌ای پیش‌ثبت‌نام دوره‌ها
 *
 *  • مرحله‌ی ۱: ثبت‌نام (نام و نام خانوادگی) + تایید شماره موبایل با کد پیامکی
 *  • مرحله‌ی ۲: انتخاب دوره — لیست تک‌انتخابی (عنوان، شهریه، حضوری/آنلاین، زمان
 *    برگزاری کلاس) + گروه زمانی برای دوره‌های حضوریِ گروه‌دار
 *  • مرحله‌ی ۳: پرداخت وجه پیش‌ثبت‌نام (نقدی/اقساطی و انتقال به درگاه)
 *
 * اگر کاربر وارد حساب کاربری شده باشد (کوکی نشست)، مرحله‌ی اول انجام
 * شده تلقی می‌شود و مستقیم مرحله‌ی دوم نشان داده می‌شود؛ عبور از مرحله‌ی
 * اول برای کاربر واردنشده الزامی است (API هم بدون نشست ثبت‌نام نمی‌پذیرد).
 *
 * `preselectFromUrl` → اگر true باشد و برگه با ?course=عنوان
 * باز شده باشد، همان دوره به‌صورت پیش‌فرض انتخاب می‌شود.
 */
export function EnrollForm({
  courses,
  preselectFromUrl = false,
}: {
  courses: PublicCourse[];
  preselectFromUrl?: boolean;
}) {
  const selectedCourse = useEnrollStore((s) => s.selectedCourse);

  // — مرحله —
  const [stage, setStage] = React.useState<Stage>(1);
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [sessionChecked, setSessionChecked] = React.useState(false);

  // — مرحله‌ی ۱: ثبت‌نام و تایید شماره —
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = React.useState(false);
  const [verifyingOtp, setVerifyingOtp] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  const [notRobot, setNotRobot] = React.useState(false);

  // — مرحله‌ی ۲: دوره —
  const [course, setCourse] = React.useState("");
  const [groupId, setGroupId] = React.useState("");

  // — مرحله‌ی ۳: پرداخت —
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [payConfig, setPayConfig] = React.useState<PaymentConfig | null>(null);
  const [payMethod, setPayMethod] = React.useState<PayMethod>("cash");
  const [payResult, setPayResult] = React.useState<
    "success" | "failed" | null
  >(null);

  // — کد تخفیف —
  const [discountInput, setDiscountInput] = React.useState("");
  const [discountChecking, setDiscountChecking] = React.useState(false);
  const [discountInfo, setDiscountInfo] = React.useState<DiscountValidation | null>(null);
  const [discountError, setDiscountError] = React.useState<string | null>(null);

  // — ظرفیت دوره‌ها و گروه‌ها (وضعیت تکمیل/باقیمانده از سرور) —
  const [availability, setAvailability] =
    React.useState<AvailabilityMap | null>(null);
  const refreshAvailability = React.useCallback(async () => {
    try {
      const res = await fetch("/api/enroll/availability");
      if (res.ok) setAvailability((await res.json()) as AvailabilityMap);
    } catch {
      // بی‌خطر: فقط اطلاعات نمایشی است؛ اعمال نهایی با سرور است
    }
  }, []);

  // — نشست کاربر: اگر وارد شده باشد مستقیم مرحله‌ی ۲ —
  React.useEffect(() => {
    fetch("/api/user/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user: SessionUser | null } | null) => {
        if (data?.user) {
          setUser(data.user);
          setStage(2);
        }
      })
      .catch(() => undefined)
      .finally(() => setSessionChecked(true));
  }, []);

  React.useEffect(() => {
    if (selectedCourse) setCourse(selectedCourse);
  }, [selectedCourse]);

  // پیش‌انتخاب دوره از پارامتر آدرس (?course=...)
  React.useEffect(() => {
    if (!preselectFromUrl) return;
    const param = new URLSearchParams(window.location.search).get("course");
    if (param && courses.some((c) => c.title === param)) {
      setCourse(param);
    }
  }, [preselectFromUrl, courses]);

  // دریافت پیکربندی پرداخت و وضعیت ظرفیت از سرور
  React.useEffect(() => {
    fetch("/api/payment/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PaymentConfig | null) => setPayConfig(data))
      .catch(() => setPayConfig(null));
    refreshAvailability();
  }, [refreshAvailability]);

  // شمارش معکوس ارسال مجدد کد
  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // نتیجه‌ی بازگشت از درگاه (?payment=success|failed)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("payment");
    if (p === "success" || p === "failed") {
      setPayResult(p);
      // پاک‌سازی آدرس بدون رفرش
      window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.hash
      );
    }
  }, []);

  const payEnabled = !!payConfig?.enabled;

  // — دوره‌ی انتخاب‌شده —
  const selected = React.useMemo(
    () => courses.find((c) => c.title === course) ?? null,
    [courses, course]
  );

  // — وضعیت ظرفیت دوره‌ی انتخاب‌شده —
  const selectedAvail = availability?.[course];
  const courseFull = !!selectedAvail?.full;
  const hasGroups = !!selectedAvail?.groups?.length;
  const groups: GroupAvailability[] = selectedAvail?.groups ?? [];
  // گروه‌های حضوری فقط برای دوره‌ی انتخاب‌شده‌ی حضوریِ دارای گروه
  const showGroups =
    !!selected && selected.type === "inperson" && hasGroups;
  const selectedGroup = groups.find((g) => g.id === groupId) ?? null;
  const groupFull = !!selectedGroup?.full;

  const remainingSeats =
    selectedAvail && selectedAvail.capacity > 0
      ? Math.max(0, selectedAvail.remaining)
      : null;
  const availabilityLoaded = !!availability;
  // تعداد اقساط: قالب اختصاصی دوره (در صورت تعریف) یا پیش‌فرض سراسری
  const templateCount = selected?.installmentTemplate?.length ?? 0;
  const instCount = Math.max(
    1,
    templateCount > 0 ? templateCount : (payConfig?.installmentCount ?? 1)
  );
  const cashAmount = selected?.cashTuition ?? 0;
  const instTotal = selected?.installmentTuition ?? 0;
  const installmentAvailable = instTotal > 0;
  // — تخفیف کد تأییدشده —
  const discountAmount = discountInfo?.discountAmount ?? 0;
  const cashFinal = Math.max(0, cashAmount - discountAmount);
  const instFinalTotal = Math.max(0, instTotal - discountAmount);
  const firstInstallment = installmentAvailable
    ? Math.ceil(instFinalTotal / instCount)
    : 0;
  const courseFree =
    !!selected &&
    (cashFinal === 0 && !installmentAvailable) &&
    !(payMethod === "installment" && instFinalTotal > 0);

  // اگر دوره‌ی جدید اقساط ندارد، روش به نقدی برمی‌گردد
  React.useEffect(() => {
    if (payMethod === "installment" && selected && !installmentAvailable) {
      setPayMethod("cash");
    }
  }, [selected, installmentAvailable, payMethod]);

  // با تغییر دوره یا روش پرداخت، کد تخفیف تأییدشده‌ی قبلی نامعتبر می‌شود
  React.useEffect(() => {
    setDiscountInfo(null);
    setDiscountError(null);
  }, [course, payMethod]);

  // با تغییر دوره، گروه انتخابی قبلی پاک می‌شود
  React.useEffect(() => {
    setGroupId("");
  }, [course]);

  const payable =
    payMethod === "installment" ? firstInstallment : cashFinal;
  const payNeeded =
    payEnabled && !!selected && payable > 0 && !courseFull && !groupFull;

  // — گروه الزامی است اما انتخاب نشده (فقط نمایشی؛ دکمه غیرفعال می‌شود) —
  const groupMissing = showGroups && !selectedGroup;

  /* ————————————————— مرحله‌ی ۱: ارسال کد ————————————————— */

  async function handleRequestOtp() {
    const cleanPhone = phone.replace(/[\s-]/g, "");
    if (firstName.trim().length < 2) {
      toast.error("لطفاً نام خود را کامل وارد کنید.");
      return;
    }
    if (lastName.trim().length < 2) {
      toast.error("لطفاً نام خانوادگی خود را کامل وارد کنید.");
      return;
    }
    if (!/^09\d{9}$/.test(cleanPhone)) {
      toast.error("شماره موبایل معتبر وارد کنید (مثال: ۰۹۱۲۳۴۵۶۷۸۹).");
      return;
    }
    if (!notRobot) {
      toast.error("لطفاً گزینه‌ی «من ربات نیستم» را فعال کنید.");
      return;
    }

    setSendingOtp(true);
    setDevCode(null);
    try {
      const res = await fetch("/api/user/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: cleanPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ارسال کد تایید");

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
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در ارسال کد تایید."
      );
    } finally {
      setSendingOtp(false);
    }
  }

  /* ————————————————— مرحله‌ی ۱: تایید کد ————————————————— */

  async function handleVerifyOtp() {
    const cleanPhone = phone.replace(/[\s-]/g, "");
    const code = otpCode.replace(/\D/g, "");
    if (code.length !== 6) {
      toast.error("کد تایید ۶ رقمی را کامل وارد کنید.");
      return;
    }

    setVerifyingOtp(true);
    try {
      const res = await fetch("/api/user/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          code,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در تایید کد");

      setUser(data.user);
      setStage(2);
      setDevCode(null);
      toast.success("شماره موبایل تایید شد؛ حساب شما فعال است.", {
        description: "اکنون دوره‌ی مورد نظر خود را انتخاب کنید.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در تایید کد.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  /** خروج از حساب → بازگشت به مرحله‌ی اول (عبور از آن دوباره الزامی است) */
  async function handleLogout() {
    try {
      await fetch("/api/user/session", { method: "DELETE" });
    } catch {
      // بی‌خطر
    }
    setUser(null);
    setStage(1);
    setOtpSent(false);
    setOtpCode("");
    setDevCode(null);
    setNotRobot(false);
    toast.info("از حساب خود خارج شدید؛ برای ادامه دوباره ثبت‌نام کنید.");
  }

  /* ————————————————— مرحله‌ی ۲ → ۳: تایید انتخاب دوره ————————————————— */

  /** اعتبارسنجی انتخاب دوره و رفتن به مرحله‌ی پرداخت */
  function handleGoToPayment() {
    if (!user) {
      // نباید رخ دهد (مرحله‌ی ۲ فقط با حساب نمایش داده می‌شود)
      setStage(1);
      toast.error("ابتدا ثبت‌نام و تایید شماره موبایل را کامل کنید.");
      return;
    }
    if (!course) {
      toast.error("لطفاً دوره مورد نظر خود را از لیست انتخاب کنید.");
      return;
    }
    if (courseFull) {
      toast.error(
        "ظرفیت این دوره تکمیل شده است؛ لطفاً دوره‌ی دیگری انتخاب کنید."
      );
      return;
    }
    if (showGroups && !selectedGroup) {
      toast.error("لطفاً گروه زمانی مورد نظر خود را انتخاب کنید.");
      return;
    }
    if (groupFull) {
      toast.error(
        "ظرفیت این گروه تکمیل شده است؛ لطفاً گروه دیگری انتخاب کنید."
      );
      return;
    }
    setDone(false);
    setStage(3);
  }

  /* ————————————————— بررسی کد تخفیف ————————————————— */

  async function handleCheckDiscount() {
    const code = discountInput.trim().toUpperCase();
    if (!code) {
      toast.error("متن کد تخفیف را وارد کنید.");
      return;
    }
    if (!course) {
      toast.error("ابتدا دوره‌ی مورد نظر خود را انتخاب کنید.");
      return;
    }

    setDiscountChecking(true);
    setDiscountError(null);
    try {
      const res = await fetch("/api/discount-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, method: payMethod, course }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "کد تخفیف معتبر نیست.");
      }
      setDiscountInfo(data as DiscountValidation);
      toast.success("کد تخفیف با موفقیت اعمال شد.", {
        description: `مبلغ تخفیف: ${faAmount(data.discountAmount)} تومان`,
      });
    } catch (err) {
      setDiscountInfo(null);
      setDiscountError(
        err instanceof Error ? err.message : "کد تخفیف معتبر نیست."
      );
    } finally {
      setDiscountChecking(false);
    }
  }

  /* ————————————————— مرحله‌ی ۳: ثبت نهایی و پرداخت ————————————————— */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Enter در مرحله‌ی ۲ → همان دکمه‌ی «ادامه» عمل می‌کند
    if (stage === 2) {
      handleGoToPayment();
      return;
    }
    if (stage !== 3) return;

    if (!user) {
      setStage(1);
      toast.error("ابتدا ثبت‌نام و تایید شماره موبایل را کامل کنید.");
      return;
    }
    if (!course) {
      setStage(2);
      toast.error("لطفاً دوره مورد نظر خود را انتخاب کنید.");
      return;
    }
    if (courseFull || groupFull) {
      setStage(2);
      toast.error("ظرفیت دوره/گروه انتخابی تکمیل شده است؛ لطفاً انتخاب خود را تغییر دهید.");
      return;
    }
    if (showGroups && !selectedGroup) {
      setStage(2);
      toast.error("لطفاً گروه زمانی مورد نظر خود را انتخاب کنید.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course,
          ...(showGroups && selectedGroup
            ? { groupId: selectedGroup.id }
            : {}),
          ...(payEnabled ? { paymentMethod: payMethod } : {}),
          ...(payEnabled && discountInfo?.code
            ? { discountCode: discountInfo.code }
            : {}),
        }),
      });
      const data = await res.json();

      if (res.status === 401) {
        setStage(1);
        throw new Error(data.error || "ابتدا ثبت‌نام خود را کامل کنید.");
      }
      if (!res.ok) throw new Error(data.error || "خطا در ثبت درخواست");

      // — پرداخت فعال است و دوره‌ی انتخابی شهریه دارد: انتقال به درگاه —
      if (payNeeded) {
        toast.success("درخواست ثبت شد؛ در حال انتقال به درگاه پرداخت...");
        try {
          const payRes = await fetch("/api/payment/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              enrollmentId: data.id,
              method: payMethod,
            }),
          });
          const payData = await payRes.json();
          if (!payRes.ok || !payData.redirectUrl) {
            throw new Error(payData.error || "خطا در آغاز پرداخت");
          }
          window.location.href = payData.redirectUrl as string;
          return; // در حال ریدایرکت — فرم پاک نمی‌شود
        } catch (payErr) {
          // ثبت‌نام ذخیره شده ولی درگاه در دسترس نیست
          setDone(true);
          toast.warning("ثبت‌نام ذخیره شد، اما انتقال به درگاه ناموفق بود.", {
            description:
              payErr instanceof Error
                ? payErr.message
                : "کارشناسان ما برای پرداخت با شما تماس می‌گیرند.",
          });
        }
      } else {
        setDone(true);
        toast.success("درخواست ثبت‌نام شما ثبت شد!", {
          description:
            "کارشناسان ما به‌زودی برای تکمیل ثبت‌نام با شما تماس می‌گیرند.",
        });
      }

      useEnrollStore.getState().setSelectedCourse("");
      // تازه‌سازی ظرفیت‌ها — ثبت‌نام جدید ممکن است آخرین جای خالی را گرفته باشد
      refreshAvailability();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطایی رخ داد. دوباره تلاش کنید."
      );
    } finally {
      setLoading(false);
    }
  };

  /** ثبت‌نام جدید بعد از موفقیت → بازگشت به مرحله‌ی انتخاب دوره */
  function handleNewEnrollment() {
    setDone(false);
    setCourse("");
    setGroupId("");
    useEnrollStore.getState().setSelectedCourse("");
    setStage(2);
  }

  /* ————————————————— رندر ————————————————— */

  return (
    <form
      onSubmit={handleSubmit}
      className="gradient-border relative rounded-[1.75rem] bg-card/85 p-7 shadow-2xl shadow-black/10 backdrop-blur-xl dark:bg-[#08110e]/80 dark:shadow-black/30 md:p-9"
    >
      <div className="pointer-events-none absolute -top-20 left-1/2 size-44 -translate-x-1/2 rounded-full bg-teal-400/10 blur-[80px]" />

      {/* نتیجه‌ی بازگشت از درگاه پرداخت */}
      {payResult && (
        <div
          className={cn(
            "mb-5 flex items-center gap-3 rounded-2xl border p-4 text-sm font-bold",
            payResult === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300"
          )}
          role="status"
        >
          {payResult === "success" ? (
            <CheckCircle2 className="size-5 shrink-0" />
          ) : (
            <XCircle className="size-5 shrink-0" />
          )}
          <p className="leading-6">
            {payResult === "success"
              ? "پرداخت شما با موفقیت انجام شد؛ ثبت‌نام شما تکمیل گردید. کارشناسان ما برای شروع دوره با شما تماس می‌گیرند."
              : "پرداخت ناموفق بود یا لغو شد. ثبت‌نام شما حفظ شده است؛ می‌توانید دوباره تلاش کنید یا منتظر تماس کارشناسان بمانید."}
          </p>
        </div>
      )}

      <div className="relative flex items-center gap-3 border-b border-foreground/[0.07] pb-6 dark:border-white/[0.07]">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25">
          <GraduationCap className="size-6 text-teal-950" />
        </span>
        <div>
          <h4 className="text-lg font-black text-foreground">فرم پیش‌ثبت‌نام</h4>
          <p className="text-xs text-muted-foreground">
            {stage === 1
              ? "مرحله‌ی اول: ثبت‌نام و تایید شماره موبایل"
              : stage === 2
                ? "مرحله‌ی دوم: انتخاب دوره"
                : "مرحله‌ی سوم: پرداخت و تکمیل ثبت‌نام"}
          </p>
        </div>
        <Sparkles className="mr-auto size-5 text-violet-600 dark:text-violet-300" />
      </div>

      {/* — نشان مراحل سه‌گانه — */}
      <ol className="relative mt-5 flex items-center gap-2" aria-label="مراحل ثبت‌نام">
        <StageStep
          index={1}
          label="ثبت‌نام و تایید"
          state={stage === 1 ? "current" : "done"}
        />
        <span className="h-px flex-1 bg-foreground/[0.1] dark:bg-white/[0.1]" />
        <StageStep
          index={2}
          label="انتخاب دوره"
          state={stage === 2 ? "current" : stage === 3 ? "done" : "todo"}
        />
        <span className="h-px flex-1 bg-foreground/[0.1] dark:bg-white/[0.1]" />
        <StageStep
          index={3}
          label="پرداخت و تکمیل"
          state={stage === 3 ? "current" : "todo"}
        />
      </ol>

      {/* ————————————————— مرحله‌ی ۱ ————————————————— */}
      {stage === 1 ? (
        <div className="relative mt-6 space-y-5">
          {/* بارگذاری نشست */}
          {!sessionChecked ? (
            <p className="flex select-none items-center gap-2 rounded-xl border border-dashed border-foreground/15 bg-foreground/[0.02] px-3.5 py-3 text-[0.7rem] font-bold text-muted-foreground dark:border-white/15 dark:bg-white/[0.02]">
              <Loader2 className="size-4 shrink-0 animate-spin" />
              در حال بررسی حساب کاربری شما...
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-bold text-foreground/90">
                نام
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="مثلاً: سارا"
                  className="h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-right placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40"
                  disabled={otpSent || sendingOtp}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-bold text-foreground/90">
                نام خانوادگی
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="مثلاً: محمدی"
                  className="h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-right placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40"
                  disabled={otpSent || sendingOtp}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-bold text-foreground/90">
              شماره موبایل
            </Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09123456789"
                dir="ltr"
                inputMode="tel"
                className="h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-right placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40"
                disabled={otpSent || sendingOtp}
              />
            </div>
          </div>

          {/* — کد تایید پیامکی — */}
          {otpSent ? (
            <div className="space-y-3 rounded-2xl border border-teal-500/30 bg-teal-500/[0.05] p-4 dark:border-teal-400/25 dark:bg-teal-400/[0.04]">
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor="otp"
                  className="flex items-center gap-2 text-sm font-bold text-foreground/90"
                >
                  <KeyRound className="size-4 text-teal-600 dark:text-teal-300" />
                  کد تایید پیامکی
                </Label>
                <span className="select-none text-[0.65rem] font-bold text-muted-foreground">
                  ارسال‌شده به {faDigits(phone)}
                </span>
              </div>

              <Input
                id="otp"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="—— ——"
                dir="ltr"
                inputMode="numeric"
                autoFocus
                className="h-14 rounded-xl border-teal-500/30 bg-background text-center text-lg font-black tracking-[0.6em] tabular-nums placeholder:tracking-[0.6em] focus-visible:ring-teal-500/40 dark:border-teal-400/30 dark:bg-white/[0.04]"
              />

              {devCode ? (
                <p className="flex select-none items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-[0.7rem] font-bold leading-5 text-amber-700 dark:border-amber-400/35 dark:bg-amber-400/10 dark:text-amber-300" role="note">
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
                  onClick={handleVerifyOtp}
                  disabled={verifyingOtp || otpCode.replace(/\D/g, "").length !== 6}
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
                      تایید و ادامه
                    </>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpCode("");
                    setDevCode(null);
                  }}
                  className="select-none text-xs font-bold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  ویرایش اطلاعات
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
            <>
              {/* تأیید انسان بودن — سبک reCAPTCHA */}
              <div className="space-y-2">
                <Label className="text-sm font-bold text-foreground/90">
                  تأیید امنیتی
                </Label>
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border p-4 transition-all duration-300",
                    notRobot
                      ? "border-teal-500/45 bg-teal-500/[0.07] shadow-sm shadow-teal-500/10 dark:border-teal-400/45 dark:bg-teal-400/[0.06]"
                      : "border-foreground/[0.12] bg-foreground/[0.03] dark:border-white/[0.12] dark:bg-white/[0.03]"
                  )}
                >
                  <label
                    htmlFor="not-robot"
                    className="flex cursor-pointer select-none items-center gap-3"
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 transition-all duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
                        notRobot
                          ? "scale-105 border-teal-500 bg-gradient-to-br from-teal-400 to-emerald-500 shadow-sm shadow-teal-500/30 dark:border-teal-400"
                          : "border-foreground/30 bg-card hover:border-teal-500/50 dark:border-white/30 dark:bg-white/[0.04]"
                      )}
                    >
                      {notRobot ? (
                        <Check
                          className="size-4 text-teal-950"
                          strokeWidth={3.2}
                        />
                      ) : null}
                    </span>
                    <input
                      id="not-robot"
                      type="checkbox"
                      checked={notRobot}
                      onChange={(e) => setNotRobot(e.target.checked)}
                      className="sr-only"
                      aria-required="true"
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
              </div>

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
            </>
          )}
        </div>
      ) : (
        /* ————————————————— مرحله‌ی ۲ و ۳ ————————————————— */
        <div className="relative mt-6 space-y-5">
          {/* حساب کاربری تاییدشده */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3 dark:border-emerald-400/25 dark:bg-emerald-400/[0.06]">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md shadow-emerald-500/20">
                <CheckCircle2 className="size-5 text-white" strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-foreground">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="flex items-center gap-1.5 text-[0.65rem] font-bold text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="size-3.5" />
                  شماره تاییدشده:
                  <span dir="ltr" className="tabular-nums">
                    {faDigits(user?.phone ?? "")}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex select-none items-center gap-1.5 rounded-xl border border-foreground/[0.1] px-3 py-2 text-[0.7rem] font-bold text-muted-foreground transition-colors hover:border-red-500/30 hover:text-red-600 dark:border-white/10 dark:hover:border-red-400/30 dark:hover:text-red-300"
            >
              <LogOut className="size-3.5" />
              خروج
            </button>
          </div>

          {stage === 2 ? (
            /* ————————————————— مرحله‌ی ۲: انتخاب دوره ————————————————— */
            <>
              {/* لیست تک‌انتخابی دوره‌ها — عنوان، شهریه، حضوری/آنلاین، زمان برگزاری */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-bold text-foreground/90">
                    انتخاب دوره
                  </Label>
                  <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                    {faDigits(courses.length)} دوره فعال · تک‌انتخابی
                  </span>
                </div>

                <div
                  className="max-h-[22rem] space-y-2.5 overflow-y-auto p-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/15 [&::-webkit-scrollbar-thumb]:dark:bg-white/15 [&::-webkit-scrollbar]:w-1.5"
                  role="radiogroup"
                  aria-label="انتخاب دوره"
                >
                  {courses.map((c) => {
                    const itemAvail = availability?.[c.title];
                    const itemFull = !!itemAvail?.full;
                    const itemRemaining =
                      itemAvail && itemAvail.capacity > 0
                        ? Math.max(0, itemAvail.remaining)
                        : null;
                    const active = course === c.title;

                    // زمان برگزاری کلاس
                    const scheduleText =
                      c.type === "inperson"
                        ? c.schedule.trim() ||
                          (itemAvail?.groups?.length
                            ? "هماهنگی در گروه‌های زمانی"
                            : "به‌زودی اعلام می‌شود")
                        : "آموزش آنلاین — بدون زمان‌بندی";

                    // شهریه
                    const tuitionText =
                      c.cashTuition > 0
                        ? `${faAmount(c.cashTuition)} تومان`
                        : "رایگان";

                    return (
                      <label
                        key={c.id}
                        className={cn(
                          "flex select-none items-start gap-3 rounded-2xl border p-4 transition-all duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
                          itemFull
                            ? "cursor-not-allowed border-foreground/[0.08] bg-foreground/[0.02] opacity-55 dark:border-white/[0.08] dark:bg-white/[0.02]"
                            : active
                              ? "cursor-pointer border-teal-500/50 bg-teal-500/[0.07] shadow-sm shadow-teal-500/10 dark:border-teal-400/50 dark:bg-teal-400/[0.06]"
                              : "cursor-pointer border-foreground/[0.12] bg-foreground/[0.03] hover:border-teal-500/35 dark:border-white/[0.12] dark:bg-white/[0.03] dark:hover:border-teal-400/35"
                        )}
                      >
                        <input
                          type="radio"
                          name="course-choice"
                          value={c.title}
                          checked={active}
                          disabled={itemFull}
                          onChange={() => setCourse(c.title)}
                          className="sr-only"
                        />
                        <span
                          className={cn(
                            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                            active
                              ? "border-teal-500 bg-gradient-to-br from-teal-400 to-emerald-500 shadow-sm shadow-teal-500/30 dark:border-teal-400"
                              : "border-foreground/30 bg-card dark:border-white/30 dark:bg-white/[0.04]"
                          )}
                        >
                          {active ? (
                            <Check
                              className="size-3 text-teal-950"
                              strokeWidth={3.5}
                            />
                          ) : null}
                        </span>

                        <span className="min-w-0 flex-1">
                          {/* عنوان دوره + برچسب‌ها */}
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-foreground">
                              {c.title}
                            </span>
                            {c.tag ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.55rem] font-black text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                                {c.tag}
                              </span>
                            ) : null}
                            {itemFull ? (
                              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[0.55rem] font-black text-red-700 dark:bg-red-400/15 dark:text-red-300">
                                تکمیل ظرفیت
                              </span>
                            ) : itemRemaining !== null && itemRemaining <= 3 ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.55rem] font-black text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                                {faDigits(itemRemaining)} ظرفیت آخر
                              </span>
                            ) : null}
                          </span>

                          {/* مشخصات: شهریه · حضوری/آنلاین · زمان برگزاری کلاس */}
                          <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.7rem] leading-5 font-semibold">
                            <span className="flex items-center gap-1.5 font-bold text-teal-700 dark:text-teal-300">
                              <Banknote className="size-3.5 shrink-0" />
                              {tuitionText}
                              {c.installmentTuition > 0 ? (
                                <span className="font-semibold text-muted-foreground">
                                  (یا {faAmount(c.installmentTuition)} اقساطی)
                                </span>
                              ) : null}
                            </span>
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              {c.type === "online" ? (
                                <Globe className="size-3.5 shrink-0 text-violet-600 dark:text-violet-300" />
                              ) : (
                                <MapPin className="size-3.5 shrink-0 text-violet-600 dark:text-violet-300" />
                              )}
                              {c.type === "online" ? "آنلاین" : "حضوری"}
                            </span>
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <CalendarClock className="size-3.5 shrink-0" />
                              {scheduleText}
                            </span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* وضعیت ظرفیت دوره‌ی انتخاب‌شده */}
              {selected && courseFull ? (
                <div
                  className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-[0.7rem] font-bold leading-5 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300"
                  role="alert"
                >
                  <XCircle className="size-4 shrink-0" />
                  <p>
                    ظرفیت این دوره تکمیل شده است؛ پیش‌ثبت‌نام و پرداخت برای آن
                    امکان‌پذیر نیست. لطفاً دوره‌ی دیگری انتخاب کنید یا با پشتیبانی
                    تماس بگیرید.
                  </p>
                </div>
              ) : selected && remainingSeats !== null && !showGroups ? (
                <p className="flex select-none items-center gap-2 rounded-xl border border-foreground/[0.09] bg-foreground/[0.02] px-3.5 py-2.5 text-[0.7rem] font-bold leading-5 text-muted-foreground dark:border-white/[0.09] dark:bg-white/[0.02]">
                  <UsersRound
                    className={cn(
                      "size-4 shrink-0",
                      remainingSeats <= 3
                        ? "text-amber-500 dark:text-amber-300"
                        : "text-teal-600 dark:text-teal-300"
                    )}
                  />
                  ظرفیت باقیمانده این دوره:
                  <span
                    className={cn(
                      "tabular-nums font-black",
                      remainingSeats <= 3
                        ? "text-amber-600 dark:text-amber-300"
                        : "text-foreground"
                    )}
                  >
                    {faDigits(remainingSeats)} نفر
                  </span>
                  {availabilityLoaded && remainingSeats <= 3 ? (
                    <Armchair className="mr-auto size-4 shrink-0 text-amber-500/70 dark:text-amber-300/70" />
                  ) : null}
                </p>
              ) : null}

              {/* — گروه‌های زمانی (دوره‌ی حضوریِ گروه‌دار) — */}
              {showGroups && !courseFull ? (
                <div className="space-y-3 rounded-2xl border border-violet-500/25 bg-violet-500/[0.04] p-4 dark:border-violet-400/20 dark:bg-violet-400/[0.04]">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="flex items-center gap-2 text-sm font-bold text-foreground/90">
                      <CalendarClock className="size-4 text-violet-600 dark:text-violet-300" />
                      انتخاب گروه زمانی
                    </Label>
                    <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                      {faDigits(groups.length)} گروه ·{" "}
                      {selectedAvail && selectedAvail.capacity > 0
                        ? `${faDigits(selectedAvail.remaining)} جای خالی`
                        : "بدون محدودیت"}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {groups.map((g) => {
                      const active = groupId === g.id;
                      return (
                        <label
                          key={g.id}
                          className={cn(
                            "flex select-none cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
                            g.full
                              ? "cursor-not-allowed border-foreground/[0.08] bg-foreground/[0.02] opacity-55 dark:border-white/[0.08] dark:bg-white/[0.02]"
                              : active
                                ? "border-violet-500/50 bg-violet-500/[0.08] shadow-sm shadow-violet-500/10 dark:border-violet-400/50 dark:bg-violet-400/[0.07]"
                                : "border-foreground/[0.12] bg-foreground/[0.03] hover:border-violet-500/35 dark:border-white/[0.12] dark:bg-white/[0.03] dark:hover:border-violet-400/35"
                          )}
                        >
                          <input
                            type="radio"
                            name="group-choice"
                            value={g.id}
                            checked={active}
                            disabled={g.full}
                            onChange={() => setGroupId(g.id)}
                            className="sr-only"
                          />
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                              active
                                ? "border-violet-500 bg-gradient-to-br from-violet-400 to-fuchsia-500 shadow-sm shadow-violet-500/30 dark:border-violet-400"
                                : "border-foreground/30 bg-card dark:border-white/30 dark:bg-white/[0.04]"
                            )}
                          >
                            {active ? (
                              <Check
                                className="size-3 text-white"
                                strokeWidth={3.5}
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black text-foreground">
                                {g.title}
                              </span>
                              {g.schedule ? (
                                <span className="text-[0.65rem] font-semibold leading-5 text-muted-foreground">
                                  {g.schedule}
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={cn(
                                "mt-1 flex select-none items-center gap-1.5 text-[0.65rem] font-bold leading-5",
                                g.full
                                  ? "text-red-600 dark:text-red-300"
                                  : "text-muted-foreground"
                              )}
                            >
                              <UsersRound
                                className={cn(
                                  "size-3.5 shrink-0",
                                  g.full
                                    ? "text-red-500"
                                    : g.capacity > 0 && g.remaining <= 3
                                      ? "text-amber-500 dark:text-amber-300"
                                      : "text-violet-500/80 dark:text-violet-300/80"
                                )}
                              />
                              {g.full ? (
                                "ظرفیت این گروه تکمیل است"
                              ) : g.capacity > 0 ? (
                                <>
                                  ظرفیت باقیمانده:
                                  <span
                                    className={cn(
                                      "tabular-nums font-black",
                                      g.remaining <= 3
                                        ? "text-amber-600 dark:text-amber-300"
                                        : "text-foreground"
                                    )}
                                  >
                                    {faDigits(g.remaining)} نفر
                                  </span>
                                  <span className="font-semibold text-muted-foreground/60">
                                    (از {faDigits(g.capacity)})
                                  </span>
                                </>
                              ) : (
                                "بدون محدودیت ظرفیت"
                              )}
                            </span>
                          </span>
                          {g.full ? (
                            <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[0.55rem] font-black text-red-700 dark:bg-red-400/15 dark:text-red-300">
                              تکمیل ظرفیت
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>

                  {groupFull ? (
                    <p
                      className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-[0.7rem] font-bold leading-5 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300"
                      role="alert"
                    >
                      <XCircle className="size-4 shrink-0" />
                      ظرفیت این گروه تکمیل است؛ گروه دیگری انتخاب کنید.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* — ادامه به مرحله‌ی پرداخت — */}
              <Button
                type="button"
                onClick={handleGoToPayment}
                disabled={!course || courseFull || groupFull || groupMissing}
                className="h-13 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 py-3.5 text-base font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] hover:shadow-teal-400/40 disabled:opacity-60"
              >
                {courseFull || groupFull ? (
                  <>
                    <XCircle className="size-5" />
                    {groupFull ? "ظرفیت این گروه تکمیل شده است" : "ظرفیت این دوره تکمیل شده است"}
                  </>
                ) : groupMissing ? (
                  <>
                    <CalendarClock className="size-5" />
                    ابتدا گروه زمانی را انتخاب کنید
                  </>
                ) : !course ? (
                  <>
                    <GraduationCap className="size-5" />
                    ابتدا یک دوره را انتخاب کنید
                  </>
                ) : (
                  <>
                    ادامه به مرحله‌ی پرداخت
                    <ChevronLeft className="size-5" />
                  </>
                )}
              </Button>
            </>
          ) : (
            /* ————————————————— مرحله‌ی ۳: پرداخت ————————————————— */
            <>
              {done ? (
                /* — ثبت موفق — */
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-teal-500/30 bg-teal-500/[0.06] px-6 py-10 text-center dark:border-teal-400/25 dark:bg-teal-400/[0.05]">
                  <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 shadow-lg shadow-teal-500/30">
                    <CheckCircle2 className="size-8 text-white" strokeWidth={2.4} />
                  </span>
                  <div>
                    <p className="text-base font-black text-foreground">
                      درخواست شما با موفقیت ثبت شد!
                    </p>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">
                      کارشناسان ما به‌زودی برای تکمیل ثبت‌نام و شروع دوره با شما
                      تماس می‌گیرند.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleNewEnrollment}
                    className="rounded-xl border-teal-500/40 text-teal-700 hover:bg-teal-500/10 hover:text-teal-800 dark:border-teal-400/40 dark:text-teal-300 dark:hover:bg-teal-400/10"
                  >
                    <GraduationCap className="size-4" />
                    ثبت‌نام در دوره‌ی دیگر
                  </Button>
                </div>
              ) : (
                <>
                  {/* — خلاصه‌ی انتخاب (دوره + گروه) — */}
                  {selected ? (
                    <div className="space-y-3 rounded-2xl border border-teal-500/25 bg-foreground/[0.02] p-4 dark:border-teal-400/20 dark:bg-white/[0.02]">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="flex items-center gap-2 text-sm font-bold text-foreground/90">
                          <GraduationCap className="size-4 text-teal-600 dark:text-teal-300" />
                          دوره‌ی انتخاب‌شده
                        </Label>
                        <button
                          type="button"
                          onClick={() => setStage(2)}
                          className="flex select-none items-center gap-1 rounded-lg px-2 py-1 text-[0.65rem] font-bold text-teal-700 underline-offset-4 transition-colors hover:bg-teal-500/10 hover:underline dark:text-teal-300 dark:hover:bg-teal-400/10"
                        >
                          <ArrowRight className="size-3.5" />
                          ویرایش انتخاب دوره
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-foreground">
                          {selected.title}
                        </span>
                        <span className="flex select-none items-center gap-1 rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-[0.6rem] font-black text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300">
                          {selected.type === "online" ? (
                            <Globe className="size-3" />
                          ) : (
                            <MapPin className="size-3" />
                          )}
                          {selected.type === "online" ? "آنلاین" : "حضوری"}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.7rem] font-semibold leading-5 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CalendarClock className="size-3.5 shrink-0" />
                          {selected.type === "inperson"
                            ? selected.schedule.trim() ||
                              (selectedGroup?.schedule
                                ? `گروه ${selectedGroup.title}: ${selectedGroup.schedule}`
                                : "به‌زودی اعلام می‌شود")
                            : "آموزش آنلاین — بدون زمان‌بندی"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Banknote className="size-3.5 shrink-0" />
                          {cashAmount > 0
                            ? `شهریه نقدی: ${faAmount(cashAmount)} تومان`
                            : "رایگان"}
                        </span>
                        {installmentAvailable ? (
                          <span className="flex items-center gap-1.5">
                            <CalendarClock className="size-3.5 shrink-0" />
                            اقساطی: {faAmount(instTotal)} تومان در{" "}
                            {faDigits(instCount)} قسط
                          </span>
                        ) : null}
                      </div>

                      {selectedGroup ? (
                        <p className="flex select-none items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] px-3.5 py-2.5 text-[0.65rem] font-bold leading-5 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/[0.05] dark:text-violet-300">
                          <CalendarClock className="size-3.5 shrink-0" />
                          گروه زمانی: {selectedGroup.title}
                          {selectedGroup.schedule
                            ? ` — ${selectedGroup.schedule}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* — روش پرداخت و مبلغ پیش‌ثبت‌نام (شهریه‌ی اختصاصی دوره‌ی انتخاب‌شده) — */}
                  {payEnabled && payConfig ? (
                    <div className="space-y-3 rounded-2xl border border-foreground/[0.09] bg-foreground/[0.02] p-4 dark:border-white/[0.09] dark:bg-white/[0.02]">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="flex items-center gap-2 text-sm font-bold text-foreground/90">
                          <Wallet className="size-4 text-teal-600 dark:text-teal-300" />
                          پرداخت پیش‌ثبت‌نام
                        </Label>
                        {selected ? (
                          <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                            {GATEWAY_LABELS[payConfig.gateway] ?? "درگاه"} ·{" "}
                            {payNeeded
                              ? payMethod === "cash"
                                ? "نقدی"
                                : "اقساطی"
                              : "رایگان"}
                          </span>
                        ) : null}
                      </div>

                      {!selected ? (
                        <p className="flex items-center gap-2 rounded-xl border border-dashed border-foreground/20 bg-foreground/[0.02] px-3.5 py-3 text-[0.7rem] font-semibold leading-5 text-muted-foreground dark:border-white/20 dark:bg-white/[0.02]">
                          <Wallet className="size-4 shrink-0 text-teal-600/70 dark:text-teal-300/70" />
                          دوره‌ای انتخاب نشده است؛ برای نمایش شهریه به مرحله‌ی قبل بازگردید.
                        </p>
                      ) : courseFree ? (
                        <p className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-[0.7rem] font-black leading-5 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
                          <CheckCircle2 className="size-4 shrink-0" />
                          این دوره رایگان است؛ پس از ثبت‌نام بدون پرداخت فعال می‌شود.
                        </p>
                      ) : (
                        <>
                          {/* انتخاب تک‌گزینه‌ای: نقدی / اقساطی (رادیویی) */}
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {(
                              [
                                {
                                  key: "cash" as const,
                                  icon: Banknote,
                                  title: "پرداخت نقدی",
                                  desc:
                                    cashFinal > 0
                                      ? `${faAmount(cashFinal)} تومان`
                                      : "رایگان",
                                },
                                {
                                  key: "installment" as const,
                                  icon: CalendarClock,
                                  title: "پرداخت اقساطی",
                                  desc: installmentAvailable
                                    ? `${faAmount(firstInstallment)} تومان × ${faDigits(
                                        instCount
                                      )} قسط`
                                    : "برای این دوره فعال نیست",
                                },
                              ] as const
                            ).map((opt) => {
                              const disabled =
                                opt.key === "installment" && !installmentAvailable;
                              const active = payMethod === opt.key && !disabled;
                              return (
                                <label
                                  key={opt.key}
                                  className={cn(
                                    "flex select-none items-center gap-3 rounded-xl border p-3.5 transition-all duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
                                    disabled
                                      ? "cursor-not-allowed border-foreground/[0.08] bg-foreground/[0.02] opacity-50 dark:border-white/[0.08] dark:bg-white/[0.02]"
                                      : cn(
                                          "cursor-pointer",
                                          active
                                            ? "border-teal-500/50 bg-teal-500/[0.07] shadow-sm shadow-teal-500/10 dark:border-teal-400/50 dark:bg-teal-400/[0.06]"
                                            : "border-foreground/[0.12] bg-foreground/[0.03] hover:border-teal-500/30 dark:border-white/[0.12] dark:bg-white/[0.03] dark:hover:border-teal-400/30"
                                        )
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name="pay-method"
                                    value={opt.key}
                                    checked={active}
                                    disabled={disabled}
                                    onChange={() => setPayMethod(opt.key)}
                                    className="sr-only"
                                  />
                                  <span
                                    className={cn(
                                      "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                                      active
                                        ? "border-teal-500 bg-gradient-to-br from-teal-400 to-emerald-500 shadow-sm shadow-teal-500/30 dark:border-teal-400"
                                        : "border-foreground/30 bg-card dark:border-white/30 dark:bg-white/[0.04]"
                                    )}
                                  >
                                    {active ? (
                                      <Check
                                        className="size-3 text-teal-950"
                                        strokeWidth={3.5}
                                      />
                                    ) : null}
                                  </span>
                                  <opt.icon
                                    className={cn(
                                      "size-5 shrink-0 transition-colors",
                                      active
                                        ? "text-teal-600 dark:text-teal-300"
                                        : "text-muted-foreground"
                                    )}
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-xs font-black text-foreground">
                                      {opt.title}
                                    </span>
                                    <span className="mt-0.5 block text-[0.65rem] font-semibold leading-5 text-muted-foreground">
                                      {opt.desc}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>

                          {/* — کد تخفیف — */}
                          <div className="space-y-2 rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-3.5 dark:border-violet-400/20 dark:bg-violet-400/[0.04]">
                            <Label
                              htmlFor="discount-code"
                              className="flex items-center gap-1.5 text-xs font-black text-foreground/90"
                            >
                              <TicketPercent className="size-3.5 text-violet-600 dark:text-violet-300" />
                              کد تخفیف دارید؟
                              <span className="font-medium text-muted-foreground">
                                (اختیاری)
                              </span>
                            </Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id="discount-code"
                                value={discountInput}
                                onChange={(e) => {
                                  setDiscountInput(e.target.value);
                                  setDiscountError(null);
                                }}
                                placeholder="مثلاً: AVID1404"
                                dir="ltr"
                                disabled={!!discountInfo || discountChecking}
                                className="h-11 rounded-xl bg-foreground/[0.03] text-left font-bold tracking-wide uppercase disabled:opacity-60 dark:bg-white/[0.04]"
                              />
                              {discountInfo ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setDiscountInfo(null);
                                    setDiscountInput("");
                                    setDiscountError(null);
                                  }}
                                  className="h-11 shrink-0 rounded-xl border-violet-500/30 px-4 text-xs font-bold text-violet-700 hover:bg-violet-500/10 dark:border-violet-400/30 dark:text-violet-300"
                                >
                                  <XCircle className="size-4" />
                                  حذف کد
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  onClick={handleCheckDiscount}
                                  disabled={discountChecking || !discountInput.trim()}
                                  className="h-11 shrink-0 rounded-xl bg-gradient-to-l from-violet-500 to-fuchsia-500 px-4 text-xs font-black text-white shadow-lg shadow-violet-500/25 disabled:opacity-60"
                                >
                                  {discountChecking ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <BadgePercent className="size-4" />
                                  )}
                                  بررسی کد
                                </Button>
                              )}
                            </div>

                            {discountInfo ? (
                              <p className="flex select-none flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[0.65rem] font-black leading-5 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
                                <CheckCircle2 className="size-3.5 shrink-0" />
                                کد «{discountInfo.code}» اعمال شد — تخفیف{" "}
                                {faAmount(discountInfo.discountAmount)} تومان
                                {discountInfo.valueType === "percent"
                                  ? ` (${faDigits(discountInfo.value)}٪ از ${faAmount(
                                      discountInfo.baseAmount
                                    )} تومان)`
                                  : ""}
                              </p>
                            ) : discountError ? (
                              <p className="flex select-none items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[0.65rem] font-bold leading-5 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300">
                                <XCircle className="size-3.5 shrink-0" />
                                {discountError}
                              </p>
                            ) : (
                              <p className="text-[0.6rem] font-medium leading-5 text-muted-foreground">
                                اگر کد تخفیف دارید، آن را وارد و «بررسی کد» را
                                بزنید؛ تخفیف پس از تأیید روی مبلغ اعمال می‌شود.
                              </p>
                            )}
                          </div>

                          {/* نمایش مبلغ قابل پرداخت — شهریه‌ی همان دوره (با کسر تخفیف) */}
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-teal-500/25 bg-gradient-to-l from-teal-500/[0.08] to-emerald-500/[0.06] px-4 py-3 dark:border-teal-400/20 dark:from-teal-400/[0.07] dark:to-emerald-400/[0.05]">
                            <div className="min-w-0">
                              <p className="text-[0.65rem] font-bold text-muted-foreground">
                                {payMethod === "installment"
                                  ? `قسط اول از مجموع ${faAmount(
                                      instFinalTotal
                                    )} تومان در ${faDigits(instCount)} قسط`
                                  : "مبلغ قابل پرداخت (شهریه کامل دوره)"}
                              </p>
                              {discountInfo ? (
                                <p className="mt-0.5 text-[0.6rem] font-bold tabular-nums text-muted-foreground">
                                  <span className="line-through">
                                    {faAmount(
                                      payMethod === "installment"
                                        ? Math.ceil(instTotal / instCount)
                                        : cashAmount
                                    )}
                                  </span>{" "}
                                  <span className="text-violet-600 dark:text-violet-300">
                                    − {faAmount(discountInfo.discountAmount)}{' '}
                                    تومان تخفیف
                                  </span>
                                </p>
                              ) : null}
                              <p className="mt-1 text-xl font-black tabular-nums text-foreground">
                                {faAmount(payable)}
                                <span className="mr-1.5 text-xs font-bold text-muted-foreground">
                                  تومان
                                </span>
                              </p>
                            </div>
                            <ShieldCheck className="size-7 shrink-0 text-teal-600 dark:text-teal-300" />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    /* پرداخت آنلاین غیرفعال است — ثبت درخواست و تماس کارشناسان */
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3.5 dark:border-amber-400/25 dark:bg-amber-400/[0.06]">
                      <Wallet className="size-5 shrink-0 text-amber-600 dark:text-amber-300" />
                      <p className="text-xs font-bold leading-6 text-foreground/85">
                        پرداخت آنلاین در حال حاضر فعال نیست؛ درخواست شما ثبت
                        می‌شود و کارشناسان ما برای هماهنگی پرداخت شهریه با شما
                        تماس می‌گیرند.
                      </p>
                    </div>
                  )}

                  {/* — ثبت نهایی — */}
                  <Button
                    type="submit"
                    disabled={loading || courseFull || groupFull || groupMissing || !course}
                    className="h-13 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 py-3.5 text-base font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] hover:shadow-teal-400/40 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="size-5 animate-spin" />
                        {payNeeded ? "در حال ثبت و انتقال به درگاه..." : "در حال ارسال..."}
                      </>
                    ) : courseFull || groupFull ? (
                      <>
                        <XCircle className="size-5" />
                        {groupFull ? "ظرفیت این گروه تکمیل شده است" : "ظرفیت این دوره تکمیل شده است"}
                      </>
                    ) : groupMissing || !course ? (
                      <>
                        <GraduationCap className="size-5" />
                        بازگشت و تکمیل انتخاب دوره
                      </>
                    ) : (
                      <>
                        <Send className="size-5" />
                        {payNeeded
                          ? `ثبت نهایی و پرداخت ${faAmount(payable)} تومان`
                          : payEnabled && selected && courseFree
                            ? "ثبت‌نام در دوره رایگان"
                            : "ارسال درخواست ثبت‌نام"}
                      </>
                    )}
                  </Button>

                  {/* بازگشت به مرحله‌ی ۲ */}
                  <button
                    type="button"
                    onClick={() => setStage(2)}
                    disabled={loading}
                    className="flex w-full select-none items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    <ArrowRight className="size-3.5" />
                    بازگشت به مرحله‌ی انتخاب دوره
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}

/* ————————————————— اجزای کمکی ————————————————— */

/** گام‌نمای مراحل سه‌مرحله‌ای */
function StageStep({
  index,
  label,
  state,
}: {
  index: number;
  label: string;
  state: "current" | "done" | "todo";
}) {
  return (
    <li
      className={cn(
        "flex select-none items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.65rem] font-black transition-all duration-300",
        state === "current"
          ? "border-teal-500/50 bg-teal-500/10 text-teal-700 shadow-sm shadow-teal-500/10 dark:border-teal-400/50 dark:bg-teal-400/10 dark:text-teal-200"
          : state === "done"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
            : "border-foreground/[0.1] bg-foreground/[0.02] text-muted-foreground dark:border-white/[0.1] dark:bg-white/[0.02]"
      )}
      aria-current={state === "current" ? "step" : undefined}
    >
      <span
        className={cn(
          "flex size-4.5 items-center justify-center rounded-full text-[0.6rem]",
          state === "done"
            ? "bg-emerald-500/20 text-emerald-600 dark:bg-emerald-400/20 dark:text-emerald-300"
            : "bg-foreground/[0.06] text-muted-foreground dark:bg-white/[0.08]"
        )}
      >
        {state === "done" ? (
          <Check className="size-3" strokeWidth={3.5} />
        ) : (
          faDigits(index)
        )}
      </span>
      <span className="hidden sm:inline">{label}</span>
      {state === "current" ? (
        <ChevronLeft className="size-3 shrink-0 text-teal-600/70 dark:text-teal-300/70" />
      ) : null}
    </li>
  );
}
