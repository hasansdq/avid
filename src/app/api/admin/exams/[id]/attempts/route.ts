import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, float } from "@/lib/api-helpers";
import {
  gradeAttempt,
  parseJsonField,
  type GradingQuestion,
  type QuestionAnswer,
  type QuestionOptions,
  type QuestionType,
} from "@/lib/exam";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/exams/[id]/attempts — پاسخ‌های کاربران به این آزمون
 * (همراه نام کاربر و پاسخ‌های هر سوال — برای تصحیح)
 *
 * PATCH /api/admin/exams/[id]/attempts — ثبت نمره‌ی پاسخ‌برگه
 * بدنه‌ی جدید: { attemptId, grades: { [questionId]: نمره }, finalManual?: boolean, finalScore?: number }
 *   • نمره‌ی کسب‌شده‌ی هر سوال ویرایش می‌شود (۰ تا نمره‌ی همان سوال)
 *   • نمره‌ی نهایی خودکار از جمع نمره‌ی سوالات محاسبه می‌شود (finalManual=false)
 *   • یا مدیر نمره‌ی نهایی را دستی ثبت می‌کند (finalManual=true + finalScore)
 * سازگاری با قبل: { attemptId, score } قدیمی همچنان کار می‌کند (نمره‌ی نهایی دستی).
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

/** گرد کردن نمره به دو رقم اعشار برای ذخیره‌سازی تمیز */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as {
      attemptId?: unknown;
      grades?: unknown;
      finalManual?: unknown;
      finalScore?: unknown;
      score?: unknown; // قالب قدیمی
    } | null;

    const attemptId =
      typeof body?.attemptId === "string" ? body.attemptId : "";
    if (!attemptId) return bad("شناسه‌ی پاسخ‌برگه لازم است.");

    const attempt = await db.examAttempt
      .findUnique({ where: { id: attemptId } })
      .catch(() => null);
    if (!attempt || attempt.examId !== id)
      return bad("پاسخ‌برگه‌ای با این شناسه در این آزمون یافت نشد.", 404);

    // سوالات فعلی آزمون — برای اعتبارسنجی نمره‌ی هر سوال (۰ تا points)
    const questions = await db.examQuestion.findMany({
      where: { examId: id },
      orderBy: { order: "asc" },
    });
    const pointsById = new Map(questions.map((q) => [q.id, q.points]));

    // نمره‌ی خودکار هر سوال (برای پاسخ‌برگه‌های قدیمی که grades ندارند)
    const answersMap = parseJsonField<Record<string, unknown>>(
      attempt.answers,
      {}
    );
    const gradingQuestions: GradingQuestion[] = questions.map((q) => ({
      id: q.id,
      type: q.type as QuestionType,
      points: q.points,
      options: parseJsonField<QuestionOptions>(q.options, {}),
      answer: parseJsonField<QuestionAnswer>(q.answer, {}),
    }));
    const autoEarned = new Map(
      gradeAttempt(gradingQuestions, answersMap).perQuestion.map((g) => [
        g.questionId,
        g.earned,
      ])
    );
    const storedGrades = parseJsonField<Record<string, number>>(
      attempt.grades,
      {}
    );

    // ————— نمره‌ی سوالات: incoming ⊃ ذخیره‌شده ⊃ خودکار —————
    const incomingRaw = body?.grades;
    const incoming: Record<string, number> = {};
    if (incomingRaw && typeof incomingRaw === "object" && !Array.isArray(incomingRaw)) {
      for (const [qid, value] of Object.entries(
        incomingRaw as Record<string, unknown>
      )) {
        if (!pointsById.has(qid))
          return bad("نمره‌ی یکی از سوالات به سوال معتبر این آزمون اشاره ندارد.");
        const v = typeof value === "number" ? value : parseFloat(String(value));
        if (!Number.isFinite(v) || v < 0)
          return bad("نمره‌ی سوال باید عددی مثبت باشد.");
        const max = pointsById.get(qid) ?? 0;
        if (v > max + 0.001)
          return bad(
            `نمره‌ی سوال نمی‌تواند بیش از نمره‌ی همان سوال (${max}) باشد.`
          );
        incoming[qid] = round2(Math.min(v, max));
      }
    } else if (incomingRaw !== undefined && incomingRaw !== null) {
      return bad("ساختار نمره‌ی سوالات معتبر نیست.");
    }

    // نمره‌ی مؤثر هر سوال = ورودی مدیر > ذخیره‌شده > خودکار
    const effective: Record<string, number> = {};
    for (const q of questions) {
      effective[q.id] =
        q.id in incoming
          ? incoming[q.id]
          : q.id in storedGrades
            ? storedGrades[q.id]
            : (autoEarned.get(q.id) ?? 0);
    }
    const gradesSum = round2(
      Object.values(effective).reduce((sum, v) => sum + v, 0)
    );

    // ————— نمره‌ی نهایی: خودکار (جمع نمره‌ی سوالات) یا دستی —————
    let finalScore: number;
    let scoreManual: boolean;

    const finalManual = body?.finalManual === true;
    if (finalManual) {
      // نمره‌ی نهایی دستی مدیر
      const raw = body?.finalScore;
      finalScore =
        typeof raw === "number" ? raw : parseFloat(String(raw ?? "NaN"));
      if (!Number.isFinite(finalScore) || finalScore < 0) {
        return bad("نمره‌ی نهایی معتبر نیست.");
      }
      if (finalScore > attempt.totalPoints + 0.001) {
        return bad(
          `نمره‌ی نهایی نمی‌تواند بیش از نمره‌ی کل آزمون (${attempt.totalPoints}) باشد.`
        );
      }
      scoreManual = true;
    } else if (
      typeof body?.score === "number" ||
      (typeof body?.score === "string" && body.score.trim() !== "")
    ) {
      // قالب قدیمی: { attemptId, score } — نمره‌ی نهایی دستی
      finalScore = float(body.score, -1);
      if (finalScore < 0) return bad("نمره‌ی نهایی معتبر نیست.");
      if (finalScore > attempt.totalPoints + 0.001) {
        return bad(
          `نمره‌ی نهایی نمی‌تواند بیش از نمره‌ی کل آزمون (${attempt.totalPoints}) باشد.`
        );
      }
      scoreManual = true;
    } else {
      // خودکار — از جمع نمره‌ی سوالات
      finalScore = gradesSum;
      scoreManual = false;
    }

    const updated = await db.examAttempt
      .update({
        where: { id: attempt.id },
        data: {
          grades: JSON.stringify(effective),
          score: round2(finalScore),
          scoreManual,
        },
      })
      .catch(() => null);
    if (!updated)
      return bad("ثبت نمره ممکن نشد؛ لطفاً دوباره تلاش کنید.", 500);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("exam attempt PATCH error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت نمره. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
