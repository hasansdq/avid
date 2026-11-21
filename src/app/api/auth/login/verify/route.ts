import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { verifyOtpOnly, consumeOtp } from "@/lib/user-auth";

/**
 * POST /api/auth/login/verify — مرحله‌ی دوم ورود مدیر: تایید کد پیامکی.
 *
 * پیش‌نیاز: اعتبارنامه (نام کاربری + رمز) باید همین مرحله‌ی اول تایید
 * شده باشد؛ برای جلوگیری از دورزدن مرحله‌ی اول، رمز عبور نیز همراه کد
 * دریافت می‌شود و دوباره صحت‌سنجی می‌گردد. پس از تایید کد، نشست ساخته
 * و کوکی ست می‌شود.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const code = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";

    if (!username || !password || !code) {
      return NextResponse.json(
        { error: "نام کاربری، رمز عبور و کد تایید را وارد کنید." },
        { status: 400 }
      );
    }

    const admin = await db.adminUser.findUnique({ where: { username } });
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      return NextResponse.json(
        { error: "اعتبارنامه معتبر نیست؛ دوباره از مرحله‌ی اول وارد شوید." },
        { status: 401 }
      );
    }
    if (!admin.twoFactorEnabled || !admin.phone.trim()) {
      return NextResponse.json(
        {
          error:
            "تایید دومرحله‌ای برای این حساب فعال نیست؛ از مرحله‌ی اول (نام کاربری و رمز) وارد شوید.",
        },
        { status: 400 }
      );
    }

    const verified = await verifyOtpOnly(admin.phone, code);
    if (!verified.ok) {
      return NextResponse.json(
        { error: verified.error },
        { status: verified.status }
      );
    }

    // کد درست — مصرف و نشست ساخته می‌شود
    await consumeOtp(verified.otpId);
    const { token, maxAge } = await createSession(admin.id);

    const res = NextResponse.json({ ok: true, username: admin.username });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req, maxAge));
    return res;
  } catch (error) {
    console.error("login verify error:", error);
    return NextResponse.json(
      { error: "خطای داخلی سرور. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
