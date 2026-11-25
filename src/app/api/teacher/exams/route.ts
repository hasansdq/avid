import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/teacher";
import { bad } from "@/lib/api-helpers";
import { parseExamInput } from "@/lib/exam-io";

/**
 * GET /api/teacher/exams — آزمون‌های ساخته‌شده در بخش «ساخت آزمون» پنل استاد.
 * فقط آزمون‌هایی که creatorId خودِ استاد است برگردانده می‌شوند (آزمون‌های
 * مدیر و استادهای دیگر دیده نمی‌شوند).
 * POST /api/teacher/exams — ایجاد آزمون به نام استاد (creatorId).
 *   • accessType=course → دوره باید متعلق به خود استاد باشد
 *   • accessType=class  → کلاس باید متعلق به خود استاد باشد
 */
export async function GET(req: NextRequest) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const exams = await db.exam.findMany({
      where: { creatorId: teacher.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        course: { select: { title: true } },
        class: { select: { title: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    });
    return NextResponse.json(exams);
  } catch (error) {
    console.error("آزمون‌های استاد — GET:", error);
    return NextResponse.json(
      { error: "خطا در دریافت آزمون‌ها." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const body = await req.json().catch(() => null);
    const data = parseExamInput(body);
    if (typeof data === "string") return bad(data);

    // آزمون دوره — دوره باید متعلق به خودِ استاد باشد
    if (data.courseId) {
      const course = await db.course
        .findUnique({ where: { id: data.courseId }, select: { id: true, teacherId: true } })
        .catch(() => null);
      if (!course) return bad("دوره‌ی انتخاب‌شده یافت نشد.");
      if (course.teacherId !== teacher.id)
        return bad("فقط می‌توانید آزمون دوره‌های خودتان را بسازید.");
    }

    // آزمون کلاس — کلاس باید متعلق به خودِ استاد باشد
    if (data.classId) {
      const classRoom = await db.classRoom
        .findUnique({ where: { id: data.classId }, select: { id: true, teacherId: true } })
        .catch(() => null);
      if (!classRoom) return bad("کلاس انتخاب‌شده یافت نشد.");
      if (classRoom.teacherId !== teacher.id)
        return bad("فقط می‌توانید آزمون کلاس‌های خودتان را بسازید.");
    }

    const exam = await db.exam.create({
      data: {
        title: data.title,
        description: data.description,
        accessType: data.accessType,
        courseId: data.accessType === "course" ? data.courseId : null,
        classId: data.accessType === "class" ? data.classId : null,
        password: data.password,
        durationMinutes: data.durationMinutes,
        allowBack: data.allowBack,
        published: data.published,
        creatorId: teacher.id,
      },
      include: {
        course: { select: { title: true } },
        class: { select: { title: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    });
    return NextResponse.json(exam, { status: 201 });
  } catch (error) {
    console.error("آزمون استاد — POST:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد آزمون. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
