import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireAdmin,
  verifyPassword,
  hashPassword,
  createSession,
  SESSION_COOKIE,
} from "@/lib/auth";
import { requestSecure } from "@/lib/http";

/**
 * POST /api/admin/account/password — تغییر رمز عبور مدیر.
 *
 * • رمز فعلی باید درست باشد؛
 * • رمز جدید حداقل ۸ نویسه است؛
 * • همه‌ی نشست‌های قبلی باطل می‌شوند و همین دستگاه با کوکی‌ی نو
 *   (نشست تازه) وارد می‌ماند — یعنی «ابطال همه نشست‌های قبلی».
 */
export async function POST(req: NextRequest) {
  const { admin, denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "رمز فعلی و رمز جدید را وارد کنید." },
        { status: 400 },
      );
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "رمز جدید باید حداقل ۸ نویسه باشد." },
        { status: 400 },
      );
    }

    const record = await db.adminUser.findUnique({
      where: { id: admin.id },
    });
    if (!record || !verifyPassword(currentPassword, record.passwordHash)) {
      return NextResponse.json(
        { error: "رمز فعلی نادرست است." },
        { status: 400 },
      );
    }

    await db.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: hashPassword(newPassword) },
    });

    // — ابطال همه‌ی نشست‌های قبلی و صدور نشست نو برای همین ورود —
    await db.adminSession.deleteMany({ where: { adminId: admin.id } });
    const { token, maxAge } = await createSession(admin.id);

    const res = NextResponse.json({ ok: true, revokedSessions: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestSecure(req),
      maxAge,
      path: "/",
    });
    return res;
  } catch (error) {
    console.error("change password error:", error);
    return NextResponse.json(
      { error: "خطای داخلی سرور. لطفاً دوباره تلاش کنید." },
      { status: 500 },
    );
  }
}
