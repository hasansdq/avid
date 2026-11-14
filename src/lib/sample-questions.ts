import {
  BookOpen,
  Bot,
  Brain,
  Calculator,
  ChartColumnBig,
  Code,
  Database,
  FileQuestion,
  FileSpreadsheet,
  Languages,
  Microscope,
  Palette,
  PenTool,
  Presentation,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  رجیستری آیکون‌های دسته‌بندی نمونه سوالات                            */
/*  کلید ذخیره‌شده در SampleQuestionCategory.icon → کامپوننت lucide    */
/* ------------------------------------------------------------------ */

export const SAMPLE_QUESTION_ICONS = {
  BookOpen,
  FileQuestion,
  Brain,
  Bot,
  Calculator,
  Code,
  Terminal,
  Database,
  Microscope,
  Languages,
  Palette,
  PenTool,
  Presentation,
  ChartColumnBig,
  ShieldCheck,
  Users,
  FileSpreadsheet,
  Sparkles,
} as const;

export type SampleQuestionIconName = keyof typeof SAMPLE_QUESTION_ICONS;

const ICON_SET = new Set(Object.keys(SAMPLE_QUESTION_ICONS));

/** آیکونِ دسته از کلید ذخیره‌شده — نامعتبر → FileQuestion */
export function getSampleQuestionIcon(name: string): LucideIcon {
  return (
    (SAMPLE_QUESTION_ICONS as Record<string, LucideIcon | undefined>)[name] ??
    FileQuestion
  );
}

/** کلید آیکون معتبر است؟ — برای اعتبارسنجی سمت API */
export function isSampleQuestionIcon(name: string): boolean {
  return ICON_SET.has(name);
}

/** گزینه‌های انتخاب آیکون در پنل مدیر */
export const SAMPLE_QUESTION_ICON_OPTIONS: { value: string; label: string }[] = (
  Object.keys(SAMPLE_QUESTION_ICONS) as SampleQuestionIconName[]
).map((key) => ({ value: key, label: key }));

/* ------------------------------------------------------------------ */
/*  نوع فایل نمونه سوال — تصویر / PDF / ویدئو                          */
/* ------------------------------------------------------------------ */

export type SampleQuestionKind = "image" | "pdf" | "video" | "other";

/** فرمت‌های مجاز بارگذاری نمونه سوال + برچسب فارسی */
export const SAMPLE_QUESTION_KIND_INFO: Record<
  SampleQuestionKind,
  { label: string; badge: string }
> = {
  image: {
    label: "تصویر",
    badge:
      "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  pdf: {
    label: "PDF",
    badge:
      "border-rose-600/25 bg-rose-500/10 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300",
  },
  video: {
    label: "ویدئو",
    badge:
      "border-violet-600/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
  },
  other: {
    label: "فایل",
    badge:
      "border-foreground/15 bg-foreground/[0.05] text-muted-foreground dark:border-white/15 dark:bg-white/[0.05]",
  },
};

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"];
const PDF_EXTS = ["pdf"];
const VIDEO_EXTS = ["mp4", "webm", "ogv", "ogg", "mov", "m4v", "mkv"];

/** تعیین نوع فایل از روی پسوند */
export function sampleQuestionKindOfExt(extRaw: string): SampleQuestionKind {
  const ext = extRaw.toLowerCase().replace(/^\./, "");
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (PDF_EXTS.includes(ext)) return "pdf";
  if (VIDEO_EXTS.includes(ext)) return "video";
  return "other";
}

/** فرمت‌های مجاز آپلود نمونه سوال — برای accept فایل‌اینپوت */
export const SAMPLE_QUESTION_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/ogg,video/quicktime,.png,.jpg,.jpeg,.webp,.gif,.pdf,.mp4,.webm,.ogv,.mov";

/** پوشه‌ی ذخیره‌ی فایل‌های نمونه سوال در public/uploads */
export const SAMPLE_QUESTIONS_DIR_NAME = "sample-questions";

/** کلید بخش گالری برای فایل‌های نمونه سوال */
export const SAMPLE_QUESTIONS_GALLERY_SECTION = "sampleQuestions";
