import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";
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
 * POST /api/panel/exams/[id]/submit — ثبت نهایی پاسخ‌ها و تصحیح خودکار.
 *
 * body: { attemptId, answers: { [questionId]: پاسخ } }
 * سوالات عینی خودکار تصحیح می‌شوند؛ تشریحی‌ها برای تصحیح مدیر ذخیره
 * می‌شوند و نمره‌ی نهایی (score) تا ثبت نمره توسط مدیر null می‌ماند.
 * پاسخ: نمره‌ها + برگه‌ی مرور (پاسخ کاربر و پاسخ صحیح هر سوال).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "برای ثبت پاسخ‌ها، وارد حساب خود شوید." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as {
      attemptId?: unknown;
      answers?: unknown;
    } | null;

    const attemptId =
      typeof body?.attemptId === "string" ? body.attemptId : "";
    if (!attemptId) return NextResponse.json({ error: "شناسه‌ی پاسخ‌برگه لازم است." }, { status: 400 });
    if (!body?.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
      return NextResponse.json({ error: "پاسخ‌های ارسالی معتبر نیست." }, { status: 400 });
    }

    const exam = await db.exam
      .findUnique({ where: { id }, select: { id: true, published: true } })
      .catch(() => null);
    if (!exam) {
      return NextResponse.json(
        { error: "آزمون یافت نشد." },
        { status: 404 }
      );
    }

    const attempt = await db.examAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt || attempt.examId !== exam.id || attempt.userId !== session.id) {
      return NextResponse.json(
        { error: "پاسخ‌برگه‌ی شما یافت نشد." },
        { status: 404 }
      );
    }
    if (attempt.finishedAt) {
      return NextResponse.json(
        { error: "این پاسخ‌برگه قبلاً ثبت شده است." },
        { status: 409 }
      );
    }

    const questions = await db.examQuestion.findMany({
      where: { examId: exam.id },
      orderBy: { order: "asc" },
    });

    // فقط پاسخ‌های متناظر با سوالات واقعی همین آزمون نگه داشته می‌شود
    const validIds = new Set(questions.map((q) => q.id));
    const rawAnswers = body.answers as Record<string, unknown>;
    const answers: Record<string, unknown> = {};
    for (const [qid, value] of Object.entries(rawAnswers)) {
      if (validIds.has(qid)) answers[qid] = value === undefined ? null : value;
    }

    const gradingQuestions: GradingQuestion[] = questions.map((q) => ({
      id: q.id,
      type: q.type as QuestionType,
      points: q.points,
      options: parseJsonField<QuestionOptions>(q.options, {}),
      answer: parseJsonField<QuestionAnswer>(q.answer, {}),
    }));

    const grade = gradeAttempt(gradingQuestions, answers);
    const finishedAt = new Date();

    // نمره‌ی کسب‌شده‌ی هر سوال ذخیره می‌شود تا مدیر بتواند آن را ویرایش کند؛
    // نمره‌ی نهایی خودکار از جمع همین مقادیر به دست می‌آید (scoreManual=false).
    const initialGrades: Record<string, number> = {};
    for (const g of grade.perQuestion) initialGrades[g.questionId] = g.earned;

    const updated = await db.examAttempt.update({
      where: { id: attempt.id },
      data: {
        answers: JSON.stringify(answers),
        grades: JSON.stringify(initialGrades),
        autoScore: grade.autoScore,
        totalPoints: grade.totalPoints,
        hasEssay: grade.hasEssay,
        finishedAt,
        score: grade.hasEssay ? null : grade.autoScore,
        scoreManual: false,
      },
    });

    // برگه‌ی مرور — پاسخ کاربر + پاسخ صحیح هر سوال
    const gradeByQuestion = new Map(
      grade.perQuestion.map((g) => [g.questionId, g])
    );
    const review = questions.map((q) => {
      const g = gradeByQuestion.get(q.id);
      return {
        id: q.id,
        type: q.type,
        text: q.text,
        image: q.image,
        video: q.video,
        points: q.points,
        options: parseJsonField<QuestionOptions>(q.options, {}),
        userAnswer: answers[q.id] ?? null,
        correct: g?.correct ?? null,
        earned: g?.earned ?? 0,
        correctAnswer: parseJsonField<QuestionAnswer>(q.answer, {}),
      };
    });

    return NextResponse.json(
      {
        score: updated.score,
        autoScore: grade.autoScore,
        autoMax: grade.autoMax,
        totalPoints: grade.totalPoints,
        hasEssay: grade.hasEssay,
        finishedAt,
        review,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("panel exam submit error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت پاسخ‌ها. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
