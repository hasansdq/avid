import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher, ownsClass } from "@/lib/teacher";
import { bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/teacher/classes/[id]/members — لیست اعضای کلاسِ «خودِ» استاد
 * (جدیدترین عضویت اول).
 *
 * هر ردیف: شناسه‌ی عضویت، تاریخ عضویت و مشخصات کاربر (نام، نام خانوادگی،
 * موبایل، کد ملی) — برای نمایش در دیالوگ اعضای کلاس و حذف عضو.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;

    // مالکیت: کلاس باید متعلق به همین استاد باشد (کلاسِ خارج → ۴۰۴)
    const classRoom = await db.classRoom.findUnique({
      where: { id },
      select: { id: true, title: true, teacherId: true },
    });
    if (!classRoom || !ownsClass(classRoom, teacher.id)) {
      return bad("کلاس پیدا نشد.", 404);
    }

    const members = await db.classMembership.findMany({
      where: { classId: id },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            nationalId: true,
          },
        },
      },
    });

    return NextResponse.json({
      classTitle: classRoom.title,
      members,
    });
  } catch (error) {
    console.error("اعضای کلاس استاد — GET:", error);
    return NextResponse.json(
      { error: "خطا در دریافت اعضای کلاس." },
      { status: 500 }
    );
  }
}
