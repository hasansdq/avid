import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, float } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/exams/[id]/attempts — پاسخ‌های کاربران به این آزمون
 * (همراه نام کاربر و پاسخ‌های هر سوال — برای تصحیح تشریحی‌ها)
 *
 * PATCH /api/admin/exams/[id]/attempts — ثبت نمره‌ی نهایی یک پاسخ‌برگه
 * body: { attemptId, score } (score عددی؛ پس از ذخیره نمره نهایی قطعی می‌شود)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const exam = await db.exam
      .findUnique({ where: { id }, select: { id: true } })
      .catch(() => null);
    if (!exam) return bad("آزمونی با این شناسه یافت نشد.", 404);

    const attempts = await db.examAttempt.findMany({
      where: { examId: id },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { firstName: true, lastName: true, phone: true },
        },
      },
    });

    return NextResponse.json(attempts);
  } catch (error) {
    console.error("exam attempts GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت پاسخ‌های آزمون." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as {
      attemptId?: unknown;
      score?: unknown;
    } | null;

    const attemptId =
      typeof body?.attemptId === "string" ? body.attemptId : "";
    if (!attemptId) return bad("شناسه‌ی پاسخ‌برگه لازم است.");

    const score = float(body?.score, -1);
    if (score < 0) return bad("نمره‌ی نهایی معتبر نیست.");

    const attempt = await db.examAttempt
      .update({
        where: { id: attemptId },
        data: { score },
      })
      .catch(() => null);
    if (!attempt || attempt.examId !== id)
      return bad("پاسخ‌برگه‌ای با این شناسه در این آزمون یافت نشد.", 404);

    return NextResponse.json(attempt);
  } catch (error) {
    console.error("exam attempt PATCH error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت نمره. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
