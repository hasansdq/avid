import { NextRequest, NextResponse } from "next/server";
import { findActiveOtp, issueOtp, deleteActiveOtp, OTP_RESEND_MS } from "@/lib/user-auth";
import { sendOtpSms } from "@/lib/sms";

/**
 * POST /api/user/otp/request — مرحله‌ی اول فرم پیش‌ثبت‌نام:
 * نام، نام خانوادگی و شماره موبایل → ارسال کد تایید پیامکی (۶ رقم).
 *
 * body: { firstName, lastName, phone }
 *
 * اگر سرویس پیامکی متصل نباشد (حالت نمایشی)، کد در پاسخ برگردانده
 * می‌شود تا جریان قابل تست باشد: { demo: true, devCode: "123456" }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const firstName =
      typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName =
      typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const phone =
      typeof body?.phone === "string" ? body.phone.replace(/[\s-]/g, "") : "";

    if (firstName.length < 2 || firstName.length > 40) {
      return NextResponse.json(
        { error: "نام معتبر وارد کنید (۲ تا ۴۰ نویسه)." },
        { status: 400 }
      );
    }
    if (lastName.length < 2 || lastName.length > 40) {
      return NextResponse.json(
        { error: "نام خانوادگی معتبر وارد کنید (۲ تا ۴۰ نویسه)." },
        { status: 400 }
      );
    }
    if (!/^09\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: "شماره موبایل معتبر نیست (مثال: 09123456789)." },
        { status: 400 }
      );
    }

    // — محدودیت ارسال: کد فعال هنوز در دوره‌ی ارسال مجدد است —
    const active = await findActiveOtp(phone);
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

    const { code } = await issueOtp(phone);
    const sms = await sendOtpSms(phone, code);

    if (!sms.delivered) {
      // حالت نمایشی (فقط محیط توسعه و فقط وقتی هیچ سرویس پیامکی تنظیم
      // نشده است): بدون سرویس پیامکی واقعی، کد برای تست در پاسخ برگردانده
      // می‌شود. در production این مقدار هرگز برگردانده نمی‌شود (حتی با
      // OTP_DEV_CODE=1) و اگر سرویس تنظیم شده باشد ولی تحویل شکست خورده
      // باشد، همان خطای واقعی به فرم برمی‌گردد.
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
    console.error("otp request error:", error);
    return NextResponse.json(
      { error: "خطا در ارسال کد تایید. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
