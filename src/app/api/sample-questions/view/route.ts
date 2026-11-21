import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bad, str } from "@/lib/api-helpers";

/**
 * POST /api/sample-questions/view — ثبت بازدید یک نمونه سوال.
 *
 * بدنه: { id } — شمارنده‌ی views یک واحد بالا می‌رود.
 * عمومی است (بدون گارد مدیر) و بی‌خطر: فقط روی شناسه‌ی معتبر
 * موجود عمل می‌کند؛ نتیجه‌اش صرفاً آمار بازدید است.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const id = body ? str(body.id) : "";
    if (!id) return bad("شناسه‌ی نمونه سوال الزامی است.");

    const updated = await db.sampleQuestion
      .update({
        where: { id },
        data: { views: { increment: 1 } },
      })
      .catch(() => null);

    if (!updated) return bad("نمونه سوال یافت نشد.", 404);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("sample-question view error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت بازدید." },
      { status: 500 }
    );
  }
}
