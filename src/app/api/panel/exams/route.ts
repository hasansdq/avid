import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";

/**
 * GET /api/panel/exams — آزمون‌های قابل مشاهده برای کاربر وارد‌شده:
 *   • آزمون‌های دوره‌هایی که کاربر در آنها ثبت‌نام کرده (فقط اعضای همان دوره)
 *   • آزمون‌های آزاد (همه)
 *   • آزمون‌های رمزدار (همه می‌بینند؛ برای شرکت باید رمز را وارد کنند)
 *   • آزمون‌های کلاس (فقط اعضای همان کلاس — بقیه اصلاً نمی‌بینند)
 * هر آزمون همراه تعداد سوال و سوابق شرکت خود کاربر است.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "برای مشاهده‌ی آزمون‌ها، وارد حساب خود شوید." },
        { status: 401 }
      );
    }

    // دوره‌هایی که کاربر عضو آنهاست (ثبت‌نام فعال)
    const enrollments = await db.enrollment.findMany({
      where: { userId: session.id, status: { not: "archived" } },
      select: { course: true },
    });
    const myCourseTitles = Array.from(
      new Set(enrollments.map((e) => e.course).filter((t) => t.length > 0))
    );

    const exams = await db.exam.findMany({
      where: {
        published: true,
        OR: [
          { accessType: "open" },
          { accessType: "password" },
          {
            accessType: "course",
            course: { title: { in: myCourseTitles } },
          },
          // آزمون کلاس — فقط اعضای همان کلاس
          {
            accessType: "class",
            class: { members: { some: { userId: session.id } } },
          },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        accessType: true,
        durationMinutes: true,
        allowBack: true,
        course: { select: { title: true } },
        class: { select: { title: true } },
        _count: { select: { questions: true } },
      },
    });

    // سوابق شرکت این کاربر در همین آزمون‌ها (برای نمایش نمره)
    // فقط پاسخ‌برگه‌های ثبت‌شده — پاسخ‌برگه‌های رهاشده (totalPoints=0) کنار گذاشته می‌شوند
    const examIds = exams.map((e) => e.id);
    const attempts =
      examIds.length > 0
        ? await db.examAttempt.findMany({
            where: {
              userId: session.id,
              examId: { in: examIds },
              finishedAt: { not: null },
              totalPoints: { gt: 0 },
            },
            orderBy: { finishedAt: "desc" },
            select: {
              id: true,
              examId: true,
              score: true,
              autoScore: true,
              totalPoints: true,
              hasEssay: true,
              finishedAt: true,
            },
          })
        : [];

    return NextResponse.json(
      {
        exams: exams.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          accessType: e.accessType,
          durationMinutes: e.durationMinutes,
          allowBack: e.allowBack,
          courseTitle: e.course?.title ?? null,
          classTitle: e.class?.title ?? null,
          questionCount: e._count.questions,
          myAttempts: attempts.filter((a) => a.examId === e.id),
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("panel exams GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت آزمون‌ها." },
      { status: 500 }
    );
  }
}
