/**
 * ثابت‌های مشترک گالری فایل‌ها — بدون هیچ وابستگی به Node/Prisma تا
 * هم در APIهای سرور (uploaded-files.ts) و هم در ماژول کلاینتی گالری
 * (gallery-module.tsx) قابل استفاده باشد.
 */

/* ---------------- بخش‌های سایت ---------------- */

export interface GallerySection {
  key: string;
  label: string;
  /** رنگ نشان بخش (کلاس tailwind) */
  badge: string;
}

export const GALLERY_SECTIONS: GallerySection[] = [
  { key: "courses", label: "دوره‌ها", badge: "border-teal-600/25 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300" },
  { key: "videos", label: "ویدئوها", badge: "border-violet-600/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300" },
  { key: "exams", label: "آزمون‌ها", badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300" },
  { key: "sampleQuestions", label: "نمونه سوالات", badge: "border-orange-600/25 bg-orange-500/10 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300" },
  { key: "certificates", label: "گواهینامه‌ها", badge: "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300" },
  { key: "fonts", label: "فونت‌ها", badge: "border-sky-600/25 bg-sky-500/10 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300" },
  { key: "settings", label: "تنظیمات سایت", badge: "border-rose-600/25 bg-rose-500/10 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300" },
  { key: "chat", label: "چت پشتیبانی", badge: "border-fuchsia-600/25 bg-fuchsia-500/10 text-fuchsia-700 dark:border-fuchsia-400/25 dark:bg-fuchsia-400/10 dark:text-fuchsia-300" },
  { key: "other", label: "نامشخص / سایر", badge: "border-foreground/15 bg-foreground/[0.05] text-muted-foreground dark:border-white/15 dark:bg-white/[0.05]" },
];

const SECTION_KEYS = new Set(GALLERY_SECTIONS.map((s) => s.key));

export function sectionLabel(key: string): string {
  return GALLERY_SECTIONS.find((s) => s.key === key)?.label ?? key;
}

/**
 * اعتبارسنجی بخش ارسالی از فرم آپلود — نامعتبر → "other".
 * ابتدا تطابق دقیق (کلیدهای camelCase مثل sampleQuestions) و سپس
 * تطابق کوچک‌شده بررسی می‌شود تا کلیدهای ترکیبی هم معتبر بمانند.
 */
export function sanitizeSection(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (SECTION_KEYS.has(key)) return key;
  const lower = key.toLowerCase();
  return SECTION_KEYS.has(lower) ? lower : "other";
}

/* ---------------- دسته‌بندی فرمت ---------------- */

export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "font"
  | "document"
  | "archive"
  | "other";

const CATEGORY_EXTS: Record<FileCategory, string[]> = {
  image: ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp", "ico"],
  video: ["mp4", "webm", "ogv", "ogg", "mov", "m4v", "mkv", "avi"],
  audio: ["mp3", "wav", "m4a", "aac", "flac", "opus"],
  font: ["woff", "woff2", "ttf", "otf", "eot"],
  document: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"],
  archive: ["zip", "rar", "7z", "gz", "tar"],
  other: [],
};

/** برچسب فارسی دسته‌ی فرمت برای نمایش */
export const CATEGORY_LABELS: Record<FileCategory, string> = {
  image: "تصاویر",
  video: "ویدئوها",
  audio: "صوت",
  font: "فونت‌ها",
  document: "اسناد",
  archive: "بایگانی",
  other: "سایر",
};

export function categoryOfExt(extRaw: string): FileCategory {
  const ext = extRaw.toLowerCase().replace(/^\./, "");
  for (const [cat, exts] of Object.entries(CATEGORY_EXTS) as [FileCategory, string[]][]) {
    if (exts.includes(ext)) return cat;
  }
  return "other";
}

/** رکورد فایل گالری — پاسخ GET /api/admin/gallery */
export interface GalleryFile {
  id: string;
  url: string;
  name: string;
  originalName: string;
  ext: string;
  mime: string;
  size: number;
  section: string;
  uploader: string;
  createdAt: string;
  updatedAt: string;
  category: FileCategory;
}
