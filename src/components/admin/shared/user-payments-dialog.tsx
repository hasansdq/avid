"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Hourglass,
  Loader2,
  Receipt,
  TicketPercent,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { MarkPaidButton } from "@/components/admin/shared/mark-paid-button";
import { tileGradient } from "@/components/admin/shared/styles";
import type {
  EnrollmentWithInstallments,
  Installment,
  User,
} from "@/components/admin/types";
import { faDate, faDigits } from "@/lib/fa";

/** پاسخ GET /api/admin/users/[id] */
interface UserDetailResponse {
  user: User;
  enrollments: EnrollmentWithInstallments[];
}

/* — نشان وضعیت پرداخت ثبت‌نام — */
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

const METHOD_LABELS: Record<string, string> = {
  cash: "نقدی",
  installment: "اقساطی",
};

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/** نام نمایشی کاربر (یا شماره‌ی او اگر نامی نداشت) */
function displayName(u: Pick<User, "firstName" | "lastName" | "phone">): string {
  const name = `${u.firstName} ${u.lastName}`.trim();
  return name || faDigits(u.phone);
}

/** نشان وضعیت قسط — معوقِ خودکار: pending با سررسید گذشته */
function installmentMeta(
  inst: Pick<Installment, "status" | "dueDate">
): { label: string; badge: string } {
  const overdue =
    inst.status === "overdue" ||
    (inst.status === "pending" && new Date(inst.dueDate).getTime() < Date.now());
  if (inst.status === "paid") {
    return {
      label: "پرداخت‌شده",
      badge:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    };
  }
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

/**
 * دیالوگ «وضعیت پرداختی‌ها و اقساط» یک کاربر —
 * با دکمه‌ی روبروی هر کاربر (در ماژول مدیریت کاربران) باز می‌شود و
 * همه‌ی پرداخت‌ها + لیست اقساط و وضعیت هر قسط را نشان می‌دهد.
 * ثبت دستی پرداخت هر قسط با دکمه‌ی «ثبت پرداخت» روبروی همان ردیف انجام می‌شود.
 */
export function UserPaymentsDialog({
  user,
  open,
  onOpenChange,
  onManageInstallments,
  onChanged,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** باز کردن دیالوگ مدیریت اقساط برای یک ثبت‌نام */
  onManageInstallments: (enrollment: EnrollmentWithInstallments) => void;
  /** پس از ثبت دستی پرداخت قسط — تازه‌سازی آمار لیست کاربران/نمای اقساط در والد */
  onChanged?: () => void;
}) {
  const [detail, setDetail] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);

  /** دریافت تازه‌ی جزئیات پرداختی کاربر */
  const loadDetail = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await apiFetch<UserDetailResponse>(
        `/api/admin/users/${user.id}`
      );
      setDetail(data);
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    void loadDetail();
  }, [open, loadDetail]);

  /** پس از ثبت دستی پرداخت: تازه‌سازی داخل دیالوگ + خبر به والد */
  function handleInstallmentChanged() {
    void loadDetail();
    onChanged?.();
  }

  /* — خلاصه‌ی مالی کل پرداخت‌ها و اقساط — */
  const summary = (() => {
    const enrollments = detail?.enrollments ?? [];
    let paymentsCount = 0;
    let paidCount = 0;
    let paidAmount = 0;
    let installmentsTotal = 0;
    let installmentsPaid = 0;
    let installmentsPaidAmount = 0;
    let installmentsRemaining = 0;
    for (const e of enrollments) {
      if (e.paymentAmount) {
        paymentsCount += 1;
        if (e.paymentStatus === "paid") {
          paidCount += 1;
          paidAmount += e.paymentAmount;
        }
      }
      for (const inst of e.installments) {
        installmentsTotal += 1;
        if (inst.status === "paid") {
          installmentsPaid += 1;
          installmentsPaidAmount += inst.amount;
        } else {
          installmentsRemaining += inst.amount;
        }
      }
    }
    return {
      paymentsCount,
      paidCount,
      paidAmount,
      installmentsTotal,
      installmentsPaid,
      installmentsPaidAmount,
      installmentsRemaining,
    };
  })();

  const tiles: { label: string; value: string; icon: typeof Wallet }[] = [
    {
      label: "پرداخت‌های ثبت‌شده",
      value: faDigits(summary.paymentsCount),
      icon: CreditCard,
    },
    {
      label: "پرداخت موفق",
      value: faDigits(summary.paidCount),
      icon: CheckCircle2,
    },
    {
      label: "مبلغ پرداخت‌شده",
      value: `${faAmount(summary.paidAmount)} تومان`,
      icon: Wallet,
    },
    {
      label: "اقساط پرداخت‌شده",
      value: `${faDigits(summary.installmentsPaid)} از ${faDigits(
        summary.installmentsTotal
      )}`,
      icon: CalendarClock,
    },
    {
      label: "مانده‌ی اقساط",
      value: `${faAmount(summary.installmentsRemaining)} تومان`,
      icon: Receipt,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl"
      >
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4 text-teal-600 dark:text-teal-300" />
            پرداختی‌ها و اقساط
          </DialogTitle>
          <DialogDescription className="leading-6">
            {user
              ? `وضعیت پرداخت‌ها و لیست اقساط «${displayName(user)}» — با دکمه‌ی «ثبت پرداخت» هر قسط را دستی تسویه کنید؛ برای ویرایش مبلغ و سررسید از «مدیریت اقساط» استفاده کنید.`
              : "وضعیت پرداخت‌ها و اقساط کاربر"}
          </DialogDescription>
        </DialogHeader>

        {loading || !detail ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : detail.enrollments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="پرداختی ثبت نشده"
            description="این کاربر هنوز برای دوره‌ای پیش‌ثبت‌نام و پرداختی انجام نداده است."
          />
        ) : (
          <>
            {/* — خلاصه‌ی مالی — */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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

            {/* — پرداخت‌ها و اقساط هر ثبت‌نام — */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
                <ClipboardList className="size-4 text-teal-600 dark:text-teal-300" />
                پرداخت‌ها و اقساط
              </h3>

              <div className="space-y-3">
                {detail.enrollments.map((e) => {
                  const payMeta =
                    e.paymentStatus in PAYMENT_STATUS
                      ? PAYMENT_STATUS[e.paymentStatus]
                      : null;
                  return (
                    <article
                      key={e.id}
                      className="glass space-y-3 rounded-2xl p-4"
                    >
                      {/* — سربرگ ثبت‌نام — */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-black text-foreground">
                          {e.course}
                        </p>
                        {payMeta && e.paymentAmount ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                              payMeta.badge
                            )}
                          >
                            {e.paymentStatus === "paid" ? (
                              <CheckCircle2 className="size-3" />
                            ) : e.paymentStatus === "failed" ? (
                              <XCircle className="size-3" />
                            ) : (
                              <Hourglass className="size-3" />
                            )}
                            {payMeta.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            بدون پرداخت
                          </span>
                        )}
                      </div>

                      {/* — جزئیات پرداخت — */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        {e.paymentMethod ? (
                          <span className="flex items-center gap-1.5 font-semibold">
                            <Banknote className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                            روش:{" "}
                            <span className="font-bold text-foreground">
                              {METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod}
                            </span>
                          </span>
                        ) : null}
                        {e.paymentAmount ? (
                          <span className="font-bold tabular-nums text-foreground">
                            {faAmount(e.paymentAmount)} تومان
                          </span>
                        ) : null}
                        {e.discountCode ? (
                          <Badge
                            className="gap-1 rounded-full border-0 bg-violet-500/15 px-2.5 py-1 text-[0.6rem] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300"
                            title={`کد تخفیف اعمال‌شده: ${e.discountCode}`}
                          >
                            <TicketPercent className="size-3" />
                            {e.discountCode}
                            {e.discountAmount
                              ? ` −${faAmount(e.discountAmount)}`
                              : ""}
                          </Badge>
                        ) : null}
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                          {faDate(e.createdAt)}
                        </span>
                      </div>

                      {e.paidAt ? (
                        <p className="flex items-center gap-1.5 text-[0.65rem] font-bold text-emerald-600 dark:text-emerald-300">
                          <CheckCircle2 className="size-3.5" />
                          پرداخت در {faDate(e.paidAt)}
                          {e.paymentGateway
                            ? ` · درگاه ${e.paymentGateway === "zarinpal" ? "زرین‌پال" : e.paymentGateway === "payping" ? "پی‌پینگ" : "آزمایشی"}`
                            : ""}
                          {e.paymentRefId ? (
                            <span dir="ltr" className="font-medium">
                              · {e.paymentRefId}
                            </span>
                          ) : null}
                        </p>
                      ) : null}

                      {/* — لیست اقساط — */}
                      {e.installments.length > 0 ? (
                        <div className="space-y-2 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] p-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
                          <p className="flex items-center gap-1.5 text-[0.65rem] font-black text-foreground/90">
                            <CalendarClock className="size-3.5 text-violet-600 dark:text-violet-300" />
                            اقساط ({faDigits(e.installments.length)} قسط)
                          </p>
                          <div className="max-h-56 space-y-1.5 overflow-y-auto">
                            {e.installments.map((inst) => {
                              const meta = installmentMeta(inst);
                              return (
                                <div
                                  key={inst.id}
                                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-foreground/[0.03] px-3 py-2 dark:bg-white/[0.03]"
                                >
                                  <span className="flex items-center gap-2 text-xs font-bold text-foreground">
                                    <span className="flex size-5 items-center justify-center rounded-full bg-violet-500/15 text-[0.6rem] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
                                      {faDigits(inst.index)}
                                    </span>
                                    <span className="tabular-nums">
                                      {faAmount(inst.amount)}
                                    </span>
                                    <span className="text-[0.6rem] font-medium text-muted-foreground">
                                      تومان
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-2 text-[0.65rem] text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <CalendarDays className="size-3" />
                                      {faDate(inst.dueDate)}
                                    </span>
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-bold",
                                        meta.badge
                                      )}
                                    >
                                      {meta.label}
                                    </span>
                                    {inst.status !== "paid" ? (
                                      <MarkPaidButton
                                        installmentId={inst.id}
                                        index={inst.index}
                                        compact
                                        onChanged={handleInstallmentChanged}
                                      />
                                    ) : null}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onManageInstallments(e)}
                            className="h-9 w-full rounded-xl text-xs font-bold sm:w-auto sm:px-5"
                          >
                            <CalendarClock className="size-3.5" />
                            مدیریت اقساط این ثبت‌نام
                          </Button>
                        </div>
                      ) : e.paymentMethod === "installment" ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-2.5 dark:border-amber-400/25 dark:bg-amber-400/[0.05]">
                          <p className="text-[0.65rem] font-bold leading-5 text-amber-700 dark:text-amber-300">
                            ثبت‌نام اقساطی است اما هنوز طرح اقساطی برای آن ساخته
                            نشده است.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onManageInstallments(e)}
                            className="h-8 rounded-xl border-amber-500/30 px-3.5 text-[0.65rem] font-bold text-amber-700 hover:bg-amber-500/10 dark:border-amber-400/30 dark:text-amber-300"
                          >
                            ساخت طرح اقساط
                          </Button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {loading ? (
          <p className="sr-only" aria-live="polite">
            در حال دریافت اطلاعات پرداخت...
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
