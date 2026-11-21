import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, bool, int, str } from "@/lib/api-helpers";
import { isSampleQuestionIcon } from "@/lib/sample-questions";

/**
 * PUT    /api/admin/sample-questions/categories/[id] — ویرایش جزئی دسته
 *        بدنه: { title?, description?, icon?, sortOrder?, published? }
 * DELETE /api/admin/sample-questions/categories/[id] — حذف دسته
 *        (نمونه سوال‌های آن به‌واسطه‌ی SetNull «بدون دسته» می‌مانند)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه‌ی درخواست نامعتبر است.");

    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = str(body.title);
      if (title.length < 2 || title.length > 80) {
        return bad("عنوان دسته باید بین ۲ تا ۸۰ نویسه باشد.");
      }
      data.title = title;
    }
    if (body.description !== undefined) {
      data.description = str(body.description).slice(0, 300);
    }
    if (body.icon !== undefined) {
      const icon = str(body.icon);
      if (!isSampleQuestionIcon(icon)) {
        return bad("آیکون انتخابی معتبر نیست.");
      }
      data.icon = icon;
    }
    if (body.sortOrder !== undefined) {
      data.sortOrder = int(body.sortOrder, 0);
    }
    if (body.published !== undefined) {
      data.published = bool(body.published, true);
    }

    if (Object.keys(data).length === 0) {
      return bad("هیچ فیلدی برای به‌روزرسانی ارسال نشده است.");
    }

    const category = await db.sampleQuestionCategory
      .update({ where: { id }, data })
      .catch(() => null);

    if (!category) return bad("دسته‌ای با این شناسه یافت نشد.", 404);
    return NextResponse.json(category, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("sample-question category PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش دسته‌بندی. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    // رابطه‌ی items با onDelete: SetNull — نمونه سوال‌ها بدون دسته می‌مانند
    const category = await db.sampleQuestionCategory
      .delete({ where: { id } })
      .catch(() => null);

    if (!category) return bad("دسته‌ای با این شناسه یافت نشد.", 404);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("sample-question category DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف دسته‌بندی. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
