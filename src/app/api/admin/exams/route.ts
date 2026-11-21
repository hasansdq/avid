import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import { parseExamInput } from "@/lib/exam-io";

/**
 * GET /api/admin/exams — لیست آزمون‌ها (با عنوان دوره/کلاس و تعداد سوال/شرکت‌ها)
 * POST /api/admin/exams — ایجاد آزمون (به‌صورت خودکار یک‌بار در بانک آزمون‌ها ذخیره می‌شود)
 */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const exams = await db.exam.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        course: { select: { title: true } },
        class: { select: { title: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    });
    return NextResponse.json(exams);
  } catch (error) {
    console.error("exams GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت آزمون‌ها." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const data = parseExamInput(body);
    if (typeof data === "string") return bad(data);

    // آزمون دوره — دوره باید واقعی باشد
    if (data.courseId) {
      const course = await db.course
        .findUnique({ where: { id: data.courseId }, select: { id: true } })
        .catch(() => null);
      if (!course) return bad("دوره‌ی انتخاب‌شده یافت نشد.");
    }

    // آزمون کلاس — کلاس باید واقعی باشد
    if (data.classId) {
      const classRoom = await db.classRoom
        .findUnique({ where: { id: data.classId }, select: { id: true } })
        .catch(() => null);
      if (!classRoom) return bad("کلاس انتخاب‌شده یافت نشد.");
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
      },
      include: {
        course: { select: { title: true } },
        class: { select: { title: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    });
    return NextResponse.json(exam, { status: 201 });
  } catch (error) {
    console.error("exam POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد آزمون. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
