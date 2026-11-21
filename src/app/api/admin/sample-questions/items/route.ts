import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, bool, int, str } from "@/lib/api-helpers";

/**
 * GET  /api/admin/sample-questions/items — همه‌ی نمونه سوال‌ها (شامل پیش‌نویس)
 *      همراه دسته‌ی هرکدام ({ id, title })؛ مرتب‌سازی sortOrder asc و سپس
 *      createdAt desc (جدیدترین‌ها در رتبه‌های برابر).
 * POST /api/admin/sample-questions/items — بارگذاری نمونه سوال جدید
 *      بدنه: { title (۲..۱۲۰), description? (≤۵۰۰), categoryId? (nullable),
 *              fileUrl (الزامی — از POST /api/admin/upload با
 *              kind=sample-question)، ext?, size?, sortOrder?, published? }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const items = await db.sampleQuestion.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: { category: { select: { id: true, title: true } } },
    });

    return NextResponse.json(items, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("sample-question items GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت نمونه سوالات." },
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
    const description = str(body.description).slice(0, 500);
    const fileUrl = str(body.fileUrl);
    const ext = str(body.ext).replace(/^\./, "").toLowerCase().slice(0, 8);
    const size = int(body.size, 0);
    const sortOrder = int(body.sortOrder, 0);
    const published = bool(body.published, true);
    const categoryIdRaw = str(body.categoryId);

    if (title.length < 2 || title.length > 120) {
      return bad("عنوان نمونه سوال باید بین ۲ تا ۱۲۰ نویسه باشد.");
    }
    if (!fileUrl) {
      return bad("فایل نمونه سوال (تصویر/PDF/ویدئو) الزامی است.");
    }

    // — دسته‌ی ارسالی باید موجود باشد (خالی → بدون دسته) —
    let categoryId: string | null = null;
    if (categoryIdRaw) {
      const category = await db.sampleQuestionCategory.findUnique({
        where: { id: categoryIdRaw },
        select: { id: true },
      });
      if (!category) return bad("دسته‌ی انتخابی یافت نشد.", 404);
      categoryId = category.id;
    }

    const item = await db.sampleQuestion.create({
      data: {
        title,
        description,
        fileUrl,
        ext,
        size,
        sortOrder,
        published,
        categoryId,
      },
      include: { category: { select: { id: true, title: true } } },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("sample-question items POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد نمونه سوال. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
