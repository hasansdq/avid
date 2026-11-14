"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  DatabaseBackup,
  FileArchive,
  FileJson,
  FileUp,
  HardDriveDownload,
  Loader2,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { btnGradient } from "@/components/admin/shared/styles";
import { UNAUTHORIZED_EVENT } from "@/components/admin/api";
import { faDigits } from "@/lib/fa";

/**
 * ماژول «بکاپ و بازیابی» —
 * دانلود بکاپ داده‌ها (JSON) یا بکاپ کامل (ZIP شامل فایل‌های آپلودی) و
 * بازیابی سایت از فایل بکاپ (جایگزینی کامل داده‌های محتوایی).
 */

/** پاسخ GET /api/admin/backup?mode=summary */
interface BackupSummary {
  ok: true;
  version: number;
  counts: Record<string, number>;
  uploads: { files: number; bytes: number };
}

/** پاسخ POST /api/admin/backup/import */
interface ImportResult {
  ok: true;
  restored: Record<string, number>;
  filesRestored: number;
  exportedAt?: string;
}

/** برچسب فارسی جدول‌ها — برای آمار و پیام موفقیت */
const TABLE_LABELS: Record<string, string> = {
  siteSettings: "تنظیمات سایت",
  siteText: "متن ویرایشگر مدادی",
  chatSettings: "تنظیمات چت",
  smsSettings: "تنظیمات پیامک",
  paymentSettings: "تنظیمات پرداخت",
  installedFont: "فونت",
  navLink: "لینک هدر/فوتر",
  testimonial: "نظر کاربر",
  discountCode: "کد تخفیف",
  course: "دوره",
  courseGroup: "گروه دوره",
  courseInstallment: "قالب اقساط",
  playlist: "لیست پخش",
  video: "ویدئو",
  user: "کاربر",
  enrollment: "ثبت‌نام",
  installment: "قسط",
  attendanceSession: "جلسه حضور و غیاب",
  attendanceRecord: "ردیف حضور و غیاب",
  smsLog: "گزارش پیامک",
  chatConversation: "گفتگو",
  chatMessage: "پیام چت",
  chatWelcomeLog: "لاگ خوش‌آمدگویی",
};

/** قالب بایت به رشته‌ی خوانا */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return faDigits(0) + " بایت";
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, i);
  return `${faDigits(Math.round(value * 10) / 10)} ${units[i]}`;
}

export function BackupModule() {
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/backup?mode=summary", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("خطا در دریافت آمار بکاپ.");
      setSummary((await res.json()) as BackupSummary);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "خطا در دریافت آمار بکاپ."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** اجرای بازیابی پس از تأیید مدیر */
  async function runImport() {
    if (!file || importing) return;
    setImporting(true);
    try {
      // formData — بدون Content-Type دستی (مرزبند multipart خودکار)
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/backup/import", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string } & Partial<ImportResult>;

      if (!res.ok) {
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
        }
        throw new Error(data.error || "خطا در بازیابی بکاپ.");
      }

      const restored = data.restored ?? {};
      const parts = Object.entries(restored)
        .filter(([, count]) => count > 0)
        .map(
          ([key, count]) =>
            `${faDigits(count)} ${TABLE_LABELS[key] ?? key}`
        );
      const summaryText =
        parts.length > 0 ? parts.join("، ") : "بدون داده";
      toast.success("بازیابی بکاپ کامل شد.", {
        description:
          summaryText +
          (data.filesRestored
            ? ` + ${faDigits(data.filesRestored)} فایل آپلودی`
            : ""),
      });

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // داده‌های همه‌ی ماژول‌ها تازه شود
      window.setTimeout(() => window.location.reload(), 1400);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "خطا در بازیابی بکاپ."
      );
      setImporting(false);
    }
  }

  /** کاشی آمار برای نمایش خلاصه‌ی محتوای بکاپ */
  const statTiles = useMemo(() => {
    if (!summary) return [];
    const c = summary.counts ?? {};
    return [
      { label: "کاربران", value: c.user ?? 0 },
      { label: "ثبت‌نام‌ها", value: c.enrollment ?? 0 },
      { label: "دوره‌ها", value: c.course ?? 0 },
      { label: "ویدئوها", value: c.video ?? 0 },
      { label: "فایل‌های آپلودی", value: summary.uploads.files },
    ].map((t) => ({ ...t, display: faDigits(t.value) }));
  }, [summary]);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="بکاپ و بازیابی"
        description="دانلود بکاپ کامل داده‌ها و فایل‌های سایت، و بازیابی از فایل بکاپ"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/20">
          <DatabaseBackup className="size-5 text-white" strokeWidth={1.9} />
        </span>
      </ModuleHeader>

      {/* ————— دانلود بکاپ ————— */}
      <section className="glass space-y-5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05]">
            <HardDriveDownload className="size-5 text-teal-600 dark:text-teal-300" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-foreground">
              دانلود بکاپ
            </h2>
            <p className="text-xs leading-6 text-muted-foreground">
              داده‌های دیتابیس (کاربران، ثبت‌نام‌ها، دوره‌ها، ویدئوها، اقساط،
              تنظیمات و…) و در حالت کامل، فایل‌های آپلودی (تصاویر، ویدئوها،
              فونت‌ها) هم داخل بسته‌ی ZIP قرار می‌گیرند.
            </p>
          </div>
        </div>

        {/* آمار محتوای فعلی */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-foreground/[0.04]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {statTiles.map((t) => (
              <div
                key={t.label}
                className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 text-center"
              >
                <p className="text-[0.65rem] font-bold text-muted-foreground">
                  {t.label}
                </p>
                <p className="text-lg font-black text-teal-700 dark:text-teal-300">
                  {t.display}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/admin/backup?mode=json"
            download
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-foreground/15 bg-foreground/[0.03] px-4 text-sm font-bold text-foreground transition-all hover:bg-foreground/[0.07]"
          >
            <FileJson className="size-4 text-teal-600 dark:text-teal-300" />
            بکاپ داده‌ها (JSON)
          </a>
          <a
            href="/api/admin/backup?mode=zip"
            download
            className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm ${btnGradient}`}
          >
            <FileArchive className="size-4" />
            بکاپ کامل (ZIP — داده‌ها + فایل‌ها)
          </a>
          {summary ? (
            <span className="text-[0.7rem] font-semibold text-muted-foreground">
              حجم فایل‌های آپلودی:{" "}
              {formatBytes(summary.uploads.bytes)}
            </span>
          ) : null}
        </div>

        <p className="rounded-xl bg-foreground/[0.03] px-3.5 py-3 text-[0.7rem] leading-6 text-muted-foreground">
          در فایل بکاپ، رمز عبور مدیر و نشست‌های ورود قرار نمی‌گیرد و بازیابی
          هیچ‌گاه شما را از پنل خارج نمی‌کند. نسخه‌ی ZIP برای انتقال کامل سایت
          به سرور دیگر مناسب است؛ بازیابی از آن، فایل‌های آپلودی را هم کنار
          داده‌ها برمی‌گرداند.
        </p>
      </section>

      {/* ————— بازیابی از بکاپ ————— */}
      <section className="glass space-y-5 rounded-2xl border-amber-500/30 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <FileUp className="size-5 text-amber-600 dark:text-amber-300" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-foreground">
              بازیابی از بکاپ (ایمپورت)
            </h2>
            <p className="text-xs leading-6 text-muted-foreground">
              فایل JSON یا ZIP بکاپ را بارگذاری کنید — همه‌ی داده‌های محتوایی
              فعلی با محتوای فایل جایگزین می‌شود. حداکثر حجم ۵۱۲ مگابایت.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="backup-file"
            className="text-sm font-bold text-foreground/90"
          >
            فایل بکاپ (JSON یا ZIP)
          </label>
          <Input
            id="backup-file"
            ref={fileInputRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            disabled={importing}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="h-12 cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-foreground/[0.06] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-foreground"
          />
          {file ? (
            <p className="flex select-none items-center gap-2 text-[0.7rem] font-bold text-foreground/80">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
              {file.name}
              <span className="text-muted-foreground">
                ({formatBytes(file.size)})
              </span>
            </p>
          ) : null}
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Button
            type="button"
            variant="outline"
            disabled={!file || importing}
            onClick={() => setConfirmOpen(true)}
            className="h-10 rounded-xl border-amber-500/40 bg-amber-500/[0.08] px-4 text-sm font-bold text-amber-700 transition-all hover:bg-amber-500/[0.15] disabled:opacity-50 dark:text-amber-300"
          >
            {importing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            {importing ? "در حال بازیابی..." : "شروع بازیابی از فایل"}
          </Button>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldAlert className="size-5 text-amber-600 dark:text-amber-300" />
                بازیابی بکاپ و جایگزینی همه‌ی داده‌ها؟
              </AlertDialogTitle>
              <AlertDialogDescription>
                همه‌ی داده‌های محتوایی فعلی (کاربران، ثبت‌نام‌ها، دوره‌ها،
                ویدئوها، اقساط، تنظیمات و…) با محتوای فایل بکاپ جایگزین
                می‌شود. این عمل قابل بازگشت نیست — پیش از ادامه، یک بکاپ
                تازه دانلود کنید. حساب مدیر و نشست ورود شما دست‌نخورده
                می‌ماند.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void runImport();
                }}
              >
                بله، بازیابی کن
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
