import { readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { db } from "@/lib/db";
import { sanitizeSection } from "@/lib/gallery-shared";

/**
 * گالری فایل‌های آپلودی — لایه‌ی منطقی سمت سرور (Node + Prisma).
 * ثابت‌های مشترک با ماژول کلاینتی در lib/gallery-shared.ts نگهداری
 * می‌شوند تا بدون کشیدن وابستگی Node به باندل کلاینت قابل استفاده باشند.
 *
 *  • ثبت متادیتا: هر آپلود جدید یک ردیف در جدول UploadedFile می‌سازد
 *    (uploader = نام کاربری مدیر نشست‌دار، section = بخش ارسالی فرم).
 *  • همگام‌سازی با دیسک: فایل‌های موجود در public/uploads که رکورد
 *    ندارند (آپلودهای قدیمی) وارد جدول می‌شوند؛ بخششان از «محل استفاده»
 *    در دیتابیس استنباط می‌شود؛ رکوردهای بی‌صاحب (فایل حذف‌شده از دیسک)
 *    پاک می‌شوند.
 */

/* ---------------- ثبت آپلود جدید ---------------- */

export interface UploadRecordInput {
  /** مسیر عمومی فایل (/uploads/…) */
  url: string;
  /** نام فایل روی دیسک */
  name: string;
  /** نام اصلی فایل ارسالی (پیش از تغییر نام تصادفی) */
  originalName?: string;
  /** پسوند کوچک‌شده */
  ext: string;
  /** MIME اعلام‌شده‌ی مرورگر */
  mime?: string;
  /** حجم بایت */
  size: number;
  /** بخش سایت (پیش از sanitize) */
  section: string;
  /** نام کاربری آپلودکننده */
  uploader: string;
}

/**
 * ثبت متادیتای یک آپلود موفق در جدول گالری —
 * idempotent است (تکرار url رکورد موجود را به‌روز می‌کند، نه تکراری).
 */
export async function recordUploadedFile(input: UploadRecordInput): Promise<void> {
  const url = input.url;
  const data = {
    url,
    name: input.name,
    originalName: (input.originalName ?? "").slice(0, 200),
    ext: input.ext.toLowerCase(),
    mime: (input.mime ?? "").slice(0, 100),
    size: Math.max(0, Math.round(input.size)),
    section: sanitizeSection(input.section),
    uploader: input.uploader.slice(0, 80),
  };

  try {
    await db.uploadedFile.upsert({
      where: { url },
      update: data,
      create: data,
    });
  } catch (error) {
    // بی‌خطر: شکست ثبت متادیتا نباید خود آپلود را بی‌نتیجه کند؛
    // همگام‌سازی گالری بعداً فایل را از دیسک پیدا می‌کند.
    console.error("uploadedFile record error:", error);
  }
}

/* ---------------- همگام‌سازی با دیسک ---------------- */

/** ریشه‌ی آپلودها — همان مسیر /api/admin/upload و روت سرو /uploads */
const UPLOADS_ROOT = resolve(process.cwd(), "public", "uploads");

interface DiskFile {
  url: string;
  relPath: string;
  name: string;
  ext: string;
  size: number;
  mtime: Date;
}

/** پیمایش بازگشتی امن فایل‌های داخل public/uploads */
async function walkUploads(dir: string, prefix: string[] = []): Promise<DiskFile[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // پوشه وجود ندارد (هنوز آپلودی انجام نشده)
  }

  const files: DiskFile[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // فایل‌های سیستمی مخفی
    if (entry.isDirectory()) {
      files.push(...(await walkUploads(join(dir, entry.name), [...prefix, entry.name])));
      continue;
    }
    if (!entry.isFile()) continue;

    const abs = join(dir, entry.name);
    let info;
    try {
      info = await stat(abs);
    } catch {
      continue; // هم‌اکنون حذف شد یا قفل خواندن دارد
    }
    if (!info.isFile()) continue;

    const relPath = [...prefix, entry.name].join("/");
    files.push({
      url: `/uploads/${relPath}`,
      relPath,
      name: entry.name,
      ext: extname(entry.name).replace(/^\./, "").toLowerCase(),
      size: info.size,
      mtime: info.mtime,
    });
  }
  return files;
}

/** نگاشت استباط بخش از «محل استفاده‌ی» فایل در دیتابیس (فایل‌های قدیمی) */
async function buildUsageMap(): Promise<Map<string, string>> {
  const usage = new Map<string, string>();
  const put = (raw: unknown, section: string) => {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (url.startsWith("/uploads/") && !usage.has(url)) usage.set(url, section);
  };

  try {
    const [settings, chatSettings, courses, videos, playlists, certificates, questions, fonts] =
      await Promise.all([
        db.siteSettings.findUnique({ where: { id: "main" } }),
        db.chatSettings.findUnique({ where: { id: "main" } }),
        db.course.findMany({ select: { imageUrl: true } }),
        db.video.findMany({ select: { url: true, thumbnail: true } }),
        db.playlist.findMany({ select: { thumbnail: true } }),
        db.certificate.findMany({ select: { fileUrl: true } }),
        db.examQuestion.findMany({ select: { image: true, video: true } }),
        db.installedFont.findMany({ select: { cssText: true } }),
      ]);

    put(settings?.logoUrl, "settings");
    put(chatSettings?.botAvatar, "chat");
    for (const c of courses) put(c.imageUrl, "courses");
    for (const v of videos) {
      put(v.url, "videos");
      put(v.thumbnail, "videos");
    }
    for (const p of playlists) put(p.thumbnail, "videos");
    for (const c of certificates) put(c.fileUrl, "certificates");
    for (const q of questions) {
      put(q.image, "exams");
      put(q.video, "exams");
    }
    // فونت‌ها داخل cssText به /uploads/fonts/<name> ارجاع می‌دهند
    for (const f of fonts) {
      const matches = f.cssText.matchAll(/\/uploads\/fonts\/[^)'"\s]+/g);
      for (const m of matches) put(m[0], "fonts");
    }
  } catch (error) {
    console.error("gallery usage map error:", error);
  }
  return usage;
}

/** بخش پیش‌فرض از روی پوشه‌ی سطح‌اول فایل */
function sectionFromFolder(relPath: string): string {
  const top = relPath.split("/")[0] ?? "";
  if (top === "videos" || top === "certificates" || top === "fonts") return top;
  return "other";
}

export interface GallerySyncSummary {
  /** رکوردهای تازه ساخته‌شده (فایل روی دیسک بود، رکورد نبود) */
  imported: number;
  /** رکوردهای حذف‌شده (فایل روی دیسک نیست) */
  removed: number;
  /** بخش رکوردهای «نامشخص» بر اساس محل استفاده به‌روز شد */
  resolved: number;
}

/**
 * همگام‌سازی جدول گالری با محتویات واقعی پوشه‌ی uploads —
 *  ۱) فایل بدون رکورد → ایجاد با بخش استنباطی و آپلودکننده‌ی نامشخص
 *  ۲) رکورد بدون فایل → حذف (فایل از دیسک حذف شده است)
 *  ۳) رکورد بخش «other» که اکنون در دیتابیس جایی استفاده می‌شود →
 *     بخشش به‌روز می‌شود (فقط برای فایل‌های قدیمیِ بدون متادیتا).
 * زمان ایجاد رکوردهای استباطی = تاریخ آخرین تغییر فایل روی دیسک (mTime)
 * تا مرتب‌سازی «تاریخ» معنی‌دار بماند.
 */
export async function syncGalleryFromDisk(): Promise<GallerySyncSummary> {
  const summary: GallerySyncSummary = { imported: 0, removed: 0, resolved: 0 };

  const [diskFiles, usage] = await Promise.all([
    walkUploads(UPLOADS_ROOT),
    buildUsageMap(),
  ]);
  const diskUrls = new Set(diskFiles.map((f) => f.url));

  const records = await db.uploadedFile.findMany();
  const recordUrls = new Set(records.map((r) => r.url));

  // — ۱) ایجاد رکوردهای مفقود (فایل روی دیسک، رکورد در جدول نیست) —
  const missing = diskFiles.filter((f) => !recordUrls.has(f.url));
  if (missing.length > 0) {
    await db.uploadedFile.createMany({
      data: missing.map((f) => ({
        url: f.url,
        name: f.name,
        originalName: f.name,
        ext: f.ext,
        mime: "",
        size: f.size,
        section: usage.get(f.url) ?? sectionFromFolder(f.relPath),
        uploader: "",
        createdAt: f.mtime,
      })),
    }).catch((error) => console.error("gallery import error:", error));
    summary.imported = missing.length;
  }

  // — ۲) حذف رکوردهای بی‌صاحب (فایل حذف شده از دیسک) —
  const orphans = records.filter((r) => !diskUrls.has(r.url));
  if (orphans.length > 0) {
    await db.uploadedFile
      .deleteMany({ where: { id: { in: orphans.map((r) => r.id) } } })
      .catch((error) => console.error("gallery orphan cleanup error:", error));
    summary.removed = orphans.length;
  }

  // — ۳) به‌روزرسانی بخش رکوردهای «نامشخص» بر اساس محل استفاده —
  for (const r of records) {
    if (r.section !== "other") continue;
    const resolved = usage.get(r.url);
    if (!resolved) continue;
    await db.uploadedFile
      .update({ where: { id: r.id }, data: { section: resolved } })
      .catch(() => {});
    summary.resolved += 1;
  }

  return summary;
}
