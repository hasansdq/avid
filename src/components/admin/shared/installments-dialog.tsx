"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Hourglass,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Sparkles,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { JalaliDateField } from "@/components/admin/shared/jalali-date-field";
import { btnGradient, tileGradient } from "@/components/admin/shared/styles";
import type { Installment } from "@/components/admin/types";
import { faDate, faDigits } from "@/lib/fa";

/* — خلاصه‌ی اقساط (پاسخ GET /api/admin/installments) — */
interface InstallmentsSummary {
  count: number;
  paidCount: number;
  pendingCount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

/* — نشان وضعیت قسط — */
function installmentMeta(
  inst: Pick<Installment, "status" | "dueDate">
): { label: string; badge: string; icon: "paid" | "overdue" | "pending" } {
  const overdue =
    inst.status === "overdue" ||
    (inst.status === "pending" && new Date(inst.dueDate).getTime() < Date.now());
  if (inst.status === "paid") {
    return {
      label: "پرداخت‌شده",
      badge:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
      icon: "paid",
    };
  }
  if (overdue) {
    return {
      label: "معوق",
      badge:
        "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
      icon: "overdue",
    };
  }
  return {
    label: "در انتظار",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
    icon: "pending",
  };
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

/** تبدیل تاریخ به قالب ورودی date (YYYY-MM-DD) */
function toDateInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/* — پیش‌نویس فرم قسط (همه‌چیز رشته؛ هنگام ذخیره تبدیل می‌شود) — */
interface InstallmentDraft {
  amount: string;
  dueDate: string;
  note: string;
}

const EMPTY_DRAFT: InstallmentDraft = { amount: "", dueDate: "", note: "" };

/**
 * دیالوگ مدیریت اقساط یک ثبت‌نام —
 * خلاصه‌ی مالی، ثبت/لغو پرداخت، ویرایش، حذف و افزودن قسط.
 * کنترل‌شده از سطح ماژول (open/onOpenChange) تا از چند جایگاه باز شود.
 */
export function InstallmentsDialog({
  enrollmentId,
  enrollmentTitle,
  open,
  onOpenChange,
  onChanged,
}: {
  enrollmentId: string;
  enrollmentTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [installments, setInstallments] = useState<Installment[] | null>(null);
  const [summary, setSummary] = useState<InstallmentsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  /* — فرم افزودن/ویرایش قسط — */
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Installment | null>(null);
  const [draft, setDraft] = useState<InstallmentDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  /** دریافت اقساط و خلاصه از سرور */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setFailed(false);
      const data = await apiFetch<{
        installments: Installment[];
        summary: InstallmentsSummary;
      }>(`/api/admin/installments?enrollmentId=${encodeURIComponent(enrollmentId)}`);
      setInstallments(data.installments);
      setSummary(data.summary);
    } catch (error) {
      setFailed(true);
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  // با هر بار باز شدن دیالوگ، داده‌ها تازه می‌شوند
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  /** پس از هر تغییر: تازه‌سازی محلی + خبر به والد */
  function afterChange() {
    void load();
    onChanged?.();
  }

  /* — فرم افزودن قسط — */
  function openAdd() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
  }

  /* — فرم ویرایش قسط — */
  function openEdit(inst: Installment) {
    setEditing(inst);
    setDraft({
      amount: String(inst.amount),
      dueDate: toDateInput(inst.dueDate),
      note: inst.note ?? "",
    });
    setFormOpen(true);
  }

  /* — ذخیره‌ی فرم (افزودن/ویرایش) — */
  async function submitForm() {
    const amount = parseAmount(draft.amount);
    if (amount < 1_000) {
      toast.error("مبلغ قسط باید دست‌کم ۱٫۰۰۰ تومان باشد.");
      return;
    }
    if (!draft.dueDate) {
      toast.error("تاریخ سررسید قسط را مشخص کنید.");
      return;
    }

    setSaving(true);
    try {
      const body = JSON.stringify({
        amount,
        dueDate: draft.dueDate,
        note: draft.note.trim(),
      });
      if (editing) {
        await apiFetch(`/api/admin/installments/${editing.id}`, {
          method: "PUT",
          body,
        });
        toast.success("قسط به‌روزرسانی شد");
      } else {
        await apiFetch("/api/admin/installments", {
          method: "POST",
          body: JSON.stringify({
            enrollmentId,
            amount,
            dueDate: draft.dueDate,
            note: draft.note.trim(),
          }),
        });
        toast.success("قسط جدید اضافه شد");
      }
      setFormOpen(false);
      afterChange();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  /* — ثبت / لغو پرداخت — */
  async function togglePaid(inst: Installment) {
    const next = inst.status === "paid" ? "pending" : "paid";
    setBusyId(inst.id);
    try {
      await apiFetch(`/api/admin/installments/${inst.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: next }),
      });
      toast.success(next === "paid" ? "پرداخت قسط ثبت شد" : "پرداخت قسط لغو شد");
      afterChange();
    } catch (error) {
      toastApiError(error);
    } finally {
      setBusyId(null);
    }
  }

  /* — حذف قسط — */
  async function handleDelete(inst: Installment) {
    try {
      await apiFetch(`/api/admin/installments/${inst.id}`, {
        method: "DELETE",
      });
      toast.success(`قسط ${faDigits(inst.index)} حذف شد`);
      afterChange();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /* — ساخت خودکار طرح اقساط — */
  async function generatePlan() {
    setGenerating(true);
    try {
      const res = await apiFetch<{ ok: boolean; count: number }>(
        "/api/admin/installments",
        {
          method: "POST",
          body: JSON.stringify({ enrollmentId, generate: true }),
        }
      );
      toast.success(`${faDigits(res.count)} قسط ایجاد شد`);
      afterChange();
    } catch (error) {
      toastApiError(error);
    } finally {
      setGenerating(false);
    }
  }

  const paidPct =
    summary && summary.totalAmount > 0
      ? Math.min(100, Math.round((summary.paidAmount / summary.totalAmount) * 100))
      : 0;

  /* — کاشی خلاصه — */
  const tiles: { label: string; value: string; icon: typeof Banknote }[] = summary
    ? [
        { label: "تعداد اقساط", value: faDigits(summary.count), icon: CalendarClock },
        { label: "پرداخت‌شده", value: faDigits(summary.paidCount), icon: CheckCircle2 },
        { label: "در انتظار", value: faDigits(summary.pendingCount), icon: Hourglass },
        { label: "مبلغ کل", value: `${faAmount(summary.totalAmount)} تومان`, icon: Banknote },
        { label: "پرداخت‌شده تا کنون", value: `${faAmount(summary.paidAmount)} تومان`, icon: Wallet },
        { label: "مانده", value: `${faAmount(summary.remainingAmount)} تومان`, icon: Receipt },
      ]
    : [];

  /* — دکمه‌های عملیات هر ردیف (مشترک جدول و کارت) — */
  function rowActions(inst: Installment, compact: boolean) {
    const paid = inst.status === "paid";
    const busy = busyId === inst.id;
    return (
      <div className={cn("flex items-center gap-1.5", compact ? "" : "flex-wrap")}>
        <Button
          variant={paid ? "ghost" : "outline"}
          size={compact ? "sm" : "default"}
          onClick={() => togglePaid(inst)}
          disabled={busy}
          aria-label={
            paid ? `لغو پرداخت قسط ${faDigits(inst.index)}` : `ثبت پرداخت قسط ${faDigits(inst.index)}`
          }
          className={cn(
            compact ? "h-7 rounded-full px-3 text-[0.65rem]" : "h-10 rounded-xl px-4 text-xs",
            "font-bold",
            paid
              ? "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              : "border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-400/25 dark:text-emerald-300"
          )}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className={paid ? "size-3.5" : "size-3.5"} />
          )}
          {paid ? "لغو پرداخت" : "ثبت پرداخت"}
        </Button>
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => openEdit(inst)}
          aria-label={`ویرایش قسط ${faDigits(inst.index)}`}
          title="ویرایش"
          className={cn(
            compact ? "size-7" : "size-10 rounded-xl",
            "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          )}
        >
          <Pencil className="size-3.5" />
        </Button>
        <ConfirmDelete
          title={`حذف قسط ${faDigits(inst.index)}`}
          description={`این قسط (${faAmount(inst.amount)} تومان) برای همیشه حذف می‌شود. مطمئن هستید؟`}
          onConfirm={() => handleDelete(inst)}
        >
          <Button
            variant="ghost"
            size={compact ? "icon" : "default"}
            aria-label={`حذف قسط ${faDigits(inst.index)}`}
            title="حذف"
            className={cn(
              compact ? "size-7" : "size-10 rounded-xl",
              "text-destructive hover:bg-destructive/10 hover:text-destructive"
            )}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </ConfirmDelete>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-3xl"
      >
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-base">
            اقساط دوره‌ی «{enrollmentTitle}»
          </DialogTitle>
          <DialogDescription className="leading-6">
            طرح اقساط این ثبت‌نام — ثبت و لغو پرداخت، ویرایش مبلغ و سررسید و افزودن
            قسط دستی.
          </DialogDescription>
        </DialogHeader>

        {loading && !installments ? (
          /* — اسکلتون بارگذاری — */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass space-y-2 rounded-xl p-3">
                  <Skeleton className="h-4 w-16 rounded-md" />
                  <Skeleton className="h-5 w-20 rounded-md" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ) : failed ? (
          /* — خطای دریافت — */
          <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
            <XCircle className="size-8 text-destructive" strokeWidth={1.8} />
            <p className="text-sm font-bold text-foreground">
              دریافت اقساط ناموفق بود.
            </p>
            <Button
              onClick={load}
              size="sm"
              variant="outline"
              className="h-10 rounded-xl px-5 text-xs font-bold"
            >
              <RefreshCw className="size-4" />
              تلاش دوباره
            </Button>
          </div>
        ) : (
          <>
            {/* — کاشی‌های خلاصه + نوار پیشرفت — */}
            {summary && (
              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
                  {tiles.map((tile) => (
                    <div
                      key={tile.label}
                      className="glass flex items-center gap-2.5 rounded-xl p-3"
                    >
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tileGradient} shadow-md`}
                        aria-hidden
                      >
                        <tile.icon className="size-4 text-white" strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[0.6rem] font-black text-muted-foreground">
                          {tile.label}
                        </p>
                        <p className="truncate text-xs font-black tabular-nums text-foreground">
                          {tile.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[0.65rem] font-bold text-muted-foreground">
                    <span>پیشرفت پرداخت</span>
                    <span className="tabular-nums text-foreground">
                      {faDigits(paidPct)}٪
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
                    role="progressbar"
                    aria-valuenow={paidPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="درصد پرداخت‌شده‌ی اقساط"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-teal-400 to-emerald-600 transition-all"
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                </div>
              </section>
            )}

            {/* — نوار ابزار — */}
            {installments && installments.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.65rem] font-bold text-muted-foreground">
                  {faDigits(installments.length)} قسط ثبت شده است.
                </p>
                <Button
                  onClick={openAdd}
                  size="sm"
                  className={`h-9 rounded-xl px-4 text-xs ${btnGradient}`}
                >
                  <Plus className="size-4" />
                  افزودن قسط
                </Button>
              </div>
            )}

            {/* — لیست اقساط — */}
            {installments && installments.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="قسطی ثبت نشده است"
                description="طرح اقساط هنگام ثبت‌نام اقساطی به‌طور خودکار ساخته می‌شود؛ می‌توانید طرح پیش‌فرض را بسازید یا قسط دستی اضافه کنید."
              >
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    onClick={generatePlan}
                    disabled={generating}
                    size="sm"
                    className={`h-10 rounded-xl px-5 text-xs ${btnGradient}`}
                  >
                    {generating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    ایجاد طرح اقساط پیش‌فرض
                  </Button>
                  <Button
                    onClick={openAdd}
                    size="sm"
                    variant="outline"
                    className="h-10 rounded-xl px-5 text-xs font-bold"
                  >
                    <Plus className="size-4" />
                    افزودن قسط دستی
                  </Button>
                </div>
              </EmptyState>
            ) : installments ? (
              <>
                {/* — جدول دسکتاپ — */}
                <div className="glass hidden overflow-hidden rounded-2xl md:block">
                  <div className="max-h-[45vh] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>قسط</TableHead>
                          <TableHead>مبلغ</TableHead>
                          <TableHead>سررسید</TableHead>
                          <TableHead>وضعیت</TableHead>
                          <TableHead>یادداشت</TableHead>
                          <TableHead className="text-left">عملیات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {installments.map((inst) => {
                          const meta = installmentMeta(inst);
                          return (
                            <TableRow key={inst.id}>
                              <TableCell className="font-bold tabular-nums">
                                {faDigits(inst.index)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <span className="text-sm font-bold tabular-nums text-foreground">
                                  {faAmount(inst.amount)}
                                </span>
                                <span className="ms-1 text-[0.6rem] font-medium text-muted-foreground">
                                  تومان
                                </span>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {faDate(inst.dueDate)}
                                {inst.status === "paid" && inst.paidAt ? (
                                  <span className="mt-0.5 flex items-center gap-1 text-[0.6rem] font-semibold text-emerald-600 dark:text-emerald-300">
                                    <CheckCircle2 className="size-3" />
                                    پرداخت: {faDate(inst.paidAt)}
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                                    meta.badge
                                  )}
                                >
                                  {meta.icon === "paid" ? (
                                    <CheckCircle2 className="size-3" />
                                  ) : meta.icon === "overdue" ? (
                                    <XCircle className="size-3" />
                                  ) : (
                                    <Hourglass className="size-3" />
                                  )}
                                  {meta.label}
                                </span>
                              </TableCell>
                              <TableCell className="max-w-40">
                                {inst.note ? (
                                  <span
                                    className="block truncate text-xs text-muted-foreground"
                                    title={inst.note}
                                  >
                                    {inst.note}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground/50">
                                    —
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-left">
                                {rowActions(inst, true)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* — کارت‌های موبایل — */}
                <div className="space-y-2.5 md:hidden">
                  {installments.map((inst) => {
                    const meta = installmentMeta(inst);
                    return (
                      <article key={inst.id} className="glass space-y-3 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-foreground">
                              قسط {faDigits(inst.index)}
                              <span className="ms-2 text-xs font-bold tabular-nums text-muted-foreground">
                                {faAmount(inst.amount)} تومان
                              </span>
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] font-semibold text-muted-foreground">
                              <span>سررسید: {faDate(inst.dueDate)}</span>
                              {inst.status === "paid" && inst.paidAt ? (
                                <span className="text-emerald-600 dark:text-emerald-300">
                                  پرداخت: {faDate(inst.paidAt)}
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                              meta.badge
                            )}
                          >
                            {meta.icon === "paid" ? (
                              <CheckCircle2 className="size-3" />
                            ) : meta.icon === "overdue" ? (
                              <XCircle className="size-3" />
                            ) : (
                              <Hourglass className="size-3" />
                            )}
                            {meta.label}
                          </span>
                        </div>
                        {inst.note ? (
                          <p className="rounded-xl bg-foreground/[0.04] px-3 py-2 text-xs leading-5 text-muted-foreground">
                            {inst.note}
                          </p>
                        ) : null}
                        <div className="border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
                          {rowActions(inst, false)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : null}
          </>
        )}
      </DialogContent>

      {/* — دیالوگ درونی افزودن/ویرایش قسط — */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent dir="rtl" className="max-w-sm rounded-2xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarPlus className="size-4 text-teal-600 dark:text-teal-300" />
              {editing ? `ویرایش قسط ${faDigits(editing.index)}` : "افزودن قسط"}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {editing
                ? "مبلغ، سررسید یا یادداشت این قسط را اصلاح کنید."
                : "مبلغ و سررسید قسط جدید را وارد کنید."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="inst-amount"
                className="text-xs font-black text-foreground/90"
              >
                مبلغ قسط (تومان)
              </Label>
              <Input
                id="inst-amount"
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                inputMode="numeric"
                placeholder="2000000"
                dir="ltr"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="inst-due"
                className="text-xs font-black text-foreground/90"
              >
                تاریخ سررسید (تقویم شمسی)
              </Label>
              <JalaliDateField
                id="inst-due"
                value={draft.dueDate}
                onChange={(dueDate) => setDraft((d) => ({ ...d, dueDate }))}
                placeholder="انتخاب تاریخ سررسید..."
                ariaLabel="تاریخ سررسید قسط — تقویم شمسی"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="inst-note"
                className="text-xs font-black text-foreground/90"
              >
                یادداشت (اختیاری)
              </Label>
              <Input
                id="inst-note"
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                placeholder="مثلاً شماره پیگیری واریز"
                className="h-11 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
              />
            </div>
          </div>

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={submitForm}
              disabled={saving}
              className={`h-10 rounded-xl px-6 text-xs ${btnGradient}`}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  در حال ذخیره...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  ذخیره
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={saving}
              className="h-10 rounded-xl px-6 text-xs font-bold"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
