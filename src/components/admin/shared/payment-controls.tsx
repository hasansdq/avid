"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Hourglass,
  Loader2,
  Pencil,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { JalaliDateField } from "@/components/admin/shared/jalali-date-field";
import type { Enrollment } from "@/components/admin/types";
import { faDigits } from "@/lib/fa";

/**
 * کنترل‌های دستیِ وضعیت پرداخت ثبت‌نام —
 * مخصوص پرداخت‌های نقدی (و هر پرداخت ثبت‌شده‌ی دیگر):
 *  • PaymentStatusSelect — تبدیل وضعیت پرداخت به هر وضعیت دیگر
 *    (پرداخت‌شده ⇄ در انتظار ⇄ ناموفق) با یک کلیک
 *  • PaymentEditButton — دیالوگ ویرایش دستیِ «وضعیت + مبلغ + تاریخ پرداخت»
 *
 * هر دو همان PUT /api/admin/enrollments/[id] را صدا می‌زنند.
 */

/* — نشان وضعیت پرداخت — */
export const PAYMENT_STATUS_META: Record<
  string,
  { label: string; badge: string; icon: "paid" | "pending" | "failed" }
> = {
  paid: {
    label: "پرداخت‌شده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    icon: "paid",
  },
  pending: {
    label: "در انتظار",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
    icon: "pending",
  },
  failed: {
    label: "ناموفق",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
    icon: "failed",
  },
};

const PAYMENT_STATUS_OPTIONS: { value: "pending" | "paid" | "failed"; label: string }[] = [
  { value: "pending", label: "در انتظار" },
  { value: "paid", label: "پرداخت‌شده" },
  { value: "failed", label: "ناموفق" },
];

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

/** آیکون وضعیت پرداخت */
function paymentStatusIcon(
  kind: "paid" | "pending" | "failed",
  className = "size-3"
) {
  if (kind === "paid") return <CheckCircle2 className={className} />;
  if (kind === "failed") return <XCircle className={className} />;
  return <Hourglass className={className} />;
}

/** تبدیل تاریخ به قالب ورودی date (YYYY-MM-DD) */
function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/* ——————————————————— سلکت تبدیل وضعیت پرداخت ——————————————————— */

export function PaymentStatusSelect({
  enrollmentId,
  value,
  onChanged,
  compact = false,
}: {
  enrollmentId: string;
  value: string;
  /** پس از تبدیل موفق — وضعیت جدید را خبر می‌دهد تا والد داده‌ها را تازه کند */
  onChanged?: (status: string) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(value);

  useEffect(() => {
    setCurrent(value);
  }, [value]);

  const meta = PAYMENT_STATUS_META[current] ?? PAYMENT_STATUS_META.pending;

  async function change(next: string) {
    const nextStatus =
      next === "paid" || next === "pending" || next === "failed" ? next : null;
    if (!nextStatus || nextStatus === current || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/enrollments/${enrollmentId}`, {
        method: "PUT",
        body: JSON.stringify({ paymentStatus: nextStatus }),
      });
      setCurrent(nextStatus);
      const label =
        PAYMENT_STATUS_META[nextStatus]?.label ?? nextStatus;
      toast.success(`وضعیت پرداخت به «${label}» تغییر یافت`);
      onChanged?.(nextStatus);
    } catch (error) {
      toastApiError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Select value={current} onValueChange={change} disabled={busy}>
      <SelectTrigger
        size="sm"
        aria-label="تغییر وضعیت پرداخت"
        title="وضعیت پرداخت را به حالت دیگری تبدیل کنید"
        className={cn(
          "w-auto gap-1.5 rounded-full border px-2.5 font-bold",
          compact ? "h-7 text-[0.65rem]" : "h-7 text-[0.65rem]",
          meta.badge,
          busy && "opacity-60"
        )}
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          paymentStatusIcon(meta.icon)
        )}
        <SelectValue>{meta.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PAYMENT_STATUS_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ——————————————————— دیالوگ ویرایش دستی پرداخت ——————————————————— */

/**
 * دکمه «ویرایش پرداخت» + دیالوگ — تغییر دستیِ وضعیت، مبلغ و (اختیاری)
 * تاریخ پرداخت ثبت‌نام؛ برای پرداخت‌های نقدی که مدیر باید بتواند مبلغ و
 * وضعیت را خودش ثبت/اصلاح کند.
 */
export function PaymentEditButton({
  enrollment,
  onChanged,
  compact = false,
  label = "ویرایش پرداخت",
}: {
  enrollment: Pick<
    Enrollment,
    | "id"
    | "paymentStatus"
    | "paymentAmount"
    | "paidAt"
    | "paymentMethod"
  >;
  onChanged?: () => void;
  compact?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("pending");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");

  // با هر باز شدن دیالوگ، فرم از وضعیت فعلی پرداخت پر می‌شود
  useEffect(() => {
    if (!open) return;
    setStatus(
      enrollment.paymentStatus in PAYMENT_STATUS_META
        ? enrollment.paymentStatus
        : "pending"
    );
    setAmount(
      enrollment.paymentAmount ? String(enrollment.paymentAmount) : ""
    );
    setPaidAt(toDateInput(enrollment.paidAt));
    setSaving(false);
  }, [open, enrollment]);

  async function save() {
    if (saving) return;
    const parsed = amount.trim() ? parseAmount(amount) : 0;
    if (amount.trim() && parsed < 1_000) {
      toast.error("مبلغ پرداخت باید دست‌کم ۱٫۰۰۰ تومان باشد (یا خالی = بدون پرداخت).");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/admin/enrollments/${enrollment.id}`, {
        method: "PUT",
        body: JSON.stringify({
          paymentStatus: status,
          paymentAmount: parsed > 0 ? parsed : null,
          // تاریخ صریح فقط برای وضعیت «پرداخت‌شده» ارسال می‌شود؛
          // در وضعیت‌های دیگر سرور تاریخ پرداخت را پاک می‌کند
          ...(status === "paid" && paidAt ? { paidAt } : {}),
        }),
      });
      toast.success("پرداخت به‌روزرسانی شد");
      setOpen(false);
      onChanged?.();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={() => setOpen(true)}
        aria-label={`${label} — ${faAmount(enrollment.paymentAmount ?? 0)} تومان`}
        title={`${label} — تغییر دستی وضعیت، مبلغ و تاریخ پرداخت`}
        className={cn(
          "shrink-0 gap-1.5 rounded-xl font-bold",
          compact
            ? "h-7 px-2.5 text-[0.65rem]"
            : "h-9 px-4 text-xs"
        )}
      >
        <Pencil className="size-3.5" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={(o) => (saving ? undefined : setOpen(o))}>
        <DialogContent dir="rtl" className="max-w-sm rounded-2xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Banknote className="size-4 text-teal-600 dark:text-teal-300" />
              ویرایش دستی پرداخت
            </DialogTitle>
            <DialogDescription className="leading-6">
              وضعیت و مبلغ پرداخت{" "}
              {enrollment.paymentMethod === "installment"
                ? "(پیش‌پرداخت ثبت‌نام اقساطی)"
                : "نقدی"}{" "}
              را دستی اصلاح کنید.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* — وضعیت — */}
            <div className="space-y-2">
              <Label className="text-xs font-black text-foreground/90">
                وضعیت پرداخت
              </Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus(
                    v === "paid" || v === "pending" || v === "failed"
                      ? v
                      : "pending"
                  )
                }
              >
                <SelectTrigger className="h-11 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[0.65rem] leading-5 text-muted-foreground">
                «پرداخت‌شده» بدون تاریخ، همین حالا را ثبت می‌کند؛ هر وضعیت دیگر
                تاریخ پرداخت را پاک می‌کند.
              </p>
            </div>

            {/* — مبلغ — */}
            <div className="space-y-2">
              <Label
                htmlFor="pay-amount"
                className="text-xs font-black text-foreground/90"
              >
                مبلغ پرداخت (تومان)
              </Label>
              <Input
                id="pay-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                placeholder="مثلاً 10000000"
                dir="ltr"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
              <p className="text-[0.65rem] leading-5 text-muted-foreground">
                {amount.trim()
                  ? `${faAmount(parseAmount(amount))} تومان`
                  : "خالی = بدون رکورد پرداخت."}
              </p>
            </div>

            {/* — تاریخ پرداخت (اختیاری) — */}
            <div className="space-y-2">
              <Label className="text-xs font-black text-foreground/90">
                تاریخ پرداخت (اختیاری — تقویم شمسی)
              </Label>
              <JalaliDateField
                id="pay-paidAt"
                value={paidAt}
                onChange={setPaidAt}
                placeholder="انتخاب تاریخ پرداخت..."
                ariaLabel="تاریخ پرداخت — تقویم شمسی"
              />
            </div>
          </div>

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={save}
              disabled={saving}
              className="h-10 rounded-xl px-6 text-xs"
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
              onClick={() => setOpen(false)}
              disabled={saving}
              className="h-10 rounded-xl px-6 text-xs font-bold"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
