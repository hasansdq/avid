"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  DatabaseBackup,
  FileArchive,
  FileJson,
  FileUp,
  FolderDown,
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

/** یک مورد «از دست رفتن داده‌ی فعلی» در بازیابی بکاپ قدیمی */
interface DataLossItem {
  key: string;
  label: string;
  currentCount: number;
  parentKeys: string[];
  mode: "cascade" | "setnull";
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
  exam: "آزمون",
  examQuestion: "سؤال آزمون",
  examAttempt: "پاسخ آزمون",
  sampleQuestionCategory: "دسته نمونه‌سؤال",
  sampleQuestion: "نمونه‌سؤال",
  certificate: "گواهی‌نامه",
  user: "کاربر",
  enrollment: "ثبت‌نام",
  installment: "قسط",
  attendanceSession: "جلسه حضور و غیاب",
  attendanceRecord: "ردیف حضور و غیاب",
  smsLog: "گزارش پیامک",
  chatConversation: "گفتگو",
  chatMessage: "پیام چت",
  chatWelcomeLog: "لاگ خوش‌آمدگویی",
  uploadedFile: "فایل گالری",
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
  /** فهرست «از دست رفتن داده‌ی فعلی» هنگام بازیابی بکاپ قدیمی */
  const [losses, setLosses] = useState<DataLossItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* — در دسترس‌بودن فایل ZIP پروژه (public/Download/avid-latest.zip) —
     در محیط توسعه/سندباکس موجود است؛ روی برخی استقرارها ممکن است نباشد — */
  const [zipAvailable, setZipAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/Download/avid-latest.zip", { method: "HEAD" })
      .then((r) => {
        if (!cancelled) setZipAvailable(r.ok);
      })
      .catch(() => {
        if (!cancelled) setZipAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  /** اجرای بازیابی — force=1 یعنی تأیید صریحِ از دست رفتن داده‌ی بخش‌های
      غایب از فایل بکاپ قدیمی (آزمون‌ها/نمونه‌سؤال‌ها/گواهی‌نامه‌ها) */
  async function runImport(force = false) {
    if (!file || importing) return;
    setImporting(true);
    try {
      // formData — بدون Content-Type دستی (مرزبند multipart خودکار)
      const form = new FormData();
      form.append("file", file);
      if (force) form.append("force", "1");
      const res = await fetch("/api/admin/backup/import", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        losses?: DataLossItem[];
      } & Partial<ImportResult>;

      if (!res.ok) {
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
        }
        // بکاپ قدیمی فاقد بخش‌های حفاظت‌شده — تأیید صریح لازم است
        if (
          res.status === 409 &&
          data.code === "data-loss" &&
          Array.isArray(data.losses)
        ) {
          setImporting(false);
          setLosses(data.losses);
          return;
        }
        throw new Error(data.error || "خطا در بازیابی بکاپ.");
      }

      setLosses(null);
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
              آزمون‌ها و سؤال‌ها و پاسخ‌ها، نمونه‌سؤال‌ها، گواهی‌نامه‌ها،
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

        {/* — دانلود پروژه (سورس کامل) — ادغام‌شده از منوی پنل — */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-teal-600/30 bg-teal-500/[0.04] px-3.5 py-3 dark:border-teal-400/30 dark:bg-teal-400/[0.06]">
          <span className="flex size-9 items-center justify-center rounded-xl bg-teal-500/10">
            <FolderDown className="size-4.5 text-teal-600 dark:text-teal-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-foreground">
              دانلود پروژه (سورس کامل — ZIP)
            </p>
            <p className="text-[0.65rem] leading-5 text-muted-foreground">
              آخرین نسخه‌ی کامل کدهای پروژه (آماده‌ی استقرار روی سرور) — به‌روز با
              آخرین تغییرات و ترمیم‌ها.
            </p>
          </div>
          {zipAvailable === null ? (
            <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-foreground/15 px-4 text-xs font-bold text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              در حال بررسی…
            </span>
          ) : zipAvailable ? (
            <a
              href="/Download/avid-latest.zip"
              download
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-teal-600/40 bg-teal-500/10 px-4 text-xs font-bold text-teal-700 transition-all hover:bg-teal-500/20 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-300 dark:hover:bg-teal-400/20"
            >
              <FolderDown className="size-4" />
              دانلود
            </a>
          ) : (
            <span className="text-[0.65rem] leading-5 text-muted-foreground">
              فایل ZIP پروژه روی این سرور قرار ندارد — از محیط توسعه/ریپو اصلی
              قابل دریافت است.
            </span>
          )}
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
              فایل JSON یا ZIP بکاپ را بارگذاری کنید — داده‌های جدول‌های
              موجود در فایل با محتوای آن جایگزین می‌شود؛ بخش‌هایی که در فایل
              بکاپ قدیمی نباشند (مثل آزمون‌ها/گواهی‌نامه‌ها) حفظ می‌شوند و
              اگر بازیابی داده‌ی فعلی‌شان را تهدید کند، پیش از ادامه تأیید
              می‌گیریم. حداکثر حجم ۵۱۲ مگابایت.
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
                داده‌های محتواییِ جدول‌های موجود در فایل (کاربران،
                ثبت‌نام‌ها، دوره‌ها، ویدئوها، اقساط، آزمون‌ها، گواهی‌نامه‌ها،
                تنظیمات و…) با محتوای فایل بکاپ جایگزین می‌شود. این عمل
                قابل بازگشت نیست — پیش از ادامه، یک بکاپ تازه دانلود کنید.
                حساب مدیر و نشست ورود شما دست‌نخورده می‌ماند.
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

        {/* — تأیید صریحِ از دست رفتن داده‌ی فعلی (بکاپ قدیمی فاقد بخش‌های
            آزمون‌ها/سؤال‌ها/پاسخ‌ها/نمونه‌سؤال‌ها/گواهی‌نامه‌ها) — */}
        <AlertDialog
          open={losses !== null}
          onOpenChange={(open) => {
            if (!open) setLosses(null);
          }}
        >
          <AlertDialogContent dir="rtl" className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldAlert className="size-5 text-red-600 dark:text-red-400" />
                این بکاپ قدیمی، داده‌های فعلی را پاک می‌کند
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-right">
                  <p className="text-xs leading-6">
                    این فایل بکاپ بخش‌های زیر را ندارد؛ با بازیابی آن،
                    جایگزینی دوره‌ها/کاربران/آزمون‌ها داده‌ی فعلی این بخش‌ها
                    را پاک (یا پیوندش را قطع) می‌کند:
                  </p>
                  <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl bg-foreground/[0.04] p-3 text-[0.7rem] leading-6">
                    {(losses ?? []).map((loss) => (
                      <li
                        key={loss.key}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="font-bold">
                          {loss.label}
                          <span className="mr-1 font-normal text-muted-foreground">
                            {loss.mode === "cascade"
                              ? "(پاک می‌شود)"
                              : "(پیوندش قطع می‌شود)"}
                          </span>
                        </span>
                        <span className="shrink-0 font-black text-red-600 dark:text-red-400">
                          {faDigits(loss.currentCount)} رکورد
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[0.65rem] leading-5 text-muted-foreground">
                    اگر نمی‌خواهید این داده‌ها از بین بروند، انصراف کنید و
                    ابتدا از وضعیت فعلی بکاپ بگیرید. ادامه دادن یعنی تأیید
                    صریح حذف این داده‌ها.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setLosses(null)}>
                انصراف — داده‌ها را نگه دار
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                onClick={() => {
                  setLosses(null);
                  void runImport(true);
                }}
              >
                بله، ادامه بده و حذف را بپذیر
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
