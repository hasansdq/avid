import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; memberId: string }> };

/**
 * DELETE /api/admin/classes/[id]/members/[memberId] — حذف عضویت یک کاربر
 * از کلاس (memberId = شناسه‌ی رکورد عضویت، نه شناسه‌ی کاربر).
 */
export async function DELETE(
  req: NextRequest,
  { params }: Params
) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id, memberId } = await params;

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
    console.error("class member DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف عضو از کلاس. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
