"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Apple,
  Award,
  CheckCircle2,
  DatabaseBackup,
  FileArchive,
  FileJson,
  FileQuestion,
  FileUp,
  FolderDown,
  Globe,
  GraduationCap,
  HardDriveDownload,
  Loader2,
  Monitor,
  MonitorPlay,
  PanelTop,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { btnGradient, tileGradient } from "@/components/admin/shared/styles";
import { UNAUTHORIZED_EVENT } from "@/components/admin/api";
import { faDigits } from "@/lib/fa";

/**
 * ماژول «بکاپ و بازیابی» —
 * دانلود بکاپ کل سایت یا هر بخش به‌تنهایی (دوره‌ها، ویدئوها، کاربران،
 * نمونه‌سؤال‌ها، گواهی‌نامه‌ها، صفحات) به‌صورت JSON یا ZIP، و بازیابی از
 * فایل بکاپ — کل فایل یا فقط یک بخش از آن.
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
  section?: string;
  filesRestored: number;
  exportedAt?: string;
}

/** یک مورد «از دست رفتن داده‌ی فعلی» در بازیابی بکاپ قدیمی/بخشی */
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
  teacherPayout: "واریزی استاد",
  enrollment: "ثبت‌نام",
  installment: "قسط",
  installmentPayment: "تلاش پرداخت قسط",
  attendanceSession: "جلسه حضور و غیاب",
  attendanceRecord: "ردیف حضور و غیاب",
  smsLog: "گزارش پیامک",
  chatConversation: "گفتگو",
  chatMessage: "پیام چت",
  chatWelcomeLog: "لاگ خوش‌آمدگویی",
  uploadedFile: "فایل گالری",
  classRoom: "کلاس حضوری",
  classMembership: "عضو کلاس",
  liveStream: "کلاس آنلاین",
  streamInvitation: "دعوت استریم",
  streamParticipant: "حضور شرکت‌کننده",
  homepageSection: "نمایش صفحه اول",
  heroAnimation: "انیمیشن هیرو",
};

/** کارت بخش‌های بکاپ — محتوا و ظاهر هر بخش دانلود جداگانه */
interface SectionCard {
  key: string;
  title: string;
  /** عنوان در فهرست «محدوده‌ی بازیابی» */
  scopeLabel: string;
  description: string;
  icon: LucideIcon;
  /** کلاس کاشی آیکون رنگی بخش */
  tile: string;
  /** شمارنده‌های جدول‌های بخش (کلید جدول + برچسب کوتاه) */
  chips: { key: string; label: string }[];
  /** آیا ZIP معنی دارد (بخش کاربران فایل آپلودی ندارد) */
  allowZip: boolean;
}

const SECTION_CARDS: SectionCard[] = [
  {
    key: "courses",
    title: "دوره‌ها",
    scopeLabel: "فقط دوره‌ها و آزمون‌ها",
    description:
      "دوره‌ها، گروه‌های زمان‌بندی، قالب اقساط و آزمون‌ها با سؤال‌هایشان",
    icon: GraduationCap,
    tile: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
    chips: [
      { key: "course", label: "دوره" },
      { key: "courseGroup", label: "گروه" },
      { key: "courseInstallment", label: "قالب اقساط" },
      { key: "exam", label: "آزمون" },
      { key: "examQuestion", label: "سؤال" },
    ],
    allowZip: true,
  },
  {
    key: "videos",
    title: "ویدئوها",
    scopeLabel: "فقط ویدئوها",
    description:
      "لیست‌های پخش و ویدئوهای آموزشی — در حالت ZIP، فایل‌های ویدئویی آپلودی هم داخل بسته می‌آیند",
    icon: MonitorPlay,
    tile: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    chips: [
      { key: "playlist", label: "لیست پخش" },
      { key: "video", label: "ویدئو" },
    ],
    allowZip: true,
  },
  {
    key: "users",
    title: "کاربران",
    scopeLabel: "فقط کاربران و واریزی‌های استادها",
    description:
      "حساب‌های کاربران سایت و واریزی‌های درآمد استادها — بدون نشست‌های ورود و کدهای یک‌بارمصرف",
    icon: Users,
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    chips: [
      { key: "user", label: "کاربر" },
      { key: "teacherPayout", label: "واریزی استاد" },
    ],
    allowZip: false,
  },
  {
    key: "sampleQuestions",
    title: "نمونه‌سؤال‌ها",
    scopeLabel: "فقط نمونه‌سؤال‌ها",
    description:
      "دسته‌بندی‌ها و فایل‌های نمونه‌سؤال (تصویر / PDF / ویدئو)",
    icon: FileQuestion,
    tile: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
    chips: [
      { key: "sampleQuestionCategory", label: "دسته" },
      { key: "sampleQuestion", label: "نمونه‌سؤال" },
    ],
    allowZip: true,
  },
  {
    key: "certificates",
    title: "گواهی‌نامه‌ها",
    scopeLabel: "فقط گواهی‌نامه‌ها",
    description:
      "گواهی‌نامه‌های صادرشده برای کاربران، به همراه فایل‌هایشان",
    icon: Award,
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    chips: [{ key: "certificate", label: "گواهی‌نامه" }],
    allowZip: true,
  },
  {
    key: "pages",
    title: "صفحات و ظاهر سایت",
    scopeLabel: "فقط صفحات و ظاهر سایت",
    description:
      "تنظیمات سایت، متن‌های ویرایشگر مدادی، فونت‌ها، لینک‌های هدر/فوتر، نظرات کاربران و نمایش/مخفی‌سازی سکشن‌ها و انیمیشن‌های هیرو",
    icon: PanelTop,
    tile: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
    chips: [
      { key: "siteSettings", label: "تنظیمات" },
      { key: "siteText", label: "متن" },
      { key: "navLink", label: "لینک" },
      { key: "installedFont", label: "فونت" },
      { key: "testimonial", label: "نظر" },
      { key: "homepageSection", label: "سکشن صفحه اول" },
      { key: "heroAnimation", label: "انیمیشن" },
    ],
    allowZip: true,
  },
];

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
  /** محدوده‌ی بازیابی: همه‌ی بخش‌های فایل یا فقط یک بخش مشخص */
  const [scope, setScope] = useState<string>("all");
  /** فهرست «از دست رفتن داده‌ی فعلی» هنگام بازیابی بکاپ قدیمی/بخشی */
  const [losses, setLosses] = useState<DataLossItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* — در دسترس‌بودن فایل ZIP پروژه (public/Download/avid-latest.zip) —
     در محیط توسعه/سندباکس موجود است؛ روی برخی استقرارها ممکن است نباشد — */
  const [zipAvailable, setZipAvailable] = useState<boolean | null>(null);

  /* — توزیع اپلیکیشن سایت (بخش «نصب برای کاربران») —
     آدرس فعال و نام سایت برای فایل نصبی و کارت‌های QR — */
  const [distInfo, setDistInfo] = useState<{
    siteUrl: string;
    siteName: string;
  } | null>(null);
  /** کارت‌های QR اندروید/iOS برای نمایش درون‌پنلی (SVG تولیدی خود API) */
  const [qrAndroid, setQrAndroid] = useState<string | null>(null);
  const [qrIos, setQrIos] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/distribution?platform=info", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setDistInfo({ siteUrl: j.siteUrl, siteName: j.siteName });
      })
      .catch(() => {});
    fetch("/api/admin/distribution?platform=android&display=inline", {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.text() : null))
      .then((s) => {
        if (!cancelled && s && s.trim().startsWith("<svg")) setQrAndroid(s);
      })
      .catch(() => {});
    fetch("/api/admin/distribution?platform=ios&display=inline", {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.text() : null))
      .then((s) => {
        if (!cancelled && s && s.trim().startsWith("<svg")) setQrIos(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
      غایب از فایل بکاپ قدیمی (آزمون‌ها/نمونه‌سؤال‌ها/گواهی‌نامه‌ها و…) */
  async function runImport(force = false) {
    if (!file || importing) return;
    setImporting(true);
    try {
      // formData — بدون Content-Type دستی (مرزبند multipart خودکار)
      const form = new FormData();
      form.append("file", file);
      if (force) form.append("force", "1");
      // محدوده‌ی بازیابی: فقط جدول‌های بخش انتخابی از فایل جایگزین شود
      if (scope !== "all") form.append("section", scope);
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
        // بکاپ قدیمی/بخشی فاقد بخش‌های در خطر — تأیید صریح لازم است
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
      // پیام‌های چندخطی (مثل خطای کلید خارجی): خط اول عنوان، باقی توضیح
      const message =
        error instanceof Error ? error.message : "خطا در بازیابی بکاپ.";
      const [head, ...rest] = message.split("\n");
      toast.error(head, {
        description:
          rest.length > 0 ? rest.join(" — ") : undefined,
      });
      setImporting(false);
    }
  }

  /** کاشی آمار برای کارت «کل سایت» */
  const statTiles = useMemo(() => {
    if (!summary) return [];
    const c = summary.counts ?? {};
    return [
      { label: "کاربران", value: c.user ?? 0 },
      { label: "ثبت‌نام‌ها", value: c.enrollment ?? 0 },
      { label: "دوره‌ها", value: c.course ?? 0 },
      { label: "ویدئوها", value: c.video ?? 0 },
      { label: "کلاس‌ها", value: c.classRoom ?? 0 },
      { label: "کلاس‌های آنلاین", value: c.liveStream ?? 0 },
      { label: "واریزی‌های استاد", value: c.teacherPayout ?? 0 },
      { label: "فایل‌های آپلودی", value: summary.uploads.files },
    ].map((t) => ({ ...t, display: faDigits(t.value) }));
  }, [summary]);

  /** شمارنده‌های یک بخش از آمار خلاصه */
  function sectionChips(card: SectionCard) {
    if (!summary) return null;
    const c = summary.counts ?? {};
    const visible = card.chips.filter((chip) => (c[chip.key] ?? 0) > 0);
    if (visible.length === 0) {
      return (
        <span className="rounded-lg bg-foreground/[0.05] px-2 py-1 text-[0.65rem] font-bold text-muted-foreground">
          بدون داده
        </span>
      );
    }
    return visible.map((chip) => (
      <span
        key={chip.key}
        className="rounded-lg bg-foreground/[0.05] px-2 py-1 text-[0.65rem] font-bold text-foreground/80"
      >
        {faDigits(c[chip.key] ?? 0)} {chip.label}
      </span>
    ));
  }

  const scopeCard = SECTION_CARDS.find((c) => c.key === scope);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="بکاپ و بازیابی"
        description="دانلود بکاپ هر بخش به‌تنهایی یا کل سایت، و بازیابی از فایل بکاپ — کامل یا فقط یک بخش"
      >
        <span className={`flex size-10 items-center justify-center rounded-xl ${tileGradient} shadow-lg shadow-teal-500/20`}>
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
              دانلود بکاپ — کل سایت یا فقط یک بخش
            </h2>
            <p className="text-xs leading-6 text-muted-foreground">
              هر بخش را جداگانه بکاپ بگیرید (JSON فقط داده‌ها؛ ZIP شامل
              فایل‌های آپلودی همان بخش هم هست) — و بعداً می‌توانید فقط همان
              بخش را بازیابی کنید. جداولی مثل ثبت‌نام‌ها، اقساط و حضور و غیاب
              که بین چند بخش مشترک‌اند فقط در بکاپ «کل سایت» می‌آیند.
            </p>
          </div>
        </div>

        {/* ——— کارت‌های بخش‌ها + کارت کل سایت ——— */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SECTION_CARDS.map((card) => (
            <article
              key={card.key}
              className="glass flex flex-col gap-3 rounded-2xl p-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${card.tile}`}
                >
                  <card.icon className="size-5" strokeWidth={1.9} />
                </span>
                <h3 className="min-w-0 text-sm font-black leading-5 text-foreground">
                  {card.title}
                </h3>
              </div>
              <p className="text-[0.7rem] leading-5 text-muted-foreground">
                {card.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <span
                      key={i}
                      className="h-6.5 w-14 animate-pulse rounded-lg bg-foreground/[0.06]"
                    />
                  ))
                ) : (
                  sectionChips(card)
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={`/api/admin/backup?mode=json&section=${card.key}`}
                  download
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-foreground/15 bg-foreground/[0.03] px-3 text-xs font-bold text-foreground transition-all hover:bg-foreground/[0.07]"
                >
                  <FileJson className="size-3.5 text-teal-600 dark:text-teal-300" />
                  بکاپ داده‌ها (JSON)
                </a>
                {card.allowZip ? (
                  <a
                    href={`/api/admin/backup?mode=zip&section=${card.key}`}
                    download
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-teal-600/40 bg-teal-500/10 px-3 text-xs font-bold text-teal-700 transition-all hover:bg-teal-500/20 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-300 dark:hover:bg-teal-400/20"
                  >
                    <FileArchive className="size-3.5" />
                    بکاپ کامل (ZIP)
                  </a>
                ) : (
                  <span className="max-w-full text-[0.65rem] leading-5 text-muted-foreground">
                    این بخش فایل آپلودی ندارد — بکاپ JSON کافی است
                  </span>
                )}
              </div>
            </article>
          ))}

          {/* ——— کارت کل سایت (گسترده) ——— */}
          <article className="glass col-span-full space-y-5 rounded-2xl border border-teal-600/25 bg-gradient-to-l from-teal-500/[0.07] via-transparent to-emerald-500/[0.07] p-5 sm:p-6 dark:border-teal-400/25">
            <div className="flex items-center gap-3">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tileGradient} shadow-lg shadow-teal-500/20`}>
                <DatabaseBackup className="size-5 text-white" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-foreground">
                  کل سایت (بکاپ کامل)
                </h3>
                <p className="text-xs leading-6 text-muted-foreground">
                  همه‌ی داده‌های دیتابیس (کاربران، ثبت‌نام‌ها، دوره‌ها،
                  ویدئوها، اقساط، آزمون‌ها و سؤال‌ها و پاسخ‌ها،
                  نمونه‌سؤال‌ها، گواهی‌نامه‌ها، واریزی‌های درآمد استادها،
                  کلاس‌های حضوری و اعضایشان، کلاس‌های آنلاین با دعوت‌ها و
                  حضور شرکت‌کنندگان، نمایش صفحه‌ی اول و انیمیشن‌ها،
                  تنظیمات و…) و در حالت ZIP، همه‌ی فایل‌های آپلودی
                  (تصاویر، ویدئوها، فونت‌ها) داخل بسته.
                </p>
              </div>
            </div>

            {/* آمار محتوای فعلی */}
            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-xl bg-foreground/[0.04]"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
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
          </article>
        </div>
      </section>

      {/* ————— توزیع اپلیکیشن سایت (نصب روی دستگاه کاربران) ————— */}
      <section className="glass space-y-5 rounded-2xl border-teal-500/30 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10">
            <Smartphone className="size-5 text-teal-600 dark:text-teal-300" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-foreground">
              توزیع اپلیکیشن سایت — نصب برای کاربران
            </h2>
            <p className="text-xs leading-6 text-muted-foreground">
              فایل نصبی ویندوز، کارت نصب اندروید و iOS و بسته‌ی وب‌اپلیکیشن را
              دانلود و در اختیار کاربران بگذارید — هر کدام با آدرس فعلی سایت
              ساخته می‌شود.
              {distInfo ? (
                <>
                  {" "}
                  آدرس فعال:{" "}
                  <span dir="ltr" className="font-bold text-foreground/80">
                    {distInfo.siteUrl}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* — ویندوز — */}
          <div className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10">
                <Monitor className="size-5 text-sky-600 dark:text-sky-300" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground">
                  فایل نصبی ویندوز (‎.cmd)
                </p>
                <p className="text-[0.65rem] leading-5 text-muted-foreground">
                  اجرای فایل روی ویندوز: میان‌بر دسکتاپ + منوی Start می‌سازد و
                  سایت در پنجره‌ی اپ مستقل (Edge/Chrome) باز می‌شود.
                </p>
              </div>
            </div>
            <a
              href="/api/admin/distribution?platform=windows"
              download
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sky-600/40 bg-sky-500/10 px-4 text-xs font-bold text-sky-700 transition-all hover:bg-sky-500/20 dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-sky-300 dark:hover:bg-sky-400/20"
            >
              <FolderDown className="size-4" />
              دانلود فایل نصبی ویندوز
            </a>
            <p className="text-[0.65rem] leading-5 text-muted-foreground">
              فایل را برای کاربران ارسال کنید — اجرا با دابل‌کلیک؛ نیازی به
              نصب‌کننده‌ی اضافه ندارد (Edge یا Chrome باید موجود باشد). راه
              جایگزین: در منوی مرورگر دسکتاپ «نصب اپلیکیشن» (Install app) را
              بزنند.
            </p>
          </div>

          {/* — اندروید — */}
          <div className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                <Smartphone className="size-5 text-emerald-600 dark:text-emerald-300" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground">
                  اپ اندروید — نصب از وب (PWA)
                </p>
                <p className="text-[0.65rem] leading-5 text-muted-foreground">
                  کارت QR را به کاربران بدهید: اسکن → باز شدن در کروم → منوی ⋮ →
                  «نصب اپلیکیشن» — آیکون لانچر و پنجره‌ی مستقل ساخته می‌شود.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex size-[104px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-foreground/10 bg-white p-1.5 dark:border-white/10">
                {qrAndroid ? (
                  <span
                    className="qr-inline [&>svg]:size-full"
                    dangerouslySetInnerHTML={{ __html: qrAndroid }}
                  />
                ) : (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                )}
              </span>
              <a
                href="/api/admin/distribution?platform=android"
                download
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-4 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-500/20 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/20"
              >
                <FolderDown className="size-4" />
                دانلود کارت نصب (SVG)
              </a>
            </div>
          </div>

          {/* — iOS — */}
          <div className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-500/10">
                <Apple className="size-5 text-zinc-700 dark:text-zinc-300" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground">
                  وب‌اپ iOS — Add to Home Screen
                </p>
                <p className="text-[0.65rem] leading-5 text-muted-foreground">
                  کارت QR را به کاربران iPhone بدهید: اسکن → باز شدن در Safari →
                  Share → «Add to Home Screen» — وب‌اپ تمام‌صفحه با آیکون.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex size-[104px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-foreground/10 bg-white p-1.5 dark:border-white/10">
                {qrIos ? (
                  <span
                    className="qr-inline [&>svg]:size-full"
                    dangerouslySetInnerHTML={{ __html: qrIos }}
                  />
                ) : (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                )}
              </span>
              <a
                href="/api/admin/distribution?platform=ios"
                download
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-500/40 bg-zinc-500/10 px-4 text-xs font-bold text-zinc-700 transition-all hover:bg-zinc-500/20 dark:border-zinc-400/40 dark:bg-zinc-400/10 dark:text-zinc-300 dark:hover:bg-zinc-400/20"
              >
                <FolderDown className="size-4" />
                دانلود کارت نصب (SVG)
              </a>
            </div>
          </div>

          {/* — نسخه وب — */}
          <div className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10">
                <Globe className="size-5 text-teal-600 dark:text-teal-300" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground">
                  وب‌اپلیکیشن سایت — بسته‌ی کامل (ZIP)
                </p>
                <p className="text-[0.65rem] leading-5 text-muted-foreground">
                  بسته‌ی کامل و کم‌حجم کدهای سایت (آماده‌ی استقرار/به‌روزرسانی
                  روی سرور) — شامل مانیفست PWA و آیکون‌های نصب.
                </p>
              </div>
            </div>
            {zipAvailable === null ? (
              <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-foreground/15 px-4 text-xs font-bold text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                در حال بررسی…
              </span>
            ) : zipAvailable ? (
              <a
                href="/Download/avid-latest.zip"
                download
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-teal-600/40 bg-teal-500/10 px-4 text-xs font-bold text-teal-700 transition-all hover:bg-teal-500/20 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-300 dark:hover:bg-teal-400/20"
              >
                <FolderDown className="size-4" />
                دانلود نسخه‌ی وب (ZIP)
              </a>
            ) : (
              <span className="text-[0.65rem] leading-5 text-muted-foreground">
                فایل ZIP روی این سرور قرار ندارد — از محیط توسعه/ریپو اصلی قابل
                دریافت است.
              </span>
            )}
          </div>
        </div>
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
              بازیابی‌شده با محتوای فایل جایگزین می‌شود؛ بقیه‌ی بخش‌ها دست‌نخورده
              می‌مانند و اگر بازیابی، داده‌ی فعلی‌شان را تهدید کند پیش از ادامه
              تأیید می‌گیریم. حداکثر حجم ۵۱۲ مگابایت.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
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

          <div className="space-y-2">
            <label
              htmlFor="backup-scope"
              className="text-sm font-bold text-foreground/90"
            >
              محدوده‌ی بازیابی
            </label>
            <Select
              value={scope}
              onValueChange={setScope}
              disabled={importing}
            >
              <SelectTrigger
                id="backup-scope"
                className="h-12 w-full rounded-xl"
                aria-describedby="backup-scope-help"
              >
                <SelectValue placeholder="همه بخش‌های موجود در فایل" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">
                  همه بخش‌های موجود در فایل
                </SelectItem>
                {SECTION_CARDS.map((card) => (
                  <SelectItem key={card.key} value={card.key}>
                    {card.scopeLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p
              id="backup-scope-help"
              className="text-[0.7rem] leading-6 text-muted-foreground"
            >
              «همه بخش‌های موجود در فایل» یعنی هر جدولی که در فایل بکاپ هست
              با محتوای آن جایگزین می‌شود (رفتار همیشگی). با انتخاب یک بخش،
              فقط جدول‌های همان بخش از فایل بازیابی می‌شود و بقیه‌ی داده‌های
              سایت دست‌نخورده می‌ماند — مثلاً از یک بکاپ کامل می‌توان فقط
              ویدئوها یا فقط کاربران را برگرداند.
            </p>
          </div>
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
                {scopeCard
                  ? `بازیابی فقط بخش «${scopeCard.title}» از این فایل؟`
                  : "بازیابی بکاپ و جایگزینی همه‌ی داده‌ها؟"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {scopeCard
                  ? `فقط جدول‌های بخش «${scopeCard.title}» با محتوای فایل بکاپ جایگزین می‌شود؛ داده‌های سایر بخش‌های سایت دست‌نخورده می‌ماند. این عمل قابل بازگشت نیست — پیش از ادامه، یک بکاپ تازه دانلود کنید. حساب مدیر و نشست ورود شما دست‌نخورده می‌ماند.`
                  : `داده‌های محتواییِ جدول‌های موجود در فایل (کاربران، ثبت‌نام‌ها، دوره‌ها، ویدئوها، اقساط، آزمون‌ها، گواهی‌نامه‌ها، تنظیمات و…) با محتوای فایل بکاپ جایگزین می‌شود. این عمل قابل بازگشت نیست — پیش از ادامه، یک بکاپ تازه دانلود کنید. حساب مدیر و نشست ورود شما دست‌نخورده می‌ماند.`}
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

        {/* — تأیید صریحِ از دست رفتن داده‌ی فعلی (بکاپ قدیمی/بخشی فاقد
            بخش‌هایی که با حذف والد‌ها در خطر می‌افتند) — */}
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
                این بازیابی، داده‌های فعلی را پاک یا قطع‌پیوند می‌کند
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-right">
                  <p className="text-xs leading-6">
                    این فایل (یا محدوده‌ی انتخابی شما) بخش‌های زیر را
                    بازیابی نمی‌کند؛ با جایگزینی والد‌هایشان، داده‌ی فعلیِ
                    این بخش‌ها پاک (یا پیوندشان قطع) می‌شود:
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
                    راه دور: بخش والد مربوطه را هم در همین فایل بازیابی کنید،
                    یا محدوده‌ی بازیابی را تغییر دهید. اگر نمی‌خواهید این
                    داده‌ها از بین بروند، انصراف کنید و ابتدا از وضعیت فعلی
                    بکاپ بگیرید. ادامه دادن یعنی تأیید صریح حذف این داده‌ها.
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
