import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findActiveOtp, issueOtp, deleteActiveOtp, OTP_RESEND_MS } from "@/lib/user-auth";
import { sendOtpSms } from "@/lib/sms";
import {
  clientIpOf,
  hitRate,
  rateLimited,
  rateStorageError,
  RATE_LIMITS,
} from "@/lib/rate-limit";

/**
 * POST /api/panel/otp/request — درخواست کد ورود به پنل کاربر.
 *
 * body: { phone }
 *
 * برخلاف ثبت‌نام، حساب باید از قبل وجود داشته باشد؛ کاربران مسدود
 * نمی‌توانند کد دریافت کنند. در حالت نمایشی (سرویس پیامکی متصل نیست)
 * کد در پاسخ برگردانده می‌شود: { demo: true, devCode }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const phone =
      typeof body?.phone === "string" ? body.phone.replace(/[\s-]/g, "") : "";

    if (!/^09\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: "شماره موبایل معتبر نیست (مثال: 09123456789)." },
        { status: 400 }
      );
    }

    // — حساب باید از قبل (از طریق فرم ثبت‌نام دوره) وجود داشته باشد —
    const user = await db.user.findUnique({ where: { phone } });
    if (!user) {
      return NextResponse.json(
        {
          error:
            "حسابی با این شماره یافت نشد. ابتدا از طریق فرم ثبت‌نام دوره، حساب بسازید.",
        },
        { status: 404 }
      );
    }
    if (user.status === "blocked") {
      return NextResponse.json(
        {
          error:
            "حساب شما توسط مدیر مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.",
        },
        { status: 403 }
      );
    }

    // — محدودیت پایدارِ ارسال کد: به‌ازای شماره و IP —
    const byPhone = await hitRate(
      `otp-req:p:${phone}`,
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

    // — محدودیت ارسال مجدد (مشابه مسیر ثبت‌نام) —
    const active = await findActiveOtp(phone, "panel_login");
    if (active && Date.now() - active.createdAt.getTime() < OTP_RESEND_MS) {
      const waitSec = Math.ceil(
        (OTP_RESEND_MS - (Date.now() - active.createdAt.getTime())) / 1000
      );
      return NextResponse.json(
        {
          error: `کد تایید قبلی برای این شماره ارسال شده است؛ حدود ${waitSec} ثانیه دیگر دوباره درخواست دهید.`,
        },
        { status: 429 }
      );
    }

    const { code } = await issueOtp(phone, "panel_login");
    const sms = await sendOtpSms(phone, code);

    if (!sms.delivered) {
      // حالت نمایشی (فقط محیط توسعه و فقط وقتی هیچ سرویس پیامکی تنظیم
      // نشده است): بدون سرویس پیامکی واقعی، کد برای تست در پاسخ برگردانده
      // می‌شود. در production این مقدار هرگز برگردانده نمی‌شود (حتی با
      // OTP_DEV_CODE=1) و اگر سرویس تنظیم شده باشد ولی تحویل شکست خورده
      // باشد، همان خطای واقعی به فرم ورود برمی‌گردد.
      const devCodeVisible =
        sms.provider === "none" &&
        process.env.NODE_ENV !== "production" &&
        process.env.OTP_DEV_CODE !== "0";
      if (devCodeVisible) {
        return NextResponse.json({
          ok: true,
          demo: true,
          devCode: code,
          expiresInSec: 300,
        });
      }

      // — ارسال پیامک واقعاً ناموفق بود: کد صادرشده بی‌استفاده است —
      // حذف می‌شود تا «ارسال مجدد» بلافاصله ممکن باشد (بدون قفل
      // ۶۰ ثانیه‌ای) و خطا همان‌جا در فرم نمایش داده شود.
      await deleteActiveOtp(phone);
      const reason =
        sms.provider === "none"
          ? "سرویس پیامک سایت تنظیم نشده است؛ لطفاً با پشتیبانی تماس بگیرید."
          : sms.error || "تحویل پیامک به مخابرات ناموفق بود.";
      return NextResponse.json(
        {
          error: `ارسال کد پیامکی ناموفق بود — ${reason}`,
          smsFailed: true,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, demo: false, expiresInSec: 300 });
  } catch (error) {
    console.error("panel otp request error:", error);
    return NextResponse.json(
      { error: "خطا در ارسال کد تایید. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
