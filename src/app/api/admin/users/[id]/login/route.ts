import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import { createUserSession, withUserCookie } from "@/lib/user-auth";

/**
 * POST /api/admin/users/[id]/login — ورود مدیر به سایت «به عنوان کاربر».
 *
 * بدون تایید پیامکی و بدون رمز: برای کاربر مورد نظر نشست سایت ساخته و
 * کوکی avid_user در مرورگر مدیر ست می‌شود؛ سپس مدیر (در تب جدید) با
 * هویت همان کاربر در سایت و پنل کاربران حرکت می‌کند.
 *
 * پاسخ: { ok, user: { id, firstName, lastName, phone }, redirect: "/panel" }
 *
 * • کاربر مسدود نمی‌تواند وارد شود (مثل ورود معمولی سایت).
 * • نشست مدیر (avid_admin) دست‌نخورده باقی می‌ماند.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const user = await db.user.findUnique({ where: { id } });
    if (!user) return bad("کاربری با این شناسه یافت نشد.", 404);
    if (user.status === "blocked") {
      return bad(
        "این کاربر مسدود است و نمی‌توان با حساب او وارد سایت شد.",
        403
      );
    }

    const { token, maxAge } = await createUserSession(user.id);

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
      },
      redirect: "/panel",
    });
    return withUserCookie(res, token, maxAge);
  } catch (error) {
    console.error("admin user login-as error:", error);
    return NextResponse.json(
      { error: "خطا در ورود به حساب کاربر. دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
