import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { str, bad } from "@/lib/api-helpers";

/**
 * آپلود مستقیم فایل از پنل مدیریت —
 * فایل در public/uploads ذخیره می‌شود و آدرس نسبی آن برگردانده می‌شود.
 *
 *  • kind=image (پیش‌فرض): تصویر ≤۴MB در public/uploads —
 *    برای فیلدهای «تصویر» (لوگو، آواتار، بندانگشتی ویدئو، تصویر دوره).
 *  • kind=video: ویدئو ≤۲۵۶MB در public/uploads/videos —
 *    برای پخش مستقیم فایل‌های MP4/WebM/OGG/MOV در پلیر سایت.
 */

const IMAGE_MAX_BYTES = 4 * 1024 * 1024; // ۴ مگابایت
const VIDEO_MAX_BYTES = 256 * 1024 * 1024; // ۲۵۶ مگابایت

/** نوع‌های مجاز تصویر → پسوند فایل */
const IMAGE_TYPES = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
]);

/** نوع‌های مجاز ویدئو → پسوند فایل */
const VIDEO_TYPES = new Map<string, string>([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/ogg", "ogv"],
  ["video/quicktime", "mov"],
]);

const IMAGE_ACCEPT = "PNG، JPG، WebP، GIF یا SVG";
const VIDEO_ACCEPT = "MP4، WebM، OGG یا MOV";

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  let isVideo = false;
  try {
    const form = await req.formData();
    const file = form.get("file");
    const kindRaw = form.get("kind");
    const kind = str(kindRaw, "image");
    isVideo = kind === "video";

    if (!(file instanceof File)) {
      return bad("فایلی ارسال نشده است.");
    }
    if (file.size === 0) {
      return bad("فایل خالی است.");
    }

    const maxBytes = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (file.size > maxBytes) {
      return bad(
        isVideo
          ? "حجم ویدئو حداکثر ۲۵۶ مگابایت می‌تواند باشد."
          : "حجم تصویر حداکثر ۴ مگابایت می‌تواند باشد."
      );
    }

    const allowed = isVideo ? VIDEO_TYPES : IMAGE_TYPES;
    const ext = allowed.get(file.type);
    if (!ext) {
      return bad(
        `فرمت ${isVideo ? "ویدئو" : "تصویر"} باید ${
          isVideo ? VIDEO_ACCEPT : IMAGE_ACCEPT
        } باشد.`
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const name = `${Date.now().toString(36)}-${crypto
      .randomBytes(4)
      .toString("hex")}.${ext}`;

    if (isVideo) {
      const dir = path.join(process.cwd(), "public", "uploads", "videos");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), bytes);

      return NextResponse.json({ url: `/uploads/videos/${name}` });
    }

    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);

    return NextResponse.json({ url: `/uploads/${name}` });
  } catch (error) {
    console.error("upload POST error:", error);
    return NextResponse.json(
      {
        error: isVideo
          ? "خطا در بارگذاری ویدئو. لطفاً دوباره تلاش کنید."
          : "خطا در بارگذاری تصویر. لطفاً دوباره تلاش کنید.",
      },
      { status: 500 }
    );
  }
}
