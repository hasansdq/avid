import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import {
  findActiveOtp,
  issueOtp,
  deleteActiveOtp,
  OTP_RESEND_MS,
} from "@/lib/user-auth";
import { sendOtpSms } from "@/lib/sms";
import {
  clientIpOf,
  checkRate,
  hitRate,
  rateLimited,
  rateStorageError,
  RATE_LIMITS,
} from "@/lib/rate-limit";

/**
 * POST /api/auth/login — مرحله‌ی اول ورود مدیر: نام کاربری + رمز عبور.
 *
 *  • تایید دومرحله‌ای «غیرفعال» (پیش‌فرض): پس از تایید اعتبارنامه، نشست
 *    ساخته و کوکی ست می‌شود — همان رفتار پیشین.
 *  • تایید دومرحله‌ای «فعال»: اعتبارنامه تایید می‌شود اما نشست ساخته
 *    نمی‌شود؛ کد ۶ رقمی به شماره‌ی موبایل مدیر پیامک می‌شود و پاسخ
 *    { ok: true, twoFactor: true } برمی‌گردد تا فرم به مرحله‌ی دوم برود.
 *    در حالت نمایشی (بدون سرویس پیامکی و خارج از production) کد در
 *    devCode برگردانده می‌شود تا جریان قابل تست باشد (همان الگوی
 *    مسیر کاربری /api/user/phone/request).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "نام کاربری و رمز عبور را وارد کنید." },
        { status: 400 }
      );
    }

    // — محدودیت پایدارِ شکست‌های ورود: به‌ازای حساب و IP (شمارنده در
    // دیتابیس مانَدگار است و با ری‌استارت صفر نمی‌شود) — فقط «شکست»
    // شمرده می‌شود، پس ورود عادی کاربر مدیر مختل نمی‌شود —
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
      // شکست اعتبارنامه — در هر دو شمارنده ثبت می‌شود؛ نتیجه‌ی هر دو
      // فراخوانی بررسی می‌شود: اگر ثبت شمارنده در دیتابیس شکست خورد
      // (storageError)، بی‌صدا نادیده گرفته نمی‌شود و پاسخ موقت ۵۰۳
      // قابل‌تلاش‌مجدد داده می‌شود تا پنجره‌ی brute-force با خطای
      // ذخیره‌سازی باز نماند (بند ۳).
      const uHit = await hitRate(keyUser, RATE_LIMITS.adminLoginUser);
      const iHit = await hitRate(keyIp, RATE_LIMITS.adminLoginIp);
      if (uHit.storageError || iHit.storageError) {
        return rateStorageError();
      }
      return NextResponse.json(
        { error: "نام کاربری یا رمز عبور اشتباه است." },
        { status: 401 }
      );
    }

    // — تایید دومرحله‌ای غیرفعال → ورود مستقیم با رمز —
    if (!admin.twoFactorEnabled || !admin.phone.trim()) {
      const { token, maxAge } = await createSession(admin.id);
      const res = NextResponse.json({ ok: true, username: admin.username });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req, maxAge));
      return res;
    }

    // — تایید دومرحله‌ای فعال → صدور کد پیامکی (بدون ساخت نشست) —

    // محدودیت پایدارِ ارسال کد دومرحله‌ای: به‌ازای شماره و IP
    const byPhone = await hitRate(
      `otp-req:p:${admin.phone}`,
      RATE_LIMITS.otpRequestPhone
    );
    const byIp = await hitRate(
      `otp-req:ip:${clientIpOf(req)}`,
      RATE_LIMITS.otpRequestIp
    );
    if (byPhone.storageError || byIp.storageError) {
      // محدودکننده نتوانست شمارش را ذخیره/بخواند — بی‌صدا رها نمی‌شود
      return rateStorageError();
    }
    if (byPhone.exceeded || byIp.exceeded) {
      const r = byPhone.exceeded ? byPhone : byIp;
      return rateLimited(r.retryAfterSec);
    }

    // محدودیت ارسال مجدد: کد فعالِ همین شماره هنوز در دوره‌ی ۶۰ ثانیه است
    const active = await findActiveOtp(admin.phone, "admin_2fa");
    if (active && Date.now() - active.createdAt.getTime() < OTP_RESEND_MS) {
      const waitSec = Math.ceil(
        (OTP_RESEND_MS - (Date.now() - active.createdAt.getTime())) / 1000
      );
      return NextResponse.json(
        {
          error: `کد تایید قبلی ارسال شده است؛ حدود ${waitSec} ثانیه دیگر دوباره تلاش کنید.`,
        },
        { status: 429 }
      );
    }

    const { code } = await issueOtp(admin.phone, "admin_2fa");
    const sms = await sendOtpSms(admin.phone, code);

    // حالت نمایشی (فقط محیط توسعه و فقط وقتی هیچ سرویس پیامکی تنظیم نشده
    // است): بدون سرویس واقعی، کد برای تست در پاسخ برگردانده می‌شود —
    // همان الگوی مسیر کاربری /api/user/phone/request. در production این
    // مقدار هرگز برگردانده نمی‌شود.
    const devCodeVisible =
      sms.provider === "none" &&
      process.env.NODE_ENV !== "production" &&
      process.env.OTP_DEV_CODE !== "0";

    if (devCodeVisible) {
      return NextResponse.json({
        ok: true,
        twoFactor: true,
        username: admin.username,
        demo: true,
        devCode: code,
      });
    }

    if (!sms.delivered) {
      // کد هرگز به دست مدیر نرسیده — حذف کد تا قفل ۶۰ ثانیه‌ای مانع تلاش مجدد نشود
      if (sms.provider !== "none") await deleteActiveOtp(admin.phone);
      const message =
        sms.provider === "none"
          ? "سرویس پیامکی تنظیم نشده است؛ ابتدا از ماژول «پنل پیامکی» سرویس را پیکربندی کنید یا تایید دومرحله‌ای را غیرفعال کنید."
          : sms.error ?? "ارسال کد پیامکی ناموفق بود؛ لطفاً دوباره تلاش کنید.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      twoFactor: true,
      username: admin.username,
    });
  } catch (error) {
    console.error("login error:", error);
    return NextResponse.json(
      { error: "خطای داخلی سرور. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
