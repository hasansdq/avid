import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, bool, int, str } from "@/lib/api-helpers";
import { isSampleQuestionIcon } from "@/lib/sample-questions";
import { ensureSampleQuestionCategoriesSeeded } from "@/lib/sample-questions-server";

/**
 * GET  /api/admin/sample-questions/categories — همه‌ی دسته‌ها (شامل پیش‌نویس)
 *      همراه شمارنده‌ی کل/منتشرشده‌ی نمونه سوال‌ها؛ ابتدا seedها اطمینان
 *      داده می‌شوند تا پنل همیشه دسته‌های پیش‌فرض را ببیند.
 * POST /api/admin/sample-questions/categories — ایجاد دسته‌ی جدید
 *      بدنه: { title (۲..۸۰), description? (≤۳۰۰), icon?, sortOrder?, published? }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    await ensureSampleQuestionCategoriesSeeded();

    const categories = await db.sampleQuestionCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { items: true } },
        // فقط برای شمارش آیتم‌های منتشرشده؛ id کفایت می‌کند
        items: { where: { published: true }, select: { id: true } },
      },
    });

    const rows = categories.map(({ items, ...rest }) => ({
      ...rest,
      publishedItems: items.length,
    }));

    return NextResponse.json(rows, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("sample-question categories GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت دسته‌بندی‌ها." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه‌ی درخواست نامعتبر است.");

    const title = str(body.title);
    const description = str(body.description).slice(0, 300);
    const icon = str(body.icon, "FileQuestion") || "FileQuestion";
    const sortOrder = int(body.sortOrder, 0);
    const published = bool(body.published, true);

    if (title.length < 2 || title.length > 80) {
      return bad("عنوان دسته باید بین ۲ تا ۸۰ نویسه باشد.");
    }
    if (!isSampleQuestionIcon(icon)) {
      return bad("آیکون انتخابی معتبر نیست.");
    }

    const category = await db.sampleQuestionCategory.create({
      data: { title, description, icon, sortOrder, published },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("sample-question categories POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد دسته‌بندی. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
