import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/classes/[id]/members — لیست اعضای کلاس (جدیدترین عضویت اول).
 *
 * هر ردیف: شناسه‌ی عضویت، تاریخ عضویت و مشخصات کاربر (نام، نام خانوادگی،
 * موبایل، کد ملی) — برای نمایش در دیالوگ اعضای کلاس و حذف عضو.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const classRoom = await db.classRoom.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!classRoom) return bad("کلاسی با این شناسه یافت نشد.", 404);

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
    console.error("class members GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت اعضای کلاس." },
      { status: 500 }
    );
  }
}
