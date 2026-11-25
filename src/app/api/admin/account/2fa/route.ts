import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, verifyPassword } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import {
  findActiveOtp,
  issueOtp,
  deleteActiveOtp,
  verifyOtpOnly,
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
 * PUT /api/admin/account/2fa — تنظیم تایید دومرحله‌ای پیامکی ورود مدیر.
 *
 * امنیت (احراز مجدد + تایید شماره‌ی جدید):
 *  • هر تغییر نیازمند «رمز عبور فعلی» است (احراز مجددِ همان نشست کافی نیست).
 *  • تغییر شماره‌ی موبایل دو مرحله‌ای است — شماره‌ی «جدید» پیش از ثبت باید
 *    با کد پیامکی تایید شود:
 *      مرحله‌ی ۱) body: { phone, currentPassword } بدون code
 *        → کد به «شماره‌ی جدید» پیامک می‌شود؛ چیزی ذخیره نمی‌شود
 *      مرحله‌ی ۲) body: { phone, currentPassword, code, twoFactorEnabled? }
 *        → پس از تایید کد، شماره (و کلید فعال‌سازی در صورت ارسال) ذخیره می‌شود
 *  • غیرفعال‌کردن دومرحله‌ای هم با همان رمز عبور فعلی ممکن است (احراز مجدد).
 *
 * body: { phone?, twoFactorEnabled?, currentPassword, code? }
 *  • فعال‌سازی (twoFactorEnabled=true) نیازمند شماره‌ی موبایل معتبر است.
 */
export async function PUT(req: NextRequest) {
  const { admin, denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // — احراز مجدد: رمز عبور فعلی برای هر تغییری الزامی است —
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (!currentPassword) {
      return bad("برای تغییر تنظیمات امنیتی، رمز عبور فعلی را وارد کنید.");
    }
    if (!verifyPassword(currentPassword, admin.passwordHash)) {
      return bad("رمز عبور فعلی نادرست است.", 401);
    }

    // — شماره موبایل (در صورت ارسال) —
    let phone: string | undefined;
    if (body.phone !== undefined) {
      phone = str(String(body.phone));
      if (phone !== "" && !/^09\d{9}$/.test(phone)) {
        return bad("شماره موبایل مدیر معتبر نیست (مثال: 09123456789).");
      }
    }

    // — کلید فعال‌سازی (در صورت ارسال) —
    let twoFactorEnabled: boolean | undefined;
    if (body.twoFactorEnabled !== undefined) {
      twoFactorEnabled = body.twoFactorEnabled === true;
    }

    if (twoFactorEnabled === undefined && phone === undefined) {
      return bad("چیزی برای ذخیره ارسال نشده است.");
    }

    // — تغییر شماره‌ی موبایل: شماره‌ی «جدید» باید پیش از ثبت تایید شود —
    const newPhone =
      phone !== undefined && phone !== "" && phone !== admin.phone ? phone : null;
    if (newPhone !== null) {
      const code = str(String(body.code ?? ""));

      // — مرحله‌ی ۱: بدون کد → صدور کد به شماره‌ی جدید (ذخیره‌ای در کار نیست) —
      if (!code) {
        // محدودیت پایدارِ ارسال کد: به‌ازای شماره و IP
        const byPhone = await hitRate(
          `otp-req:p:${newPhone}`,
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
        // محدودیت ارسال مجدد ۶۰ ثانیه‌ای برای همین شماره/هدف
        const active = await findActiveOtp(newPhone, "admin_phone");
        if (active && Date.now() - active.createdAt.getTime() < OTP_RESEND_MS) {
          const waitSec = Math.ceil(
            (OTP_RESEND_MS - (Date.now() - active.createdAt.getTime())) / 1000
          );
          return bad(
            `کد تایید قبلی برای این شماره ارسال شده است؛ حدود ${waitSec} ثانیه دیگر دوباره تلاش کنید.`,
            429
          );
        }

        const { code: newCode } = await issueOtp(newPhone, "admin_phone");
        const sms = await sendOtpSms(newPhone, newCode);

        // حالت نمایشی (محیط توسعه بدون سرویس پیامکی): کد در پاسخ برمی‌گردد
        const devCodeVisible =
          sms.provider === "none" &&
          process.env.NODE_ENV !== "production" &&
          process.env.OTP_DEV_CODE !== "0";
        if (devCodeVisible) {
          return NextResponse.json({
            ok: true,
            otpSent: true,
            phone: newPhone,
            demo: true,
            devCode: newCode,
          });
        }

        if (!sms.delivered) {
          // کد هرگز به دست مدیر نرسید — حذف تا قفل ۶۰ ثانیه‌ای مانع تلاش مجدد نشود
          if (sms.provider !== "none") await deleteActiveOtp(newPhone);
          const message =
            sms.provider === "none"
              ? "سرویس پیامکی تنظیم نشده است؛ ابتدا از ماژول «پنل پیامکی» سرویس را پیکربندی کنید."
              : sms.error ?? "ارسال کد پیامکی ناموفق بود؛ لطفاً دوباره تلاش کنید.";
          return NextResponse.json({ error: message }, { status: 502 });
        }

        return NextResponse.json({ ok: true, otpSent: true, phone: newPhone });
      }

      // — مرحله‌ی ۲: با کد → تایید کدِ شماره‌ی جدید و سپس ذخیره —
      const verified = await verifyOtpOnly(newPhone, code, "admin_phone");
      if (!verified.ok) {
        return NextResponse.json(
          { error: verified.error },
          { status: verified.status }
        );
      }
    }

    // فعال‌سازی نیازمند شماره (برای ارسال کد) است — جدید یا از قبل ذخیره‌شده
    const effectivePhone = phone !== undefined ? phone : admin.phone;
    if (twoFactorEnabled && !/^09\d{9}$/.test(effectivePhone)) {
      return bad(
        "برای فعال‌سازی تایید دومرحله‌ای ابتدا شماره موبایل مدیر را وارد کنید."
      );
    }

    const updated = await db.adminUser.update({
      where: { id: admin.id },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(twoFactorEnabled !== undefined ? { twoFactorEnabled } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      phone: updated.phone,
      twoFactorEnabled: updated.twoFactorEnabled,
    });
  } catch (error) {
    console.error("admin account 2fa error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی تنظیمات تایید دومرحله‌ای." },
      { status: 500 }
    );
  }
}
