"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  Hourglass,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { JalaliDateField } from "@/components/admin/shared/jalali-date-field";
import { tileGradient } from "@/components/admin/shared/styles";
import { UserPaymentsBody } from "@/components/admin/shared/user-payments-dialog";
import type { EnrollmentWithInstallments, User } from "@/components/admin/types";
import { faDate, faDigits } from "@/lib/fa";
import {
  isValidShaba,
  normalizeShaba,
  SHABA_INVALID_MESSAGE,
} from "@/lib/shaba";

/**
 * دیالوگ «پرداختی‌ها و اقساط» استاد — با دکمه‌ی کیف‌پول روبروی هر استاد
 * (تب «اساتید» در ماژول مدیریت کاربران) باز می‌شود و دو تب دارد:
 *
 *  ۱. پرداختی‌ها و اقساط — همان محتوای دیالوگ کاربر (UserPaymentsBody):
 *     پرداخت‌ها + اقساط ثبت‌نام‌های خودِ استاد با ثبت دستی پرداخت هر قسط.
 *  ۲. درآمد استاد و شبا — درآمد کل (همان محاسبه‌ی پنل خود استاد)، شماره‌ی
 *     شبا (قابل ویرایش)، وضعیت واریز درآمد و فهرست واریزی‌های دستی
 *     (ثبت/ویرایش/حذف).
 */

/** پاسخ GET /api/admin/teachers/[id]/finance */
interface TeacherFinanceResponse {
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    shabaNumber: string | null;
  };
  summary: {
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
  };
  payouts: TeacherPayoutItem[];
  payoutSummary: {
    paidAmount: number;
    pendingAmount: number;
    pendingCount: number;
    count: number;
    remaining: number;
    settled: boolean;
  };
}

/** یک واریزی درآمد استاد */
interface TeacherPayoutItem {
  id: string;
  amount: number;
  status: string;
  note: string | null;
  paidAt: string | null;
  createdAt: string;
}

/* ————————————————— ابزارهای محلی ————————————————— */

/** نام نمایشی استاد (یا شماره‌ی او اگر نامی نداشت) */
function displayName(u: Pick<User, "firstName" | "lastName" | "phone">): string {
  const name = `${u.firstName} ${u.lastName}`.trim();
  return name || faDigits(u.phone);
}

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/** تبدیل ورودی رقمی (فارسی/انگلیسی با جداکننده) به عدد */
function parseAmount(v: string): number {
  const faToEn = v.replace(/[۰-۹]/g, (d) =>
    String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
  );
  const digits = faToEn.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

/** تبدیل تاریخ به قالب ورودی تاریخ (YYYY-MM-DD) */
function toDateInput(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** پیش‌نویس فرم واریزی (همه‌چیز رشته؛ هنگام ذخیره تبدیل می‌شود) */
interface PayoutDraft {
  amount: string;
  status: "paid" | "pending";
  paidAt: string;
  note: string;
}

const EMPTY_DRAFT: PayoutDraft = {
  amount: "",
  status: "paid",
  paidAt: toDateInput(new Date()),
  note: "",
};

/** وضعیت‌های واریزی با نشان رنگی */
const PAYOUT_STATUS: Record<string, { label: string; badge: string }> = {
  paid: {
    label: "واریز‌شده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  pending: {
    label: "در انتظار واریز",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
};

/* ————————————————— دیالوگ اصلی ————————————————— */

export function TeacherPaymentsDialog({
  teacher,
  open,
  onOpenChange,
  onManageInstallments,
  onChanged,
}: {
  teacher: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** باز کردن دیالوگ مدیریت اقساط برای یک ثبت‌نام (تب پرداختی‌ها) */
  onManageInstallments: (enrollment: EnrollmentWithInstallments) => void;
  /** پس از هر تغییر (شبا/واریزی/پرداخت قسط) — تازه‌سازی فهرست اساتید و کاربران در والد */
  onChanged?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-h-[88vh] overflow-y-auto rounded-2xl sm:max-w-3xl"
      >
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4 text-teal-600 dark:text-teal-300" />
            پرداختی‌ها و اقساط
            {teacher ? (
              <span className="text-muted-foreground">— {displayName(teacher)}</span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="leading-6">
            {teacher
              ? `دو تب: «پرداختی‌ها و اقساط» (ثبت‌نام‌ها و اقساط خودِ «${displayName(teacher)}») و «درآمد استاد و شبا» (درآمد، شماره شبا و وضعیت واریز درآمد — قابل ویرایش و ثبت واریزی دستی).`
              : "پرداختی‌ها، اقساط و درآمد استاد"}
          </DialogDescription>
        </DialogHeader>

        {teacher ? (
          <Tabs dir="rtl" defaultValue="payments" className="gap-4">
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl p-1">
              <TabsTrigger value="payments" className="gap-1.5 rounded-lg text-xs font-bold">
                <Wallet className="size-3.5" />
                پرداختی‌ها و اقساط
              </TabsTrigger>
              <TabsTrigger value="income" className="gap-1.5 rounded-lg text-xs font-bold">
                <Banknote className="size-3.5" />
                درآمد استاد و شبا
              </TabsTrigger>
            </TabsList>

            {/* — تب ۱: پرداختی‌ها و اقساط — همان محتوای دیالوگ کاربر — */}
            <TabsContent value="payments" className="mt-0">
              <UserPaymentsBody
                user={teacher}
                onManageInstallments={onManageInstallments}
                onChanged={onChanged}
              />
            </TabsContent>

            {/* — تب ۲: درآمد استاد و شبا — */}
            <TabsContent value="income" className="mt-0">
              <TeacherIncomeTab teacher={teacher} onChanged={onChanged} />
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ————————————————— تب «درآمد استاد و شبا» ————————————————— */

function TeacherIncomeTab({
  teacher,
  onChanged,
}: {
  teacher: User;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<TeacherFinanceResponse | null>(null);
  const [loading, setLoading] = useState(false);

  /** دریافت تازه‌ی درآمد/شبا/واریزی‌های استاد */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch<TeacherFinanceResponse>(
        `/api/admin/teachers/${teacher.id}/finance`
      );
      setData(res);
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, [teacher.id]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={Banknote}
        title="درآمد استاد در دسترس نیست"
        description="دریافت اطلاعات مالی این استاد ناموفق بود؛ دوباره تلاش کنید."
      />
    );
  }

  const s = data.summary;
  const ps = data.payoutSummary;

  /* — کاشی‌های درآمد — */
  const tiles: { label: string; value: string; icon: typeof Wallet }[] = [
    {
      label: "درآمد کل استاد",
      value: `${faAmount(s.totalIncome)} تومان`,
      icon: Wallet,
    },
    {
      label: "فروش نقدی دریافتی",
      value: `${faAmount(s.salesPaidAmount)} تومان`,
      icon: Banknote,
    },
    {
      label: "اقساط دریافتی",
      value: `${faAmount(s.installmentsPaidAmount)} تومان`,
      icon: ReceiptText,
    },
    {
      label: "دانشجوهای یکتا",
      value: faDigits(s.studentsCount),
      icon: Users,
    },
  ];

  return (
    <div className="space-y-3">
      {/* — کاشی‌های درآمد — */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="glass flex items-center gap-2.5 rounded-2xl p-3"
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tileGradient} shadow-md`}
              aria-hidden
            >
              <tile.icon className="size-4 text-white" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.6rem] font-bold text-muted-foreground">
                {tile.label}
              </p>
              <p className="truncate text-xs font-black tabular-nums text-foreground">
                {tile.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* — شبا + وضعیت واریز — */}
      <ShabaSection
        teacherId={teacher.id}
        initialShaba={data.teacher.shabaNumber}
        payoutSummary={ps}
        onChanged={load}
      />

      {/* — واریزی‌های دستی — */}
      <PayoutsSection
        teacherId={teacher.id}
        teacherName={displayName(teacher)}
        payouts={data.payouts}
        totalIncome={s.totalIncome}
        onChanged={() => {
          void load();
          onChanged?.();
        }}
      />

      {loading ? (
        <p className="sr-only" aria-live="polite">
          در حال به‌روزرسانی درآمد استاد...
        </p>
      ) : null}
    </div>
  );
}

/* ————————————————— بخش شبا و وضعیت واریز ————————————————— */

/** نمایش/ویرایش شماره‌ی شبای استاد (توسط مدیر) + وضعیت واریز درآمد */
function ShabaSection({
  teacherId,
  initialShaba,
  payoutSummary,
  onChanged,
}: {
  teacherId: string;
  initialShaba: string | null;
  payoutSummary: TeacherFinanceResponse["payoutSummary"];
  /** پس از ذخیره‌ی شبا — تازه‌سازی داده‌های والد */
  onChanged: () => void;
}) {
  const [shaba, setShaba] = useState(initialShaba ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setShaba(initialShaba ?? "");
  }, [initialShaba, editing]);

  /** ذخیره‌ی شبا — PUT /api/admin/teachers/[id]/finance */
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
      await apiFetch(`/api/admin/teachers/${teacherId}/finance`, {
        method: "PUT",
        body: JSON.stringify({ shabaNumber: clean }),
      });
      setEditing(false);
      toast.success(clean === "" ? "شماره شبا حذف شد." : "شماره شبا ذخیره شد.");
      onChanged();
    } catch (e) {
      toastApiError(e);
      setError(
        e instanceof Error && e.message !== "خطای ناشناخته رخ داد."
          ? e.message
          : "ذخیره‌ی شماره شبا ناموفق بود."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="glass space-y-3 rounded-2xl p-4">
      {/* سربرگ: عنوان + وضعیت واریز درآمد */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
          <Landmark className="size-4 text-teal-600 dark:text-teal-300" />
          شماره شبا و وضعیت واریز درآمد
        </h3>
        {payoutSummary.settled ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.65rem] font-black",
              PAYOUT_STATUS.paid.badge
            )}
          >
            <CheckCircle2 className="size-3" />
            درآمد تسویه شده
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.65rem] font-black",
              PAYOUT_STATUS.pending.badge
            )}
          >
            <Hourglass className="size-3" />
            درآمد در انتظار واریز
          </span>
        )}
      </div>

      {/* مقدار شبا — نمایش یا ویرایش */}
      {editing ? (
        <div className="space-y-2">
          <Input
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
            aria-label="شماره شبای استاد"
            aria-invalid={!!error}
            className={cn(
              "h-11 rounded-xl bg-foreground/[0.03] font-mono text-sm tracking-wider dark:bg-white/[0.04]",
              error && "border-red-500/60 dark:border-red-400/50"
            )}
          />
          {error ? (
            <p role="alert" className="text-[0.68rem] font-bold text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : (
            <p className="text-[0.62rem] leading-5 text-muted-foreground">
              قالب صحیح: IR و سپس ۲۴ رقم؛ خالی بگذارید تا شبا حذف شود.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void save()}
              disabled={saving}
              className="h-9 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-4 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/20 transition-all hover:scale-[1.01] disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              ذخیره
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(false);
                setShaba(initialShaba ?? "");
                setError(null);
              }}
              disabled={saving}
              className="h-9 rounded-xl px-4 text-xs font-bold"
            >
              <X className="size-4" />
              انصراف
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] px-3.5 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.02]">
          {initialShaba ? (
            <p
              dir="ltr"
              className="min-w-0 select-all break-all font-mono text-sm font-bold tracking-wider text-foreground"
            >
              {initialShaba}
            </p>
          ) : (
            <p className="text-xs font-bold text-muted-foreground">
              شماره شبایی برای واریز درآمد این استاد ثبت نشده است.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            className="h-8 shrink-0 rounded-xl border-teal-500/30 px-3 text-[0.68rem] font-bold text-teal-700 hover:bg-teal-500/10 dark:border-teal-400/30 dark:text-teal-300 dark:hover:bg-teal-400/10"
          >
            <Pencil className="size-3.5" />
            {initialShaba ? "ویرایش شبا" : "ثبت شبا"}
          </Button>
        </div>
      )}

      {/* — خلاصه‌ی وضعیت واریز درآمد — */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-3.5" />
          واریز‌شده: {faAmount(payoutSummary.paidAmount)} تومان
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="font-bold text-amber-700 dark:text-amber-300">
          مانده: {faAmount(payoutSummary.remaining)} تومان
        </span>
        {payoutSummary.pendingCount > 0 ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold text-violet-700 dark:text-violet-300">
              {faDigits(payoutSummary.pendingCount)} واریز در انتظار
            </span>
          </>
        ) : null}
      </div>
    </article>
  );
}

/* ————————————————— بخش واریزی‌های دستی ————————————————— */

/** فهرست واریزی‌های درآمد استاد + فرم ثبت واریزی دستی + ویرایش/حذف */
function PayoutsSection({
  teacherId,
  teacherName,
  payouts,
  totalIncome,
  onChanged,
}: {
  teacherId: string;
  teacherName: string;
  payouts: TeacherPayoutItem[];
  totalIncome: number;
  onChanged: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<PayoutDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<TeacherPayoutItem | null>(null);
  const [editDraft, setEditDraft] = useState<PayoutDraft>(EMPTY_DRAFT);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  /** آماده‌سازی فرم افزودن واریزی */
  function openForm() {
    setDraft({ ...EMPTY_DRAFT, paidAt: toDateInput(new Date()) });
    setError(null);
    setFormOpen(true);
  }

  /** ثبت واریزی دستی — POST /api/admin/teachers/[id]/payouts */
  async function create() {
    if (saving) return;
    const amount = parseAmount(draft.amount);
    if (amount <= 0) {
      setError("مبلغ واریزی (تومان) را وارد کنید.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/teachers/${teacherId}/payouts`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          status: draft.status,
          ...(draft.paidAt ? { paidAt: draft.paidAt } : {}),
          ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
        }),
      });
      toast.success("واریزی دستی درآمد استاد ثبت شد.");
      setFormOpen(false);
      setDraft({ ...EMPTY_DRAFT, paidAt: toDateInput(new Date()) });
      onChanged();
    } catch (e) {
      toastApiError(e);
      setError(
        e instanceof Error && e.message !== "خطای ناشناخته رخ داد."
          ? e.message
          : "ثبت واریزی ناموفق بود."
      );
    } finally {
      setSaving(false);
    }
  }

  /** آماده‌سازی ویرایش یک واریزی */
  function openEdit(p: TeacherPayoutItem) {
    setEditing(p);
    setEditError(null);
    setEditDraft({
      amount: String(p.amount),
      status: p.status === "pending" ? "pending" : "paid",
      paidAt: toDateInput(p.paidAt),
      note: p.note ?? "",
    });
  }

  /** ذخیره‌ی ویرایش واریزی — PUT /api/admin/teachers/[id]/payouts/[payoutId] */
  async function saveEdit() {
    if (!editing || editSaving) return;
    const amount = parseAmount(editDraft.amount);
    if (amount <= 0) {
      setEditError("مبلغ واریزی (تومان) را وارد کنید.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await apiFetch(
        `/api/admin/teachers/${teacherId}/payouts/${editing.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            amount,
            status: editDraft.status,
            paidAt: editDraft.paidAt,
            note: editDraft.note.trim(),
          }),
        }
      );
      toast.success("واریزی به‌روزرسانی شد.");
      setEditing(null);
      onChanged();
    } catch (e) {
      toastApiError(e);
      setEditError(
        e instanceof Error && e.message !== "خطای ناشناخته رخ داد."
          ? e.message
          : "ویرایش واریزی ناموفق بود."
      );
    } finally {
      setEditSaving(false);
    }
  }

  /** حذف واریزی — DELETE /api/admin/teachers/[id]/payouts/[payoutId] */
  async function remove(payoutId: string) {
    try {
      await apiFetch(
        `/api/admin/teachers/${teacherId}/payouts/${payoutId}`,
        { method: "DELETE" }
      );
      toast.success("واریزی حذف شد.");
      onChanged();
    } catch (e) {
      toastApiError(e);
    }
  }

  return (
    <section className="space-y-3">
      {/* سربرگ: عنوان + دکمه‌ی ثبت واریزی دستی */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
          <ReceiptText className="size-4 text-emerald-600 dark:text-emerald-300" />
          واریزی‌های درآمد استاد
          <span className="text-[0.62rem] font-bold text-muted-foreground">
            ({faDigits(payouts.length)} واریزی)
          </span>
        </h3>
        <Button
          type="button"
          size="sm"
          onClick={openForm}
          className="h-9 rounded-xl bg-gradient-to-l from-emerald-400 to-teal-500 px-4 text-xs font-black text-emerald-950 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.01]"
        >
          <Plus className="size-4" />
          ثبت واریزی دستی
        </Button>
      </div>

      {/* — فرم ثبت واریزی دستی — */}
      {formOpen ? (
        <PayoutFormFields
          draft={draft}
          onDraftChange={setDraft}
          error={error}
          submitLabel="ثبت واریزی"
          busy={saving}
          onSubmit={create}
          onCancel={() => setFormOpen(false)}
        />
      ) : null}

      {/* — فهرست واریزی‌ها — */}
      {payouts.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="واریزی ثبت نشده"
          description={`هنوز واریزی از درآمد «${teacherName}» ثبت نشده است — با «ثبت واریزی دستی» مبلغ منتقل‌شده به شماره شبای استاد را ثبت کنید.`}
        />
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pe-1">
          {payouts.map((p) => {
            const meta = PAYOUT_STATUS[p.status] ?? PAYOUT_STATUS.paid;

            /* — حالت ویرایش: فرم درجا جای محتوای ردیف می‌نشیند — */
            if (editing && editing.id === p.id) {
              return (
                <PayoutFormFields
                  key={p.id}
                  draft={editDraft}
                  onDraftChange={setEditDraft}
                  error={editError}
                  submitLabel="ذخیره تغییرات"
                  busy={editSaving}
                  onSubmit={saveEdit}
                  onCancel={() => setEditing(null)}
                  compact
                />
              );
            }

            return (
              <div
                key={p.id}
                className="glass flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-2xl px-3.5 py-2.5"
              >
                {/* مبلغ + وضعیت */}
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-xs font-black tabular-nums text-foreground">
                    {faAmount(p.amount)}
                    <span className="text-[0.6rem] font-medium text-muted-foreground">
                      {" "}
                      تومان
                    </span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.62rem] font-bold",
                      meta.badge
                    )}
                  >
                    {p.status === "paid" ? (
                      <CheckCircle2 className="size-3" />
                    ) : (
                      <Hourglass className="size-3" />
                    )}
                    {meta.label}
                  </span>
                </span>

                {/* تاریخ + یادداشت + عملیات */}
                <span className="flex flex-wrap items-center gap-2 text-[0.65rem] text-muted-foreground">
                  {p.note ? (
                    <span className="max-w-44 truncate font-medium" title={p.note}>
                      {p.note}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {p.paidAt ? faDate(p.paidAt) : "بدون تاریخ"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(p)}
                    aria-label={`ویرایش واریزی ${faAmount(p.amount)} تومانی`}
                    title="ویرایش واریزی (مبلغ، وضعیت، تاریخ و یادداشت)"
                    className="size-7 rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <ConfirmDelete
                    title="حذف واریزی"
                    description={`واریزی ${faAmount(p.amount)} تومانی از درآمد «${teacherName}» حذف شود؟ وضعیت تسویه/مانده‌ی درآمد استاد همین‌جا بازمحاسبه می‌شود.`}
                    onConfirm={() => void remove(p.id)}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`حذف واریزی ${faAmount(p.amount)} تومانی`}
                      title="حذف واریزی"
                      className="size-7 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </ConfirmDelete>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* — یادداشت جمع‌بندی — */}
      <p className="text-[0.62rem] leading-5 text-muted-foreground">
        درآمد کل استاد {faAmount(totalIncome)} تومان است؛ جمع واریزی‌های
        «واریز‌شده» با آن مقایسه می‌شود و مانده‌ی تسویه در بالا نشان داده
        می‌شود.
      </p>
    </section>
  );
}

/* ————————————————— فرم واریزی (ثبت/ویرایش مشترک) ————————————————— */

function PayoutFormFields({
  draft,
  onDraftChange,
  error,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  compact = false,
}: {
  draft: PayoutDraft;
  onDraftChange: (draft: PayoutDraft) => void;
  error: string | null;
  submitLabel: string;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const set = (patch: Partial<PayoutDraft>) =>
    onDraftChange({ ...draft, ...patch });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={cn(
        "glass space-y-3 rounded-2xl border-emerald-500/25 p-3.5",
        compact && "border-dashed"
      )}
    >
      <p className="flex items-center gap-1.5 text-[0.7rem] font-black text-foreground">
        <Plus className="size-3.5 text-emerald-600 dark:text-emerald-300" />
        {compact ? "ویرایش واریزی" : "ثبت واریزی دستی درآمد استاد"}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* — مبلغ — */}
        <div className="space-y-1.5">
          <Label
            htmlFor={compact ? "payout-edit-amount" : "payout-amount"}
            className="text-[0.68rem] font-bold text-muted-foreground"
          >
            مبلغ واریزی (تومان)
          </Label>
          <Input
            id={compact ? "payout-edit-amount" : "payout-amount"}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            value={draft.amount}
            onChange={(e) => set({ amount: e.target.value })}
            placeholder="۲٫۰۰۰٫۰۰۰"
            className="h-10 rounded-xl bg-foreground/[0.03] tabular-nums dark:bg-white/[0.04]"
          />
        </div>

        {/* — وضعیت — */}
        <div className="space-y-1.5">
          <Label
            htmlFor={compact ? "payout-edit-status" : "payout-status"}
            className="text-[0.68rem] font-bold text-muted-foreground"
          >
            وضعیت واریز
          </Label>
          <Select
            value={draft.status}
            onValueChange={(v) => set({ status: v as PayoutDraft["status"] })}
          >
            <SelectTrigger
              id={compact ? "payout-edit-status" : "payout-status"}
              className="h-10 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paid">واریز‌شده</SelectItem>
              <SelectItem value="pending">در انتظار واریز</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* — تاریخ واریز — */}
        <div className="space-y-1.5">
          <Label
            htmlFor={compact ? "payout-edit-date" : "payout-date"}
            className="text-[0.68rem] font-bold text-muted-foreground"
          >
            تاریخ واریز (اختیاری)
          </Label>
          <JalaliDateField
            id={compact ? "payout-edit-date" : "payout-date"}
            value={draft.paidAt}
            onChange={(v) => set({ paidAt: v })}
            clearable
            className="h-10 rounded-xl"
          />
        </div>

        {/* — یادداشت — */}
        <div className="space-y-1.5">
          <Label
            htmlFor={compact ? "payout-edit-note" : "payout-note"}
            className="text-[0.68rem] font-bold text-muted-foreground"
          >
            یادداشت (اختیاری)
          </Label>
          <Input
            id={compact ? "payout-edit-note" : "payout-note"}
            value={draft.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="مثلاً شماره پیگیری واریز"
            maxLength={300}
            className="h-10 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[0.68rem] font-bold text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : (
        <p className="text-[0.62rem] leading-5 text-muted-foreground">
          واریز «شده» بدون تاریخ، تاریخ امروز را می‌گیرد؛ جمع واریزهای
          «واریز‌شده» با درآمد کل استاد مقایسه می‌شود.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy}
          className="h-9 rounded-xl bg-gradient-to-l from-emerald-400 to-teal-500 px-4 text-xs font-black text-emerald-950 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.01] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          className="h-9 rounded-xl px-4 text-xs font-bold"
        >
          <X className="size-4" />
          انصراف
        </Button>
      </div>
    </form>
  );
}
