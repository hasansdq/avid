import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  findActiveOtp,
  issueOtp,
  deleteActiveOtp,
  OTP_RESEND_MS,
} from "@/lib/user-auth";
import { sendOtpSms } from "@/lib/sms";
import {
  clientIpOf,
  hitRate,
  rateLimited,
  rateStorageError,
  RATE_LIMITS,
} from "@/lib/rate-limit";

/**
 * POST /api/user/phone/request — مرحله‌ی اول فرم یکپارچه‌ی «ورود/ثبت‌نام»:
 * فقط شماره موبایل → ارسال کد تایید پیامکی (۶ رقم).
 *
 * body: { phone }
 *
 * برخلاف مسیرهای قدیمی، شماره‌ی ثبت‌نشده هم کد می‌گیرد (مسیر ثبت‌نام در
 * مرحله‌ی تایید کد تفکیک می‌شود). پاسخ شامل `exists` است تا فرم بتواند
 * راهنمای مناسب («ورود» یا «ثبت‌نام») را پیش از واردکردن کد نشان دهد.
 * کاربر مسدود کد دریافت نمی‌کند (۴۰۳).
 *
 * اگر سرویس پیامکی متصل نباشد (حالت نمایشی)، کد در پاسخ برگردانده
 * می‌شود تا جریان قابل تست باشد: { demo: true, devCode: "123456" }.
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

    // حساب مسدود نمی‌تواند کد بگیرد (نه ورود، نه ثبت‌نام مجدد همان شماره)
    const user = await db.user.findUnique({ where: { phone } });
    if (user?.status === "blocked") {
      return NextResponse.json(
        {
          error:
            "حساب شما توسط مدیر مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.",
        },
        { status: 403 }
      );
    }

    // — محدودیت پایدارِ ارسال کد: به‌ازای شماره و IP (شمارنده در دیتابیس
    // می‌ماند و با ری‌استارت صفر نمی‌شود) — سقف‌ها باز‌تر از استفاده‌ی عادی‌اند —
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

    // — محدودیت ارسال: کد فعال هنوز در دوره‌ی ارسال مجدد است —
    const active = await findActiveOtp(phone, "user_auth");
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

    const { code } = await issueOtp(phone, "user_auth");
    const sms = await sendOtpSms(phone, code);

    if (!sms.delivered) {
      // حالت نمایشی (فقط محیط توسعه و فقط وقتی هیچ سرویس پیامکی تنظیم
      // نشده است): بدون سرویس پیامکی واقعی، کد برای تست در پاسخ برگردانده
      // می‌شود. در production این مقدار هرگز برگردانده نمی‌شود.
      const devCodeVisible =
        sms.provider === "none" &&
        process.env.NODE_ENV !== "production" &&
        process.env.OTP_DEV_CODE !== "0";
      if (devCodeVisible) {
        return NextResponse.json({
          ok: true,
          exists: !!user,
          demo: true,
          devCode: code,
          expiresInSec: 300,
        });
      }

      // — ارسال پیامک واقعاً ناموفق بود: کد صادرشده بی‌استفاده است —
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

    return NextResponse.json({
      ok: true,
      exists: !!user,
      demo: false,
      expiresInSec: 300,
    });
  } catch (error) {
    console.error("phone otp request error:", error);
    return NextResponse.json(
      { error: "خطا در ارسال کد تایید. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
