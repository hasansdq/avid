import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { requireAdmin } from "@/lib/auth";
import { str, bad } from "@/lib/api-helpers";
import { recordUploadedFile } from "@/lib/uploaded-files";
import { sanitizeSection } from "@/lib/gallery-shared";
import { contentMatchesExt } from "@/lib/file-signature";
import { sanitizeSvg, sanitizedSvgIsUsable } from "@/lib/svg-sanitize";
import {
  IMAGES_DIR,
  MEDIA_ROOT,
  VIDEOS_DIR,
  newMediaName,
  saveStreamedFile,
} from "@/lib/media";
import { SAMPLE_QUESTIONS_DIR_NAME } from "@/lib/sample-questions";

/**
 * آپلود مستقیم فایل از پنل مدیریت — POST /api/admin/upload
 * (multipart/form-data)
 *
 * فیلدهای فرم:
 *  • file (الزامی) — فایل ارسالی
 *  • kind — image (پیش‌فرض) | video | certificate | sample-question
 *  • section — بخش گالری برای ثبت متادیتا (اختیاری؛ sanitize می‌شود)
 *
 * مقاصد و محدودیت‌ها:
 *  • kind=image: تصویر ≤۱۰MB (PNG/JPG/WebP/GIF/AVIF/SVG)
 *      → public/uploads/images — لوگو، آواتار، بندانگشتی‌ها
 *  • kind=video: ویدئو ≤۲۵۶MB (MP4/WebM/OGV/OGG/MOV/M4V/MKV)
 *      → public/uploads/videos — پخش مستقیم در پلیر سایت
 *  • kind=certificate: PDF یا تصویر ≤۱۰MB
 *      → public/uploads/certificates — فایل گواهینامه‌ها
 *  • kind=sample-question: تصویر ≤۱۰MB / PDF ≤۳۲MB / ویدئو ≤۲۵۶MB
 *      → public/uploads/sample-questions — نمونه سوالات
 *
 * فایل با استریم (بدون بافر کامل در حافظه) روی دیسک نوشته می‌شود؛
 * پس از نوشتن، متادیتای آن در جدول گالری (UploadedFile) ثبت می‌شود و
 * پاسخ 201 با {url, ext, size, kind} برمی‌گردد.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- محدودیت‌ها و پسوندهای مجاز ---------------- */

const MB = 1024 * 1024;

const IMAGE_MAX_BYTES = 10 * MB;
const VIDEO_MAX_BYTES = 256 * MB;
const CERT_MAX_BYTES = 10 * MB;
const SQ_IMAGE_MAX_BYTES = 10 * MB;
const SQ_PDF_MAX_BYTES = 32 * MB;

/** تصویر عمومی */
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"]);
/** ویدئو */
const VIDEO_EXTS = new Set(["mp4", "webm", "ogv", "ogg", "mov", "m4v", "mkv"]);
/** فایل گواهینامه */
const CERT_EXTS = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif"]);
/** تصویر نمونه سوال */
const SQ_IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "avif",
  "bmp",
]);

/** نگاشت MIME → پسوند (وقتی نام فایل پسوند ندارد) */
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "application/pdf": "pdf",
};

const KINDS = new Set(["image", "video", "certificate", "sample-question"]);

/** بخش پیش‌فرض گالری برای هر kind (وقتی فرم section نفرستاده باشد) */
function defaultSectionForKind(kind: string): string {
  switch (kind) {
    case "certificate":
      return "certificates";
    case "sample-question":
      return "sampleQuestions";
    case "video":
      return "videos";
    default:
      return "other";
  }
}

export async function POST(req: NextRequest) {
  const { admin, denial } = await requireAdmin(req);
  if (denial) return denial;

  let kind = "image";
  try {
    const form = await req.formData();
    const file = form.get("file");

    kind = str(form.get("kind"), "image");
    if (!KINDS.has(kind)) {
      return bad("نوع بارگذاری نامعتبر است.");
    }

    if (!(file instanceof File)) {
      return bad("فایلی ارسال نشده است.");
    }
    if (file.size === 0) {
      return bad("فایل خالی است.");
    }

    // — استخراج پسوند: اول از نام فایل، در غیر این صورت از MIME —
    const extFromName = path
      .extname(file.name)
      .replace(/^\./, "")
      .toLowerCase();
    const ext = extFromName || MIME_EXT[file.type] || "";

    /** مسیر نسبی پوشه + حداکثر مجاز مربوط به kind/فرمت */
    let folder: string;
    let maxBytes: number;

    if (kind === "image") {
      folder = "images";
      maxBytes = IMAGE_MAX_BYTES;
      if (!IMAGE_EXTS.has(ext)) {
        return bad("فرمت تصویر باید PNG، JPG، WebP، GIF، AVIF یا SVG باشد.");
      }
    } else if (kind === "video") {
      folder = "videos";
      maxBytes = VIDEO_MAX_BYTES;
      if (!VIDEO_EXTS.has(ext)) {
        return bad(
          "فرمت ویدئو باید MP4، WebM، OGV، OGG، MOV، M4V یا MKV باشد."
        );
      }
    } else if (kind === "certificate") {
      folder = "certificates";
      maxBytes = CERT_MAX_BYTES;
      if (!CERT_EXTS.has(ext)) {
        return bad("فرمت فایل گواهینامه باید PDF، PNG، JPG، WebP یا GIF باشد.");
      }
    } else {
      // sample-question — سقف حجم متناسب با نوع فایل
      folder = SAMPLE_QUESTIONS_DIR_NAME;
      if (SQ_IMAGE_EXTS.has(ext)) {
        maxBytes = SQ_IMAGE_MAX_BYTES;
      } else if (ext === "pdf") {
        maxBytes = SQ_PDF_MAX_BYTES;
      } else if (VIDEO_EXTS.has(ext)) {
        maxBytes = VIDEO_MAX_BYTES;
      } else {
        return bad(
          "فرمت نمونه سوال باید تصویر (PNG/JPG/WebP/GIF/AVIF/BMP)، PDF یا ویدئو (MP4/WebM/MOV…) باشد."
        );
      }
    }

    if (file.size > maxBytes) {
      const maxFa =
        maxBytes >= MB
          ? `${(maxBytes / MB).toLocaleString("en-US")} مگابایت`
          : `${maxBytes} بایت`;
      return bad(`حجم فایل بیش از حد مجاز است — حداکثر ${maxFa} است.`);
    }

    // — نام تصادفی امن و نوشتن استریمی روی دیسک —
    const name = newMediaName(ext);
    const dir =
      folder === "images"
        ? IMAGES_DIR
        : folder === "videos"
          ? VIDEOS_DIR
          : path.join(MEDIA_ROOT, folder);
    await mkdir(dir, { recursive: true });

    // — اعتبارسنجی محتوای واقعی (magic bytes) — پسوند بس نیست (بند ۸) —
    // ۶۴ کیلوبایت آغازین برای تشخیص نوع کافی است؛ تعارض = رد.
    const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
    if (!contentMatchesExt(ext, head)) {
      return bad(
        "محتوای فایل با فرمت اعلام‌شده هم‌خوانی ندارد — فایل خراب یا جعل‌شده است."
      );
    }

    let size: number;
    if (ext === "svg") {
      // SVG متنی است — کل محتوا پاکسازی و «پاکسازی‌شده» ذخیره می‌شود
      const safe = sanitizeSvg(await file.text());
      if (!sanitizedSvgIsUsable(safe)) {
        return bad("فایل SVG معتبر نیست.");
      }
      await writeFile(path.join(dir, name), safe, "utf8");
      size = Buffer.byteLength(safe, "utf8");
    } else {
      size = await saveStreamedFile(file, path.join(dir, name));
    }
    const url = `/uploads/${folder}/${name}`;

    // — ثبت متادیتا در جدول گالری —
    const rawSection = str(form.get("section"));
    const section = rawSection
      ? sanitizeSection(rawSection)
      : defaultSectionForKind(kind);

    await recordUploadedFile({
      url,
      name,
      originalName: file.name,
      ext,
      mime: file.type,
      size,
      section,
      uploader: admin.username,
    });

    return NextResponse.json(
      { url, ext, size, kind },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("upload POST error:", error);
    return NextResponse.json(
      { error: "خطا در بارگذاری فایل. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
