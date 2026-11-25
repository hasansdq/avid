import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/teacher";
import { bad } from "@/lib/api-helpers";
import { parseQuestionsInput } from "@/lib/exam-io";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/teacher/exams/[id]/questions — ذخیره‌ی گروهی سوالات آزمون خودِ
 * استاد (در بخش «ساخت آزمون» پنل استاد). کل لیست جایگزین می‌شود
 * (حذف + ایجاد در یک تراکنش)؛ ترتیب از روی آرایه است.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;
    const exam = await db.exam
      .findUnique({ where: { id }, select: { id: true, creatorId: true } })
      .catch(() => null);
    if (!exam || exam.creatorId !== teacher.id)
      return bad("آزمون موردنظر یافت نشد یا متعلق به شما نیست.", 404);

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
    console.error("سوالات آزمون استاد — PUT:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی سوالات. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
