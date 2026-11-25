import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { requireTeacher } from "@/lib/teacher";
import { str, bad } from "@/lib/api-helpers";
import { recordUploadedFile } from "@/lib/uploaded-files";
import { sanitizeSection } from "@/lib/gallery-shared";
import { contentMatchesExt } from "@/lib/file-signature";
import { sanitizeSvg, sanitizedSvgIsUsable } from "@/lib/svg-sanitize";
import {
  IMAGES_DIR,
  VIDEOS_DIR,
  newMediaName,
  saveStreamedFile,
} from "@/lib/media";

/**
 * آپلود فایل از پنل استاد — POST /api/teacher/upload (multipart/form-data)
 *
 * فقط برای نقش teacher (نشست avid_user) — منطق همان آپلود مدیر است اما
 * محدود به دو kind موردنیاز پنل استاد:
 *  • kind=image: تصویر ≤۱۰MB (PNG/JPG/WebP/GIF/AVIF/SVG)
 *      → public/uploads/images — تصویر سوالات آزمون استاد
 *  • kind=video: ویدئو ≤۲۵۶MB (MP4/WebM/OGV/OGG/MOV/M4V/MKV)
 *      → public/uploads/videos — ویدئو سوالات آزمون استاد
 *
 * فیلد فرم section برای ثبت گالری اختیاری است (پیش‌فرض «exams»).
 * متادیتای فایل در جدول گالری (UploadedFile) با نام استاد ثبت می‌شود.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MB = 1024 * 1024;
const IMAGE_MAX_BYTES = 10 * MB;
const VIDEO_MAX_BYTES = 256 * MB;

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "ogv", "ogg", "mov", "m4v", "mkv"]);

/** نگاشت MIME → پسوند (وقتی نام فایل پسوند ندارد) */
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
};

const KINDS = new Set(["image", "video"]);

export async function POST(req: NextRequest) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

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

    let folder: string;
    let maxBytes: number;

    if (kind === "image") {
      folder = "images";
      maxBytes = IMAGE_MAX_BYTES;
      if (!IMAGE_EXTS.has(ext)) {
        return bad("فرمت تصویر باید PNG، JPG، WebP، GIF، AVIF یا SVG باشد.");
      }
    } else {
      folder = "videos";
      maxBytes = VIDEO_MAX_BYTES;
      if (!VIDEO_EXTS.has(ext)) {
        return bad(
          "فرمت ویدئو باید MP4، WebM، OGV، OGG، MOV، M4V یا MKV باشد."
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
    const dir = folder === "images" ? IMAGES_DIR : VIDEOS_DIR;
    await mkdir(dir, { recursive: true });

    // — اعتبارسنجی محتوای واقعی (magic bytes) — پسوند بس نیست (بند ۸) —
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

    // — ثبت متادیتا در جدول گالری (سازنده = نام استاد) —
    const rawSection = str(form.get("section"));
    const section = rawSection ? sanitizeSection(rawSection) : "exams";

    await recordUploadedFile({
      url,
      name,
      originalName: file.name,
      ext,
      mime: file.type,
      size,
      section,
      uploader: `استاد: ${teacher.firstName} ${teacher.lastName}`.trim(),
    });

    return NextResponse.json(
      { url, ext, size, kind },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("teacher upload POST error:", error);
    return NextResponse.json(
      { error: "خطا در بارگذاری فایل. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
