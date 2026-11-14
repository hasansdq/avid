import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import {
  IMAGES_API_PREFIX,
  IMAGES_DIR,
  MAX_IMAGE_BYTES,
  ensureImagesDir,
  isImageExt,
  newMediaName,
  saveStreamedFile,
} from "@/lib/media";
import { extname } from "path";

/**
 * آپلود مستقیم تصویر — POST /api/admin/upload-image
 * formData: file (تصویر، الزامی)
 * کاربرد: لوگوی سایت، بندانگشتی دوره‌ها، کاور لیست پخش، بندانگشتی ویدئو، تصویر پروفایل چت‌بات
 * پاسخ: { url } — مسیر قابل استفاده در next/image
 */

function fileExt(name: string, fallbackMime: string): string {
  const ext = extname(name).toLowerCase().replace(".", "");
  if (ext) return ext;
  const fromMime = fallbackMime.split("/")[1];
  return fromMime || "png";
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  // محدودیت حجم پیش از خواندن بدنه
  const declaredLength = parseInt(req.headers.get("content-length") ?? "", 10);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_IMAGE_BYTES + 4096
  ) {
    return bad("حجم ارسالی بیش از حد مجاز (۱۰ مگابایت) است.");
  }

  try {
    const form = await req.formData().catch(() => null);
    if (!form) return bad("بدنه‌ی درخواست نامعتبر است.");

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return bad("پرونده‌ی تصویری ارسال نشده است.");
    }    if (file.size > MAX_IMAGE_BYTES) {
      return bad("حجم تصویر نباید بیش از ۱۰ مگابایت باشد.");
    }

    // پسوند باید تصویری باشد (بر اساس نام یا MIME)
    const ext = fileExt(file.name, file.type || "image/png");
    if (!isImageExt(`x.${ext}`)) {
      return bad(
        "قالب تصویر پشتیبانی نمی‌شود (فرمت‌های مجاز: jpg، png، webp، gif، avif)."
      );
    }

    await ensureImagesDir();

    // — ذخیره‌ی تصویر با نام تصادفی —
    const imageName = newMediaName(ext);
    const size = await saveStreamedFile(file, `${IMAGES_DIR}/${imageName}`);
    if (size === 0) {
      return bad("پرونده‌ی تصویری خالی است.", 422);
    }

    return NextResponse.json(
      { url: `${IMAGES_API_PREFIX}/${imageName}` },
      { status: 201 }
    );
  } catch (error) {
    console.error("image upload error:", error);
    return bad("خطا در ذخیره‌ی تصویر. لطفاً دوباره تلاش کنید.", 500);
  }
}
