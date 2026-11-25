import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/teacher";
import { bad } from "@/lib/api-helpers";
import { parseExamInput } from "@/lib/exam-io";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/teacher/exams/[id] — آزمون خودِ استاد با سوالات کامل (برای ادیتور).
 * PATCH /api/teacher/exams/[id] — ویرایش مشخصات آزمون خودِ استاد.
 * DELETE /api/teacher/exams/[id] — حذف آزمون خودِ استاد (با سوالات و شرکت‌ها — آبشار).
 *
 * مالکیت: فقط آزمون‌های creatorId = استادِ جاری قابل دسترس‌اند.
 */
async function ownExam(id: string, teacherId: string) {
  return db.exam
    .findUnique({ where: { id }, select: { id: true, creatorId: true } })
    .then((exam) => (exam && exam.creatorId === teacherId ? exam : null))
    .catch(() => null);
}

export async function GET(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;
    if (!(await ownExam(id, teacher.id)))
      return bad("آزمون موردنظر یافت نشد یا متعلق به شما نیست.", 404);

    const exam = await db.exam.findUnique({
      where: { id },
      include: {
        course: { select: { title: true } },
        class: { select: { title: true } },
        questions: { orderBy: { order: "asc" } },
        _count: { select: { attempts: true } },
      },
    });
    if (!exam) return bad("آزمون یافت نشد.", 404);
    return NextResponse.json(exam);
  } catch (error) {
    console.error("آزمون استاد — GET:", error);
    return NextResponse.json(
      { error: "خطا در دریافت آزمون." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;
    if (!(await ownExam(id, teacher.id)))
      return bad("آزمون موردنظر یافت نشد یا متعلق به شما نیست.", 404);

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
        return bad("فقط می‌توانید آزمون را به دوره‌های خودتان وصل کنید.");
    }

    // آزمون کلاس — کلاس باید متعلق به خودِ استاد باشد
    if (data.classId) {
      const classRoom = await db.classRoom
        .findUnique({ where: { id: data.classId }, select: { id: true, teacherId: true } })
        .catch(() => null);
      if (!classRoom) return bad("کلاس انتخاب‌شده یافت نشد.");
      if (classRoom.teacherId !== teacher.id)
        return bad("فقط می‌توانید آزمون را به کلاس‌های خودتان وصل کنید.");
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

    if (!exam) return bad("آزمون یافت نشد.", 404);
    return NextResponse.json(exam);
  } catch (error) {
    console.error("آزمون استاد — PATCH:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش آزمون. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;
    if (!(await ownExam(id, teacher.id)))
      return bad("آزمون موردنظر یافت نشد یا متعلق به شما نیست.", 404);

    const exam = await db.exam.delete({ where: { id } }).catch(() => null);
    if (!exam) return bad("آزمون یافت نشد.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("آزمون استاد — DELETE:", error);
    return NextResponse.json(
      { error: "خطا در حذف آزمون. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
