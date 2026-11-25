import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { verifyOtpOnly } from "@/lib/user-auth";
import {
  clientIpOf,
  checkRate,
  hitRate,
  rateLimited,
  rateStorageError,
  RATE_LIMITS,
} from "@/lib/rate-limit";

/**
 * POST /api/auth/login/verify — مرحله‌ی دوم ورود مدیر: تایید کد پیامکی.
 *
 * پیش‌نیاز: اعتبارنامه (نام کاربری + رمز) باید همین مرحله‌ی اول تایید
 * شده باشد؛ برای جلوگیری از دورزدن مرحله‌ی اول، رمز عبور نیز همراه کد
 * دریافت می‌شود و دوباره صحت‌سنجی می‌گردد. پس از تایید کد (مصرفِ اتمیک)،
 * نشست ساخته و کوکی ست می‌شود.
 *
 * شکست رمز/کد در همان شمارنده‌های پایدارِ «ورود مدیر» (به‌ازای حساب و
 * IP) ثبت می‌شود تا brute-force روی هر دو مرحله با هم محدود بماند.
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

    // — محدودیت پایدارِ شکست‌های ورود (همان کلیدهای مرحله‌ی اول) —
    const keyUser = `admin-login:u:${username.toLowerCase()}`;
    const keyIp = `admin-login:ip:${clientIpOf(req)}`;
    const uLim = await checkRate(keyUser, RATE_LIMITS.adminLoginUser);
    const ipLim = await checkRate(keyIp, RATE_LIMITS.adminLoginIp);
    if (uLim.storageError || ipLim.storageError) {
      // محدودکننده نتوانست شمارش را ذخیره/بخواند — بی‌صدا رها نمی‌شود
      return rateStorageError();
    }
    if (uLim.exceeded || ipLim.exceeded) {
      const r = uLim.exceeded ? uLim : ipLim;
      return rateLimited(r.retryAfterSec);
    }

    const admin = await db.adminUser.findUnique({ where: { username } });
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      // شکست اعتبارنامه — شمارنده‌های پایدارِ ورود؛ نتیجه‌ی هر دو
      // فراخوانی بررسی می‌شود تا خطای ثبت شمارنده (storageError) بی‌صدا
      // نادیده گرفته نشود — پاسخ موقت ۵۰۳ قابل‌تلاش‌مجدد (بند ۳).
      const uHit = await hitRate(keyUser, RATE_LIMITS.adminLoginUser);
      const iHit = await hitRate(keyIp, RATE_LIMITS.adminLoginIp);
      if (uHit.storageError || iHit.storageError) {
        return rateStorageError();
      }
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

    // — محدودیت پایدارِ تایید کد: به‌ازای شماره و IP —
    const byPhone = await hitRate(
      `otp-verify:p:${admin.phone}`,
      RATE_LIMITS.otpVerifyPhone
    );
    const byIp = await hitRate(
      `otp-verify:ip:${clientIpOf(req)}`,
      RATE_LIMITS.otpVerifyIp
    );
    if (byPhone.storageError || byIp.storageError) {
      // محدودکننده نتوانست شمارش را ذخیره/بخواند — بی‌صدا رها نمی‌شود
      return rateStorageError();
    }
    if (byPhone.exceeded || byIp.exceeded) {
      const r = byPhone.exceeded ? byPhone : byIp;
      return rateLimited(r.retryAfterSec);
    }

    // کد دومرحله‌ای مدیر — هدف‌مند (admin_2fa)؛ مصرف اتمیک داخل تابع
    const verified = await verifyOtpOnly(admin.phone, code, "admin_2fa");
    if (!verified.ok) {
      return NextResponse.json(
        { error: verified.error },
        { status: verified.status }
      );
    }

    // کد درست (مصرف‌شده) — نشست ساخته می‌شود
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
