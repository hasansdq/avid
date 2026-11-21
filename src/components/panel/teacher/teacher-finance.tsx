"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  Hourglass,
  Landmark,
  Loader2,
  Pencil,
  ReceiptText,
  ShieldAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { faDate, faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";
import {
  isValidShaba,
  normalizeShaba,
  SHABA_INVALID_MESSAGE,
} from "@/lib/shaba";

/* ————————————————— انواع (قرارداد GET /api/teacher/finance) ————————————————— */

/** خلاصه‌ی مالی استاد — مبالغ به تومان */
interface TeacherFinanceSummary {
  salesCount: number;
  salesPaid: number;
  salesPaidAmount: number;
  salesPendingAmount: number;
  installmentsPaidCount: number;
  installmentsPaidAmount: number;
  installmentsPendingCount: number;
  installmentsPendingAmount: number;
  totalIncome: number;
  studentsCount: number;
}

/** درآمد تفکیک‌شده هر دوره */
interface TeacherFinanceCourse {
  id: string;
  title: string;
  studentsCount: number;
  salesPaidAmount: number;
  installmentsPaidAmount: number;
  income: number;
}

/** قسطِ داخل صورت حساب فروش */
interface TeacherFinanceSaleInstallment {
  index: number;
  amount: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
}

/** یک فروش (ثبت‌نام پرداخت‌شده/در انتظار) */
interface TeacherFinanceSale {
  id: string;
  name: string;
  course: string;
  status: string;
  paymentMethod: string;
  paymentAmount: number | null;
  paymentStatus: string;
  paidAt: string | null;
  discountCode: string | null;
  discountAmount: number | null;
  createdAt: string;
  installments: TeacherFinanceSaleInstallment[];
}

/** قسط سررسیددار استاد با برچسب نسبی */
interface TeacherFinanceInstallment {
  id: string;
  enrollmentId: string;
  index: number;
  amount: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
  holder: string;
  course: string;
  relative: "overdue" | "today" | "tomorrow" | "dayAfter" | "later";
}

/** یک واریز درآمد استاد — ثبت دستی مدیر */
interface TeacherFinancePayout {
  id: string;
  amount: number;
  status: string;
  note: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** خلاصه‌ی وضعیت واریز درآمد — مقایسه‌ی درآمد کل با واریزهای «paid» */
interface TeacherFinancePayoutSummary {
  paidAmount: number;
  pendingAmount: number;
  pendingCount: number;
  count: number;
  remaining: number;
  settled: boolean;
}

/** پاسخ کامل GET /api/teacher/finance */
interface TeacherFinanceData {
  summary: TeacherFinanceSummary;
  courses: TeacherFinanceCourse[];
  sales: TeacherFinanceSale[];
  installments: TeacherFinanceInstallment[];
  /** شماره شبای ثبت‌شده برای برداشت درآمد (null = ثبت نشده) */
  shabaNumber: string | null;
  /** واریزهای درآمد استاد — ثبت مدیر */
  payouts: TeacherFinancePayout[];
  /** وضعیت تسویه/مانده‌ی درآمد استاد */
  payoutSummary: TeacherFinancePayoutSummary;
}

/* ————————————————— ثابت‌ها و ابزارهای محلی ————————————————— */

/** کارت شیشه‌ای هماهنگ با بقیه‌ی پنل (کپی محلی از استایل داشبورد) */
const CARD =
  "rounded-2xl border border-foreground/[0.08] bg-card/85 p-4 shadow-xl shadow-black/[0.04] backdrop-blur-xl sm:p-6 dark:border-white/[0.08] dark:bg-[#08110e]/70 dark:shadow-black/20";

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/** استایل اسکرول‌بار سفارشی لیست‌های بلند */
const THIN_SCROLLBAR =
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20";

/** وضعیت پرداخت فروش — نشان رنگی */
const PAYMENT_STATUS: Record<string, { label: string; badge: string }> = {
  paid: {
    label: "پرداخت‌شده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  pending: {
    label: "در انتظار",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
  failed: {
    label: "ناموفق",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
};

/** روش پرداخت */
const PAYMENT_METHODS: Record<string, string> = {
  cash: "نقدی",
  installment: "اقساطی",
};

/** وضعیت قسط */
const INSTALLMENT_STATUS: Record<string, { label: string; badge: string }> = {
  paid: {
    label: "پرداخت‌شده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  overdue: {
    label: "معوق",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
  pending: {
    label: "در انتظار پرداخت",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
};

/** برچسب نسبی سررسید قسط */
const RELATIVE_BADGES: Record<string, { label: string; badge: string }> = {
  overdue: {
    label: "سررسید گذشته",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
  today: {
    label: "امروز",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
  tomorrow: {
    label: "فردا",
    badge:
      "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300",
  },
  dayAfter: {
    label: "پس‌فردا",
    badge:
      "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300",
  },
  later: {
    label: "بعداً",
    badge: "border-border bg-foreground/[0.04] text-muted-foreground dark:bg-white/[0.04]",
  },
};

/** نشان کوچک با بوردر ملایم — هم‌سبک داشبورد */
function Chip({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.65rem] font-black",
        className
      )}
    >
      {children}
    </span>
  );
}

/* ————————————————— بخش «مالی و درآمد» ————————————————— */

/**
 * TeacherFinanceSection — بخش «مالی و درآمد» در پنل استاد (فقط خواندنی):
 * خلاصه‌ی درآمد، تفکیک درآمد هر دوره، صورت حساب فروش و اقساط سررسیددار —
 * داده‌ها از GET /api/teacher/finance.
 */
export function TeacherFinanceSection() {
  const [data, setData] = React.useState<TeacherFinanceData | null>(null);
  const [denied, setDenied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/teacher/finance", { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!cancelled) {
            setDenied(true);
            setData(null);
            toast.error(json.error ?? "دسترسی استاد ندارید.");
          }
          return;
        }
        if (!res.ok) throw new Error();
        const json = (await res.json()) as TeacherFinanceData;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData(null);
          toast.error("دریافت اطلاعات مالی ناموفق بود؛ دوباره تلاش کنید.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ————————————— رندر ————————————— */

  return (
    <section aria-label="مالی و درآمد (استاد)" className="space-y-4 sm:space-y-6">
      {/* سربرگ */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 sm:mb-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
            <Wallet className="size-5 text-amber-600 dark:text-amber-300" />
            مالی و درآمد
          </h2>
          <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            {data ? `${faDigits(data.sales.length)} فروش` : "…"}
          </span>
        </div>
      </div>

      {denied ? (
        <DeniedNotice />
      ) : !data ? (
        <FinanceSkeleton />
      ) : (
        <>
          {/* ————— کارت‌های آماری نئونی ————— */}
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
            aria-label="خلاصه‌ی مالی"
          >
            <SummaryCard
              icon={<Wallet className="size-7 sm:size-9" strokeWidth={1.9} />}
              label="درآمد کل"
              value={`${faAmount(data.summary.totalIncome)} تومان`}
              tone="emerald"
            />
            <SummaryCard
              icon={<Banknote className="size-7 sm:size-9" strokeWidth={1.9} />}
              label="فروش نقدی"
              value={`${faAmount(data.summary.salesPaidAmount)} تومان`}
              subtitle={`${faDigits(data.summary.salesPaid)} پرداخت موفق`}
              tone="teal"
            />
            <SummaryCard
              icon={<Hourglass className="size-7 sm:size-9" strokeWidth={1.9} />}
              label="اقساط"
              value={`${faAmount(data.summary.installmentsPaidAmount)} تومان`}
              subtitle={`${faDigits(data.summary.installmentsPendingCount)} قسط باقیمانده`}
              tone="amber"
            />
            <SummaryCard
              icon={<Users className="size-7 sm:size-9" strokeWidth={1.9} />}
              label="دانشجوها"
              value={faDigits(data.summary.studentsCount)}
              tone="violet"
            />
          </div>

          {/* ————— شماره شبا و وضعیت واریز درآمد ————— */}
          <ShabaCard
            initialShaba={data.shabaNumber}
            payoutSummary={data.payoutSummary}
            payouts={data.payouts}
          />

          {/* ————— درآمد تفکیک‌شده‌ی دوره‌ها ————— */}
          <CoursesBreakdown courses={data.courses} />

          {/* ————— صورت حساب فروش ————— */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
              <ReceiptText className="size-4 text-teal-600 dark:text-teal-300" />
              صورت حساب فروش
            </h3>
            {data.sales.length === 0 ? (
              <EmptyFinance
                icon={<ReceiptText className="size-7 text-muted-foreground" />}
                title="هنوز فروشی ثبت نشده است"
                description="با ثبت‌نام و پرداخت کاربران در دوره‌های شما، صورت حساب همین‌جا نمایش داده می‌شود."
              />
            ) : (
              <div
                className={cn(
                  "flex max-h-96 flex-col gap-3 overflow-y-auto pe-1",
                  THIN_SCROLLBAR
                )}
                aria-label="لیست فروش دوره‌ها"
              >
                {data.sales.map((s) => (
                  <SaleCard key={s.id} sale={s} />
                ))}
              </div>
            )}
          </div>

          {/* ————— اقساط سررسیددار ————— */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
              <Hourglass className="size-4 text-amber-600 dark:text-amber-300" />
              اقساط
            </h3>
            {data.installments.length === 0 ? (
              <EmptyFinance
                icon={<Hourglass className="size-7 text-muted-foreground" />}
                title="قسط سررسیدداری ندارید"
                description="اقساط پرداخت‌نشده‌ی ثبت‌نام‌های اقساطی دوره‌های شما با سررسید نزدیک همین‌جا فهرست می‌شوند."
              />
            ) : (
              <div
                className={cn(
                  "flex max-h-96 flex-col gap-2 overflow-y-auto pe-1",
                  THIN_SCROLLBAR
                )}
                aria-label="لیست اقساط"
              >
                {data.installments.map((i) => (
                  <InstallmentRow key={i.id} installment={i} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* ————————————————— کارت آماری نئونی ————————————————— */

/** استایل‌های نئونی هم‌سبک کارت‌های آماری داشبورد (بدون آبی/نیلی) */
const SUMMARY_TONES: Record<string, string> = {
  emerald:
    "border-emerald-500/60 bg-emerald-500/[0.05] text-emerald-700 shadow-[0_0_16px_rgba(16,185,129,0.20)] dark:border-emerald-400/50 dark:text-emerald-300",
  teal: "border-teal-500/60 bg-teal-500/[0.05] text-teal-700 shadow-[0_0_16px_rgba(20,184,166,0.20)] dark:border-teal-400/50 dark:text-teal-300",
  amber:
    "border-amber-500/60 bg-amber-500/[0.05] text-amber-700 shadow-[0_0_16px_rgba(245,158,11,0.22)] dark:border-amber-400/50 dark:text-amber-300",
  violet:
    "border-violet-500/60 bg-violet-500/[0.05] text-violet-700 shadow-[0_0_16px_rgba(139,92,246,0.20)] dark:border-violet-400/50 dark:text-violet-300",
};

function SummaryCard({
  icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone: keyof typeof SUMMARY_TONES;
}) {
  return (
    <div
      className={cn(
        "flex min-h-32 select-none flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-3 text-center transition-transform hover:-translate-y-0.5 sm:min-h-36 sm:gap-2 sm:p-4",
        SUMMARY_TONES[tone]
      )}
    >
      <span className="shrink-0 opacity-90" aria-hidden>
        {icon}
      </span>
      <span className="flex min-h-9 items-center text-xl font-black leading-none tabular-nums sm:text-2xl">
        {value}
      </span>
      <span className="text-[0.7rem] font-bold sm:text-xs">{label}</span>
      {subtitle ? (
        <span className="text-[0.6rem] font-semibold leading-4 opacity-80">
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}

/* ————————————————— کارت شبا و وضعیت واریز درآمد ————————————————— */

/**
 * ShabaCard — کارت «شماره شبا (واریز درآمد)» در بخش مالی استاد:
 *  • استاد شماره‌ی شبای بانکی خود را برای برداشت درآمد ثبت/ویرایش می‌کند
 *    (PUT /api/teacher/finance — خالی = حذف).
 *  • وضعیت واریز درآمد زیر آن خلاصه می‌شود: واریز‌شده/مانده + فهرست
 *    واریزهای ثبت‌شده‌ی مدیر (مبلغ، وضعیت، تاریخ و یادداشت).
 */
function ShabaCard({
  initialShaba,
  payoutSummary,
  payouts,
}: {
  initialShaba: string | null;
  payoutSummary: TeacherFinancePayoutSummary;
  payouts: TeacherFinancePayout[];
}) {
  const [shaba, setShaba] = React.useState(initialShaba ?? "");
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // آخرین ذخیره‌ی موفق محلی — تا تازه‌سازی داده‌ی کل بخش، نمایش را با خودش
  // به‌روز نگه می‌کند (prop اولیه stale می‌ماند تا رفرش بعدی)
  const [saved, setSaved] = React.useState<string | null | undefined>(undefined);

  // مقدار مؤثر: آخرین ذخیره‌ی محلی یا مقدار سرور
  const effective = saved !== undefined ? saved : initialShaba;

  // ورودی ویرایش همیشه با مقدار مؤثر شروع می‌شود
  function openEdit() {
    setShaba(effective ?? "");
    setError(null);
    setEditing(true);
  }

  /** ذخیره‌ی شماره شبا — خالی = حذف */
  async function save() {
    if (saving) return;
    const clean = normalizeShaba(shaba);
    if (clean !== "" && !isValidShaba(clean)) {
      setError(SHABA_INVALID_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/finance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shabaNumber: clean }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        shabaNumber?: string | null;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "ذخیره‌ی شماره شبا ناموفق بود.");
      }
      setSaved(json.shabaNumber ?? null);
      setShaba(json.shabaNumber ?? "");
      setEditing(false);
      toast.success(
        clean === "" ? "شماره شبا حذف شد." : "شماره شبا ذخیره شد."
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "ذخیره‌ی شماره شبا ناموفق بود."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={cn(CARD, "space-y-3")}>
      {/* سربرگ: عنوان + وضعیت تسویه */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.07] pb-3 dark:border-white/[0.07]">
        <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
          <Landmark className="size-4 text-teal-600 dark:text-teal-300" />
          شماره شبا — واریز درآمد
        </h3>
        {payoutSummary.settled ? (
          <Chip className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
            <Check className="size-3" />
            تسویه‌شده
          </Chip>
        ) : (
          <Chip className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
            <Hourglass className="size-3" />
            در انتظار واریز
          </Chip>
        )}
      </div>

      {/* مقدار شبا — نمایش یا ویرایش */}
      {editing ? (
        <div className="space-y-2">
          <label
            htmlFor="teacher-shaba-input"
            className="block text-[0.7rem] font-bold text-muted-foreground"
          >
            شماره‌ی شبا (۲۶ نویسه — IR + ۲۴ رقم)
          </label>
          <input
            id="teacher-shaba-input"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={shaba}
            onChange={(e) => {
              setShaba(e.target.value);
              if (error) setError(null);
            }}
            placeholder="IR840570028180010509854001"
            aria-invalid={!!error}
            className={cn(
              "h-11 w-full rounded-xl border border-input bg-foreground/[0.03] px-3 font-mono text-sm tracking-wider text-foreground outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/25 dark:bg-white/[0.04]",
              error && "border-red-500/60 dark:border-red-400/50"
            )}
          />
          {error ? (
            <p role="alert" className="text-[0.68rem] font-bold text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : (
            <p className="text-[0.62rem] leading-5 text-muted-foreground">
              درآمد شما به این شماره شبا واریز می‌شود؛ خالی بگذارید تا شماره حذف شود.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-4 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/20 transition-all hover:scale-[1.01] disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              ذخیره
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setShaba(effective ?? "");
                setError(null);
              }}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-foreground/[0.12] bg-foreground/[0.03] px-4 text-xs font-bold text-foreground transition-colors hover:bg-foreground/[0.07] disabled:opacity-60 dark:border-white/[0.12] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
            >
              <X className="size-4" />
              انصراف
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {effective ? (
            <p
              dir="ltr"
              className="min-w-0 select-all break-all font-mono text-sm font-bold tracking-wider text-foreground"
            >
              {effective}
            </p>
          ) : (
            <p className="text-xs font-bold text-muted-foreground">
              شماره شبایی برای واریز درآمد شما ثبت نشده است.
            </p>
          )}
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/[0.06] px-3.5 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-500/10 dark:border-teal-400/30 dark:bg-teal-400/[0.08] dark:text-teal-300 dark:hover:bg-teal-400/15"
          >
            <Pencil className="size-3.5" />
            {effective ? "ویرایش شماره شبا" : "ثبت شماره شبا"}
          </button>
        </div>
      )}

      {/* خلاصه‌ی واریز درآمد */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
        <Chip className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
          واریز‌شده: {faAmount(payoutSummary.paidAmount)} تومان
        </Chip>
        {payoutSummary.remaining > 0 ? (
          <Chip className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
            مانده واریز: {faAmount(payoutSummary.remaining)} تومان
          </Chip>
        ) : null}
        {payoutSummary.pendingCount > 0 ? (
          <Chip className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300">
            {faDigits(payoutSummary.pendingCount)} واریز در انتظار
          </Chip>
        ) : null}
      </div>

      {/* فهرست واریزهای ثبت‌شده */}
      {payouts.length > 0 ? (
        <div
          className={cn(
            "flex max-h-48 flex-col gap-1.5 overflow-y-auto pe-1",
            THIN_SCROLLBAR
          )}
          aria-label="واریزهای درآمد"
        >
          {payouts.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-foreground/[0.03] px-3 py-2 dark:bg-white/[0.03]"
            >
              <span className="flex items-center gap-2 text-xs font-black tabular-nums text-foreground">
                {faAmount(p.amount)}
                <span className="text-[0.6rem] font-medium text-muted-foreground">
                  تومان
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-[0.65rem] text-muted-foreground">
                {p.note ? (
                  <span className="max-w-40 truncate font-medium">{p.note}</span>
                ) : null}
                {p.paidAt ? faDate(p.paidAt) : "بدون تاریخ"}
                {p.status === "paid" ? (
                  <Chip className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
                    واریز‌شده
                  </Chip>
                ) : (
                  <Chip className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                    در انتظار واریز
                  </Chip>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

/* ————————————————— جدول درآمد دوره‌ها ————————————————— */

function CoursesBreakdown({ courses }: { courses: TeacherFinanceCourse[] }) {
  const totals = courses.reduce(
    (acc, c) => ({
      studentsCount: acc.studentsCount + c.studentsCount,
      salesPaidAmount: acc.salesPaidAmount + c.salesPaidAmount,
      installmentsPaidAmount: acc.installmentsPaidAmount + c.installmentsPaidAmount,
      income: acc.income + c.income,
    }),
    { studentsCount: 0, salesPaidAmount: 0, installmentsPaidAmount: 0, income: 0 }
  );

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
        <Banknote className="size-4 text-emerald-600 dark:text-emerald-300" />
        درآمد دوره‌ها
      </h3>
      {courses.length === 0 ? (
        <EmptyFinance
          icon={<Banknote className="size-7 text-muted-foreground" />}
          title="هنوز درآمدی ثبت نشده است"
          description="درآمد تفکیک‌شده‌ی هر دوره پس از نخستین ثبت‌نام پرداخت‌شده همین‌جا نمایش داده می‌شود."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-foreground/[0.08] dark:border-white/[0.08]">
          <Table className="min-w-[34rem]">
            <TableHeader>
              <TableRow className="bg-foreground/[0.03] hover:bg-foreground/[0.03] dark:bg-white/[0.03] dark:hover:bg-white/[0.03]">
                <TableHead className="text-start text-[0.7rem] font-black">
                  دوره
                </TableHead>
                <TableHead className="text-start text-[0.7rem] font-black">
                  دانشجو
                </TableHead>
                <TableHead className="text-start text-[0.7rem] font-black">
                  فروش نقدی
                </TableHead>
                <TableHead className="text-start text-[0.7rem] font-black">
                  اقساط دریافتی
                </TableHead>
                <TableHead className="text-start text-[0.7rem] font-black">
                  درآمد
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-56 truncate text-xs font-black text-foreground">
                    {c.title}
                  </TableCell>
                  <TableCell className="text-xs font-bold tabular-nums text-muted-foreground">
                    {faDigits(c.studentsCount)}
                  </TableCell>
                  <TableCell className="text-xs font-bold tabular-nums text-muted-foreground">
                    {faAmount(c.salesPaidAmount)} تومان
                  </TableCell>
                  <TableCell className="text-xs font-bold tabular-nums text-muted-foreground">
                    {faAmount(c.installmentsPaidAmount)} تومان
                  </TableCell>
                  <TableCell className="text-xs font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                    {faAmount(c.income)} تومان
                  </TableCell>
                </TableRow>
              ))}
              {/* ردیف جمع — همیشه نمایان */}
              <TableRow className="border-t-2 border-foreground/[0.12] bg-foreground/[0.02] hover:bg-foreground/[0.02] dark:border-white/[0.12] dark:bg-white/[0.02] dark:hover:bg-white/[0.02]">
                <TableCell className="text-xs font-black text-foreground">
                  جمع
                </TableCell>
                <TableCell className="text-xs font-black tabular-nums text-foreground">
                  {faDigits(totals.studentsCount)}
                </TableCell>
                <TableCell className="text-xs font-black tabular-nums text-foreground">
                  {faAmount(totals.salesPaidAmount)} تومان
                </TableCell>
                <TableCell className="text-xs font-black tabular-nums text-foreground">
                  {faAmount(totals.installmentsPaidAmount)} تومان
                </TableCell>
                <TableCell className="text-xs font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                  {faAmount(totals.income)} تومان
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ————————————————— کارت فروش ————————————————— */

function SaleCard({ sale: s }: { sale: TeacherFinanceSale }) {
  const payStatus = PAYMENT_STATUS[s.paymentStatus] ?? null;
  const method = PAYMENT_METHODS[s.paymentMethod] ?? "—";
  const installments = s.installments;
  const paidCount = installments.filter((i) => i.status === "paid").length;
  const pct =
    installments.length > 0
      ? Math.round((paidCount / installments.length) * 100)
      : 0;

  return (
    <article className={CARD}>
      {/* نام خریدار + وضعیت پرداخت */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.07] pb-3 dark:border-white/[0.07]">
        <h4 className="text-sm font-black leading-7 text-foreground">
          {s.name}
        </h4>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip className="border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300">
            {method}
          </Chip>
          {payStatus ? (
            <Chip className={payStatus.badge}>{payStatus.label}</Chip>
          ) : null}
        </div>
      </div>

      {/* جزئیات فروش */}
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <InfoRow label="دوره">{s.course}</InfoRow>
        {s.paymentAmount !== null && s.paymentAmount !== undefined ? (
          <InfoRow label="مبلغ">
            <span className="tabular-nums">
              {faAmount(s.paymentAmount)} تومان
            </span>
          </InfoRow>
        ) : null}
        {s.paidAt ? (
          <InfoRow label="تاریخ پرداخت">{faDate(s.paidAt)}</InfoRow>
        ) : null}
        <InfoRow label="تاریخ ثبت">{faDate(s.createdAt)}</InfoRow>
        {s.discountAmount ? (
          <InfoRow label="تخفیف">
            <span className="flex items-center gap-1.5">
              <span className="tabular-nums">
                {faAmount(s.discountAmount)} تومان
              </span>
              {s.discountCode ? (
                <span dir="ltr" className="font-black tracking-wide text-muted-foreground">
                  {s.discountCode}
                </span>
              ) : null}
            </span>
          </InfoRow>
        ) : null}
      </dl>

      {/* اقساط این فروش — پیشرفت درخطی */}
      {installments.length > 0 ? (
        <div className="mt-3 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] p-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.7rem] font-black text-foreground">
              اقساط {s.course}
            </p>
            <p className="select-none text-[0.65rem] font-bold tabular-nums text-muted-foreground">
              {faDigits(paidCount)} از {faDigits(installments.length)} قسط
              پرداخت شده
            </p>
          </div>
          <Progress
            value={pct}
            className="mt-2.5 h-1.5 bg-foreground/10 dark:bg-white/10"
            aria-label={`پیشرفت پرداخت اقساط: ${faDigits(pct)} درصد`}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {installments.map((i) => {
              const badge = INSTALLMENT_STATUS[i.status];
              return (
                <span
                  key={i.index}
                  className={cn(
                    "inline-flex select-none items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-black",
                    badge
                      ? badge.badge
                      : "border-border bg-foreground/[0.04] text-muted-foreground dark:bg-white/[0.04]"
                  )}
                  title={`سررسید: ${faDate(i.dueDate)}`}
                >
                  {i.status === "paid" ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : null}
                  قسط {faDigits(i.index)}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/* ————————————————— ردیف قسط ————————————————— */

function InstallmentRow({
  installment: i,
}: {
  installment: TeacherFinanceInstallment;
}) {
  const status = INSTALLMENT_STATUS[i.status];
  const relative = RELATIVE_BADGES[i.relative];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-3 dark:border-white/[0.07]",
        i.status === "paid"
          ? "border-foreground/[0.07] bg-foreground/[0.02] dark:bg-white/[0.02]"
          : "border-amber-500/25 bg-amber-500/[0.05] dark:bg-amber-400/[0.05]"
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <span className="text-sm font-black text-foreground">
          قسط {faDigits(i.index)}
        </span>
        <span className="text-sm font-bold tabular-nums text-foreground/90">
          {faAmount(i.amount)} تومان
        </span>
        <span className="flex min-w-0 flex-col text-[0.65rem] font-semibold text-muted-foreground">
          <span className="truncate">{i.holder}</span>
          <span className="truncate">{i.course}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="select-none text-[0.65rem] font-semibold text-muted-foreground">
          سررسید: {faDate(i.dueDate)}
        </span>
        {relative ? <Chip className={relative.badge}>{relative.label}</Chip> : null}
        {status ? (
          <Chip className={status.badge}>
            {i.status === "paid" ? (
              <Check className="size-3" strokeWidth={3} />
            ) : i.status === "overdue" ? (
              <X className="size-3" strokeWidth={3} />
            ) : null}
            {status.label}
          </Chip>
        ) : null}
      </div>
    </div>
  );
}

/* ————————————————— اجزای مشترک ————————————————— */

/** ردیف فراداده — برچسب کم‌رنگ + مقدار پررنگ */
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] px-3.5 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.02]">
      <dt className="shrink-0 select-none text-[0.7rem] font-bold text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-left text-sm font-bold text-foreground">
        {children}
      </dd>
    </div>
  );
}

/** حالت خالی لیست‌های مالی */
function EmptyFinance({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        CARD,
        "flex flex-col items-center gap-4 px-6 py-12 text-center"
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
        {icon}
      </span>
      <div>
        <p className="text-base font-black text-foreground">{title}</p>
        <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

/* ————————————————— حالت‌های بارگذاری/دسترسی ————————————————— */

/** اسکلت بخش مالی — کارت‌های آماری + جدول + لیست‌ها */
function FinanceSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[0, 1, 2, 3].map((k) => (
          <div
            key={k}
            className="min-h-32 animate-pulse rounded-2xl bg-foreground/10 dark:bg-white/10 sm:min-h-36"
          />
        ))}
      </div>
      <div className="h-5 w-28 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
      <div className="h-40 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
      <div className="h-5 w-24 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
      <div className="h-52 animate-pulse rounded-2xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
      <div className="h-5 w-16 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
      <div className="h-36 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
    </div>
  );
}

/** کارت اعلان «دسترسی استاد ندارید» — 401/403 */
function DeniedNotice() {
  return (
    <div
      className={cn(
        CARD,
        "flex flex-col items-center gap-3 px-6 py-10 text-center"
      )}
      role="alert"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 dark:bg-amber-400/10">
        <ShieldAlert className="size-6 text-amber-600 dark:text-amber-300" />
      </span>
      <p className="text-sm font-black text-foreground">دسترسی استاد ندارید</p>
      <p className="max-w-sm text-xs leading-6 text-muted-foreground">
        این بخش فقط برای حساب‌های استاد فعال است؛ برای فعال‌سازی دسترسی استاد
        با پشتیبانی تماس بگیرید.
      </p>
    </div>
  );
}
