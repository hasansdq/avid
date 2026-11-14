"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Phone,
  TicketPercent,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import {
  PaymentEditButton,
  PaymentStatusSelect,
} from "@/components/admin/shared/payment-controls";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import type { Enrollment } from "@/components/admin/types";
import {
  ENROLLMENT_STATUSES,
  isEnrollmentStatus,
  type EnrollmentStatus,
} from "@/lib/course-theme";
import { faDate, faDigits } from "@/lib/fa";

type StatusFilter = "all" | EnrollmentStatus;
type PayFilter = "all" | "paid" | "pending" | "failed";

/* — نشان وضعیت پرداخت — */
const PAYMENT_STATUSES: Record<
  string,
  { label: string; badge: string }
> = {
  paid: {
    label: "پرداخت‌شده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  pending: {
    label: "در انتظار پرداخت",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
  failed: {
    label: "ناموفق",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
};

const METHOD_LABELS: Record<string, string> = {
  cash: "نقدی",
  installment: "اقساطی",
};

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

/**
 * ماژول «مدیریت پیش‌ثبت‌نام‌ها» —
 * لیست پیش‌ثبت‌نام‌های دریافتی از فرم عمومی + وضعیت پرداخت و کد تخفیف
 * هر مورد. تنظیمات درگاه، طرح اقساطی و کدهای تخفیف در ماژول
 * «تنظیمات درگاه پرداخت» مدیریت می‌شوند.
 */
export function EnrollmentsModule() {
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [changingId, setChangingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setEnrollments(
        await apiFetch<Enrollment[]>("/api/admin/enrollments")
      );
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      all: 0,
      new: 0,
      contacted: 0,
      enrolled: 0,
      archived: 0,
    };
    const pay: Record<PayFilter, number> = {
      all: 0,
      paid: 0,
      pending: 0,
      failed: 0,
    };
    for (const e of enrollments ?? []) {
      base.all += 1;
      const status = isEnrollmentStatus(e.status) ? e.status : "new";
      base[status] += 1;

      // فقط موارد دارای پرداخت در شمارش پرداخت می‌آیند
      if (e.paymentAmount) {
        pay.all += 1;
        if (e.paymentStatus in PAYMENT_STATUSES) pay[e.paymentStatus as PayFilter] += 1;
      }
    }
    return { base, pay };
  }, [enrollments]);

  const filtered = useMemo(() => {
    if (!enrollments) return [];
    return enrollments.filter((e) => {
      const statusOk =
        filter === "all" ||
        filter === (isEnrollmentStatus(e.status) ? e.status : "new");
      // فیلتر پرداخت فقط روی موارد دارای پرداخت اعمال می‌شود (هم‌خوان با شمارنده‌ها)
      const payOk =
        payFilter === "all" ||
        (!!e.paymentAmount && e.paymentStatus === payFilter);
      return statusOk && payOk;
    });
  }, [enrollments, filter, payFilter]);

  async function changeStatus(enrollment: Enrollment, next: string) {
    if (!isEnrollmentStatus(next)) return;
    setChangingId(enrollment.id);
    const previous = enrollment.status;
    // به‌روزرسانی خوش‌بینانه
    setEnrollments(
      (prev) =>
        prev?.map((e) => (e.id === enrollment.id ? { ...e, status: next } : e)) ??
        prev
    );
    try {
      await apiFetch<Enrollment>(`/api/admin/enrollments/${enrollment.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: next }),
      });
      toast.success(
        `وضعیت «${enrollment.name}» به ${ENROLLMENT_STATUSES[next].label} تغییر یافت`
      );
    } catch (error) {
      setEnrollments(
        (prev) =>
          prev?.map((e) =>
            e.id === enrollment.id ? { ...e, status: previous } : e
          ) ?? prev
      );
      toastApiError(error);
    } finally {
      setChangingId(null);
    }
  }

  async function handleDelete(enrollment: Enrollment) {
    try {
      await apiFetch(`/api/admin/enrollments/${enrollment.id}`, {
        method: "DELETE",
      });
      toast.success(`پیش‌ثبت‌نام «${enrollment.name}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /** به‌روزرسانی خوش‌بینانه‌ی یک ردیف (مثلاً تبدیل وضعیت پرداخت) */
  function applyEnrollmentPatch(id: string, patch: Partial<Enrollment>) {
    setEnrollments(
      (prev) =>
        prev?.map((e) => (e.id === id ? { ...e, ...patch } : e)) ?? prev
    );
  }

  const chips: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "همه", count: counts.base.all },
    ...(Object.keys(ENROLLMENT_STATUSES) as EnrollmentStatus[]).map((key) => ({
      key,
      label: ENROLLMENT_STATUSES[key].label,
      count: counts.base[key],
    })),
  ];

  const payChips: { key: PayFilter; label: string; count: number }[] = [
    { key: "all", label: "همه", count: counts.pay.all },
    { key: "paid", label: "پرداخت‌شده", count: counts.pay.paid },
    { key: "pending", label: "در انتظار", count: counts.pay.pending },
    { key: "failed", label: "ناموفق", count: counts.pay.failed },
  ];

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="مدیریت پیش‌ثبت‌نام‌ها"
        description={`لیست پیش‌ثبت‌نام‌های فرم سایت و وضعیت پرداخت هر مورد — مجموع ${faDigits(
          counts.base.all
        )} مورد، ${faDigits(counts.pay.paid)} پرداخت‌شده.`}
      />

      {/* فیلتر وضعیت پیگیری */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.65rem] font-black text-muted-foreground">
          پیگیری:
        </span>
        {chips.map((chip) => {
          const active = filter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary/40 bg-primary/15 text-accent-foreground"
                  : "glass text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              )}
            >
              {chip.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[0.6rem] font-black",
                  active
                    ? "bg-primary/25 text-accent-foreground"
                    : "bg-foreground/[0.06] text-muted-foreground"
                )}
              >
                {faDigits(chip.count)}
              </span>
            </button>
          );
        })}
      </div>

      {/* فیلتر وضعیت پرداخت — فقط وقتی پرداختی ثبت شده باشد */}
      {counts.pay.all > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.65rem] font-black text-muted-foreground">
            پرداخت:
          </span>
          {payChips.map((chip) => {
            const active = payFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setPayFilter(chip.key)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary/40 bg-primary/15 text-accent-foreground"
                    : "glass text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[0.6rem] font-black",
                    active
                      ? "bg-primary/25 text-accent-foreground"
                      : "bg-foreground/[0.06] text-muted-foreground"
                  )}
                >
                  {faDigits(chip.count)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* جدول */}
      {loading && !enrollments ? (
        <TableSkeleton rows={6} cols={8} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="پیش‌ثبت‌نامی یافت نشد"
          description={
            filter === "all" && payFilter === "all"
              ? "هنوز پیش‌ثبت‌نامی از فرم عمومی سایت دریافت نشده است."
              : "در این وضعیت موردی وجود ندارد؛ فیلتر دیگری را امتحان کنید."
          }
        />
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <div className="max-h-[70vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>شماره تماس</TableHead>
                  <TableHead>دوره</TableHead>
                  <TableHead>گروه</TableHead>
                  <TableHead>پرداخت</TableHead>
                  <TableHead>وضعیت پرداخت</TableHead>
                  <TableHead>وضعیت پیگیری</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => {
                  const status = isEnrollmentStatus(e.status) ? e.status : "new";
                  const meta = ENROLLMENT_STATUSES[status];
                  const pending = changingId === e.id;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-40 font-bold">
                        <span className="truncate">{e.name}</span>
                      </TableCell>
                      <TableCell dir="ltr" className="text-left">
                        <a
                          href={`tel:${e.phone}`}
                          className="flex items-center justify-start gap-1.5 font-semibold text-teal-600 transition-colors hover:underline dark:text-teal-300 dark:hover:text-teal-200"
                          title="تماس با متقاضی"
                        >
                          <Phone className="size-3.5" />
                          {e.phone}
                        </a>
                      </TableCell>
                      <TableCell className="max-w-40 text-sm text-muted-foreground">
                        <span className="block truncate" title={e.course}>
                          {e.course}
                        </span>
                      </TableCell>
                      <TableCell>
                        {e.groupTitle ? (
                          <Badge className="rounded-full border-0 bg-violet-500/15 px-2.5 py-1 text-[0.65rem] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" title={e.groupTitle}>
                            {e.groupTitle}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {e.paymentAmount ? (
                            <div className="space-y-0.5">
                              <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                {e.paymentMethod === "installment" ? (
                                  <CalendarClock className="size-3.5 text-violet-600 dark:text-violet-300" />
                                ) : (
                                  <Banknote className="size-3.5 text-teal-600 dark:text-teal-300" />
                                )}
                                {METHOD_LABELS[e.paymentMethod ?? "cash"] ?? "نقدی"}
                                <span className="tabular-nums">
                                  {faAmount(e.paymentAmount)}
                                </span>
                                <span className="text-[0.6rem] font-medium text-muted-foreground">
                                  تومان
                                </span>
                              </p>
                              {e.paymentRefId ? (
                                <p
                                  dir="ltr"
                                  className="truncate text-left text-[0.6rem] font-medium text-muted-foreground"
                                  title={`کد پیگیری: ${e.paymentRefId}`}
                                >
                                  {e.paymentRefId}
                                </p>
                              ) : null}
                              {e.discountCode ? (
                                <p
                                  className="flex items-center gap-1 text-[0.6rem] font-bold text-violet-600 dark:text-violet-300"
                                  title={`کد تخفیف اعمال‌شده: ${e.discountCode}`}
                                >
                                  <TicketPercent className="size-3" />
                                  {e.discountCode}
                                  {e.discountAmount ? (
                                    <span className="tabular-nums">
                                      (−{faAmount(e.discountAmount)})
                                    </span>
                                  ) : null}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">
                              بدون پرداخت
                            </span>
                          )}
                          {/* — ویرایش دستی مبلغ/وضعیت پرداخت (مخصوص پرداخت‌های نقدی) — */}
                          <PaymentEditButton
                            enrollment={e}
                            compact
                            label="ویرایش پرداخت"
                            onChanged={() => void load()}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.paymentAmount ? (
                          <PaymentStatusSelect
                            enrollmentId={e.id}
                            value={e.paymentStatus}
                            onChanged={(next) =>
                              applyEnrollmentPatch(e.id, {
                                paymentStatus: next,
                              })
                            }
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground/60">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={status}
                          onValueChange={(v) => changeStatus(e, v)}
                          disabled={pending}
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={`تغییر وضعیت ثبت‌نام ${e.name}`}
                            className={cn(
                              "h-7 w-auto gap-1.5 rounded-full border px-3 text-[0.65rem] font-bold",
                              meta.badge
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              Object.keys(ENROLLMENT_STATUSES) as EnrollmentStatus[]
                            ).map((key) => (
                              <SelectItem key={key} value={key}>
                                {ENROLLMENT_STATUSES[key].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarDays className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                          {faDate(e.createdAt)}
                        </span>
                        {e.paidAt ? (
                          <span className="mt-0.5 flex items-center gap-1.5 text-[0.6rem] font-semibold text-emerald-600 dark:text-emerald-300">
                            <CheckCircle2 className="size-3" />
                            پرداخت: {faDate(e.paidAt)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-left">
                        <ConfirmDelete
                          title="حذف پیش‌ثبت‌نام"
                          description={`پیش‌ثبت‌نام «${e.name}» برای همیشه حذف می‌شود. مطمئن هستید؟`}
                          onConfirm={() => handleDelete(e)}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`حذف پیش‌ثبت‌نام ${e.name}`}
                            title="حذف"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </ConfirmDelete>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* راهنمای پایانی */}
      <p className="flex items-center gap-2 text-[0.7rem] leading-5 text-muted-foreground">
        <ClipboardList className="size-3.5 shrink-0 text-teal-600/70 dark:text-teal-300/70" />
        پیش‌ثبت‌نام‌ها از فرم دومرحله‌ای سایت دریافت می‌شوند (مرحله‌ی اول:
        ثبت‌نام و تایید پیامکی شماره؛ مرحله‌ی دوم: انتخاب دوره/گروه و پرداخت).
        برای دوره‌های گروه‌دار (حضوری یا حضوری و آنلاین)، گروه انتخابی متقاضی در
        ستون «گروه» نمایش داده می‌شود. تنظیمات درگاه پرداخت، طرح اقساطی و کدهای تخفیف در ماژول
        «تنظیمات درگاه پرداخت» و شهریه‌ی نقدی/اقساطی هر دوره در فرم همان دوره
        (بخش «دوره‌ها») تعیین می‌شود.
      </p>
    </div>
  );
}
