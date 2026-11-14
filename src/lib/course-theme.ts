import {
  Bot,
  Code,
  Gamepad2,
  Terminal,
  Palette,
  ShieldCheck,
  ChartColumnBig,
  TrendingUp,
  Brain,
  Cpu,
  Database,
  Cloud,
  Globe,
  Smartphone,
  Camera,
  Music,
  Languages,
  PenTool,
  Rocket,
  Sparkles,
  Users,
  Laptop,
  Presentation,
  Wrench,
  MessageCircle,
  BookOpen,
  Calculator,
  Microscope,
  Layers,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  رجیستری آیکون‌ها: کلید ذخیره‌شده در دیتابیس -> کامپوننت lucide    */
/*  (کلاس‌ها و آیکون‌ها باید در سورس حاضر باشند تا کامپایل شوند)      */
/* ------------------------------------------------------------------ */

export const COURSE_ICONS = {
  Bot,
  Code,
  Gamepad2,
  Terminal,
  Palette,
  ShieldCheck,
  ChartColumnBig,
  TrendingUp,
  Brain,
  Cpu,
  Database,
  Cloud,
  Globe,
  Smartphone,
  Camera,
  Music,
  Languages,
  PenTool,
  Rocket,
  Sparkles,
  Users,
  Laptop,
  Presentation,
  Wrench,
  MessageCircle,
  BookOpen,
  Calculator,
  Microscope,
} as const;

export type CourseIconName = keyof typeof COURSE_ICONS;

export function getCourseIcon(name: string): LucideIcon {
  return (COURSE_ICONS as Record<string, LucideIcon | undefined>)[name] ?? Sparkles;
}

export const COURSE_ICON_OPTIONS: { value: string; label: string }[] = (
  Object.keys(COURSE_ICONS) as CourseIconName[]
).map((key) => ({ value: key, label: key }));

/* ------------------------------------------------------------------ */
/*  رجیستری تم‌ها: کلید ذخیره‌شده در دیتابیس -> کلاس‌های tailwind      */
/* ------------------------------------------------------------------ */

export interface CourseTheme {
  label: string;
  tile: string; // گرادیان کاشی آیکون
  glow: string; // سایه هاور کارت
  text: string; // رنگ متن شاخص
  bar: string; // گرادیان نوار پیشرفت
  soft: string; // پس‌زمینه ملایم
  border: string; // بوردر ملایم
}

export const COURSE_THEMES: Record<string, CourseTheme> = {
  teal: {
    label: "فیروزه‌ای",
    tile: "from-teal-400 to-emerald-600",
    glow: "group-hover:shadow-teal-500/25",
    text: "text-teal-600 dark:text-teal-300",
    bar: "from-teal-400 to-emerald-500",
    soft: "bg-teal-500/10 dark:bg-teal-400/10",
    border: "border-teal-500/25 dark:border-teal-400/25",
  },
  emerald: {
    label: "زمردی",
    tile: "from-emerald-400 to-teal-600",
    glow: "group-hover:shadow-emerald-500/25",
    text: "text-emerald-600 dark:text-emerald-300",
    bar: "from-emerald-400 to-teal-500",
    soft: "bg-emerald-500/10 dark:bg-emerald-400/10",
    border: "border-emerald-500/25 dark:border-emerald-400/25",
  },
  violet: {
    label: "بنفش",
    tile: "from-violet-400 to-purple-600",
    glow: "group-hover:shadow-violet-500/25",
    text: "text-violet-600 dark:text-violet-300",
    bar: "from-violet-400 to-fuchsia-500",
    soft: "bg-violet-500/10 dark:bg-violet-400/10",
    border: "border-violet-500/25 dark:border-violet-400/25",
  },
  fuchsia: {
    label: "سرخابی",
    tile: "from-fuchsia-400 to-pink-600",
    glow: "group-hover:shadow-fuchsia-500/25",
    text: "text-fuchsia-600 dark:text-fuchsia-300",
    bar: "from-fuchsia-400 to-pink-500",
    soft: "bg-fuchsia-500/10 dark:bg-fuchsia-400/10",
    border: "border-fuchsia-500/25 dark:border-fuchsia-400/25",
  },
  amber: {
    label: "کهربایی",
    tile: "from-amber-400 to-orange-500",
    glow: "group-hover:shadow-amber-500/25",
    text: "text-amber-600 dark:text-amber-300",
    bar: "from-amber-400 to-orange-500",
    soft: "bg-amber-500/15 dark:bg-amber-400/10",
    border: "border-amber-500/30 dark:border-amber-400/25",
  },
  orange: {
    label: "نارنجی",
    tile: "from-orange-400 to-red-500",
    glow: "group-hover:shadow-orange-500/25",
    text: "text-orange-600 dark:text-orange-300",
    bar: "from-orange-400 to-red-500",
    soft: "bg-orange-500/10 dark:bg-orange-400/10",
    border: "border-orange-500/25 dark:border-orange-400/25",
  },
  rose: {
    label: "گل‌بهی",
    tile: "from-rose-400 to-red-600",
    glow: "group-hover:shadow-rose-500/25",
    text: "text-rose-600 dark:text-rose-300",
    bar: "from-rose-400 to-red-500",
    soft: "bg-rose-500/10 dark:bg-rose-400/10",
    border: "border-rose-500/25 dark:border-rose-400/25",
  },
  lime: {
    label: "لیمویی",
    tile: "from-lime-400 to-green-600",
    glow: "group-hover:shadow-lime-500/25",
    text: "text-lime-700 dark:text-lime-300",
    bar: "from-lime-400 to-green-500",
    soft: "bg-lime-500/15 dark:bg-lime-400/10",
    border: "border-lime-600/25 dark:border-lime-400/25",
  },
};

export type CourseThemeKey = keyof typeof COURSE_THEMES;

export function getCourseTheme(key: string): CourseTheme {
  return COURSE_THEMES[key] ?? COURSE_THEMES.teal;
}

export const COURSE_THEME_OPTIONS = Object.entries(COURSE_THEMES).map(
  ([value, theme]) => ({ value, label: theme.label, tile: theme.tile })
);

/* ------------------------------------------------------------------ */
/*  نوع و سطح دوره                                                     */
/* ------------------------------------------------------------------ */

export const COURSE_TYPES = {
  online: {
    label: "آنلاین",
    badge:
      "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300",
    icon: Laptop,
  },
  inperson: {
    label: "حضوری",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
    icon: Users,
  },
  // دوره‌ی ترکیبی — هم جلسات حضوری دارد هم پخش آنلاین
  hybrid: {
    label: "حضوری و آنلاین",
    badge:
      "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
    icon: Layers,
  },
} as const;

export type CourseType = keyof typeof COURSE_TYPES;

export function isCourseType(v: string): v is CourseType {
  return v === "online" || v === "inperson" || v === "hybrid";
}

export const COURSE_LEVELS = ["مقدماتی", "متوسط", "پیشرفته"] as const;

export const ENROLLMENT_STATUSES = {
  new: {
    label: "جدید",
    badge:
      "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300",
  },
  contacted: {
    label: "تماس گرفته شد",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
  enrolled: {
    label: "ثبت‌نام نهایی",
    badge:
      "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
  },
  archived: {
    label: "بایگانی",
    badge: "border-foreground/15 bg-foreground/5 text-muted-foreground",
  },
} as const;

export type EnrollmentStatus = keyof typeof ENROLLMENT_STATUSES;

export function isEnrollmentStatus(v: string): v is EnrollmentStatus {
  return v in ENROLLMENT_STATUSES;
}
