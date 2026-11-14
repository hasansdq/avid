import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import {
  countActiveEnrollments,
  countActiveGroupEnrollments,
  isCourseFull,
  isGroupFull,
} from "@/lib/course-availability";

/**
 * GET /api/admin/enrollments — فهرست همه‌ی ثبت‌نام‌ها.
 *
 * POST /api/admin/enrollments — افزودن دستی یک کاربر به دانشجویان دوره
 * (دکمه‌ی «+» ردیف هر کاربر در ماژول مدیریت کاربران).
 *
 * body: {
 *   userId:  string,   // کاربر موجود
 *   courseId: string,  // دوره‌ی موجود
 *   groupId?: string,  // گروه زمان‌بندی — برای دوره‌های حضوری/ترکیبیِ گروه‌دار الزامی
 * }
 *
 * • نام و شماره‌ی ثبت‌نام از حساب کاربر خوانده می‌شود.
 * • ظرفیت دوره/گروه در سرور اعمال می‌شود (مثل فرم سایت).
 * • ثبت‌نام تکراری (همان کاربر در همان دوره) مجاز نیست.
 * • وضعیت پیش‌فرض: «ثبت‌نام نهایی» (enrolled).
 */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const enrollments = await db.enrollment.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(enrollments);
  } catch (error) {
    console.error("enrollments GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت ثبت‌نام‌ها." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const courseId =
      typeof body.courseId === "string" ? body.courseId.trim() : "";
    const groupId = typeof body.groupId === "string" ? body.groupId : "";

    if (!userId || !courseId) {
      return bad("کاربر و دوره باید مشخص شوند.");
    }

    // — کاربر —
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return bad("کاربری با این شناسه یافت نشد.", 404);

    // — دوره (همراه گروه‌های زمان‌بندی) —
    const courseRecord = await db.course.findUnique({
      where: { id: courseId },
      include: {
        groups: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!courseRecord) return bad("دوره‌ی انتخاب‌شده یافت نشد.", 404);

    // — ثبت‌نام تکراری؟ (فعال = غیر بایگانی) —
    const duplicate = await db.enrollment.findFirst({
      where: {
        userId,
        course: courseRecord.title,
        status: { not: "archived" },
      },
    });
    if (duplicate) {
      return bad(
        "این کاربر قبلاً در این دوره ثبت‌نام شده است؛ ثبت‌نام تکراری مجاز نیست.",
        409
      );
    }

    // — گروه/ظرفیت —
    let selectedGroup: { id: string; title: string } | null = null;
    if (courseRecord.type !== "online" && courseRecord.groups.length > 0) {
      const group = courseRecord.groups.find((g) => g.id === groupId);
      if (!group) {
        return bad(
          "برای این دوره‌ی گروه‌دار، گروه زمانی مورد نظر را انتخاب کنید."
        );
      }
      const groupEnrolled = await countActiveGroupEnrollments(group.id);
      if (isGroupFull(group, groupEnrolled)) {
        return bad(
          `ظرفیت «${group.title}» از دوره «${courseRecord.title}» تکمیل شده است؛ گروه دیگری انتخاب کنید.`,
          409
        );
      }
      selectedGroup = { id: group.id, title: group.title };
    } else {
      const enrolledCount = await countActiveEnrollments(courseRecord.title);
      if (isCourseFull(courseRecord, enrolledCount)) {
        return bad(
          `ظرفیت دوره «${courseRecord.title}» تکمیل شده است؛ امکان افزودن دانشجو وجود ندارد.`,
          409
        );
      }
    }

    const enrollment = await db.enrollment.create({
      data: {
        name: `${user.firstName} ${user.lastName}`.trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        course: courseRecord.title,
        status: "enrolled",
        ...(selectedGroup
          ? {
              group: { connect: { id: selectedGroup.id } },
              groupTitle: selectedGroup.title,
            }
          : {}),
        user: { connect: { id: user.id } },
      },
    });

    return NextResponse.json(enrollment, { status: 201 });
  } catch (error) {
    console.error("enrollments POST error:", error);
    return NextResponse.json(
      { error: "خطا در افزودن دانشجو به دوره." },
      { status: 500 }
    );
  }
}
