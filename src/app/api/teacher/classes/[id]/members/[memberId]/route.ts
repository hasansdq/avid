import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher, ownsClass } from "@/lib/teacher";
import { bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; memberId: string }> };

/**
 * DELETE /api/teacher/classes/[id]/members/[memberId] — حذف عضویت یک کاربر
 * از کلاسِ خودِ استاد (memberId = شناسه‌ی رکورد عضویت، نه شناسه‌ی کاربر).
 * عضویت باید به همین کلاس تعلق داشته باشد.
 */
export async function DELETE(
  req: NextRequest,
  { params }: Params
) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id, memberId } = await params;

    // مالکیت: کلاس باید متعلق به همین استاد باشد (کلاسِ خارج → ۴۰۴)
    const classRoom = await db.classRoom.findUnique({
      where: { id },
      select: { id: true, teacherId: true },
    });
    if (!classRoom || !ownsClass(classRoom, teacher.id)) {
      return bad("کلاس پیدا نشد.", 404);
    }

    // عضویت باید متعلق به همین کلاس باشد
    const membership = await db.classMembership.findUnique({
      where: { id: memberId },
      select: { id: true, classId: true },
    });
    if (!membership || membership.classId !== id) {
      return bad("عضویت یافت نشد.", 404);
    }

    await db.classMembership.delete({ where: { id: memberId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("اعضای کلاس استاد — DELETE:", error);
    return NextResponse.json(
      { error: "خطا در حذف عضو از کلاس. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
