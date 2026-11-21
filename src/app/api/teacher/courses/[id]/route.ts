import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher, ownsCourse } from "@/lib/teacher";
import { parseCourse, bad } from "@/lib/api-helpers";
import { syncGroups, syncInstallmentTemplate } from "@/lib/course-write";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/teacher/courses/[id] — ویرایش دوره‌ی «خودِ» استاد (دوره‌های
 * دیگران یا دوره‌های مدیر ۴۰۴ برمی‌گردند) با همان همگام‌سازی گروه‌ها و
 * قالب اقساطِ پنل مدیریت. DELETE /api/teacher/courses/[id] — حذف دوره‌ی
 * خودِ استاد.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const data = parseCourse(body);
    if (typeof data === "string") return bad(data);

    const { groups, installments, ...courseData } = data;

    // مالکیت: دوره باید متعلق به همین استاد باشد (دوره‌ی خارج → ۴۰۴)
    const exists = await db.course.findUnique({ where: { id } });
    if (!exists || !ownsCourse(exists, teacher.id)) {
      return bad("دوره پیدا نشد.", 404);
    }

    await db.course.update({ where: { id }, data: courseData });

    // — همگام‌سازی گروه‌ها (دوره‌های حضوری/ترکیبی؛ برای آنلاین همه‌ی گروه‌ها حذف می‌شوند) —
    const blocked = await syncGroups(id, groups);
    if (blocked) return blocked;

    // — همگام‌سازی قالب اقساط (تعداد و سررسیدها) —
    await syncInstallmentTemplate(id, installments);

    // پاسخ: دوره‌ی به‌روزشده همراه گروه‌ها و قالب اقساط
    const course = await db.course.findUnique({
      where: { id },
      include: {
        groups: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        installmentTemplate: { orderBy: { index: "asc" } },
      },
    });
    return NextResponse.json(course);
  } catch (error) {
    console.error("دوره‌های استاد — PUT:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش دوره. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;

    // مالکیت: دوره باید متعلق به همین استاد باشد (دوره‌ی خارج → ۴۰۴)
    const exists = await db.course.findUnique({
      where: { id },
      select: { id: true, teacherId: true },
    });
    if (!exists || !ownsCourse(exists, teacher.id)) {
      return bad("دوره پیدا نشد.", 404);
    }

    // گروه‌های دوره با Cascade حذف می‌شوند؛ ثبت‌نام‌ها باقی می‌مانند
    // (پیوندشان SetNull می‌شود و عنوان دوره/گروه به‌صورت متن باقی می‌ماند)
    await db.course.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("دوره‌های استاد — DELETE:", error);
    return NextResponse.json(
      { error: "خطا در حذف دوره. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
