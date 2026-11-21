import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import { parseExamInput } from "@/lib/exam-io";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/exams/[id] — آزمون با سوالات کامل (برای ادیتور سوالات)
 * PATCH /api/admin/exams/[id] — ویرایش مشخصات آزمون
 * DELETE /api/admin/exams/[id] — حذف آزمون (با سوالات و شرکت‌ها — آبشار)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const exam = await db.exam.findUnique({
      where: { id },
      include: {
        course: { select: { title: true } },
        class: { select: { title: true } },
        questions: { orderBy: { order: "asc" } },
        _count: { select: { attempts: true } },
      },
    });
    if (!exam) return bad("آزمونی با این شناسه یافت نشد.", 404);
    return NextResponse.json(exam);
  } catch (error) {
    console.error("exam GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت آزمون." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const data = parseExamInput(body);
    if (typeof data === "string") return bad(data);

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

    const exam = await db.exam
      .update({
        where: { id },
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
      })
      .catch(() => null);

    if (!exam) return bad("آزمونی با این شناسه یافت نشد.", 404);
    return NextResponse.json(exam);
  } catch (error) {
    console.error("exam PATCH error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش آزمون. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const exam = await db.exam.delete({ where: { id } }).catch(() => null);
    if (!exam) return bad("آزمونی با این شناسه یافت نشد.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("exam DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف آزمون. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
