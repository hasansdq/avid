import {
  AppWindow,
  BookOpen,
  Bot,
  Braces,
  Brain,
  Calculator,
  ChartColumnBig,
  Code,
  Code2,
  Database,
  Dna,
  FileCode2,
  FileQuestion,
  FileSpreadsheet,
  FlaskConical,
  Globe,
  Languages,
  LayoutTemplate,
  Monitor,
  Microscope,
  Palette,
  PenTool,
  Presentation,
  ShieldCheck,
  Sigma,
  Smartphone,
  Sparkles,
  SquarePen,
  Table,
  Terminal,
  Users,
  Atom,
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
  Code2,
  Terminal,
  FileCode2,
  Braces,
  Database,
  Microscope,
  FlaskConical,
  Sigma,
  Atom,
  Dna,
  Monitor,
  Languages,
  Palette,
  PenTool,
  Presentation,
  ChartColumnBig,
  ShieldCheck,
  Users,
  FileSpreadsheet,
  Table,
  SquarePen,
  Globe,
  Smartphone,
  LayoutTemplate,
  AppWindow,
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

/** برچسب فارسی آیکون‌ها — انتخابگر پنل مدیر */
const ICON_FA_LABELS: Record<string, string> = {
  BookOpen: "عمومی / کتاب",
  FileQuestion: "سوال",
  Brain: "مغز / تمرکز",
  Bot: "هوش مصنوعی",
  Calculator: "ماشین حساب",
  Code: "کد",
  Code2: "برنامه نویسی",
  Terminal: "ترمینال",
  FileCode2: "پایتون",
  Braces: "سینتکس",
  Database: "اکسس / پایگاه داده",
  Microscope: "علوم تجربی",
  FlaskConical: "شیمی",
  Sigma: "ریاضی",
  Atom: "فیزیک",
  Dna: "زیست شناسی",
  Monitor: "کامپیوتر",
  Languages: "زبان",
  Palette: "فتوشاپ / طراحی",
  PenTool: "تولید محتوا",
  Presentation: "پاورپوینت / ارائه",
  ChartColumnBig: "آمار / نمودار",
  ShieldCheck: "امنیت",
  Users: "کاربران / عمومی",
  FileSpreadsheet: "اکسل / صفحه گسترده",
  Table: "جدول / اکسل",
  SquarePen: "ورد / نگارش",
  Globe: "اینترنت",
  Smartphone: "اپلیکیشن موبایل",
  LayoutTemplate: "طراحی سایت",
  AppWindow: "رابط کاربری",
  Sparkles: "ایده / خلاقیت",
};

/** گزینه‌های انتخاب آیکون در پنل مدیر */
export const SAMPLE_QUESTION_ICON_OPTIONS: { value: string; label: string }[] = (
  Object.keys(SAMPLE_QUESTION_ICONS) as SampleQuestionIconName[]
).map((key) => ({ value: key, label: ICON_FA_LABELS[key] ?? key }));

/* ------------------------------------------------------------------ */
/*  تم‌های رنگی کارت‌های دسته‌بندی — پس‌زمینه‌ی «مرتبط با موضوع»          */
/*  هر کلید آیکون یک گرادیان از پالت مجاز سایت می‌گیرد                  */
/*  (فیروزه‌ای/زمرد/کهربایی/نارنجی/گلبهی/بنفش/فوشیا/لیمویی/فیروزه‌ای   */
/*  روشن/سنگی — بدون آبی و نیلی).                                       */
/* ------------------------------------------------------------------ */

export interface SampleCategoryTheme {
  /** کلاس‌های چیپ/برچسب کوچک */
  badge: string;
  /** گرادیان پس‌زمینه‌ی کارت مربعی (شامل bg-gradient-to-br) */
  gradient: string;
  /** رنگ حلقه/هاور متمرز */
  ring: string;
}

/** تم پیش‌فرض — لهجه‌ی کهربایی/نارنجیِ بخش نمونه سوالات سایت */
const DEFAULT_CATEGORY_THEME: SampleCategoryTheme = {
  badge:
    "border-orange-600/25 bg-orange-500/10 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300",
  gradient: "bg-gradient-to-br from-orange-400 to-amber-600",
  ring: "ring-orange-500/60 hover:ring-orange-400/70",
};

/** نقشه‌ی کلید آیکون → تم رنگی کارت (پس‌زمینه‌ی مرتبط با موضوع) */
export const SAMPLE_CATEGORY_THEMES: Record<string, SampleCategoryTheme> = {
  // — شیمی: شیشه‌ی آزمایش زمردی —
  FlaskConical: {
    badge:
      "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    gradient: "bg-gradient-to-br from-emerald-400 to-teal-600",
    ring: "ring-emerald-500/60 hover:ring-emerald-400/70",
  },
  // — ریاضی: کهربایی —
  Sigma: {
    badge:
      "border-amber-600/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
    gradient: "bg-gradient-to-br from-amber-400 to-orange-600",
    ring: "ring-amber-500/60 hover:ring-amber-400/70",
  },
  // — علوم تجربی: فیروزه‌ای —
  Microscope: {
    badge:
      "border-teal-600/25 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300",
    gradient: "bg-gradient-to-br from-teal-400 to-emerald-500",
    ring: "ring-teal-500/60 hover:ring-teal-400/70",
  },
  // — فیزیک: فیروزه‌ای روشن —
  Atom: {
    badge:
      "border-cyan-600/25 bg-cyan-500/10 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-300",
    gradient: "bg-gradient-to-br from-cyan-400 to-teal-600",
    ring: "ring-cyan-500/60 hover:ring-cyan-400/70",
  },
  // — زیست شناسی: لیمویی —
  Dna: {
    badge:
      "border-lime-600/25 bg-lime-500/10 text-lime-700 dark:border-lime-400/25 dark:bg-lime-400/10 dark:text-lime-300",
    gradient: "bg-gradient-to-br from-lime-400 to-emerald-600",
    ring: "ring-lime-500/60 hover:ring-lime-400/70",
  },
  // — کامپیوتر: فیروزه‌ای عمیق —
  Monitor: {
    badge:
      "border-teal-600/25 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300",
    gradient: "bg-gradient-to-br from-teal-500 to-emerald-700",
    ring: "ring-teal-600/60 hover:ring-teal-500/70",
  },
  // — برنامه نویسی: بنفش —
  Code2: {
    badge:
      "border-violet-600/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
    gradient: "bg-gradient-to-br from-violet-500 to-fuchsia-700",
    ring: "ring-violet-500/60 hover:ring-violet-400/70",
  },
  Code: {
    badge:
      "border-violet-600/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
    gradient: "bg-gradient-to-br from-violet-500 to-fuchsia-700",
    ring: "ring-violet-500/60 hover:ring-violet-400/70",
  },
  Braces: {
    badge:
      "border-violet-600/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
    gradient: "bg-gradient-to-br from-violet-500 to-fuchsia-700",
    ring: "ring-violet-500/60 hover:ring-violet-400/70",
  },
  // — پایتون: زمرد عمیق —
  FileCode2: {
    badge:
      "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    gradient: "bg-gradient-to-br from-emerald-500 to-teal-800",
    ring: "ring-emerald-600/60 hover:ring-emerald-500/70",
  },
  Terminal: {
    badge:
      "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    gradient: "bg-gradient-to-br from-emerald-500 to-teal-800",
    ring: "ring-emerald-600/60 hover:ring-emerald-500/70",
  },
  // — هوش مصنوعی: فوشیا —
  Bot: {
    badge:
      "border-fuchsia-600/25 bg-fuchsia-500/10 text-fuchsia-700 dark:border-fuchsia-400/25 dark:bg-fuchsia-400/10 dark:text-fuchsia-300",
    gradient: "bg-gradient-to-br from-fuchsia-500 to-rose-600",
    ring: "ring-fuchsia-500/60 hover:ring-fuchsia-400/70",
  },
  Brain: {
    badge:
      "border-fuchsia-600/25 bg-fuchsia-500/10 text-fuchsia-700 dark:border-fuchsia-400/25 dark:bg-fuchsia-400/10 dark:text-fuchsia-300",
    gradient: "bg-gradient-to-br from-fuchsia-500 to-rose-600",
    ring: "ring-fuchsia-500/60 hover:ring-fuchsia-400/70",
  },
  Sparkles: {
    badge:
      "border-fuchsia-600/25 bg-fuchsia-500/10 text-fuchsia-700 dark:border-fuchsia-400/25 dark:bg-fuchsia-400/10 dark:text-fuchsia-300",
    gradient: "bg-gradient-to-br from-fuchsia-500 to-rose-600",
    ring: "ring-fuchsia-500/60 hover:ring-fuchsia-400/70",
  },
  // — ورد: سنگی/خنثی (اپ‌های آفیس) —
  SquarePen: {
    badge:
      "border-stone-600/25 bg-stone-500/10 text-stone-700 dark:border-stone-400/25 dark:bg-stone-400/10 dark:text-stone-300",
    gradient: "bg-gradient-to-br from-stone-400 to-stone-600",
    ring: "ring-stone-500/60 hover:ring-stone-400/70",
  },
  // — اکسل: لیمویی/زمرد —
  Table: {
    badge:
      "border-lime-600/25 bg-lime-500/10 text-lime-700 dark:border-lime-400/25 dark:bg-lime-400/10 dark:text-lime-300",
    gradient: "bg-gradient-to-br from-emerald-500 to-lime-600",
    ring: "ring-lime-600/60 hover:ring-lime-500/70",
  },
  FileSpreadsheet: {
    badge:
      "border-lime-600/25 bg-lime-500/10 text-lime-700 dark:border-lime-400/25 dark:bg-lime-400/10 dark:text-lime-300",
    gradient: "bg-gradient-to-br from-emerald-500 to-lime-600",
    ring: "ring-lime-600/60 hover:ring-lime-500/70",
  },
  // — پاورپوینت: نارنجی —
  Presentation: {
    badge:
      "border-orange-600/25 bg-orange-500/10 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300",
    gradient: "bg-gradient-to-br from-orange-400 to-amber-600",
    ring: "ring-orange-500/60 hover:ring-orange-400/70",
  },
  // — اکسس: گلبهی —
  Database: {
    badge:
      "border-rose-600/25 bg-rose-500/10 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300",
    gradient: "bg-gradient-to-br from-rose-500 to-rose-800",
    ring: "ring-rose-500/60 hover:ring-rose-400/70",
  },
  // — فتوشاپ: گلبهی/بنفش (طراحی) —
  Palette: {
    badge:
      "border-rose-600/25 bg-rose-500/10 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300",
    gradient: "bg-gradient-to-br from-rose-400 to-violet-600",
    ring: "ring-rose-500/60 hover:ring-rose-400/70",
  },
  // — اینترنت: فیروزه‌ای روشن/زمرد —
  Globe: {
    badge:
      "border-cyan-600/25 bg-cyan-500/10 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-300",
    gradient: "bg-gradient-to-br from-cyan-400 to-emerald-600",
    ring: "ring-cyan-500/60 hover:ring-cyan-400/70",
  },
  // — تولید محتوا: کهربایی/گلبهی —
  PenTool: {
    badge:
      "border-amber-600/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
    gradient: "bg-gradient-to-br from-amber-500 to-rose-600",
    ring: "ring-amber-500/60 hover:ring-amber-400/70",
  },
  // — طراحی سایت: بنفش/فوشیا —
  LayoutTemplate: {
    badge:
      "border-violet-600/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
    gradient: "bg-gradient-to-br from-violet-400 to-fuchsia-600",
    ring: "ring-violet-500/60 hover:ring-violet-400/70",
  },
  AppWindow: {
    badge:
      "border-violet-600/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
    gradient: "bg-gradient-to-br from-violet-400 to-fuchsia-600",
    ring: "ring-violet-500/60 hover:ring-violet-400/70",
  },
  // — طراحی اپلیکیشن: گلبهی/فوشیا —
  Smartphone: {
    badge:
      "border-rose-600/25 bg-rose-500/10 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300",
    gradient: "bg-gradient-to-br from-rose-400 to-fuchsia-600",
    ring: "ring-rose-500/60 hover:ring-rose-400/70",
  },
  // — ریاضی پایه/ماشین حساب: کهربایی روشن —
  Calculator: {
    badge:
      "border-amber-600/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
    gradient: "bg-gradient-to-br from-amber-400 to-teal-600",
    ring: "ring-amber-500/60 hover:ring-amber-400/70",
  },
  // — زبان/ترجمه: زمرد —
  Languages: {
    badge:
      "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    gradient: "bg-gradient-to-br from-teal-400 to-emerald-600",
    ring: "ring-teal-500/60 hover:ring-teal-400/70",
  },
  // — آمار: فیروزه‌ای/لیمویی —
  ChartColumnBig: {
    badge:
      "border-teal-600/25 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300",
    gradient: "bg-gradient-to-br from-teal-400 to-lime-600",
    ring: "ring-teal-500/60 hover:ring-teal-400/70",
  },
  // — امنیت: زمرد عمیق —
  ShieldCheck: {
    badge:
      "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    gradient: "bg-gradient-to-br from-emerald-500 to-teal-700",
    ring: "ring-emerald-500/60 hover:ring-emerald-400/70",
  },
  // — عمومی: کهربایی (پیش‌فرض بخش) —
  Users: {
    badge:
      "border-orange-600/25 bg-orange-500/10 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300",
    gradient: "bg-gradient-to-br from-amber-400 to-orange-600",
    ring: "ring-amber-500/60 hover:ring-amber-400/70",
  },
  BookOpen: {
    badge:
      "border-orange-600/25 bg-orange-500/10 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300",
    gradient: "bg-gradient-to-br from-amber-400 to-orange-600",
    ring: "ring-amber-500/60 hover:ring-amber-400/70",
  },
  FileQuestion: {
    badge:
      "border-orange-600/25 bg-orange-500/10 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300",
    gradient: "bg-gradient-to-br from-orange-400 to-amber-600",
    ring: "ring-orange-500/60 hover:ring-orange-400/70",
  },
};

/** تم رنگی دسته از کلید آیکون — نامعلوم → تم کهربایی پیش‌فرض */
export function getSampleQuestionTheme(iconKey: string): SampleCategoryTheme {
  return SAMPLE_CATEGORY_THEMES[iconKey] ?? DEFAULT_CATEGORY_THEME;
}

/** فهرست تم‌های موجود برای انتخابگر مدیر (آیکون مرتبط = پس‌زمینه مرتبط) */
export const SAMPLE_CATEGORY_THEME_OPTIONS: {
  value: string;
  label: string;
  gradient: string;
}[] = (Object.keys(SAMPLE_QUESTION_ICONS) as SampleQuestionIconName[])
  .filter((key) => SAMPLE_CATEGORY_THEMES[key])
  .map((key) => ({
    value: key,
    label: ICON_FA_LABELS[key] ?? key,
    gradient: SAMPLE_CATEGORY_THEMES[key].gradient,
  }));

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
