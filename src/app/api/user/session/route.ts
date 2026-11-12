import { NextRequest, NextResponse } from "next/server";
import { destroyUserSession, getSessionUser } from "@/lib/user-auth";

/**
 * GET /api/user/session — کاربر واردشده (حساب تاییدشده با پیامک) یا null.
 *
 * فرم پیش‌ثبت‌نام با همین پاسخ تشخیص می‌دهد که مرحله‌ی اول (ثبت‌نام و
 * تایید شماره) انجام شده است یا نه.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    return NextResponse.json(
      { user },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("user session GET error:", error);
    return NextResponse.json({ user: null });
  }
}

/** DELETE /api/user/session — خروج از حساب کاربری */
export async function DELETE(req: NextRequest) {
  try {
    await destroyUserSession(req);
    const res = NextResponse.json({ ok: true });
    res.cookies.set("avid_user", "", { path: "/", maxAge: 0 });
    return res;
  } catch (error) {
    console.error("user session DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در خروج از حساب. دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
