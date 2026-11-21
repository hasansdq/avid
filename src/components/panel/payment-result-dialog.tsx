"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Banknote,
  CalendarDays,
  Check,
  Clock3,
  GraduationCap,
  Loader2,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { PanelEnrollment } from "@/components/panel/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/**
 * PaymentResultDialog — پاپ‌آپ نتیجه‌ی بازگشت از درگاه پرداخت در پنل کاربر.
 *
 * پس از پرداخت موفق، کاربر به /panel?payment=success هدایت می‌شود؛ این
 * گفت‌وگو همان لحظه باز می‌شود، پیام «پرداخت شما با موفقیت انجام شد» را
 * همراه فهرست دوره‌های کاربر (از GET /api/panel/me) نشان می‌دهد و آدرس
 * بدون رفرش پاک می‌شود تا رفرش دوباره پاپ‌آپ را باز نکند.
 *
 * حالت‌های failed (با کد دلیل) و pending (در حال تأیید) هم پوشش داده
 * می‌شوند — قالب بصری همان گفت‌وگو با رنگ/آیکون متفاوت است.
 */

type PaymentOutcome = "success" | "failed" | "pending";

/** پیام فارسی کدهای دلیل ناموفق — همان کدهای api/payment/callback */
const FAIL_REASONS: Record<string, string> = {
  canceled: "پرداخت توسط شما یا درگاه لغو شد.",
  "test-mode-disabled": "درگاه آزمایشی در پنل مدیریت فعال نیست.",
  "invalid-test": "پارامترهای پرداخت آزمایشی نامعتبر بود.",
  "invalid-callback": "پاسخ درگاه پرداخت نامعتبر بود.",
  "not-found": "رکورد پرداخت یافت نشد.",
  "not-pending": "این پرداخت قبلاً نهایی شده است.",
  "stale-attempt": "این تلاش پرداخت منقضی یا تکراری است.",
  "order-not-found": "سفارش درگاه یافت نشد.",
  "payment-code-mismatch": "کد پرداخت درگاه با ثبت‌نام مطابقت نداشت.",
  "amount-mismatch": "مبلغ پرداختی با مبلغ ثبت‌شده مطابقت نداشت.",
  "attempt-mismatch": "کد تلاش پرداخت با رکورد مطابقت نداشت.",
  "verify-failed": "تأیید نهایی پرداخت درگاه ناموفق بود.",
  "unknown-gateway": "درگاه پرداخت شناسایی نشد.",
  "server-error": "خطای سرور هنگام تأیید پرداخت.",
};

export function PaymentResultDialog({
  enrollments,
}: {
  /** دوره‌های کاربر از GET /api/panel/me — تا رسیدن پاسخ null است */
  enrollments: PanelEnrollment[] | null;
}) {
  const [outcome, setOutcome] = React.useState<PaymentOutcome | null>(null);
  const [reason, setReason] = React.useState("");
  const [open, setOpen] = React.useState(false);

  // خواندن نتیجه‌ی درگاه از پارامتر آدرس (?payment=...) — فقط یک‌بار در مانت
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("payment");
    if (p === "success" || p === "failed" || p === "pending") {
      setOutcome(p);
      setReason(params.get("reason") ?? "");
      setOpen(true);
      // پاک‌سازی آدرس بدون رفرش — پاپ‌آپ با رفرش دوباره باز نمی‌شود
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  if (!outcome) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-0 overflow-hidden rounded-[1.75rem] border-border bg-card/95 p-0 backdrop-blur-xl dark:bg-[#08110e]/95 [&>button]:z-10"
      >
        {outcome === "success" ? (
          <SuccessView enrollments={enrollments} onClose={() => setOpen(false)} />
        ) : outcome === "pending" ? (
          <PendingView onClose={() => setOpen(false)} />
        ) : (
          <FailedView reason={reason} onClose={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ————————————————— موفق ————————————————— */

function SuccessView({
  enrollments,
  onClose,
}: {
  enrollments: PanelEnrollment[] | null;
  onClose: () => void;
}) {
  // تازه‌ترین ثبت‌نام‌ها اول — «لیست دوره‌های من»
  const list = React.useMemo(() => {
    if (!enrollments) return null;
    return [...enrollments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [enrollments]);

  return (
    <div dir="rtl" className="relative flex flex-col">
      {/* هاله‌ی پس‌زمینه */}
      <div className="pointer-events-none absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-emerald-400/15 blur-[80px]" />

      {/* نشان موفقیت — انیمیشن فنری */}
      <div className="relative flex justify-center pt-8">
        <motion.span
          initial={{ scale: 0, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-xl shadow-emerald-500/30"
        >
          <motion.span
            initial={{ scale: 1.6, opacity: 0.55 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.4 }}
            className="absolute inset-0 rounded-3xl bg-emerald-400"
            aria-hidden
          />
          <Check className="relative size-10 text-teal-950" strokeWidth={3} />
        </motion.span>
      </div>

      <div className="relative px-7 pt-5 text-center">
        <DialogTitle className="text-lg font-black leading-8 text-foreground">
          پرداخت شما با موفقیت انجام شد
        </DialogTitle>
        <DialogDescription className="mt-2 text-[0.8rem] leading-6 text-muted-foreground">
          ثبت‌نام شما تکمیل گردید؛ کارشناسان ما برای شروع دوره با شما تماس
          می‌گیرند. دوره‌های شما در ادامه فهرست شده‌اند.
        </DialogDescription>
      </div>

      {/* لیست دوره‌های کاربر */}
      <div className="relative px-5 pt-5">
        <p className="mb-2.5 flex items-center gap-1.5 px-2 text-[0.7rem] font-black text-muted-foreground">
          <GraduationCap className="size-3.5 text-teal-600 dark:text-teal-300" />
          دوره‌های من
        </p>

        {list === null ? (
          // داده‌ی پنل هنوز بارگذاری نشده — اسکلت‌های کم‌رنگ
          <div className="space-y-2" role="status" aria-label="در حال دریافت دوره‌ها">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="flex h-[3.25rem] items-center gap-3 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.02] px-3.5 dark:border-white/[0.07] dark:bg-white/[0.02]"
              >
                <Loader2 className="size-4 animate-spin text-teal-600 dark:text-teal-300" />
                <span className="h-2.5 w-2/5 animate-pulse rounded-full bg-foreground/10 dark:bg-white/10" />
                <span className="h-2.5 w-14 animate-pulse rounded-full bg-foreground/10 dark:bg-white/10" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-foreground/[0.07] bg-foreground/[0.02] px-4 py-5 text-center text-[0.75rem] font-semibold text-muted-foreground dark:border-white/[0.07] dark:bg-white/[0.02]">
            دوره‌ای برای نمایش نیست؛ کارشناسان ما به‌زودی ثبت‌نام شما را نهایی
            می‌کنند.
          </p>
        ) : (
          <ul
            className="max-h-72 space-y-2 overflow-y-auto p-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/15 [&::-webkit-scrollbar-thumb]:dark:bg-white/15 [&::-webkit-scrollbar]:w-1.5"
            aria-label="فهرست دوره‌های ثبت‌نام‌شده"
          >
            {list.map((e, i) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.07, duration: 0.3 }}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-3.5 py-3",
                  e.paymentStatus === "paid"
                    ? "border-emerald-500/30 bg-emerald-500/[0.07] dark:border-emerald-400/25 dark:bg-emerald-400/[0.07]"
                    : "border-foreground/[0.09] bg-foreground/[0.02] dark:border-white/[0.09] dark:bg-white/[0.02]"
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                    e.paymentStatus === "paid"
                      ? "bg-gradient-to-br from-teal-400 to-emerald-500 shadow-md shadow-emerald-500/25"
                      : "bg-foreground/[0.06] dark:bg-white/[0.06]"
                  )}
                >
                  {e.paymentStatus === "paid" ? (
                    <Check className="size-4.5 text-teal-950" strokeWidth={3} />
                  ) : (
                    <Clock3 className="size-4 text-amber-600 dark:text-amber-300" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8rem] font-black text-foreground">
                    {e.course}
                    {e.groupTitle ? (
                      <span className="font-semibold text-muted-foreground">
                        {" "}
                        · {e.groupTitle}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[0.62rem] font-semibold text-muted-foreground">
                    {typeof e.paymentAmount === "number" && e.paymentAmount > 0 ? (
                      <span className="flex items-center gap-1">
                        <Banknote className="size-3" />
                        {faDigits(e.paymentAmount.toLocaleString("en-US"))} تومان
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <ReceiptText className="size-3" />
                        ثبت‌نام رایگان
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {faDigits(
                        new Date(e.createdAt).toLocaleDateString("fa-IR")
                      )}
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-1 text-[0.55rem] font-black",
                    e.paymentStatus === "paid"
                      ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                      : e.paymentStatus === "pending"
                        ? "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                        : "bg-red-500/15 text-red-700 dark:bg-red-400/15 dark:text-red-300"
                  )}
                >
                  {e.paymentStatus === "paid"
                    ? "پرداخت شده"
                    : e.paymentStatus === "pending"
                      ? "در انتظار پرداخت"
                      : "ناموفق"}
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      {/* دکمه‌ها */}
      <div className="relative flex flex-col gap-2 px-7 pb-7 pt-5 sm:flex-row">
        <Button
          onClick={onClose}
          className="h-11 flex-1 rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 text-sm font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] hover:shadow-teal-400/40"
        >
          <GraduationCap className="size-4.5" />
          مشاهده دوره‌های من
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-11 rounded-2xl border-foreground/[0.12] bg-foreground/[0.04] px-5 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
        >
          <Link href="/">بازگشت به سایت</Link>
        </Button>
      </div>
    </div>
  );
}

/* ————————————————— در انتظار تأیید ————————————————— */

function PendingView({ onClose }: { onClose: () => void }) {
  return (
    <div dir="rtl" className="relative flex flex-col items-center px-7 pb-7 pt-8 text-center">
      <div className="pointer-events-none absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-amber-400/15 blur-[80px]" />
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl shadow-amber-500/30"
      >
        <Clock3 className="size-10 text-amber-950" strokeWidth={2.4} />
      </motion.span>
      <DialogTitle className="relative mt-5 text-lg font-black leading-8 text-foreground">
        تأیید پرداخت در حال بررسی است
      </DialogTitle>
      <DialogDescription className="relative mt-2 text-[0.8rem] leading-6 text-muted-foreground">
        تا مشخص شدن نتیجه، پرداخت را دوباره انجام ندهید. نتیجه به‌صورت خودکار
        در همین پنل به‌روزرسانی می‌شود.
      </DialogDescription>
      <Button
        onClick={onClose}
        className="relative mt-6 h-11 w-full rounded-2xl bg-gradient-to-l from-amber-400 to-orange-500 text-sm font-black text-amber-950 shadow-xl shadow-amber-500/30 transition-all hover:scale-[1.01]"
      >
        متوجه شدم
      </Button>
    </div>
  );
}

/* ————————————————— ناموفق ————————————————— */

function FailedView({
  reason,
  onClose,
}: {
  reason: string;
  onClose: () => void;
}) {
  const message =
    FAIL_REASONS[reason] ?? "پرداخت ناموفق بود یا لغو شد؛ ثبت‌نام شما حفظ شده است.";

  return (
    <div dir="rtl" className="relative flex flex-col items-center px-7 pb-7 pt-8 text-center">
      <div className="pointer-events-none absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-red-400/15 blur-[80px]" />
      <motion.span
        initial={{ scale: 0, rotate: 12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-red-400 to-rose-600 shadow-xl shadow-red-500/30"
      >
        <XCircle className="size-10 text-white" strokeWidth={2.4} />
      </motion.span>
      <DialogTitle className="relative mt-5 text-lg font-black leading-8 text-foreground">
        پرداخت ناموفق بود
      </DialogTitle>
      <DialogDescription className="relative mt-2 text-[0.8rem] leading-6 text-muted-foreground">
        {message}
      </DialogDescription>
      <p className="relative mt-2 flex items-center gap-1.5 rounded-full border border-foreground/[0.09] bg-foreground/[0.03] px-3 py-1.5 text-[0.6rem] font-bold text-muted-foreground dark:border-white/[0.09] dark:bg-white/[0.03]">
        <ShieldCheck className="size-3.5" />
        ثبت‌نام شما حفظ شده است — می‌توانید دوباره تلاش کنید
      </p>

      <div className="relative mt-6 flex w-full flex-col gap-2 sm:flex-row">
        <Button
          asChild
          className="h-11 flex-1 rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 text-sm font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01]"
        >
          <Link href="/register">
            <RotateCcw className="size-4.5" />
            تلاش مجدد پرداخت
          </Link>
        </Button>
        <Button
          onClick={onClose}
          variant="outline"
          className="h-11 rounded-2xl border-foreground/[0.12] bg-foreground/[0.04] px-5 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
        >
          بستن
        </Button>
      </div>
    </div>
  );
}
