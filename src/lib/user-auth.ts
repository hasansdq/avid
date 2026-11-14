import { createHash, randomBytes, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import {
  isValidNationalId,
  normalizeNationalId,
} from "@/lib/national-id";

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

/** آیا برای این شماره همین الان کد فعال و در-دست-ارسال وجود دارد؟ */
export async function findActiveOtp(phone: string) {
  const otp = await db.otpCode.findFirst({
    where: { phone, consumedAt: null },
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
export async function issueOtp(phone: string): Promise<{
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
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return {
    code,
    expiresAt: otp.expiresAt,
    resendAvailableAt: new Date(otp.createdAt.getTime() + OTP_RESEND_MS),
  };
}

/** بررسی کد — در صورت موفقیت کد مصرف و کاربر برگردانده می‌شود */
export async function verifyOtp(
  phone: string,
  code: string,
  names: { firstName: string; lastName: string; nationalId?: string | null }
): Promise<
  | { ok: true; user: SessionUser }
  | { ok: false; error: string; status: number }
> {
  const otp = await findActiveOtp(phone);
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
    await db.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
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

  // کد درست — مصرف و حساب کاربری ایجاد/به‌روزرسانی می‌شود
  await db.otpCode.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

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
  code: string
): Promise<
  | { ok: true; user: User }
  | { ok: false; error: string; status: number }
> {
  const otp = await findActiveOtp(phone);
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
    await db.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return {
      ok: false,
      status: 400,
      error: "کد تایید اشتباه است؛ دوباره وارد کنید.",
    };
  }

  // کد درست — کد مصرف می‌شود و حساب موجود بازیابی می‌شود
  await db.otpCode.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) {
    return {
      ok: false,
      status: 400,
      error: "حساب یافت نشد.",
    };
  }

  return { ok: true, user };
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

/** پاسخ با کوکی نشست کاربر (secure = استقرار HTTPS از طریق پروکسی) */
export function withUserCookie(
  res: NextResponse,
  token: string,
  maxAge: number,
  secure = false
) {
  res.cookies.set(USER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  });
  return res;
}
