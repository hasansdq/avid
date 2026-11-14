import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireAdmin,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

/**
 * POST /api/admin/account/sessions/revoke — ابطال همه‌ی نشست‌های ورود مدیر.
 *
 * همه‌ی رکوردهای AdminSession حذف می‌شوند (خروج از همه دستگاه‌ها)؛
 * کوکی جاری هم پاک می‌شود تا همان لحظه به صفحه‌ی ورود برگردد.
 */
export async function POST(req: NextRequest) {
  const { admin, denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const revoked = await db.adminSession.deleteMany({
      where: { adminId: admin.id },
    });

    const res = NextResponse.json({ ok: true, revoked: revoked.count });
    res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(req, 0));
    return res;
  } catch (error) {
    console.error("revoke sessions error:", error);
    return NextResponse.json(
      { error: "خطای داخلی سرور. لطفاً دوباره تلاش کنید." },
      { status: 500 },
    );
  }
}
