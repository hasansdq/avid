"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  User,
  UserRoundPlus,
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
  UsersRound,
  MessageSquareText,
  KeyRound,
  LogOut,
  Clock3,
  ChevronLeft,
  ArrowRight,
  Globe,
  MapPin,
  Layers,
  TicketPercent,
  BadgePercent,
  IdCard,
  ScrollText,
} from "lucide-react";
import type { Course } from "@prisma/client";
import { useEnrollStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { faDigits } from "@/lib/fa";
import {
  isValidNationalId,
  normalizeNationalId,
  toEnDigits,
} from "@/lib/national-id";
import type {
  PublicAvailabilityMap,
  PublicCourseAvailability,
} from "@/lib/availability";

/** گروه زمانی در پاسخ عمومی API (بدون اعداد باقیمانده) */
type PublicGroupAvailability = NonNullable<
  PublicCourseAvailability["groups"]
>[number];
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/site/editable-texts";

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

const GATEWAY_LABELS: Record<string, string> = {
  zarinpal: "زرین‌پال",
  payping: "پی‌پینگ",
  test: "درگاه آزمایشی",
};

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/** برچسب فارسی نوع دوره — آنلاین / حضوری / حضوری و آنلاین (hybrid) */
function courseTypeLabel(t: string): string {
  return t === "online" ? "آنلاین" : t === "hybrid" ? "حضوری و آنلاین" : "حضوری";
}

/** ماده‌های پیش‌فرض قوانین ثبت‌نام (همگام با جایگاه enrollTerms.body در رجیستری متن‌ها) */
const DEFAULT_ENROLL_TERMS: string[] = [
  "۱. ثبت‌نام پس از تایید شماره موبایل، پذیرش قوانین و پرداخت شهریه (نقدی یا قسط اول) نهایی می‌شود.",
  "۲. لغو ثبت‌نام و عودت کامل وجه تا ۷ روز قبل از شروع دوره امکان‌پذیر است؛ پس از آن مطابق سیاست بازپرداخت اعلام‌شده عمل می‌شود.",
  "۳. در صورت تکمیل ظرفیت، ثبت‌نام به دوره/گروه جانشین منتقل یا وجه کامل عودت داده می‌شود.",
  "۴. اقساط باید تا سررسید هر قسط پرداخت شوند؛ تأخیر بیش از ۱۵ روز ممکن است دسترسی به دوره را محدود کند.",
  "۵. محتوای دوره‌ها فقط برای استفاده‌ی شخصی شماست؛ انتشار مجدد آن مجاز نیست.",
  "۶. حضور و انجام تکالیف دوره‌های حضوری/ترکیبی طبق برنامه‌ی اعلام‌شده الزامی است.",
];

/** متن سفارشی قوانین (ویرایش مدادی) — هر خط یک ماده */
function renderTermsBody(text: string): React.ReactNode {
  const items = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <>
      {items.map((item, i) => (
        <span key={i} className="block leading-6">
          {item}
        </span>
      ))}
    </>
  );
}

type PayMethod = "cash" | "installment";

/* ————————————————— مرحله‌ی فرم ————————————————— */

/**
 * مرحله‌ی جاری:
 *  ۱ = تایید شماره موبایل (کد پیامکی)
 *  ۲ = ثبت‌نام — فقط برای شماره‌های ثبت‌نشده (نام، نام خانوادگی، کد ملی اختیاری)
 *  ۳ = انتخاب دوره (الزامی)
 *  ۴ = تایید قوانین
 *  ۵ = پرداخت و تکمیل
 */
type Stage = 1 | 2 | 3 | 4 | 5;

/**
 * EnrollForm — فرم پنج‌مرحله‌ای پیش‌ثبت‌نام دوره‌ها
 *
 *  • مرحله‌ی ۱: تایید شماره موبایل با کد پیامکی — اگر شماره از قبل ثبت
 *    شده باشد، پس از تایید مستقیم وارد مرحله‌ی ۳ (انتخاب دوره) می‌شود؛
 *    در غیر این صورت به مرحله‌ی ۲ (ثبت‌نام) می‌رود.
 *  • مرحله‌ی ۲: ثبت‌نام — دریافت مشخصات (نام، نام خانوادگی، کد ملی اختیاری)
 *    با توکنِ صادرشده پس از تایید شماره (بدون کد دوباره).
 *  • مرحله‌ی ۳: انتخاب دوره — الزامی؛ لیست تک‌انتخابی (عنوان، شهریه،
 *    حضوری/آنلاین، زمان برگزاری کلاس) + گروه زمانی برای دوره‌های گروه‌دار.
 *  • مرحله‌ی ۴: تایید قوانین و مقررات (متن قابل ویرایش با مداد مدیر).
 *  • مرحله‌ی ۵: پرداخت وجه پیش‌ثبت‌نام (نقدی/اقساطی و انتقال به درگاه).
 *
 * اگر کاربر از قبل وارد حساب کاربری شده باشد (کوکی نشست)، مرحله‌های ۱ و ۲
 * نمایش داده نمی‌شوند و فرم مستقیماً از مرحله‌ی ۳ آغاز می‌شود؛ عبور از
 * مرحله‌های ۱ و ۲ برای کاربر واردنشده الزامی است (API هم بدون نشست ثبت‌نام
 * نمی‌پذیرد). ثبت‌نام مستقل در سایت (بدون انتخاب دوره) از دکمه‌ی
 * «ورود / ثبت‌نام» هدر و پنل کاربر انجام می‌شود.
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
  /** کاربر از قبل وارد شده بود → مرحله‌های ۱ و ۲ (تایید شماره/ثبت‌نام) نمایش داده نمی‌شوند */
  const [hideAuthSteps, setHideAuthSteps] = React.useState(false);

  // — مرحله‌ی ۱: تایید شماره موبایل —
  const [phone, setPhone] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [devCode, setDevCode] = React.useState<string | null>(null);
  /** خطای ارسال کد پیامکی — همان‌جا در فرم (جعبه‌ی قرمز + دکمه‌ی ارسال مجدد) */
  const [otpError, setOtpError] = React.useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = React.useState(false);
  const [verifyingOtp, setVerifyingOtp] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  const [notRobot, setNotRobot] = React.useState(false);
  /** شماره در سیستم ثبت شده؟ (راهنمای مسیر پس از تایید کد) */
  const [phoneExists, setPhoneExists] = React.useState<boolean | null>(null);

  // — مرحله‌ی ۲: ثبت‌نام (شماره‌های جدید) —
  const [pendingToken, setPendingToken] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  /** کد ملی (اختیاری) — برای استعلام گواهی‌نامه‌ها */
  const [nationalId, setNationalId] = React.useState("");
  const [registering, setRegistering] = React.useState(false);

  // — مرحله‌ی ۳: دوره —
  const [course, setCourse] = React.useState("");
  const [groupId, setGroupId] = React.useState("");

  // — مرحله‌ی ۴: قوانین —
  const [termsAccepted, setTermsAccepted] = React.useState(false);

  // — مرحله‌ی ۵: پرداخت —
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [payConfig, setPayConfig] = React.useState<PaymentConfig | null>(null);
  const [payMethod, setPayMethod] = React.useState<PayMethod>("cash");
  const [payResult, setPayResult] = React.useState<
    "success" | "failed" | "pending" | null
  >(null);

  // — کد تخفیف —
  const [discountInput, setDiscountInput] = React.useState("");
  const [discountChecking, setDiscountChecking] = React.useState(false);
  const [discountInfo, setDiscountInfo] = React.useState<DiscountValidation | null>(null);
  const [discountError, setDiscountError] = React.useState<string | null>(null);

  // — ظرفیت دوره‌ها و گروه‌ها (وضعیت تکمیل از سرور — اعداد باقیمانده به کاربر نمایش داده نمی‌شوند) —
  const [availability, setAvailability] =
    React.useState<PublicAvailabilityMap | null>(null);
  const refreshAvailability = React.useCallback(async () => {
    try {
      const res = await fetch("/api/enroll/availability");
      if (res.ok) setAvailability((await res.json()) as PublicAvailabilityMap);
    } catch {
      // بی‌خطر: فقط اطلاعات نمایشی است؛ اعمال نهایی با سرور است
    }
  }, []);

  // — نشست کاربر: اگر وارد شده باشد مستقیم مرحله‌ی ۳ (بدون ۱ و ۲) —
  React.useEffect(() => {
    fetch("/api/user/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user: SessionUser | null } | null) => {
        if (data?.user) {
          setUser(data.user);
          setStage(3);
          setHideAuthSteps(true);
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

  // نتیجه‌ی بازگشت از درگاه (?payment=success|failed|pending)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("payment");
    if (p === "success" || p === "failed" || p === "pending") {
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

  // — وضعیت ظرفیت دوره‌ی انتخاب‌شده (فقط پرچمِ «تکمیل» — باقیمانده نمایش داده نمی‌شود) —
  const selectedAvail = availability?.[course];
  const courseFull = !!selectedAvail?.full;
  const hasGroups = !!selectedAvail?.groups?.length;
  const groups: PublicGroupAvailability[] = selectedAvail?.groups ?? [];
  // گروه‌های زمانی برای دوره‌ی گروه‌دار (حضوری یا ترکیبی) دارای گروه
  const showGroups =
    !!selected && selected.type !== "online" && hasGroups;
  const selectedGroup = groups.find((g) => g.id === groupId) ?? null;
  const groupFull = !!selectedGroup?.full;
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
    setOtpError(null);
    try {
      const res = await fetch("/api/user/phone/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneRequestResult;
      if (!res.ok) {
        // ارسال پیامک (یا اعتبارسنجی سرور) ناموفق بود — خطا همان‌جا
        // در فرم نمایش داده می‌شود و «ارسال مجدد» در دسترس است.
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
      const res = await fetch("/api/user/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, code }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneVerifyResult;
      if (!res.ok) throw new Error(data.error || "خطا در تایید کد");

      // — شماره از قبل ثبت شده → ورود و مستقیم به مرحله‌ی ۳ (انتخاب دوره) —
      if (data.user) {
        setUser(data.user);
        setStage(3);
        setDevCode(null);
        toast.success("خوش آمدید! ورود با موفقیت انجام شد.", {
          description: "اکنون دوره‌ی مورد نظر خود را انتخاب کنید.",
        });
        return;
      }

      // — شماره جدید → مرحله‌ی ۲ (ثبت‌نام) با توکن نیمه‌کاره —
      setPendingToken(data.pendingToken ?? "");
      setStage(2);
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

  /* ————————————————— مرحله‌ی ۲: تکمیل ثبت‌نام ————————————————— */

  async function handleRegister() {
    if (!pendingToken) {
      // نباید رخ دهد — بدون توکن نیمه‌کاره مرحله‌ی ۲ نمایش داده نمی‌شود
      setStage(1);
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
    // کد ملی اختیاری — اگر چیزی وارد شده باشد باید معتبر باشد
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
          // کد ملی اختیاری — فقط وقتی پر شده ارسال می‌شود
          ...(cleanNationalId !== ""
            ? { nationalId: cleanNationalId }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneRegisterResult;

      // توکن نیمه‌کاره منقضی شده → بازگشت به مرحله‌ی ۱ برای کد جدید
      if (res.status === 410) {
        resetToPhoneStep();
        toast.error(
          data.error ||
            "مهلت تکمیل ثبت‌نام گذشته است؛ دوباره کد تایید دریافت کنید."
        );
        return;
      }
      if (!res.ok) throw new Error(data.error || "خطا در تکمیل ثبت‌نام");

      setUser(data.user ?? null);
      setPendingToken("");
      setStage(3);
      toast.success("ثبت‌نام شما تکمیل شد؛ خوش آمدید!", {
        description: "اکنون دوره‌ی مورد نظر خود را انتخاب کنید.",
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در تکمیل ثبت‌نام."
      );
    } finally {
      setRegistering(false);
    }
  }

  /** بازگشت به مرحله‌ی ۱ برای تغییر شماره (توکن و کد ریست می‌شوند؛ نام‌ها حفظ می‌شوند) */
  function resetToPhoneStep() {
    setStage(1);
    setPendingToken("");
    setOtpSent(false);
    setOtpCode("");
    setDevCode(null);
    setPhoneExists(null);
    setOtpError(null);
    setResendIn(0);
  }

  /** خروج از حساب → بازگشت به مرحله‌ی اول (عبور از آن دوباره الزامی است) */
  async function handleLogout() {
    try {
      await fetch("/api/user/session", { method: "DELETE" });
    } catch {
      // بی‌خطر
    }
    setUser(null);
    setHideAuthSteps(false);
    setStage(1);
    setOtpSent(false);
    setOtpCode("");
    setDevCode(null);
    setNotRobot(false);
    setTermsAccepted(false);
    toast.info("از حساب خود خارج شدید؛ برای ادامه دوباره تایید شماره را انجام دهید.");
  }

  /* ————————————————— مرحله‌ی ۳ → ۴: تایید انتخاب دوره ————————————————— */

  /** اعتبارسنجی انتخاب دوره و رفتن به مرحله‌ی تایید قوانین */
  function handleGoToTerms() {
    if (!user) {
      // نباید رخ دهد (مرحله‌ی ۳ فقط با حساب نمایش داده می‌شود)
      setStage(1);
      toast.error("ابتدا تایید شماره موبایل را کامل کنید.");
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
    setStage(4);
  }

  /* ————————————————— مرحله‌ی ۴ → ۵: پذیرش قوانین ————————————————— */

  function handleGoToPayment() {
    if (!termsAccepted) {
      toast.error("برای ادامه، قوانین و مقررات ثبت‌نام را مطالعه و بپذیرید.");
      return;
    }
    setDone(false);
    setStage(5);
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

  /* ————————————————— مرحله‌ی ۵: ثبت نهایی و پرداخت ————————————————— */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Enter در هر مرحله → همان دکمه‌ی اصلی آن مرحله عمل می‌کند
    if (stage === 1) {
      if (otpSent) void handleVerifyOtp();
      else void handleRequestOtp();
      return;
    }
    if (stage === 2) {
      void handleRegister();
      return;
    }
    if (stage === 3) {
      handleGoToTerms();
      return;
    }
    if (stage === 4) {
      handleGoToPayment();
      return;
    }

    if (!user) {
      setStage(1);
      toast.error("ابتدا تایید شماره موبایل را کامل کنید.");
      return;
    }
    if (!course) {
      setStage(3);
      toast.error("لطفاً دوره مورد نظر خود را انتخاب کنید.");
      return;
    }
    if (courseFull || groupFull) {
      setStage(3);
      toast.error("ظرفیت دوره/گروه انتخابی تکمیل شده است؛ لطفاً انتخاب خود را تغییر دهید.");
      return;
    }
    if (showGroups && !selectedGroup) {
      setStage(3);
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
    setTermsAccepted(false);
    useEnrollStore.getState().setSelectedCourse("");
    setStage(3);
  }

  /* ————————————————— رندر ————————————————— */

  const stageSubtitle =
    stage === 1
      ? "مرحله‌ی اول: تایید شماره موبایل"
      : stage === 2
        ? "مرحله‌ی دوم: ثبت‌نام (شماره‌های جدید)"
        : stage === 3
          ? "مرحله‌ی سوم: انتخاب دوره (الزامی)"
          : stage === 4
            ? "مرحله‌ی چهارم: تایید قوانین"
            : "مرحله‌ی پنجم: پرداخت و تکمیل ثبت‌نام";

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
              : payResult === "pending"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                : "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300"
          )}
          role="status"
        >
          {payResult === "success" ? (
            <CheckCircle2 className="size-5 shrink-0" />
          ) : payResult === "pending" ? (
            <Clock3 className="size-5 shrink-0" />
          ) : (
            <XCircle className="size-5 shrink-0" />
          )}
          <p className="leading-6">
            {payResult === "success"
              ? "پرداخت شما با موفقیت انجام شد؛ ثبت‌نام شما تکمیل گردید. کارشناسان ما برای شروع دوره با شما تماس می‌گیرند."
              : payResult === "pending"
                ? "تأیید پرداخت در حال انجام است. تا مشخص شدن نتیجه، پرداخت را دوباره انجام ندهید."
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
          <p className="text-xs text-muted-foreground">{stageSubtitle}</p>
        </div>
        <Sparkles className="mr-auto size-5 text-violet-600 dark:text-violet-300" />
      </div>

      {/* — نشان مراحل پنج‌گانه (۱ و ۲ برای کاربرِ واردشده نمایش داده نمی‌شوند) — */}
      <ol className="relative mt-5 flex items-center gap-1.5" aria-label="مراحل ثبت‌نام">
        {!hideAuthSteps ? (
          <>
            <StageStep
              index={1}
              label="تایید شماره"
              state={stage === 1 ? "current" : "done"}
            />
            <span className="h-px min-w-3 flex-1 bg-foreground/[0.1] dark:bg-white/[0.1]" />
            <StageStep
              index={2}
              label="ثبت‌نام"
              state={
                stage === 2 ? "current" : stage > 2 ? "done" : "todo"
              }
            />
            <span className="h-px min-w-3 flex-1 bg-foreground/[0.1] dark:bg-white/[0.1]" />
          </>
        ) : null}
        <StageStep
          index={3}
          label="انتخاب دوره"
          state={stage === 3 ? "current" : stage > 3 ? "done" : "todo"}
        />
        <span className="h-px min-w-3 flex-1 bg-foreground/[0.1] dark:bg-white/[0.1]" />
        <StageStep
          index={4}
          label="تایید قوانین"
          state={stage === 4 ? "current" : stage > 4 ? "done" : "todo"}
        />
        <span className="h-px min-w-3 flex-1 bg-foreground/[0.1] dark:bg-white/[0.1]" />
        <StageStep
          index={5}
          label="پرداخت"
          state={stage === 5 ? "current" : "todo"}
        />
      </ol>

      {/* ————————————————— مرحله‌ی ۱: تایید شماره موبایل ————————————————— */}
      {stage === 1 ? (
        <div className="relative mt-6 space-y-5">
          {/* بارگذاری نشست */}
          {!sessionChecked ? (
            <p className="flex select-none items-center gap-2 rounded-xl border border-dashed border-foreground/15 bg-foreground/[0.02] px-3.5 py-3 text-[0.7rem] font-bold text-muted-foreground dark:border-white/15 dark:bg-white/[0.02]">
              <Loader2 className="size-4 shrink-0 animate-spin" />
              در حال بررسی حساب کاربری شما...
            </p>
          ) : null}

          {/* — خطای ارسال کد پیامکی: نمایش همان‌جا + ارسال مجدد — */}
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
                {sendingOtp ? "در حال ارسال مجدد..." : "ارسال مجدد کد پیامکی"}
              </button>
            </div>
          ) : null}

          {/* شماره موبایل */}
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
            <p className="select-none text-[0.65rem] font-semibold leading-5 text-muted-foreground">
              {otpSent
                ? phoneExists
                  ? "این شماره در آوید ثبت شده — پس از تایید کد مستقیم به انتخاب دوره می‌روید."
                  : "شماره جدید — پس از تایید کد، مشخصات شما برای ثبت‌نام گرفته می‌شود."
                : "شماره شما با کد پیامکی تایید می‌شود؛ اگر از قبل ثبت شده باشید مستقیم وارد مرحله‌ی انتخاب دوره می‌شوید."}
            </p>
          </div>

          {otpSent ? (
            /* — کد تایید پیامکی — */
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
                  ارسال‌شده به {faDigits(phone.replace(/[\s-]/g, ""))}
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
        /* ————————————————— مراحل ۲ تا ۵ ————————————————— */
        <div className="relative mt-6 space-y-5">
          {stage === 2 ? (
            /* ————————————————— مرحله‌ی ۲: ثبت‌نام (شماره‌های جدید) ————————————————— */
            <>
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
                  onClick={resetToPhoneStep}
                  className="flex select-none items-center gap-1.5 rounded-xl border border-foreground/[0.1] px-3 py-2 text-[0.7rem] font-bold text-muted-foreground transition-colors hover:border-teal-500/30 hover:text-teal-700 dark:border-white/10 dark:hover:border-teal-400/30 dark:hover:text-teal-300"
                >
                  <Phone className="size-3.5" />
                  تغییر شماره
                </button>
              </div>

              {/* نام و نام خانوادگی */}
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
                      autoFocus
                      className="h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-right placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40"
                      disabled={registering}
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
                      disabled={registering}
                    />
                  </div>
                </div>
              </div>

              {/* کد ملی (اختیاری) — برای استعلام گواهی‌نامه‌ها */}
              <div className="space-y-2">
                <Label
                  htmlFor="enroll-nationalId"
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
                    id="enroll-nationalId"
                    value={nationalId}
                    onChange={(e) =>
                      setNationalId(
                        toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 10)
                      )
                    }
                    placeholder="1234567891"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    className="h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-center font-black tabular-nums placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40"
                    disabled={registering}
                  />
                </div>
                <p className="select-none text-[0.65rem] font-semibold leading-5 text-muted-foreground">
                  با ثبت کد ملی، گواهی‌نامه‌های شما با استعلام کد ملی قابل بررسی و
                  دانلود خواهد بود.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleRegister}
                disabled={registering}
                className="h-13 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 py-3.5 text-base font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] hover:shadow-teal-400/40 disabled:opacity-60"
              >
                {registering ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    در حال ساخت حساب...
                  </>
                ) : (
                  <>
                    <UserRoundPlus className="size-5" />
                    تکمیل ثبت‌نام و ادامه
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
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

              {stage === 3 ? (
                /* ————————————————— مرحله‌ی ۳: انتخاب دوره ————————————————— */
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
                        const active = course === c.title;

                        // زمان برگزاری کلاس (دوره‌های حضوری و ترکیبی؛ آنلاین زمان‌بندی ندارد)
                        const scheduleText =
                          c.type !== "online"
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
                                  ) : c.type === "hybrid" ? (
                                    <Layers className="size-3.5 shrink-0 text-violet-600 dark:text-violet-300" />
                                  ) : (
                                    <MapPin className="size-3.5 shrink-0 text-violet-600 dark:text-violet-300" />
                                  )}
                                  {courseTypeLabel(c.type)}
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

                  {/* وضعیت ظرفیت دوره‌ی انتخاب‌شده — فقط «تکمیل»؛ اعداد باقیمانده نمایش داده نمی‌شوند */}
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
                          {faDigits(groups.length)} گروه
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
                                        : "text-violet-500/80 dark:text-violet-300/80"
                                    )}
                                  />
                                  {g.full
                                    ? "ظرفیت این گروه تکمیل است"
                                    : "ثبت‌نام این گروه فعال است"}
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

                  {/* — ادامه به مرحله‌ی تایید قوانین — */}
                  <Button
                    type="button"
                    onClick={handleGoToTerms}
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
                        ادامه به مرحله‌ی تایید قوانین
                        <ChevronLeft className="size-5" />
                      </>
                    )}
                  </Button>

                  {/* — راهنمای الزامی بودن انتخاب دوره — */}
                  <p className="pt-1 text-center text-[0.65rem] leading-5 text-muted-foreground/80">
                    انتخاب دوره برای تکمیل پیش‌ثبت‌نام الزامی است؛ برای ثبت‌نام مستقل
                    در سایت از دکمه‌ی «ورود / ثبت‌نام» در هدر استفاده کنید.
                  </p>
                </>
              ) : stage === 4 ? (
                /* ————————————————— مرحله‌ی ۴: تایید قوانین ————————————————— */
                <>
                  {/* خلاصه‌ی انتخاب تا این مرحله */}
                  {selected ? (
                    <div className="space-y-2 rounded-2xl border border-teal-500/25 bg-foreground/[0.02] p-4 dark:border-teal-400/20 dark:bg-white/[0.02]">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="flex items-center gap-2 text-sm font-bold text-foreground/90">
                          <GraduationCap className="size-4 text-teal-600 dark:text-teal-300" />
                          انتخاب شما
                        </Label>
                        <button
                          type="button"
                          onClick={() => setStage(3)}
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
                          ) : selected.type === "hybrid" ? (
                            <Layers className="size-3" />
                          ) : (
                            <MapPin className="size-3" />
                          )}
                          {courseTypeLabel(selected.type)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.7rem] font-semibold leading-5 text-muted-foreground">
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

                  {/* — قوانین و مقررات — */}
                  <div className="space-y-3 rounded-2xl border border-foreground/[0.09] bg-foreground/[0.02] p-4 dark:border-white/[0.09] dark:bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="flex items-center gap-2 text-sm font-bold text-foreground/90">
                        <ScrollText className="size-4 text-violet-600 dark:text-violet-300" />
                        <EditableText k="enrollTerms.title">
                          قوانین و مقررات ثبت‌نام دوره‌ها
                        </EditableText>
                      </Label>
                      <span className="select-none shrink-0 rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                        الزامی
                      </span>
                    </div>

                    {/* متن قوانین — قابل ویرایش با مداد مدیر؛ هر خط یک ماده */}
                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-foreground/[0.07] bg-background/60 p-3.5 text-[0.7rem] font-semibold text-foreground/85 dark:border-white/[0.07] dark:bg-white/[0.03] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/15 [&::-webkit-scrollbar-thumb]:dark:bg-white/15 [&::-webkit-scrollbar]:w-1.5">
                      <EditableText
                        k="enrollTerms.body"
                        renderText={renderTermsBody}
                      >
                        {DEFAULT_ENROLL_TERMS.map((item, i) => (
                          <span key={i} className="block leading-6">
                            {item}
                          </span>
                        ))}
                      </EditableText>
                    </div>

                    {/* پذیرش قوانین — سبک تأیید امنیتی */}
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border p-4 transition-all duration-300",
                        termsAccepted
                          ? "border-teal-500/45 bg-teal-500/[0.07] shadow-sm shadow-teal-500/10 dark:border-teal-400/45 dark:bg-teal-400/[0.06]"
                          : "border-foreground/[0.12] bg-foreground/[0.03] dark:border-white/[0.12] dark:bg-white/[0.03]"
                      )}
                    >
                      <label
                        htmlFor="terms-accepted"
                        className="flex cursor-pointer select-none items-center gap-3"
                      >
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 transition-all duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
                            termsAccepted
                              ? "scale-105 border-teal-500 bg-gradient-to-br from-teal-400 to-emerald-500 shadow-sm shadow-teal-500/30 dark:border-teal-400"
                              : "border-foreground/30 bg-card hover:border-teal-500/50 dark:border-white/30 dark:bg-white/[0.04]"
                          )}
                        >
                          {termsAccepted ? (
                            <Check
                              className="size-4 text-teal-950"
                              strokeWidth={3.2}
                            />
                          ) : null}
                        </span>
                        <input
                          id="terms-accepted"
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="sr-only"
                          aria-required="true"
                        />
                        <span className="text-sm font-bold text-foreground/90">
                          {termsAccepted
                            ? "قوانین پذیرفته شد — متوجه هستم"
                            : "قوانین بالا را مطالعه کردم و می‌پذیرم"}
                        </span>
                      </label>

                      <ShieldCheck
                        className={cn(
                          "size-5 shrink-0 transition-colors duration-300",
                          termsAccepted
                            ? "text-teal-600 dark:text-teal-300"
                            : "text-muted-foreground"
                        )}
                      />
                    </div>
                  </div>

                  {/* — ادامه به مرحله‌ی پرداخت — */}
                  <Button
                    type="button"
                    onClick={handleGoToPayment}
                    disabled={!termsAccepted}
                    className="h-13 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 py-3.5 text-base font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] hover:shadow-teal-400/40 disabled:opacity-60"
                  >
                    {termsAccepted ? (
                      <>
                        ادامه به مرحله‌ی پرداخت
                        <ChevronLeft className="size-5" />
                      </>
                    ) : (
                      <>
                        <ScrollText className="size-5" />
                        ابتدا قوانین را مطالعه و بپذیرید
                      </>
                    )}
                  </Button>

                  {/* بازگشت به مرحله‌ی ۳ */}
                  <button
                    type="button"
                    onClick={() => setStage(3)}
                    className="flex w-full select-none items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    <ArrowRight className="size-3.5" />
                    بازگشت به مرحله‌ی انتخاب دوره
                  </button>
                </>
              ) : (
                /* ————————————————— مرحله‌ی ۵: پرداخت ————————————————— */
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
                              onClick={() => setStage(3)}
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
                              ) : selected.type === "hybrid" ? (
                                <Layers className="size-3" />
                              ) : (
                                <MapPin className="size-3" />
                              )}
                              {courseTypeLabel(selected.type)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.7rem] font-semibold leading-5 text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <CalendarClock className="size-3.5 shrink-0" />
                              {selected.type !== "online"
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

                          {/* تیک پذیرش قوانین در این مرحله */}
                          <p className="flex select-none items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-2.5 text-[0.65rem] font-bold leading-5 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.05] dark:text-emerald-300">
                            <CheckCircle2 className="size-3.5 shrink-0" />
                            قوانین و مقررات ثبت‌نام پذیرفته شد
                            <button
                              type="button"
                              onClick={() => setStage(4)}
                              className="ml-auto rounded-lg px-2 py-1 text-[0.65rem] font-bold text-emerald-700 underline-offset-4 transition-colors hover:bg-emerald-500/10 hover:underline dark:text-emerald-300 dark:hover:bg-emerald-400/10"
                            >
                              مشاهده / تغییر
                            </button>
                          </p>
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

                      {/* بازگشت به مرحله‌ی ۳ */}
                      <button
                        type="button"
                        onClick={() => setStage(3)}
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
            </>
          )}
        </div>
      )}
    </form>
  );
}

/* ————————————————— اجزای کمکی ————————————————— */

/** گام‌نمای مراحل پنج‌مرحله‌ای */
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
        "flex select-none items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[0.65rem] font-black transition-all duration-300",
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
      <span className="hidden md:inline">{label}</span>
      {state === "current" ? (
        <ChevronLeft className="size-3 shrink-0 text-teal-600/70 dark:text-teal-300/70" />
      ) : null}
    </li>
  );
}
