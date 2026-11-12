"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { faDigits } from "@/lib/fa";

/**
 * دکمه‌ی «ثبت پرداخت» — ثبت دستی پرداخت یک قسط توسط مدیر.
 *
 * همان PUT /api/admin/installments/[id] با status=paid را صدا می‌زند
 * (تاریخ پرداخت = همین حالا) و پس از موفقیت onChanged را خبر می‌کند
 * تا لیست/خلاصه‌ها تازه شوند.
 *
 * compact: اندازه‌ی کوچک برای ردیف‌های فشرده (پاپ‌آور هدر و دیالوگ‌ها)
 */
export function MarkPaidButton({
  installmentId,
  index,
  onChanged,
  compact = false,
  label = "ثبت پرداخت",
  title,
  className,
}: {
  installmentId: string;
  index: number;
  /** پس از ثبت موفق پرداخت — تازه‌سازی داده‌های والد */
  onChanged?: () => void;
  compact?: boolean;
  label?: string;
  title?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function markPaid() {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/installments/${installmentId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "paid" }),
      });
      toast.success(`پرداخت قسط ${faDigits(index)} ثبت شد`);
      onChanged?.();
    } catch (error) {
      toastApiError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "sm" : "default"}
      onClick={markPaid}
      disabled={busy}
      aria-label={`ثبت دستی پرداخت قسط ${faDigits(index)}`}
      title={title ?? `ثبت دستی پرداخت قسط ${faDigits(index)} — وضعیت به «پرداخت‌شده» تغییر می‌کند`}
      className={cn(
        "shrink-0 font-bold",
        compact
          ? "h-7 gap-1 rounded-full px-2.5 text-[0.65rem]"
          : "h-8 gap-1.5 rounded-full px-3.5 text-xs",
        "border-emerald-500/30 bg-emerald-500/[0.04] text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800",
        "dark:border-emerald-400/25 dark:bg-emerald-400/[0.06] dark:text-emerald-300 dark:hover:bg-emerald-400/10",
        className
      )}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <CheckCircle2 className="size-3.5" />
      )}
      {label}
    </Button>
  );
}
