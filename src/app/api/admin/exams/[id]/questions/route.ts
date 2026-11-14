import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import { parseQuestionsInput } from "@/lib/exam-io";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/admin/exams/[id]/questions — ذخیره‌ی گروهی سوالات آزمون
 * کل لیست جایگزین می‌شود (حذف + ایجاد در یک تراکنش)؛ ترتیب از روی آرایه است.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const exam = await db.exam
      .findUnique({ where: { id }, select: { id: true } })
      .catch(() => null);
    if (!exam) return bad("آزمونی با این شناسه یافت نشد.", 404);

    const body = await req.json().catch(() => null);
    const rows = parseQuestionsInput(body);
    if (typeof rows === "string") return bad(rows);

    await db.$transaction([
      db.examQuestion.deleteMany({ where: { examId: id } }),
      db.examQuestion.createMany({
        data: rows.map((q) => ({ ...q, examId: id })),
      }),
    ]);

    const questions = await db.examQuestion.findMany({
      where: { examId: id },
      orderBy: { order: "asc" },
    });
    return NextResponse.json({ ok: true, questions });
  } catch (error) {
    console.error("exam questions PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی سوالات. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
