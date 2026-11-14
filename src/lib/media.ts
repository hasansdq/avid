import { createReadStream, createWriteStream, stat, unlink } from "fs";
import { mkdir } from "fs/promises";
import { Readable } from "stream";
import { join, extname } from "path";
import { randomBytes } from "crypto";

/**
 * زیرساخت رسانه (ویدئوهای آپلودی) —
 * پرونده‌ها در public/uploads/videos ذخیره می‌شوند و از طریق
 * مسیر /api/media/videos/[name] با پشتیبانی Range (برای seek ویدیو) سرو می‌شوند.
 */

/** ریشه‌ی ذخیره‌سازی پرونده‌های رسانه */
export const MEDIA_ROOT = join(process.cwd(), "public", "uploads");
export const VIDEOS_DIR = join(MEDIA_ROOT, "videos");
export const THUMBS_DIR = join(VIDEOS_DIR, "thumbs");
/** تصاویر عمومی (لوگو، بندانگشتی دوره، کاور لیست پخش و ...) */
export const IMAGES_DIR = join(MEDIA_ROOT, "images");

/** حداکثر حجم ویدئوی آپلودی — ۵۱۲ مگابایت */
export const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
/** حداکثر حجم تصویر بندانگشتی آپلودی — ۱۰ مگابایت */
export const MAX_THUMB_BYTES = 10 * 1024 * 1024;
/** حداکثر حجم تصویر عمومی آپلودی — ۱۰ مگابایت */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** پیشوند عمومی مسیر رسانه در API */
export const MEDIA_API_PREFIX = "/api/media/videos";
/** پیشوند مسیر تصاویر عمومی در API */
export const IMAGES_API_PREFIX = "/api/media/images";

/** پسوندهای مجاز ویدئو + نوع MIME */
const VIDEO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".ogg": "video/ogg",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

/** تعیین MIME از روی پسوند پرونده */
export function mimeOf(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return VIDEO_MIME[ext] ?? IMAGE_MIME[ext] ?? null;
}

/** بررسی مجاز بودن پسوند ویدئو */
export function isVideoExt(name: string): boolean {
  return extname(name).toLowerCase() in VIDEO_MIME;
}

/** بررسی مجاز بودن پسوند تصویر */
export function isImageExt(name: string): boolean {
  return extname(name).toLowerCase() in IMAGE_MIME;
}

/** نام پرونده‌ی امن تولیدشده به‌صورت تصادفی (بدون تکرار) */
export function newMediaName(ext: string): string {
  const clean = ext.startsWith(".") ? ext : `.${ext}`;
  return `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}${clean}`;
}

/** ساخت دایرکتوری‌های رسانه در صورت نبود */
export async function ensureMediaDirs(): Promise<void> {
  await mkdir(THUMBS_DIR, { recursive: true });
}

/** ساخت دایرکتوری تصاویر عمومی در صورت نبود */
export async function ensureImagesDir(): Promise<void> {
  await mkdir(IMAGES_DIR, { recursive: true });
}

/** اندازه‌ی نهایی پرونده */
export async function saveStreamedFile(
  file: File,
  targetPath: string
): Promise<number> {
  const nodeStream = Readable.fromWeb(file.stream() as unknown as Parameters<typeof Readable.fromWeb>[0]);
  await new Promise<void>((resolve, reject) => {
    const writer = createWriteStream(targetPath);
    nodeStream.pipe(writer);
    writer.on("finish", () => resolve());
    writer.on("error", reject);
    nodeStream.on("error", reject);
  });
  return await new Promise<number>((resolve) =>
    stat(targetPath, (e, s) => resolve(e ? file.size : s.size))
  );
}

/** حذف امن یک پرونده (اگر وجود داشته باشد) */
export function unlinkIfExists(targetPath: string): void {
  unlink(targetPath, () => undefined);
}

/**
 * استخراج نام پرونده‌ی فیزیکی از مسیر API رسانه —
 * فقط مسیرهای همین پیشوند پذیرفته می‌شوند؛ خروجی برای حذف امن است.
 */
export function mediaPathFromApiUrl(url: string): string | null {
  if (!url.startsWith(`${MEDIA_API_PREFIX}/`)) return null;
  const rel = url.slice(MEDIA_API_PREFIX.length + 1); // مثلاً videos/abc.mp4 یا thumbs/abc.jpg
  const parts = rel.split("/").filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  for (const part of parts) {
    if (!/^[A-Za-z0-9._-]+$/.test(part) || part.includes("..")) return null;
  }
  if (parts.length === 2 && parts[0] !== "thumbs") return null;
  return join(VIDEOS_DIR, ...parts);
}

/** تبدیل استریم Node به Web Stream برای Response */
export function toWebStream(nodeStream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
}
