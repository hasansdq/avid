import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * محدودیت پایدار نرخ درخواست‌ها (Rate Limiting) — ورود مدیر و ارسال/تایید OTP.
 *
 * «پایدار»: شمارنده‌ها در جدول RateLimitEntry دیتابیس اصلی (SQLite) ذخیره
 * می‌شوند، پس از ری‌استارت هم باقی می‌مانند و به فرآیند/حافظه وابسته نیستند —
 * بدون هیچ وابستگی زیرساختی تازه‌ای (Redis و…). سقف‌ها به‌قدر باز انتخاب
 * شده‌اند که استفاده‌ی عادی کاربران (درخواست کد، ورود عادی، تایید کد)
 * هرگز مختل نشود و فقط حمله‌ی brute-force/ارسال انبوه را قطع کنند.
 *
 * طراحی: پنجره‌ی ثابت لنگری — اولین تلاش پنجره را باز می‌کند؛ شمارنده تا
 * پایان پنجره فقط افزایش می‌یابد؛ اولین تلاشِ پس از انقضای پنجره، پنجره‌ی
 * تازه را با ۱ آغاز می‌کند. افزایش شمارنده داخل تراکنش (نوشتن SQLite
 * سریالیزه می‌شود) انجام می‌شود تا شمارشِ همزمان از دست نرود.
 *
 * خطای ذخیره‌سازی «بی‌صدا غیرفعال‌کننده» نیست (بند ۳): اگر شمارنده نتوانست
 * ثبت/خوانده شود، نتیجه با storageError برمی‌گردد و فراخواننده با پاسخ موقتِ
 * ۵۰۳ (rateStorageError) درخواست را قابل‌تلاش‌مجدد رد می‌کند — پنجره‌ی
 * حمله‌ی همزمان با خطای ذخیره‌سازی باز نمی‌ماند.
 */

/* ---------------- سیاست‌ها (سقف باز — عادی‌ها هیچ‌وقت نمی‌رسند) ---------------- */

export interface RatePolicy {
  max: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  /** ورود مدیر — شکست‌های رمز، به‌ازای حساب (نام کاربری) */
  adminLoginUser: { max: 8, windowMs: 15 * 60_000 },
  /** ورود مدیر — شکست‌های رمز، به‌ازای IP (پوشش چرخش نام کاربری) */
  adminLoginIp: { max: 20, windowMs: 15 * 60_000 },
  /** ارسال کد OTP — به‌ازای شماره */
  otpRequestPhone: { max: 6, windowMs: 60 * 60_000 },
  /** ارسال کد OTP — به‌ازای IP (پوشش چرخش شماره از یک منبع) */
  otpRequestIp: { max: 40, windowMs: 60 * 60_000 },
  /** تایید کد OTP — به‌ازای شماره */
  otpVerifyPhone: { max: 20, windowMs: 15 * 60_000 },
  /** تایید کد OTP — به‌ازای IP */
  otpVerifyIp: { max: 60, windowMs: 15 * 60_000 },
} satisfies Record<string, RatePolicy>;

export interface RateResult {
  exceeded: boolean;
  /** ثانیه تا پایان پنجره (برای پیام «بعد از N ثانیه دوباره تلاش کنید») */
  retryAfterSec: number;
  count: number;
  /** خطای ذخیره‌سازی — شمارنده ثبت/خوانده نشد؛ فراخواننده ۵۰۳ موقت بدهد */
  storageError?: boolean;
}

/* ---------------- IP کلاینت (پشت پروکسی DirectAdmin) ---------------- */

/** IP درخواست‌کننده — اولین مقدار X-Forwarded-For (پشت nginx/Apache) */
export function clientIpOf(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  if (first) return first.slice(0, 45);
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 45);
  return "local";
}

/* ---------------- هسته‌ی شمارنده ---------------- */

/** حذف فرصت‌طلبانه‌ی ردیف‌های خیلی کهنه (جدول کوچک می‌ماند) */
async function pruneStale(): Promise<void> {
  try {
    await db.rateLimitEntry.deleteMany({
      where: { windowStart: { lt: new Date(Date.now() - 24 * 3600_000) } },
    });
  } catch {
    /* بهترین تلاش */
  }
}

function resultOf(
  entry: { count: number; windowStart: Date } | null,
  policy: RatePolicy
): RateResult {
  if (!entry) return { exceeded: false, retryAfterSec: 0, count: 0 };
  const elapsed = Date.now() - entry.windowStart.getTime();
  const retryAfterSec =
    elapsed >= policy.windowMs ? 0 : Math.ceil((policy.windowMs - elapsed) / 1000);
  return {
    exceeded: entry.count > policy.max,
    retryAfterSec: Math.max(retryAfterSec, 1),
    count: entry.count,
  };
}

/** افزایش شمارنده (هر تلاش/ارسال/تایید شمرده می‌شود) — اتمیک داخل تراکنش */
export async function hitRate(key: string, policy: RatePolicy): Promise<RateResult> {
  try {
    if (Math.random() < 1 / 16) await pruneStale();
    const now = new Date();
    const cutoff = new Date(now.getTime() - policy.windowMs);
    const entry = await db.$transaction(async (tx) => {
      // پنجره‌ی کهنه → شروع پنجره‌ی تازه با صفر
      await tx.rateLimitEntry
        .updateMany({
          where: { key, windowStart: { lte: cutoff } },
          data: { count: 0, windowStart: now },
        })
        .catch(() => {});
      // افزایش ردیف موجود
      const res = await tx.rateLimitEntry.updateMany({
        where: { key },
        data: { count: { increment: 1 } },
      });
      if (res.count === 0) {
        // ردیفی نبود — ساخته می‌شود (رقابت همزمان → افزایش مجدد)
        try {
          return await tx.rateLimitEntry.create({
            data: { key, count: 1, windowStart: now },
          });
        } catch {
          await tx.rateLimitEntry.updateMany({
            where: { key },
            data: { count: { increment: 1 } },
          });
          return await tx.rateLimitEntry.findUnique({ where: { key } });
        }
      }
      return await tx.rateLimitEntry.findUnique({ where: { key } });
    });
    return resultOf(entry, policy);
  } catch {
    // خطای ذخیره‌سازی — محدودکننده بی‌صدا غیرفعال نمی‌شود؛ فراخواننده
    // با rateStorageError پاسخ موقت ۵۰۳ می‌دهد.
    return { exceeded: false, retryAfterSec: 0, count: 0, storageError: true };
  }
}

/** خواندنی — آیا کلید همین الان مسدود است؟ (برای «شکست‌ها فقط شمرده شوند») */
export async function checkRate(key: string, policy: RatePolicy): Promise<RateResult> {
  try {
    const entry = await db.rateLimitEntry.findUnique({ where: { key } });
    if (!entry) return { exceeded: false, retryAfterSec: 0, count: 0 };
    const elapsed = Date.now() - entry.windowStart.getTime();
    if (elapsed >= policy.windowMs) return { exceeded: false, retryAfterSec: 0, count: 0 };
    return resultOf(entry, policy);
  } catch {
    return { exceeded: false, retryAfterSec: 0, count: 0, storageError: true };
  }
}

/* ---------------- پاسخ ۴۲۹ (همان الگوی پاسخ‌های محدودیت موجود) ---------------- */

export function rateLimited(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    {
      error: `تلاش‌های ناموفق زیاد بوده است؛ حدود ${retryAfterSec} ثانیه دیگر دوباره تلاش کنید.`,
    },
    { status: 429 }
  );
}

/* ---------------- پاسخ ۵۰۳ (خطای موقت ذخیره‌سازی محدودکننده) ---------------- */

/**
 * پاسخ خطای موقت برای وقتی که شمارنده‌ی محدودیت نتوانست در دیتابیس
 * ثبت/خوانده شود — محدودکننده «بی‌صدا غیرفعال» نمی‌شود؛ درخواست با
 * پاسخ ۵۰۳ قابل‌تلاش‌مجدد رد می‌شود.
 */
export function rateStorageError(): NextResponse {
  return NextResponse.json(
    {
      error:
        "خطای موقت در ذخیره‌سازی؛ لطفاً چند لحظه دیگر دوباره تلاش کنید.",
    },
    {
      status: 503,
      headers: { "Retry-After": "10", "Cache-Control": "no-store" },
    }
  );
}
