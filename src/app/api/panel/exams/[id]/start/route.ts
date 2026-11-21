import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";
import {
  parseJsonField,
  type PanelQuestion,
  type QuestionOptions,
} from "@/lib/exam";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/panel/exams/[id]/start — شروع آزمون (ساخت پاسخ‌برگه).
 *
 * body: { password? } — برای آزمون رمزدار.
 * کنترل دسترسی:
 *   • آزاد → همه‌ی کاربران وارد‌شده
 *   • دوره → فقط اعضای همان دوره (ثبت‌نام فعال)
 *   • رمزدار → رمز صحیح
 *   • کلاس → فقط اعضای همان کلاس
 * پاسخ: { attemptId, exam, questions } — سوالات بدون پاسخ صحیح.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "برای شرکت در آزمون، وارد حساب خود شوید." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const exam = await db.exam
      .findUnique({
        where: { id },
        include: { course: true, class: { select: { id: true, title: true } } },
      })
      .catch(() => null);
    if (!exam || !exam.published) {
      return NextResponse.json(
        { error: "آزمون یافت نشد یا منتشر نشده است." },
        { status: 404 }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      password?: unknown;
    } | null;
    const password =
      typeof body?.password === "string" ? body.password.trim() : "";

    // — کنترل دسترسی —
    if (exam.accessType === "course") {
      const membership = await db.enrollment.findFirst({
        where: {
          userId: session.id,
          course: exam.course?.title ?? "__none__",
          status: { not: "archived" },
        },
        select: { id: true },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "این آزمون فقط برای اعضای دوره‌ی مرتبط است." },
          { status: 403 }
        );
      }
    } else if (exam.accessType === "class") {
      // آزمون کلاس — فقط اعضای همان کلاس می‌توانند آزمون را باز کنند
      const membership = await db.classMembership.findFirst({
        where: { userId: session.id, classId: exam.classId ?? "__none__" },
        select: { id: true },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "این آزمون فقط برای اعضای کلاس مرتبط است." },
          { status: 403 }
        );
      }
    } else if (exam.accessType === "password") {
      if (!password || password !== exam.password) {
        return NextResponse.json(
          { error: "رمز آزمون اشتباه است." },
          { status: 403 }
        );
      }
    }

    // پاسخ‌برگه‌های نیمه‌کاره‌ی قبلی همین کاربر «رهاشده» ثبت می‌شوند
    const now = new Date();
    await db.examAttempt.updateMany({
      where: {
        userId: session.id,
        examId: exam.id,
        finishedAt: null,
      },
      data: { finishedAt: now },
    });

    const attempt = await db.examAttempt.create({
      data: { examId: exam.id, userId: session.id },
      select: { id: true, startedAt: true },
    });

    const questions = await db.examQuestion.findMany({
      where: { examId: exam.id },
      orderBy: { order: "asc" },
    });

    const panelQuestions: PanelQuestion[] = questions.map((q) => ({
      id: q.id,
      type: q.type as PanelQuestion["type"],
      text: q.text,
      image: q.image,
      video: q.video,
      points: q.points,
      order: q.order,
      options: parseJsonField<QuestionOptions>(q.options, {}),
    }));

    return NextResponse.json(
      {
        attemptId: attempt.id,
        startedAt: attempt.startedAt,
        exam: {
          id: exam.id,
          title: exam.title,
          description: exam.description,
          durationMinutes: exam.durationMinutes,
          allowBack: exam.allowBack,
          courseTitle: exam.course?.title ?? null,
          classTitle: exam.class?.title ?? null,
        },
        questions: panelQuestions,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("panel exam start error:", error);
    return NextResponse.json(
      { error: "خطا در شروع آزمون. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
