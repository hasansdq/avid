"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Hourglass,
  Inbox,
  Phone,
  RefreshCw,
  Search,
  TicketPercent,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/admin/shared/empty-state";
import {
  PAYMENT_STATUS_META,
  PaymentEditButton,
  PaymentStatusSelect,
} from "@/components/admin/shared/payment-controls";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import { tileGradient } from "@/components/admin/shared/styles";
import { faAmount } from "@/components/admin/shared/installments-overview";
import type { Enrollment } from "@/components/admin/types";
import { faDate, faDigits } from "@/lib/fa";

/* ------------------------------------------------------------------ */
/*  انواع                                                              */
/* ------------------------------------------------------------------ */

/** آمار خلاصه‌ی پرداخت‌های نقدی */
export interface CashPaymentsStats {
  total: number;
  totalAmount: number;
  paid: number;
  paidAmount: number;
  pending: number;
  pendingAmount: number;
  failed: number;
  failedAmount: number;
}

/** برچسب درگاه پرداخت (مطابق نمایش دیالوگ پرداختی‌های کاربر) */
const GATEWAY_LABELS: Record<string, string> = {
  zarinpal: "زرین‌پال",
  payping: "پی‌پینگ",
  test: "آزمایشی",
};

/** آیا این ثبت‌نام یک «پرداخت نقدی» است؟ (نه اقساطی و بدون مبلغ ثبت‌شده) */
export function isCashPayment(e: Enrollment): boolean {
  return e.paymentAmount != null && e.paymentMethod !== "installment";
}

/* ------------------------------------------------------------------ */
/*  هوک دریافت پرداخت‌های نقدی                                          */
/* ------------------------------------------------------------------ */

/**
 * هوک مشترک پرداخت‌های نقدی — فهرست ثبت‌نام‌های «نقدی» (یک‌جا و کامل مبلغ
 * دوره) را از GET /api/admin/enrollments می‌گیرد، فیلتر می‌کند و آمار
 * خلاصه‌ی هر وضعیت را حساب می‌کند.
 */
export function useCashPayments() {
  const [payments, setPayments] = useState<Enrollment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const all = await apiFetch<Enrollment[]>("/api/admin/enrollments");
      setPayments(all.filter(isCashPayment));
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** به‌روزرسانی خوش‌بینانه‌ی وضعیت یک پرداخت (بدون درخواست مجدد) */
  const updateStatus = useCallback((id: string, status: string) => {
    setPayments(
      (prev) =>
        prev?.map((p) => (p.id === id ? { ...p, paymentStatus: status } : p)) ??
        prev
    );
  }, []);

  const stats = useMemo<CashPaymentsStats>(() => {
    const base: CashPaymentsStats = {
      total: 0,
      totalAmount: 0,
      paid: 0,
      paidAmount: 0,
      pending: 0,
      pendingAmount: 0,
      failed: 0,
      failedAmount: 0,
    };
    for (const p of payments ?? []) {
      base.total += 1;
      base.totalAmount += p.paymentAmount ?? 0;
      if (p.paymentStatus in PAYMENT_STATUS_META) {
        if (p.paymentStatus === "paid") {
          base.paid += 1;
          base.paidAmount += p.paymentAmount ?? 0;
        } else if (p.paymentStatus === "failed") {
          base.failed += 1;
          base.failedAmount += p.paymentAmount ?? 0;
        } else {
          base.pending += 1;
          base.pendingAmount += p.paymentAmount ?? 0;
        }
      } else {
        base.pending += 1;
        base.pendingAmount += p.paymentAmount ?? 0;
      }
    }
    return base;
  }, [payments]);

  return { payments, stats, loading, refreshing, reload: load, updateStatus };
}

/* ------------------------------------------------------------------ */
/*  کارت آماری                                                          */
/* ------------------------------------------------------------------ */

function CashStatCard({
  icon: Icon,
  tile,
  label,
  value,
  sub,
  isAmount = false,
}: {
  icon: typeof Wallet;
  tile: string;
  label: string;
  value: string;
  sub: string;
  isAmount?: boolean;
}) {
  return (
    <div className="glass relative flex flex-col gap-2.5 rounded-2xl p-4">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ${tile}`}
        >
          <Icon className="size-4.5 text-white" strokeWidth={1.9} />
        </span>
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
      </div>
      <div>
        <p
          className={cn(
            "font-black tracking-tight text-foreground",
            isAmount ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-[0.65rem] leading-5 text-muted-foreground">
          {sub}
        </p>
      </div>
    </div>
  );
}

/** کارت‌های خلاصه‌ی پرداخت‌های نقدی — کل، پرداخت‌شده، در انتظار و ناموفق */
export function CashPaymentsSummaryCards({
  stats,
}: {
  stats: CashPaymentsStats;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <CashStatCard
        icon={Wallet}
        tile="from-teal-400 to-emerald-600"
        label="کل پرداخت‌های نقدی"
        value={faDigits(stats.total)}
        sub={`${faAmount(stats.totalAmount)} تومان مجموع`}
      />
      <CashStatCard
        icon={CheckCircle2}
        tile="from-emerald-400 to-teal-600"
        label="پرداخت‌شده"
        value={faDigits(stats.paid)}
        sub={`${faAmount(stats.paidAmount)} تومان تسویه‌شده`}
      />
      <CashStatCard
        icon={Hourglass}
        tile="from-amber-400 to-orange-500"
        label="در انتظار"
        value={faDigits(stats.pending)}
        sub={`${faAmount(stats.pendingAmount)} تومان در انتظار`}
      />
      <CashStatCard
        icon={XCircle}
        tile="from-rose-400 to-red-600"
        label="ناموفق"
        value={faDigits(stats.failed)}
        sub={`${faAmount(stats.failedAmount)} تومان ناموفق`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  تب «پرداخت‌های نقدی»                                                */
/* ------------------------------------------------------------------ */

type CashStatusFilter = "all" | "paid" | "pending" | "failed";

/**
 * تب «پرداخت‌های نقدی» ماژول پرداختی‌ها — همه‌ی ثبت‌نام‌هایی که مبلغ دوره را
 * یک‌جا (نقدی) پرداخته‌اند: خلاصه‌ی آماری + فیلتر وضعیت + جست‌وجو +
 * جدول/کارت‌ها با تغییر وضعیت و ویرایش دستی پرداخت.
 */
export function CashPaymentsSection({
  payments,
  stats,
  loading,
  refreshing,
  onReload,
  onStatusChanged,
}: {
  payments: Enrollment[] | null;
  stats: CashPaymentsStats;
  loading: boolean;
  refreshing: boolean;
  /** تازه‌سازی بی‌صدا — پس از ویرایش دستی مبلغ/وضعیت */
  onReload: () => void;
  /** پس از تغییر وضعیت با سلکت — به‌روزرسانی خوش‌بینانه‌ی همان ردیف */
  onStatusChanged: (id: string, status: string) => void;
}) {
  const [filter, setFilter] = useState<CashStatusFilter>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");

  /* — جست‌وجو با تأخیر — */
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = useMemo(() => {
    if (!payments) return [];
    return payments.filter((e) => {
      const statusOk = filter === "all" || e.paymentStatus === filter;
      const needle = query.replace(/[۰-۹]/g, (d) =>
        String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      );
      const textOk =
        !needle ||
        [e.name, e.phone, e.course, e.groupTitle ?? "", e.paymentRefId ?? "", e.discountCode ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle.toLowerCase());
      return statusOk && textOk;
    });
  }, [payments, filter, query]);

  const chips: { key: CashStatusFilter; label: string; count: number }[] = [
    { key: "all", label: "همه", count: stats.total },
    { key: "paid", label: "پرداخت‌شده", count: stats.paid },
    { key: "pending", label: "در انتظار", count: stats.pending },
    { key: "failed", label: "ناموفق", count: stats.failed },
  ];

  const showSkeleton = loading && !payments;
  const showEmpty = !showSkeleton && filtered.length === 0;

  return (
    <div className="space-y-5">
      {/* — کارت‌های خلاصه — */}
      <CashPaymentsSummaryCards stats={stats} />

      {/* — فیلتر وضعیت — */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.65rem] font-black text-muted-foreground">
          وضعیت:
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

      {/* — فیلترها: جست‌وجو + به‌روزرسانی — */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نام، شماره موبایل، دوره یا کد پیگیری..."
            aria-label="جستجوی پرداخت نقدی"
            className="h-11 rounded-xl bg-foreground/[0.03] pr-10 text-sm dark:bg-white/[0.04]"
          />
        </div>
        <Button
          variant="outline"
          onClick={onReload}
          disabled={refreshing}
          aria-label="به‌روزرسانی پرداخت‌های نقدی"
          title="به‌روزرسانی"
          className="h-11 rounded-xl px-4 font-bold"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          <span className="sm:hidden">به‌روزرسانی</span>
        </Button>
      </div>

      {/* — جدول (دسکتاپ) + کارت (موبایل) — */}
      {showSkeleton ? (
        <>
          <div className="hidden md:block">
            <TableSkeleton rows={6} cols={6} />
          </div>
          <div className="space-y-3 md:hidden" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass h-32 animate-pulse rounded-2xl" />
            ))}
          </div>
        </>
      ) : showEmpty ? (
        <EmptyState
          icon={Inbox}
          title="پرداخت نقدی یافت نشد"
          description={
            query || filter !== "all"
              ? "با این فیلتر/جست‌وجو موردی وجود ندارد؛ فیلتر دیگری را امتحان کنید."
              : "هنوز پرداخت نقدی ثبت نشده است — با ثبت‌نام نقدی کاربران از فرم سایت، اینجا نمایش داده می‌شود."
          }
        />
      ) : payments ? (
        <>
          {/* — جدول دسکتاپ — */}
          <div className="glass hidden overflow-hidden rounded-2xl md:block">
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کاربر</TableHead>
                    <TableHead>دوره</TableHead>
                    <TableHead>مبلغ نقدی</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>درگاه / پیگیری</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => {
                    const meta =
                      PAYMENT_STATUS_META[e.paymentStatus] ??
                      PAYMENT_STATUS_META.pending;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="max-w-44">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white ${tileGradient} shadow-md`}
                              aria-hidden
                            >
                              {e.name.trim().charAt(0) || "؟"}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-foreground">
                                {e.name}
                              </p>
                              <a
                                href={`tel:${e.phone}`}
                                dir="ltr"
                                className="flex w-fit items-center justify-start gap-1 text-xs font-semibold text-teal-600 transition-colors hover:underline dark:text-teal-300 dark:hover:text-teal-200"
                                title="تماس با کاربر"
                              >
                                <Phone className="size-3" />
                                {faDigits(e.phone)}
                              </a>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-40">
                          <span
                            className="block truncate text-sm text-foreground"
                            title={e.course}
                          >
                            {e.course}
                          </span>
                          {e.groupTitle ? (
                            <Badge
                              className="mt-1 rounded-full border-0 bg-violet-500/15 px-2.5 py-0.5 text-[0.6rem] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300"
                              title={e.groupTitle}
                            >
                              {e.groupTitle}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <p className="flex items-center gap-1.5 text-xs font-bold tabular-nums text-foreground">
                            <Banknote className="size-3.5 text-teal-600 dark:text-teal-300" />
                            {faAmount(e.paymentAmount ?? 0)}
                            <span className="text-[0.6rem] font-medium text-muted-foreground">
                              تومان
                            </span>
                          </p>
                          {e.discountCode ? (
                            <p
                              className="mt-0.5 flex items-center gap-1 text-[0.6rem] font-bold text-violet-600 dark:text-violet-300"
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
                        </TableCell>
                        <TableCell>
                          <PaymentStatusSelect
                            enrollmentId={e.id}
                            value={e.paymentStatus}
                            compact
                            onChanged={(next) =>
                              onStatusChanged(e.id, next)
                            }
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {e.paymentGateway || e.paymentRefId ? (
                            <div className="space-y-0.5">
                              {e.paymentGateway ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-bold",
                                    meta.badge
                                  )}
                                  title={`درگاه پرداخت: ${
                                    GATEWAY_LABELS[e.paymentGateway] ??
                                    e.paymentGateway
                                  }`}
                                >
                                  {GATEWAY_LABELS[e.paymentGateway] ??
                                    e.paymentGateway}
                                </span>
                              ) : null}
                              {e.paymentRefId ? (
                                <p
                                  dir="ltr"
                                  className="truncate text-left text-[0.6rem] font-medium tabular-nums text-muted-foreground"
                                  title={`کد پیگیری: ${e.paymentRefId}`}
                                >
                                  {e.paymentRefId}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">
                              —
                            </span>
                          )}
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
                          <PaymentEditButton
                            enrollment={e}
                            compact
                            label="ویرایش"
                            onChanged={onReload}
                          />
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
            {filtered.map((e) => {
              return (
                <article key={e.id} className="glass space-y-3 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-black text-white ${tileGradient} shadow-md`}
                      aria-hidden
                    >
                      {e.name.trim().charAt(0) || "؟"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-foreground">
                        {e.name}
                      </p>
                      <a
                        href={`tel:${e.phone}`}
                        dir="ltr"
                        className="mt-0.5 flex w-fit items-center justify-start gap-1 text-xs font-semibold text-teal-600 dark:text-teal-300"
                        title="تماس با کاربر"
                      >
                        <Phone className="size-3" />
                        {faDigits(e.phone)}
                      </a>
                    </div>
                    <PaymentStatusSelect
                      enrollmentId={e.id}
                      value={e.paymentStatus}
                      compact
                      onChanged={(next) => onStatusChanged(e.id, next)}
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="truncate text-xs font-bold text-foreground">
                      {e.course}
                      {e.groupTitle ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {e.groupTitle}
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.6rem] font-bold">
                      <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-foreground">
                        <Banknote className="me-1 inline size-3 text-teal-600 dark:text-teal-300" />
                        {faAmount(e.paymentAmount ?? 0)} تومان
                      </span>
                      {e.discountCode ? (
                        <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
                          <TicketPercent className="me-1 inline size-3" />
                          {e.discountCode}
                          {e.discountAmount
                            ? ` −${faAmount(e.discountAmount)}`
                            : ""}
                        </span>
                      ) : null}
                      {e.paymentGateway ? (
                        <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-muted-foreground">
                          {GATEWAY_LABELS[e.paymentGateway] ?? e.paymentGateway}
                        </span>
                      ) : null}
                      {e.paymentRefId ? (
                        <span
                          dir="ltr"
                          className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-muted-foreground"
                          title={`کد پیگیری: ${e.paymentRefId}`}
                        >
                          {e.paymentRefId}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6rem] font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="size-3 text-teal-600/70 dark:text-teal-300/70" />
                      {faDate(e.createdAt)}
                    </span>
                    {e.paidAt ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300">
                        <CheckCircle2 className="size-3" />
                        پرداخت: {faDate(e.paidAt)}
                      </span>
                    ) : null}
                    <PaymentEditButton
                      enrollment={e}
                      compact
                      label="ویرایش"
                      onChanged={onReload}
                    />
                  </div>
                </article>
              );
            })}
          </div>

          {/* — راهنما — */}
          <p className="flex items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
            <Banknote className="size-3.5 shrink-0 text-teal-600/70 dark:text-teal-300/70" />
            پرداخت‌های نقدی = ثبت‌نام‌هایی که مبلغ دوره را یک‌جا (نقدی) پرداخته‌اند؛
            با سلکت وضعیت هر ردیف، آن را تسویه/ابطال کنید و با «ویرایش» مبلغ و
            تاریخ را دستی اصلاح کنید.
          </p>
        </>
      ) : null}
    </div>
  );
}
