"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Banknote,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Hourglass,
  Loader2,
  Phone,
  ReceiptText,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { MarkPaidButton } from "@/components/admin/shared/mark-paid-button";
import { faDate, faDigits } from "@/lib/fa";

/* ------------------------------------------------------------------ */
/*  انواع                                                              */
/* ------------------------------------------------------------------ */

/** یک قسط با داده‌ی دارنده — پاسخ /api/admin/installments/overview */
export interface OverviewInstallment {
  id: string;
  index: number;
  amount: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
  note: string | null;
  holder: string;
  phone: string;
  course: string;
  enrollmentId: string;
  relative: "overdue" | "today" | "tomorrow" | "dayAfter" | "later";
}

export interface InstallmentsOverview {
  dueSoon: OverviewInstallment[];
  recentPaid: OverviewInstallment[];
  remaining: OverviewInstallment[];
  summary: {
    total: number;
    paid: number;
    paidAmount: number;
    pending: number;
    pendingAmount: number;
    overdue: number;
    overdueAmount: number;
  };
}

/** برچسب روز نسبی سررسید */
export const RELATIVE_LABELS: Record<OverviewInstallment["relative"], string> = {
  overdue: "معوق (گذشته)",
  today: "امروز",
  tomorrow: "فردا",
  dayAfter: "پس‌فردا",
  later: "آینده",
};

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
export function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/** نشان وضعیت قسط */
function installmentStatusMeta(inst: OverviewInstallment) {
  if (inst.status === "paid") {
    return {
      label: "پرداخت‌شده",
      badge:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    };
  }
  const overdue =
    inst.status === "overdue" ||
    (inst.status === "pending" && new Date(inst.dueDate).getTime() < Date.now());
  if (overdue) {
    return {
      label: "معوق",
      badge:
        "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
    };
  }
  return {
    label: "در انتظار",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  };
}

/** هوک مشترک برای دریافت نمای اقساط */
export function useInstallmentsOverview() {
  const [data, setData] = useState<InstallmentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        setData(
          await apiFetch<InstallmentsOverview>(
            "/api/admin/installments/overview"
          )
        );
      } catch (error) {
        toastApiError(error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, refreshing, reload: load };
}

/* ------------------------------------------------------------------ */
/*  ردیف قسط                                                          */
/* ------------------------------------------------------------------ */

export function OverviewRow({
  inst,
  action,
}: {
  inst: OverviewInstallment;
  /** عملیات ردیف — مثل دکمه‌ی ثبت دستی پرداخت */
  action?: ReactNode;
}) {
  const meta = installmentStatusMeta(inst);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg bg-foreground/[0.03] px-3 py-2 dark:bg-white/[0.03]">
      <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-foreground">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[0.6rem] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
          {faDigits(inst.index)}
        </span>
        <span className="min-w-0 truncate">
          {inst.holder}
          <span className="mr-1.5 text-[0.6rem] font-medium text-muted-foreground">
            ({inst.course})
          </span>
        </span>
        {inst.phone ? (
          <span
            dir="ltr"
            className="hidden shrink-0 items-center gap-1 text-[0.65rem] font-bold text-teal-600 dark:text-teal-300 sm:inline-flex"
          >
            <Phone className="size-3" />
            {inst.phone}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-2.5 text-[0.65rem] text-muted-foreground">
        <span className="tabular-nums font-black text-foreground">
          {faAmount(inst.amount)}
          <span className="mr-1 text-[0.55rem] font-medium text-muted-foreground">
            تومان
          </span>
        </span>
        <span className="flex items-center gap-1">
          <CalendarDays className="size-3" />
          {faDate(inst.dueDate)}
        </span>
        <span
          className={cn(
            "inline-flex whitespace-nowrap items-center gap-1 rounded-full border px-2 py-0.5 font-bold",
            meta.badge
          )}
        >
          {meta.label}
        </span>
        {action ? (
          <span className="flex shrink-0 items-center">{action}</span>
        ) : null}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  محتوای مشترک: بخش «رسید قسط‌های امروز» — برای پاپ‌آور هدر           */
/* ------------------------------------------------------------------ */

export function DueSoonContent({
  data,
  refreshing,
  onRefresh,
  onChanged,
}: {
  data: InstallmentsOverview | null;
  refreshing: boolean;
  onRefresh: () => void;
  /** پس از ثبت دستی پرداخت — تازه‌سازی داده‌ها (ردیف از فهرست خارج می‌شود) */
  onChanged?: () => void;
}) {
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        در حال دریافت اقساط...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs leading-5 text-muted-foreground">
          اقساط سررسیدشده از امروز تا پس‌فردا + معوق‌های گذشته — با دکمه‌ی «ثبت پرداخت» هر قسط را دستی تسویه کنید
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="به‌روزرسانی"
          title="به‌روزرسانی"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>

      {data.dueSoon.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3.5 py-3 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06]">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <p className="text-xs font-bold leading-5 text-emerald-700 dark:text-emerald-300">
            قسط سررسیدنزدیکی وجود ندارد — همه‌چیز مرتب است.
          </p>
        </div>
      ) : (
        <>
          {/* شمارنده‌ها */}
          <div className="grid grid-cols-3 gap-2">
            <MiniStat
              icon={XCircle}
              label="معوق"
              count={data.summary.overdue}
              tone="text-red-600 dark:text-red-300 bg-red-500/10"
            />
            <MiniStat
              icon={Clock3}
              label="امروز"
              count={data.dueSoon.filter((i) => i.relative === "today").length}
              tone="text-amber-600 dark:text-amber-300 bg-amber-500/10"
            />
            <MiniStat
              icon={CalendarClock}
              label="فردا/پس‌فردا"
              count={
                data.dueSoon.filter(
                  (i) => i.relative === "tomorrow" || i.relative === "dayAfter"
                ).length
              }
              tone="text-teal-600 dark:text-teal-300 bg-teal-500/10"
            />
          </div>

          <div className="max-h-72 space-y-1.5 overflow-y-auto pe-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20">
            {data.dueSoon.map((inst) => (
              <div key={inst.id} className="space-y-1">
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-[0.6rem] font-black",
                    inst.relative === "overdue"
                      ? "text-red-600 dark:text-red-300"
                      : inst.relative === "today"
                        ? "text-amber-600 dark:text-amber-300"
                        : "text-teal-600 dark:text-teal-300"
                  )}
                >
                  <CalendarClock className="size-3" />
                  {RELATIVE_LABELS[inst.relative]}
                </p>
                <OverviewRow
                  inst={inst}
                  action={
                    <MarkPaidButton
                      installmentId={inst.id}
                      index={inst.index}
                      compact
                      onChanged={onChanged}
                    />
                  }
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  count,
  tone,
}: {
  icon: typeof Clock3;
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-foreground/[0.02] px-2 py-2.5 dark:bg-white/[0.02]">
      <span className={cn("flex size-7 items-center justify-center rounded-lg", tone)}>
        <Icon className="size-3.5" />
      </span>
      <span className="text-base font-black leading-none tabular-nums text-foreground">
        {faDigits(count)}
      </span>
      <span className="text-[0.6rem] font-bold text-muted-foreground">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  بخش کامل: پرداخت‌های اخیر + همه‌ی اقساط باقیمانده                    */
/* ------------------------------------------------------------------ */

export function InstallmentsOverviewSection({
  data,
  loading,
  refreshing,
  onRefresh,
  onChanged,
}: {
  data: InstallmentsOverview | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  /** پس از ثبت دستی پرداخت — تازه‌سازی داده‌ها */
  onChanged?: () => void;
}) {
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-56 animate-pulse rounded-xl bg-foreground/[0.04]" />
        <div className="glass h-44 animate-pulse rounded-2xl" />
        <div className="glass h-44 animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="دریافت وضعیت اقساط ناموفق بود"
        description="برای تلاش مجدد دوباره امتحان کنید."
      >
        <Button variant="outline" size="sm" onClick={onRefresh}>
          تلاش مجدد
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      {/* سربرگ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
            <ReceiptText className="size-5 text-violet-600 dark:text-violet-300" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-black text-foreground">
              وضعیت اقساط کاربران
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              اقساط پرداخت‌شده‌ی اخیر و کل اقساط باقیمانده‌ی همه‌ی کاربران
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-xl text-xs font-bold"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          به‌روزرسانی
        </Button>
      </div>

      {/* کارت‌های خلاصه */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard
          icon={Wallet}
          tile="from-teal-400 to-emerald-600"
          label="کل اقساط"
          value={faDigits(data.summary.total)}
          sub={`پرداخت‌شده: ${faDigits(data.summary.paid)}`}
        />
        <SummaryCard
          icon={Banknote}
          tile="from-emerald-400 to-teal-600"
          label="مبلغ پرداخت‌شده"
          value={faAmount(data.summary.paidAmount)}
          sub="تومان — مجموع اقساط تسویه‌شده"
          isAmount
        />
        <SummaryCard
          icon={Hourglass}
          tile="from-amber-400 to-orange-500"
          label="اقساط باقیمانده"
          value={faDigits(data.summary.pending)}
          sub={`${faAmount(data.summary.pendingAmount)} تومان باقیمانده`}
        />
        <SummaryCard
          icon={XCircle}
          tile="from-rose-400 to-red-600"
          label="معوق"
          value={faDigits(data.summary.overdue)}
          sub={`${faAmount(data.summary.overdueAmount)} تومان سررسید گذشته`}
        />
      </div>

      {/* پرداخت‌های اخیر */}
      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-border p-4 sm:px-5">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <h3 className="text-sm font-black text-foreground">
            اقساط پرداخت‌شده‌ی اخیر
          </h3>
          <Badge className="ms-auto rounded-full border-0 bg-emerald-500/15 px-2.5 py-0.5 text-[0.65rem] font-black text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
            {faDigits(data.recentPaid.length)} مورد اخیر
          </Badge>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto p-4 sm:px-5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20">
          {data.recentPaid.length === 0 ? (
            <p className="py-6 text-center text-xs font-bold text-muted-foreground">
              هنوز قسطی پرداخت نشده است.
            </p>
          ) : (
            data.recentPaid.map((inst) => (
              <div key={inst.id} className="space-y-1">
                <p className="flex items-center gap-1.5 text-[0.6rem] font-black text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="size-3" />
                  پرداخت در {inst.paidAt ? faDate(inst.paidAt) : "—"}
                </p>
                <OverviewRow inst={inst} />
              </div>
            ))
          )}
        </div>
      </section>

      {/* همه‌ی اقساط باقیمانده */}
      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-border p-4 sm:px-5">
          <Hourglass className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <h3 className="text-sm font-black text-foreground">
            همه‌ی اقساط باقیمانده کاربران
          </h3>
          <Badge className="ms-auto rounded-full border-0 bg-amber-500/15 px-2.5 py-0.5 text-[0.65rem] font-black text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            {faDigits(data.remaining.length)} قسط ·{" "}
            {faAmount(data.summary.pendingAmount)} تومان
          </Badge>
        </div>
        <div className="max-h-[26rem] space-y-2 overflow-y-auto p-4 sm:px-5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20">
          {data.remaining.length === 0 ? (
            <p className="py-6 text-center text-xs font-bold text-muted-foreground">
              قسط باقیمانده‌ای وجود ندارد — همه‌ی اقساط تسویه شده‌اند.
            </p>
          ) : (
            data.remaining.map((inst) => (
              <OverviewRow
                key={inst.id}
                inst={inst}
                action={
                  <MarkPaidButton
                    installmentId={inst.id}
                    index={inst.index}
                    compact
                    onChanged={onChanged}
                  />
                }
              />
            ))
          )}
        </div>
      </section>

      {/* راهنمای تسویه‌ی دستی */}
      <p className="flex items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
        <ChevronLeft className="size-3 shrink-0" />
        با دکمه‌ی «ثبت پرداخت» روبروی هر قسط، آن را دستی تسویه کنید؛ برای ویرایش
        مبلغ و سررسید، از بخش «مدیریت کاربران» دکمه‌ی وضعیت پرداختی هر کاربر را
        باز کنید.
      </p>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tile,
  label,
  value,
  sub,
  isAmount = false,
}: {
  icon: typeof Clock3;
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
