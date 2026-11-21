import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher, ownsCourse } from "@/lib/teacher";
import { bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/teacher/courses/[id]/enrollees — لیست کاربران ثبت‌نام‌شده در
 * دوره‌ی «خودِ» استاد، فقط برای مشاهده (بدون امکان ویرایش).
 *
 * Enrollment با «عنوان دوره» به Course وصل است؛ بنابراین لیست با تطبیق
 * عنوانِ دوره‌ی استاد ساخته می‌شود (همان منطق مالی استاد).
 *
 * هر ردیف: نام و نام خانوادگی، موبایل، کد ملی (اگر حساب متصل باشد)،
 * وضعیت ثبت‌نام، گروه انتخابی، وضعیت پرداخت پیش‌ثبت‌نام و تاریخ ثبت‌نام.
 * مدیریتی/حذف/ویرایشی روی این داده‌ها وجود ندارد — این مسیر فقط GET است.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;

    // مالکیت: دوره باید متعلق به همین استاد باشد (دوره‌ی خارج → ۴۰۴)
    const course = await db.course.findUnique({
      where: { id },
      select: { id: true, title: true, teacherId: true },
    });
    if (!course || !ownsCourse(course, teacher.id)) {
      return bad("دوره پیدا نشد.", 404);
    }

    const enrollments = await db.enrollment.findMany({
      where: { course: course.title },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        groupTitle: true,
        paymentStatus: true,
        createdAt: true,
        user: { select: { nationalId: true } },
      },
    });

    return NextResponse.json(
      {
        courseTitle: course.title,
        enrollees: enrollments,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ثبت‌نام‌شدگان دوره استاد — GET:", error);
    return NextResponse.json(
      { error: "خطا در دریافت کاربران دوره." },
      { status: 500 }
    );
  }
}
