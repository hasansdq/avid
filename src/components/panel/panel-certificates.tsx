"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Award,
  Download,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { faDate, faDigits } from "@/lib/fa";
import type { PanelCertificate } from "@/components/panel/types";

/** کارت شیشه‌ای هماهنگ با بقیه‌ی پنل */
const CARD =
  "rounded-2xl border border-foreground/[0.08] bg-card/85 p-4 shadow-xl shadow-black/[0.04] backdrop-blur-xl sm:p-6 dark:border-white/[0.08] dark:bg-[#08110e]/70 dark:shadow-black/20";

/* ————————————————— بخش گواهینامه‌ها ————————————————— */

/** نوع فایل گواهینامه از روی آدرس — pdf | image | none */
function fileKindOf(url: string): "pdf" | "image" | "none" {
  const clean = (url ?? "").trim().split("?")[0];
  if (!clean) return "none";
  return /\.pdf$/i.test(clean) ? "pdf" : "image";
}

/** نام فایل دانلود — «گواهینامه-AVD-XXXX» */
function downloadName(cert: PanelCertificate): string {
  return `گواهینامه-${cert.code}`;
}

/**
 * CertificatesSection — گواهینامه‌های کاربر با امکان مشاهده و دانلود.
 * داده از GET /api/panel/certificates می‌آید؛ گواهینامه‌های دارای فایل
 * آپلودی (PDF یا تصویر) پیش‌نمایش و دانلود مستقیم دارند و گواهینامه‌های
 * بدون فایل به‌صورت برگه‌ی سیستمی قابل چاپ نمایش داده می‌شوند.
 */
export function CertificatesSection({
  settings,
  userName,
  onCount,
}: {
  settings: SiteSettings;
  userName: string;
  /** اعلام تعداد به کارت آماری بالای داشبورد (اختیاری) */
  onCount?: (count: number) => void;
}) {
  const [certs, setCerts] = React.useState<PanelCertificate[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [viewing, setViewing] = React.useState<PanelCertificate | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/panel/certificates", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { certificates?: PanelCertificate[] };
        if (cancelled) return;
        setCerts(Array.isArray(json.certificates) ? json.certificates : []);
        onCount?.(json.certificates?.length ?? 0);
      } catch {
        if (!cancelled) {
          setCerts([]);
          toast.error("خطا در دریافت گواهینامه‌ها؛ دوباره تلاش کنید.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="گواهینامه‌های من" className="space-y-4">
      {/* سربرگ بخش */}
      <div className="mb-1 flex items-center justify-between gap-2 sm:mb-2">
        <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
          <Award className="size-5 text-amber-500 dark:text-amber-300" />
          گواهینامه‌های من
        </h2>
        {certs ? (
          <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            {faDigits(certs.length)} گواهینامه
          </span>
        ) : null}
      </div>

      {loading ? (
        <CertificateSkeleton />
      ) : !certs || certs.length === 0 ? (
        <div
          className={cn(
            CARD,
            "flex flex-col items-center gap-4 px-6 py-12 text-center"
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
            <Inbox className="size-7 text-muted-foreground" />
          </span>
          <div>
            <p className="text-base font-black text-foreground">
              هنوز گواهینامه‌ای دریافت نکرده‌اید
            </p>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              پس از گذراندن دوره‌ها، گواهینامه‌های پایان دوره توسط آکادمی صادر
              می‌شود و همین‌جا برای دانلود قرار می‌گیرد.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6">
          {certs.map((cert) => (
            <CertificateCard
              key={cert.id}
              cert={cert}
              onOpen={() => setViewing(cert)}
            />
          ))}
        </div>
      )}

      {/* برگه‌ی گواهینامه — مشاهده و دانلود */}
      <CertificateDialog
        cert={viewing}
        settings={settings}
        userName={userName}
        onClose={() => setViewing(null)}
      />
    </section>
  );
}

/** اسکلت بارگذاری بخش گواهینامه‌ها */
function CertificateSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {[0, 1].map((k) => (
        <div key={k} className={cn(CARD, "animate-pulse space-y-3")}>
          <div className="flex items-center justify-between">
            <div className="h-5 w-44 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
            <div className="h-6 w-28 animate-pulse rounded-full bg-foreground/10 dark:bg-white/10" />
          </div>
          <div className="h-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
          <div className="h-10 w-40 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
        </div>
      ))}
    </div>
  );
}

/** کارت یک گواهینامه */
function CertificateCard({
  cert,
  onOpen,
}: {
  cert: PanelCertificate;
  onOpen: () => void;
}) {
  const kind = fileKindOf(cert.fileUrl);

  return (
    <article className={cn(CARD, "flex flex-col gap-4 sm:flex-row sm:items-start")}>
      {/* پیش‌نمایش فایل — تصویر یا کاشی PDF */}
      <div className="flex shrink-0 items-center justify-center sm:self-stretch">
        {kind === "image" ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`مشاهده گواهینامه ${cert.courseTitle}`}
            className="relative block h-40 w-32 overflow-hidden rounded-xl border border-foreground/[0.1] bg-foreground/[0.03] dark:border-white/10"
          >
            {/* گواهینامه خصوصی است — لینک امضاشده (?sig=) — بهینه‌ساز next/image
                کوئری‌استرینگ را رد می‌کند؛ <img> مستقیم (بدون بهینه‌ساز) سرو می‌شود */}
            <img
              src={cert.fileUrl}
              alt={`گواهینامه دوره ${cert.courseTitle}`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`مشاهده گواهینامه ${cert.courseTitle}`}
            className="flex h-40 w-32 flex-col items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 shadow-lg shadow-rose-500/25"
          >
            <FileText className="size-9 text-white" strokeWidth={1.8} />
            <span className="text-xs font-black text-white">فایل PDF</span>
            <span
              dir="ltr"
              className="rounded-full bg-white/20 px-2 py-0.5 text-[0.6rem] font-black tracking-wide text-white"
            >
              {cert.code}
            </span>
          </button>
        )}
      </div>

      {/* جزئیات */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.07] pb-3 dark:border-white/[0.07]">
          <h3 className="flex min-w-0 items-center gap-2 text-base font-black leading-7 text-foreground sm:text-lg">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
              <Award className="size-5 text-amber-950" strokeWidth={2.2} />
            </span>
            <span className="truncate">گواهینامه‌ی دوره‌ی «{cert.courseTitle}»</span>
          </h3>
          <span
            dir="ltr"
            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-black tracking-wide text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
          >
            {cert.code}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-muted-foreground">
          <span>تاریخ صدور: {faDate(cert.issuedAt)}</span>
          {cert.grade !== null && cert.grade !== undefined ? (
            <span
              className={cn(
                "tabular-nums",
                cert.grade >= 17
                  ? "text-emerald-600 dark:text-emerald-300"
                  : cert.grade >= 10
                    ? "text-teal-600 dark:text-teal-300"
                    : "text-amber-600 dark:text-amber-300"
              )}
            >
              معدل: {faDigits(cert.grade)} از {faDigits(20)}
            </span>
          ) : null}
        </div>

        {cert.note ? (
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            {cert.note}
          </p>
        ) : null}

        <Button
          type="button"
          onClick={onOpen}
          className="mt-4 h-11 w-full rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 px-5 text-sm font-black text-amber-950 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.01]"
        >
          <Download className="size-4" />
          مشاهده و دانلود گواهینامه
        </Button>
      </div>
    </article>
  );
}

/* ————————————————— برگه‌ی گواهینامه ————————————————— */

/**
 * CertificateDialog — نمایش گواهینامه + دانلود.
 *  · گواهینامه‌ی دارای فایل آپلودی (PDF یا تصویر): پیش‌نمایش زنده‌ی همان فایل
 *    (PDF داخل قاب مرورگر، تصویر تمام‌صفحه) + دانلود مستقیم فایل.
 *  · گواهینامه‌ی بدون فایل: برگه‌ی رسمی سیستمی نمایش داده می‌شود و دانلود
 *    با پنجره‌ی چاپ مرورگر انجام می‌شود (ذخیره به PDF).
 */
function CertificateDialog({
  cert,
  settings,
  userName,
  onClose,
}: {
  cert: PanelCertificate | null;
  settings: SiteSettings;
  userName: string;
  onClose: () => void;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);
  const [imageFailed, setImageFailed] = React.useState(false);
  const kind = cert ? fileKindOf(cert.fileUrl) : "none";

  return (
    <Dialog open={cert !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-h-[90vh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-3xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>گواهینامه {cert?.courseTitle}</DialogTitle>
          <DialogDescription>
            برگه‌ی گواهینامه‌ی پایان دوره — قابل مشاهده و دانلود
          </DialogDescription>
        </DialogHeader>

        {cert ? (
          kind === "pdf" ? (
            <>
              {/* — پیش‌نمایش PDF داخل قاب مرورگر — */}
              <div className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <p className="flex items-center gap-1.5 text-xs font-black text-foreground">
                    <FileText className="size-4 text-rose-600 dark:text-rose-300" />
                    گواهینامه‌ی دوره‌ی «{cert.courseTitle}»
                  </p>
                  <span
                    dir="ltr"
                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-black tracking-wide text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
                  >
                    {cert.code}
                  </span>
                </div>
                <iframe
                  src={cert.fileUrl}
                  title={`فایل گواهینامه ${cert.courseTitle}`}
                  className="h-[60vh] w-full rounded-xl border border-foreground/[0.1] bg-white dark:border-white/10"
                />
              </div>
              <CertificateFileActions cert={cert} onClose={onClose} />
            </>
          ) : kind === "image" ? (
            <>
              {/* — پیش‌نمایش تصویر گواهینامه — */}
              <div className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <p className="flex items-center gap-1.5 text-xs font-black text-foreground">
                    <Award className="size-4 text-amber-500 dark:text-amber-300" />
                    گواهینامه‌ی دوره‌ی «{cert.courseTitle}»
                  </p>
                  <span
                    dir="ltr"
                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-black tracking-wide text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
                  >
                    {cert.code}
                  </span>
                </div>
                {imageFailed ? (
                  <div className="flex h-[50vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-foreground/[0.15] text-center dark:border-white/15">
                    <FileText className="size-10 text-muted-foreground" />
                    <p className="px-6 text-xs leading-6 text-muted-foreground">
                      پیش‌نمایش تصویر در دسترس نیست؛ با دکمه‌ی «دانلود فایل» آن را
                      دریافت کنید.
                    </p>
                  </div>
                ) : (
                  /* قاب با ارتفاع محدود تا دکمه‌های دانلود بدون پیمایش دیده شوند */
                  <div className="relative h-[60vh] w-full overflow-hidden rounded-xl border border-foreground/[0.1] bg-white p-2 dark:border-white/10">
                    {/* لینک امضاشده — <img> مستقیم (بهینه‌ساز کوئری را رد می‌کند) */}
                    <img
                      src={cert.fileUrl}
                      alt={`گواهینامه دوره ${cert.courseTitle}`}
                      onError={() => setImageFailed(true)}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  </div>
                )}
              </div>
              <CertificateFileActions cert={cert} onClose={onClose} />
            </>
          ) : (
            <>
              <CertificateSheet
                cert={cert}
                settings={settings}
                userName={userName}
                logoFailed={logoFailed}
                onLogoError={() => setLogoFailed(true)}
              />
              {/* ریشه‌ی چاپ — پورتال مستقیم زیر body؛ فقط هنگام چاپ دیده می‌شود
                  (globals.css: بقیه‌ی فرزندان بدنه با display:none از چاپ خارج می‌شوند)
                  تا خروجی دقیقاً یک برگه‌ی A4 افقی باشد. */}
              {typeof document !== "undefined"
                ? createPortal(
                    <div className="cert-print-root hidden print:block">
                      <CertificateSheet
                        cert={cert}
                        settings={settings}
                        userName={userName}
                      />
                    </div>,
                    document.body
                  )
                : null}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/[0.07] p-3 dark:border-white/[0.07]">
                <p className="text-[0.65rem] leading-5 text-muted-foreground">
                  در پنجره‌ی چاپ، مقصد را «ذخیره به‌صورت PDF» انتخاب کنید.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="h-10 rounded-xl px-4 text-xs font-bold"
                  >
                    بستن
                  </Button>
                  <Button
                    type="button"
                    onClick={() => window.print()}
                    className="h-10 rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 px-5 text-xs font-black text-amber-950 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02]"
                  >
                    <Download className="size-4" />
                    دانلود PDF
                  </Button>
                </div>
              </div>
            </>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** نوار عملیات گواهینامه‌ی دارای فایل — دانلود + مشاهده در تب جدید + بستن */
function CertificateFileActions({
  cert,
  onClose,
}: {
  cert: PanelCertificate;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/[0.07] p-3 dark:border-white/[0.07]">
      <p className="text-[0.65rem] leading-5 text-muted-foreground">
        کد رهگیری {cert.code} — برای اعتبارسنجی به آکادمی مراجعه کنید.
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="h-10 rounded-xl px-4 text-xs font-bold"
        >
          بستن
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-10 rounded-xl px-4 text-xs font-bold"
        >
          <a
            href={cert.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="مشاهده فایل گواهینامه در تب جدید"
          >
            <ExternalLink className="size-4" />
            مشاهده در تب جدید
          </a>
        </Button>
        <Button
          asChild
          className="h-10 rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 px-5 text-xs font-black text-amber-950 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02]"
        >
          <a
            href={cert.fileUrl}
            download={downloadName(cert)}
            aria-label="دانلود فایل گواهینامه"
          >
            <Download className="size-4" />
            دانلود فایل
          </a>
        </Button>
      </div>
    </div>
  );
}

/** برگه‌ی رسمی گواهینامه — در چاپ فقط همین بخش دیده می‌شود (کلاس certificate-sheet) */
export function CertificateSheet({
  cert,
  settings,
  userName,
  logoFailed = false,
  onLogoError,
}: {
  cert: PanelCertificate;
  settings: SiteSettings;
  userName: string;
  logoFailed?: boolean;
  onLogoError?: () => void;
}) {
  return (
    <div
      dir="rtl"
      className="certificate-sheet relative m-3 w-[calc(100%-1.5rem)] overflow-hidden rounded-xl bg-white text-slate-900 sm:m-4 sm:w-[calc(100%-2rem)] sm:rounded-2xl"
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      {/* قاب دوبل رسمی — فیروزه‌ای و طلایی */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-2 rounded-xl border-2 border-teal-600/70 sm:inset-3.5 sm:rounded-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-3.5 rounded-lg border border-amber-500/60 sm:inset-5.5 sm:rounded-xl"
      />
      {/* هاله‌ی نرم گوشه‌ها */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-1/4 size-56 rounded-full bg-teal-500/[0.07]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 left-1/4 size-56 rounded-full bg-amber-400/[0.09]"
      />

      <div className="relative flex aspect-[297/210] flex-col items-center justify-between px-8 py-7 sm:px-14 sm:py-10">
        {/* سربرگ آکادمی */}
        <div className="flex w-full items-center justify-center gap-3">
          {settings.logoUrl && !logoFailed ? (
            <Image
              src={settings.logoUrl}
              alt={settings.siteName}
              width={48}
              height={48}
              onError={onLogoError}
              className="size-12 shrink-0 rounded-xl border border-slate-200 object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-2xl font-black text-white"
            >
              آ
            </span>
          )}
          <div className="min-w-0 text-center">
            <p className="truncate text-lg font-black text-slate-800 sm:text-xl">
              آکادمی {settings.siteName}
            </p>
            <p className="truncate text-[0.6rem] font-semibold text-slate-500 sm:text-xs">
              {settings.tagline}
            </p>
          </div>
        </div>

        {/* متن اصلی */}
        <div className="max-w-full text-center">
          <h2 className="text-xl font-black tracking-tight text-teal-800 sm:text-3xl">
            گواهینامه‌ی پایان دوره
          </h2>
          <div
            aria-hidden
            className="mx-auto mt-2 h-[3px] w-24 rounded-full bg-gradient-to-l from-teal-600 via-teal-400 to-amber-400"
          />
          <p className="mt-4 text-[0.7rem] font-semibold text-slate-500 sm:text-sm">
            بدین‌نامه تأیید می‌شود که
          </p>
          <p className="mt-1 truncate text-lg font-black text-slate-900 sm:text-2xl">
            {userName}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[0.7rem] leading-6 font-semibold text-slate-600 sm:text-sm">
            دوره‌ی آموزشی «{cert.courseTitle}» را در این آکادمی
            {cert.grade !== null && cert.grade !== undefined && cert.grade >= 10
              ? " با موفقیت "
              : " "}
            گذرانده است.
          </p>
          {cert.note ? (
            <p className="mx-auto mt-1 max-w-md text-[0.65rem] font-medium text-slate-500 sm:text-xs">
              {cert.note}
            </p>
          ) : null}
        </div>

        {/* پایین — معدل، کد رهگیری، تاریخ و امضا */}
        <div className="flex w-full flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[0.6rem] font-bold text-slate-500 sm:text-[0.7rem]">
              معدل
            </span>
            <span className="rounded-lg border border-teal-600/40 bg-teal-600/[0.06] px-3 py-1 text-sm font-black tabular-nums text-teal-800 sm:text-base">
              {cert.grade !== null && cert.grade !== undefined
                ? `${faDigits(cert.grade)} از ${faDigits(20)}`
                : "—"}
            </span>
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[0.6rem] font-bold text-slate-500 sm:text-[0.7rem]">
              تاریخ صدور
            </span>
            <span className="text-xs font-black text-slate-700 sm:text-sm">
              {faDate(cert.issuedAt)}
            </span>
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[0.6rem] font-bold text-slate-500 sm:text-[0.7rem]">
              کد رهگیری
            </span>
            <span
              dir="ltr"
              className="rounded-lg border border-amber-500/50 bg-amber-500/[0.08] px-3 py-1 text-xs font-black tracking-[0.2em] text-amber-700 sm:text-sm"
            >
              {cert.code}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <ShieldCheck
              aria-hidden
              className="size-5 text-teal-700/70"
              strokeWidth={2}
            />
            <span className="w-32 border-t border-slate-400 pt-1 text-center text-[0.55rem] font-bold text-slate-500 sm:w-40 sm:text-[0.65rem]">
              مهر و امضای {settings.siteName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
