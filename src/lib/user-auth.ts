import { createHash, randomBytes, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import {
  isValidNationalId,
  normalizeNationalId,
} from "@/lib/national-id";
import { presencePulse, trackLogin, trackSignup } from "@/lib/stats";

/**
 * حساب کاربری و تایید پیامکی کاربران سایت (مرحله‌ی اول فرم پیش‌ثبت‌نام)
 *
 * جریان:
 *  ۱) POST /api/user/otp/request → نام، نام خانوادگی و موبایل؛ کد ۶ رقمی صادر می‌شود
 *  ۲) POST /api/user/otp/verify  → کد تایید می‌شود؛ حساب ایجاد/به‌روز و نشست ست می‌شود
 *  ۳) POST /api/enroll           → نیازمند نشست است (عبور از مرحله‌ی اول الزامی)
 */

export const USER_COOKIE = "avid_user";
export const USER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // ۳۰ روز

export const OTP_TTL_MS = 5 * 60 * 1000; // اعتبار کد: ۵ دقیقه
export const OTP_RESEND_MS = 60 * 1000; // فاصله‌ی مجاز بین دو درخواست کد
export const OTP_MAX_ATTEMPTS = 5; // حداکثر تلاش برای هر کد

/**
 * هدف‌مندی کد یک‌بارمصرف — هر کد به «هدف مشخصی» صادر و مصرف می‌شود؛
 * کدِ مسیر ورود کاربر در مسیر دومرحله‌ای مدیر (یا بالعکس) قابل استفاده نیست:
 *  • user_auth    → ورود/ثبت‌نام کاربر سایت (فرم یکپارچه + مسیر قدیمی user/otp)
 *  • panel_login  → ورود به پنل کاربر
 *  • admin_2fa    → مرحله‌ی دوم ورود مدیر
 *  • admin_phone  → تایید شماره‌ی موبایل «جدید» مدیر پیش از ثبت
 */
export type OtpPurpose = "user_auth" | "panel_login" | "admin_2fa" | "admin_phone";

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/* ---------------- هش کد (شش رقم) ---------------- */

function hashCode(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

/* ---------------- کد یک‌بارمصرف ---------------- */

export function generateOtpCode(): string {
  return String(randomInt(100000, 1000000)); // ۶ رقم
}

/** آیا برای این شماره همین الان کدِ فعالِ «همین هدف» در-دست-ارسال وجود دارد؟ */
export async function findActiveOtp(phone: string, purpose: OtpPurpose) {
  const otp = await db.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return null;
  if (otp.expiresAt < new Date()) return null; // منقضی — دیگر معتبر نیست
  return otp;
}

/**
 * حذف کدهای فعال صادرشده برای یک شماره — بعد از «شکست ارسال پیامک»
 * صدا زده می‌شود تا کاربر بدون انتظار برای قفل ۶۰ ثانیه‌ای ارسال مجدد،
 * بلافاصله بتواند دوباره کد بخواهد (کد هرگز به دست او نرسیده است).
 */
export async function deleteActiveOtp(phone: string) {
  await db.otpCode
    .deleteMany({ where: { phone, consumedAt: null } })
    .catch(() => {});
}

/** صادرکردن کد جدید برای شماره — نتیجه شامل کد متن‌آشکار فقط برای ارسال است */
export async function issueOtp(phone: string, purpose: OtpPurpose): Promise<{
  code: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}> {
  // پاک‌سازی کدهای منقضی/کهنه‌ی همین شماره و کدهای منقضی عمومی
  await db.otpCode.deleteMany({
    where: { OR: [{ phone, consumedAt: null, expiresAt: { lt: new Date() } }, { expiresAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } }] },
  });

  const code = generateOtpCode();
  const otp = await db.otpCode.create({
    data: {
      phone,
      codeHash: hashCode(phone, code),
      purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return {
    code,
    expiresAt: otp.expiresAt,
    resendAvailableAt: new Date(otp.createdAt.getTime() + OTP_RESEND_MS),
  };
}

/* ---------------- اتمیک: شمارش تلاش ناموفق و مصرف ---------------- */

/** پیام خطای موقت ذخیره‌سازی — پاسخ ۵۰۳ قابل‌تلاش‌مجدد */
const OTP_STORAGE_ERROR =
  "خطای موقت در ذخیره‌سازی؛ لطفاً چند لحظه بعد دوباره تلاش کنید.";

/** نتیجه‌ی ثبت تلاش ناموفق: شمرده شد / سقف پر شد / خطای ذخیره‌سازی */
type BadAttemptOutcome = "counted" | "exhausted" | "storage-error";

/**
 * ثبت اتمیکِ یک تلاش ناموفق — فقط تا سقف OTP_MAX_ATTEMPTS شمارش می‌شود؛
 * خروجی "exhausted" یعنی سقف پر شده (باید ۴۲۹ برگردد). افزایش شرطیِ
 * updateMany شمارشِ همزمانِ دو درخواست را هم درست نگه می‌دارد.
 *
 * «storage-error» یعنی شمارنده ثبت نشد — شمارش بی‌صدا رها نمی‌شود؛
 * فراخواننده باید پاسخ موقت (۵۰۳) بدهد، نه تایید یا ادامه‌ی جریان.
 */
async function recordBadAttempt(otpId: string): Promise<BadAttemptOutcome> {
  try {
    const res = await db.otpCode.updateMany({
      where: { id: otpId, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (res.count === 0) return "exhausted";
    return "counted";
  } catch {
    return "storage-error";
  }
}

/** نتیجه‌ی مصرف کد: مصرف شد / از قبل استفاده شده / خطای ذخیره‌سازی */
type ConsumeOutcome = "consumed" | "already-used" | "storage-error";

/**
 * مصرف اتمیک کد — فقط اگر «همین لحظه» مصرف‌نشده و معتبر باشد (count=1).
 * دو درخواست همزمان با یک کد: فقط اولین موفق می‌شود؛ دومی 400 می‌گیرد.
 *
 * «storage-error» یعنی ثبت مصرف ناموفق بود — در این حالت هیچ تایید موفق
 * یا نشستی صادر نمی‌شود؛ فراخواننده پاسخ موقتِ قابل‌تلاش‌مجدد (۵۰۳)
 * می‌دهد تا کاربر همان کدِ هنوز‌مصرف‌نشده را کمی بعد دوباره بزند.
 */
async function consumeOtpRow(otpId: string): Promise<ConsumeOutcome> {
  try {
    const res = await db.otpCode.updateMany({
      where: { id: otpId, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    return res.count === 1 ? "consumed" : "already-used";
  } catch {
    return "storage-error";
  }
}

/** بررسی کد — در صورت موفقیت کد «اتمیک» مصرف و کاربر برگردانده می‌شود */
export async function verifyOtp(
  phone: string,
  code: string,
  names: { firstName: string; lastName: string; nationalId?: string | null },
  purpose: OtpPurpose
): Promise<
  | { ok: true; user: SessionUser }
  | { ok: false; error: string; status: number }
> {
  const otp = await findActiveOtp(phone, purpose);
  if (!otp) {
    return {
      ok: false,
      status: 400,
      error: "کد فعالی برای این شماره صادر نشده است؛ دوباره درخواست دهید.",
    };
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      error: "تلاش‌های ناموفق زیاد بود؛ کد جدید درخواست دهید.",
    };
  }

  if (hashCode(phone, code) !== otp.codeHash) {
    const outcome = await recordBadAttempt(otp.id);
    if (outcome === "storage-error") {
      // شمارش ناموفق ثبت نشد — بی‌صدا رها نمی‌شود؛ پاسخ موقت ۵۰۳
      return { ok: false, status: 503, error: OTP_STORAGE_ERROR };
    }
    if (outcome === "exhausted") {
      return {
        ok: false,
        status: 429,
        error: "تلاش‌های ناموفق زیاد بود؛ کد جدید درخواست دهید.",
      };
    }
    return {
      ok: false,
      status: 400,
      error: "کد تایید اشتباه است؛ دوباره وارد کنید.",
    };
  }

  // کد ملی (اختیاری) — پیش از مصرف کد اعتبارسنجی می‌شود تا در صورت خطا،
  // کاربر بدون درخواست کد جدید بتواند مقدار را اصلاح کند
  let nationalId: string | null | undefined;
  if (typeof names.nationalId === "string" && names.nationalId.trim() !== "") {
    const clean = normalizeNationalId(names.nationalId);
    if (!isValidNationalId(clean)) {
      return {
        ok: false,
        status: 400,
        error: "کد ملی ۱۰ رقمی معتبر وارد کنید یا این فیلد را خالی بگذارید.",
      };
    }
    const owner = await db.user.findUnique({ where: { nationalId: clean } });
    if (owner && owner.phone !== phone) {
      return {
        ok: false,
        status: 409,
        error: "این کد ملی به حساب کاربری دیگری تعلق دارد.",
      };
    }
    nationalId = clean;
  }

  // کد درست — «اتمیک» مصرف می‌شود؛ رقابت همزمان فقط یک برنده دارد
  const consumed = await consumeOtpRow(otp.id);
  if (consumed === "storage-error") {
    // ثبت مصرف شکست خورد — تایید موفق/نشست صادر نمی‌شود؛ تلاش مجدد مجاز
    return { ok: false, status: 503, error: OTP_STORAGE_ERROR };
  }
  if (consumed !== "consumed") {
    return {
      ok: false,
      status: 400,
      error: "این کد همین الان استفاده شده است؛ کد جدید درخواست دهید.",
    };
  }

  const firstName = names.firstName.trim();
  const lastName = names.lastName.trim();
  const user = await db.user.upsert({
    where: { phone },
    create: { phone, firstName, lastName, ...(nationalId ? { nationalId } : {}) },
    // نام جدید فقط وقتی جایگزین می‌شود که ارسال شده باشد
    update: {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      // کد ملی فقط وقتی تغییر می‌کند که مقدار غیرخالی ارسال شده باشد
      ...(nationalId !== undefined ? { nationalId } : {}),
    },
  });

  return {
    ok: true,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
    },
  };
}

/* ---------------- نشست کاربر ---------------- */

/**
 * بررسی کد برای «ورود» کاربر موجود — برخلاف verifyOtp حساب را نمی‌سازد؛
 * کاربر باید از قبل (از طریق فرم ثبت‌نام دوره) وجود داشته باشد.
 * در صورت صحت کد، کد مصرف و رکورد کامل کاربر برگردانده می‌شود
 * (وضعیت مسدود بودن را فراخواننده بررسی می‌کند).
 */
export async function verifyOtpLogin(
  phone: string,
  code: string,
  purpose: OtpPurpose
): Promise<
  | { ok: true; user: User }
  | { ok: false; error: string; status: number }
> {
  const verified = await verifyOtpOnly(phone, code, purpose);
  if (!verified.ok) return verified;

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) {
    return {
      ok: false,
      status: 400,
      error: "حساب یافت نشد.",
    };
  }

  // کد درست و حساب موجود — کد (اتمیک، داخل verifyOtpOnly) مصرف شد؛ ورود ثبت می‌شود
  void trackLogin();

  return { ok: true, user };
}

/**
 * بررسیِ خالصِ کد یک‌بارمصرف (بدون ساخت/یافتن هیچ حسابی) — برای مسیرهای
 * غیرکاربری مثل دومرحله‌ای مدیر و تایید شماره‌ی جدید. کدِ درست «همین‌جا
 * اتمیک» مصرف می‌شود (مصرف موفق فقط یک بار ممکن است)؛ فراخواننده پس از
 * ok=true ادامه‌ی جریان (ساخت نشست و…) را انجام می‌دهد.
 */
export async function verifyOtpOnly(
  phone: string,
  code: string,
  purpose: OtpPurpose
): Promise<
  | { ok: true }
  | { ok: false; error: string; status: number }
> {
  const otp = await findActiveOtp(phone, purpose);
  if (!otp) {
    return {
      ok: false,
      status: 400,
      error: "کد فعالی برای این شماره صادر نشده است؛ دوباره درخواست دهید.",
    };
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      error: "تلاش‌های ناموفق زیاد بود؛ کد جدید درخواست دهید.",
    };
  }

  if (hashCode(phone, code) !== otp.codeHash) {
    const outcome = await recordBadAttempt(otp.id);
    if (outcome === "storage-error") {
      // شمارش ناموفق ثبت نشد — بی‌صدا رها نمی‌شود؛ پاسخ موقت ۵۰۳
      return { ok: false, status: 503, error: OTP_STORAGE_ERROR };
    }
    if (outcome === "exhausted") {
      return {
        ok: false,
        status: 429,
        error: "تلاش‌های ناموفق زیاد بود؛ کد جدید درخواست دهید.",
      };
    }
    return {
      ok: false,
      status: 400,
      error: "کد تایید اشتباه است؛ دوباره وارد کنید.",
    };
  }

  // کد درست — مصرف اتمیک؛ مصرف دوباره (همزمان/متوالی) ممکن نیست
  const consumed = await consumeOtpRow(otp.id);
  if (consumed === "storage-error") {
    // ثبت مصرف شکست خورد — تایید موفق/نشست صادر نمی‌شود؛ تلاش مجدد مجاز
    return { ok: false, status: 503, error: OTP_STORAGE_ERROR };
  }
  if (consumed !== "consumed") {
    return {
      ok: false,
      status: 400,
      error: "این کد همین الان استفاده شده است؛ کد جدید درخواست دهید.",
    };
  }
  return { ok: true };
}

/* ---------------- فرم یکپارچه‌ی ورود/ثبت‌نام (تایید شماره) ---------------- */

/** اعتبار توکن ثبت‌نام نیمه‌کاره — پس از تایید شماره، ۱۵ دقیقه فرصت تکمیل مشخصات */
export const PENDING_REG_TTL_MS = 15 * 60 * 1000;

/**
 * تایید شماره موبایل در فرم یکپارچه‌ی «ورود/ثبت‌نام» (کد پیامکی مصرف می‌شود):
 *  • حساب موجود → کاربر برگردانده می‌شود (ورود مستقیم؛ نشست را مسیر API می‌سازد)
 *  • حساب موجود نیست + مشخصات کامل (نام و نام خانوادگی) → حساب ساخته و برگردانده می‌شود
 *  • حساب موجود نیست + بدون مشخصات → توکنِ «ثبت‌نام نیمه‌کاره» صادر می‌شود تا
 *    مرحله‌ی ثبت‌نام بدون درخواست دوباره‌ی کد قابل تکمیل باشد.
 *
 * اعتبارسنجی مشخصات/کد ملی پیش از مصرف کد انجام می‌شود تا در صورت خطا،
 * کاربر بدون درخواست کد جدید بتواند مقدار را اصلاح کند.
 */
export async function verifyPhone(
  phone: string,
  code: string,
  names?: {
    firstName?: string;
    lastName?: string;
    nationalId?: string | null;
  },
  purpose: OtpPurpose = "user_auth"
): Promise<
  | { ok: true; isNew: false; user: SessionUser }
  | { ok: true; isNew: true; user: SessionUser }
  | { ok: true; isNew: true; pendingToken: string }
  | { ok: false; error: string; status: number }
> {
  const otp = await findActiveOtp(phone, purpose);
  if (!otp) {
    return {
      ok: false,
      status: 400,
      error: "کد فعالی برای این شماره صادر نشده است؛ دوباره درخواست دهید.",
    };
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      error: "تلاش‌های ناموفق زیاد بود؛ کد جدید درخواست دهید.",
    };
  }

  if (hashCode(phone, code) !== otp.codeHash) {
    const outcome = await recordBadAttempt(otp.id);
    if (outcome === "storage-error") {
      // شمارش ناموفق ثبت نشد — بی‌صدا رها نمی‌شود؛ پاسخ موقت ۵۰۳
      return { ok: false, status: 503, error: OTP_STORAGE_ERROR };
    }
    if (outcome === "exhausted") {
      return {
        ok: false,
        status: 429,
        error: "تلاش‌های ناموفق زیاد بود؛ کد جدید درخواست دهید.",
      };
    }
    return {
      ok: false,
      status: 400,
      error: "کد تایید اشتباه است؛ دوباره وارد کنید.",
    };
  }

  // کد ملی (اختیاری) — پیش از مصرف کد اعتبارسنجی می‌شود
  let nationalId: string | null | undefined;
  if (typeof names?.nationalId === "string" && names.nationalId.trim() !== "") {
    const clean = normalizeNationalId(names.nationalId);
    if (!isValidNationalId(clean)) {
      return {
        ok: false,
        status: 400,
        error: "کد ملی ۱۰ رقمی معتبر وارد کنید یا این فیلد را خالی بگذارید.",
      };
    }
    const owner = await db.user.findUnique({ where: { nationalId: clean } });
    if (owner && owner.phone !== phone) {
      return {
        ok: false,
        status: 409,
        error: "این کد ملی به حساب کاربری دیگری تعلق دارد.",
      };
    }
    nationalId = clean;
  }

  // نام‌ها (در صورت ارسال) پیش از مصرف کد اعتبارسنجی می‌شوند
  const firstName = (names?.firstName ?? "").trim();
  const lastName = (names?.lastName ?? "").trim();
  if (
    (firstName || lastName) &&
    (firstName.length < 2 ||
      firstName.length > 40 ||
      lastName.length < 2 ||
      lastName.length > 40)
  ) {
    return {
      ok: false,
      status: 400,
      error: "نام و نام خانوادگی معتبر وارد کنید (۲ تا ۴۰ نویسه).",
    };
  }

  // کد درست — مصرف «اتمیک»؛ رقابت همزمان فقط یک برنده دارد
  const consumed = await consumeOtpRow(otp.id);
  if (consumed === "storage-error") {
    // ثبت مصرف شکست خورد — تایید موفق/نشست صادر نمی‌شود؛ تلاش مجدد مجاز
    return { ok: false, status: 503, error: OTP_STORAGE_ERROR };
  }
  if (consumed !== "consumed") {
    return {
      ok: false,
      status: 400,
      error: "این کد همین الان استفاده شده است؛ کد جدید درخواست دهید.",
    };
  }

  const existing = await db.user.findUnique({ where: { phone } });
  if (existing) {
    // ورود کاربر موجود — مشخصات ارسالی (در صورت وجود) به‌روز می‌شود
    if (firstName || lastName || nationalId !== undefined) {
      await db.user
        .update({
          where: { id: existing.id },
          data: {
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
            ...(nationalId !== undefined ? { nationalId } : {}),
          },
        })
        .catch(() => {});
    }
    const fresh = await db.user.findUnique({ where: { phone } });
    if (!fresh) {
      return { ok: false, status: 500, error: "خطا در بازیابی حساب کاربری." };
    }
    // ورود موفق حسابِ موجود → آمار ورود
    void trackLogin();
    return {
      ok: true,
      isNew: false,
      user: {
        id: fresh.id,
        firstName: fresh.firstName,
        lastName: fresh.lastName,
        phone: fresh.phone,
      },
    };
  }

  // حساب موجود نیست + مشخصات کامل → ساخت مستقیم حساب
  if (firstName && lastName) {
    try {
      const user = await db.user.create({
        data: { phone, firstName, lastName, ...(nationalId ? { nationalId } : {}) },
      });
      // ثبت‌نام موفق (حساب تازه) → آمار ثبت‌نام
      void trackSignup();
      return {
        ok: true,
        isNew: true,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
        },
      };
    } catch (error) {
      console.error("verifyPhone create error:", error);
      return {
        ok: false,
        status: 500,
        error: "خطا در ایجاد حساب کاربری. لطفاً دوباره تلاش کنید.",
      };
    }
  }

  // بدون مشخصات → توکن ثبت‌نام نیمه‌کاره (یک‌بارمصرف، ۱۵ دقیقه)
  const pendingToken = randomBytes(32).toString("hex");
  try {
    await db.pendingRegistration.deleteMany({
      where: { OR: [{ phone }, { expiresAt: { lt: new Date() } }] },
    });
    await db.pendingRegistration.create({
      data: {
        phone,
        token: pendingToken,
        expiresAt: new Date(Date.now() + PENDING_REG_TTL_MS),
      },
    });
  } catch (error) {
    console.error("verifyPhone pending error:", error);
    return {
      ok: false,
      status: 500,
      error: "خطا در آماده‌سازی ثبت‌نام. لطفاً دوباره تلاش کنید.",
    };
  }
  return { ok: true, isNew: true, pendingToken };
}

/**
 * تکمیل ثبت‌نام با توکن نیمه‌کاره — مرحله‌ی دوم فرم یکپارچه:
 * مشخصات کاربر (نام، نام خانوادگی، کد ملی اختیاری) دریافت و حساب ساخته
 * می‌شود؛ توکن یک‌بارمصرف است و پس از تکمیل/انقضا حذف می‌گردد.
 * اگر حسابِ همان شماره در فاصله‌ی میان دو مرحله ساخته شده باشد، همان
 * حساب برگردانده می‌شود (رفعِ رقابتِ نادرِ ثبت‌نام همزمان).
 */
export async function completeRegistration(
  pendingToken: string,
  names: { firstName: string; lastName: string; nationalId?: string | null }
): Promise<
  | { ok: true; isNew: boolean; user: SessionUser }
  | { ok: false; error: string; status: number }
> {
  if (!pendingToken) {
    return {
      ok: false,
      status: 400,
      error: "ثبت‌نام نیمه‌کاره‌ای برای تکمیل وجود ندارد؛ دوباره کد تایید بگیرید.",
    };
  }

  const firstName = names.firstName.trim();
  const lastName = names.lastName.trim();
  if (firstName.length < 2 || firstName.length > 40) {
    return { ok: false, status: 400, error: "نام معتبر وارد کنید (۲ تا ۴۰ نویسه)." };
  }
  if (lastName.length < 2 || lastName.length > 40) {
    return {
      ok: false,
      status: 400,
      error: "نام خانوادگی معتبر وارد کنید (۲ تا ۴۰ نویسه).",
    };
  }

  // کد ملی (اختیاری) — فقط اعتبارسنجی ساختاری در اینجا؛ بررسی مالکیت
  // پس از یافتن رکورد نیمه‌کاره انجام می‌شود (شماره pending معلوم است)
  let nationalId: string | null | undefined;
  if (typeof names.nationalId === "string" && names.nationalId.trim() !== "") {
    const clean = normalizeNationalId(names.nationalId);
    if (!isValidNationalId(clean)) {
      return {
        ok: false,
        status: 400,
        error: "کد ملی ۱۰ رقمی معتبر وارد کنید یا این فیلد را خالی بگذارید.",
      };
    }
    nationalId = clean;
  }

  const pending = await db.pendingRegistration.findUnique({
    where: { token: pendingToken },
  });
  if (!pending || pending.expiresAt < new Date()) {
    if (pending) {
      await db.pendingRegistration
        .delete({ where: { id: pending.id } })
        .catch(() => {});
    }
    return {
      ok: false,
      status: 410,
      error: "مهلت تکمیل ثبت‌نام (۱۵ دقیقه) گذشته است؛ دوباره کد تایید دریافت کنید.",
    };
  }

  // حساب همان شماره در فاصله‌ی دو مرحله ساخته شده → ورود با همان حساب
  const raced = await db.user.findUnique({ where: { phone: pending.phone } });
  if (raced) {
    await db.pendingRegistration
      .delete({ where: { id: pending.id } })
      .catch(() => {});
    // ورود حسابِ موجود → آمار ورود
    void trackLogin();
    return {
      ok: true,
      isNew: false,
      user: {
        id: raced.id,
        firstName: raced.firstName,
        lastName: raced.lastName,
        phone: raced.phone,
      },
    };
  }

  // مالکیت کد ملی — حسابِ همان شماره وجود ندارد؛ مالکِ احتمالی لزاماً دیگر است
  if (nationalId) {
    const owner = await db.user.findUnique({ where: { nationalId } });
    if (owner && owner.phone !== pending.phone) {
      return {
        ok: false,
        status: 409,
        error: "این کد ملی به حساب کاربری دیگری تعلق دارد.",
      };
    }
  }

  try {
    const user = await db.user.create({
      data: {
        phone: pending.phone,
        firstName,
        lastName,
        ...(nationalId ? { nationalId } : {}),
      },
    });
    await db.pendingRegistration
      .delete({ where: { id: pending.id } })
      .catch(() => {});
    // ثبت‌نام موفق (تکمیل مرحله‌ی دوم) → آمار ثبت‌نام
    void trackSignup();
    return {
      ok: true,
      isNew: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
      },
    };
  } catch (error) {
    // رقابت نادر روی یکتایی شماره → بازیابی حسابِ موجود
    const again = await db.user.findUnique({ where: { phone: pending.phone } });
    if (again) {
      await db.pendingRegistration
        .delete({ where: { id: pending.id } })
        .catch(() => {});
      // ورود حسابِ موجود → آمار ورود
      void trackLogin();
      return {
        ok: true,
        isNew: false,
        user: {
          id: again.id,
          firstName: again.firstName,
          lastName: again.lastName,
          phone: again.phone,
        },
      };
    }
    console.error("completeRegistration error:", error);
    return {
      ok: false,
      status: 500,
      error: "خطا در تکمیل ثبت‌نام. لطفاً دوباره تلاش کنید.",
    };
  }
}

export async function createUserSession(userId: string) {
  await db.userSession
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});

  const token = randomBytes(32).toString("hex");
  await db.userSession.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + USER_SESSION_TTL_MS),
    },
  });
  return {
    token,
    maxAge: Math.floor(USER_SESSION_TTL_MS / 1000),
  };
}

export async function getSessionUser(
  req: NextRequest
): Promise<SessionUser | null> {
  const token = req.cookies.get(USER_COOKIE)?.value;
  if (!token) return null;

  const session = await db.userSession.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.userSession
      .delete({ where: { id: session.id } })
      .catch(() => {});
    return null;
  }

  // ضربان حضور (کاربران آنلاین) — throttled و بی‌خطا؛ هرگز جریان را نمی‌شکند
  void presencePulse(session.id, session.userId, session.lastSeenAt);

  return {
    id: session.user.id,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    phone: session.user.phone,
  };
}

export async function destroyUserSession(req: NextRequest) {
  const token = req.cookies.get(USER_COOKIE)?.value;
  if (token) {
    await db.userSession.deleteMany({ where: { token } }).catch(() => {});
  }
}

/** پاسخ با کوکی نشست کاربر — تنظیمات پیش‌نمایش/production جدا (مانند مدیر)
 *  پیش‌نمایشِ HTTPS: sameSite:none+partitioned تا ورود داخل iframe پیش‌نمایش
 *  کار کند؛ production: lax (کاربردها هم‌مبدأ؛ ریدایرکت درگاه = GET سطح‌بالا) */
export function withUserCookie(
  res: NextResponse,
  token: string,
  maxAge: number,
  secure = false
) {
  const preview = process.env.NODE_ENV !== "production";
  const crossSiteIframe = preview && secure;
  res.cookies.set(USER_COOKIE, token, {
    httpOnly: true,
    sameSite: crossSiteIframe ? "none" : "lax",
    secure,
    partitioned: crossSiteIframe || undefined,
    path: "/",
    maxAge,
  });
  return res;
}
