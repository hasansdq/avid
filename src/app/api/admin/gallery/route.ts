import { unlink } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { categoryOfExt, type FileCategory } from "@/lib/gallery-shared";
import { syncGalleryFromDisk } from "@/lib/uploaded-files";

/**
 * GET /api/admin/gallery — گالری فایل‌های آپلودی سایت.
 *
 * پیش از پاسخ، جدول با محتویات واقعی پوشه‌ی uploads همگام می‌شود:
 * فایل‌های قدیمیِ بدون رکورد (با استنباط بخش از محل استفاده) وارد
 * می‌شوند و رکوردهای بی‌صاحب حذف می‌گردند.
 *
 * پاسخ: { files, stats } —
 *  • files: همه‌ی فایل‌ها به‌همراه دسته‌ی فرمت (category)
 *  • stats: { total, totalSize, categories: { count, size }[] }
 *    مرتب‌سازی (تاریخ/سایز/نام) و فیلترها سمت کلاینت اعمال می‌شود.
 *
 * DELETE /api/admin/gallery — حذف تکی/دسته‌جمعی فایل‌ها.
 * بدنه: { ids: string[] } — رکورد هر فایل از DB و خودِ فایل از دیسک
 * (فقط داخل public/uploads؛ با بررسی امن مسیر) حذف می‌شوند.
 */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    // — همگام‌سازی best-effort: حتی در صورت خطا، فهرست DB برگردانده می‌شود —
    const sync = await syncGalleryFromDisk().catch(() => null);

    const records = await db.uploadedFile.findMany({
      orderBy: { createdAt: "desc" },
    });

    // دسته‌ی فرمت هر فایل روی رکورد محاسبه و در پاسخ درج می‌شود
    const files = records.map((r) => ({
      ...r,
      category: categoryOfExt(r.ext),
    }));

    // — آمار کلی و به‌ازای دسته‌ی فرمت —
    const categories: Record<string, { count: number; size: number }> = {};
    let totalSize = 0;
    for (const f of files) {
      totalSize += f.size;
      const cat = f.category as FileCategory;
      categories[cat] ??= { count: 0, size: 0 };
      categories[cat].count += 1;
      categories[cat].size += f.size;
    }

    return NextResponse.json({
      files,
      stats: {
        total: files.length,
        totalSize,
        categories,
      },
      sync,
    });
  } catch (error) {
    console.error("gallery GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت گالری فایل‌ها." },
      { status: 500 }
    );
  }
}

/* ————————————————— حذف فایل‌ها ————————————————— */

const UPLOADS_ROOT = path.resolve(process.cwd(), "public", "uploads");

/** حداکثر فایل در هر درخواست حذف */
const MAX_DELETE = 200;

/**
 * مسیر امن فایل روی دیسک از URL گالری — فقط داخل public/uploads و
 * بدون پیمایش به بیرون (.. / جداکننده‌ی ویندوزی / نویسه‌ی nul).
 */
function safeUploadPath(url: string): string | null {
  const clean = (url ?? "").trim();
  if (!clean.startsWith("/uploads/")) return null;
  const rel = clean.slice("/uploads/".length);
  if (
    !rel ||
    rel.includes("..") ||
    rel.includes("\\") ||
    rel.startsWith("/") ||
    rel.includes("\u0000")
  ) {
    return null;
  }
  const abs = path.resolve(UPLOADS_ROOT, rel);
  if (abs !== UPLOADS_ROOT && !abs.startsWith(UPLOADS_ROOT + path.sep)) {
    return null; // پیمایش به بیرون از پوشه‌ی uploads — رد می‌شود
  }
  return abs;
}

export async function DELETE(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = (await req.json().catch(() => null)) as
      | { ids?: unknown }
      | null;
    const rawIds = Array.isArray(body?.ids) ? body.ids : [];
    if (rawIds.length === 0) {
      return bad("شناسه‌ی فایلی برای حذف ارسال نشده است.");
    }
    if (rawIds.length > MAX_DELETE) {
      return bad(`در هر درخواست حداکثر ${MAX_DELETE} فایل قابل حذف است.`);
    }

    const ids = Array.from(
      new Set(
        rawIds
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
          .map((v) => v.trim())
      )
    );
    if (ids.length === 0) {
      return bad("شناسه‌ی فایلی برای حذف ارسال نشده است.");
    }

    const records = await db.uploadedFile.findMany({
      where: { id: { in: ids } },
    });
    if (records.length === 0) {
      return bad("فایلی با این شناسه‌ها یافت نشد.", 404);
    }

    // — حذف فایل‌ها از دیسک (فقط مسیرهای امن داخل uploads) —
    let diskSkipped = 0;
    for (const r of records) {
      const abs = safeUploadPath(r.url);
      if (!abs) {
        // فایل خارج از/uploads (نادر) — فقط رکورد حذف می‌شود
        diskSkipped += 1;
        continue;
      }
      await unlink(abs).catch(() => {
        // فایل از قبل حذف شده یا در دسترس نیست — رکورد همچنان حذف می‌شود
      });
    }

    // — حذف رکوردها از پایگاه داده —
    await db.uploadedFile.deleteMany({
      where: { id: { in: records.map((r) => r.id) } },
    });

    return NextResponse.json({
      ok: true,
      deleted: records.length,
      diskSkipped,
    });
  } catch (error) {
    console.error("gallery DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف فایل‌ها." },
      { status: 500 }
    );
  }
}
