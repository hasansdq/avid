import { toEnDigits } from "@/lib/national-id";

/**
 * شماره شبا (Sheba / IBAN ایران) — نرمال‌سازی و اعتبارسنجی مشترک.
 *
 * استاد شماره‌ی شبا را در بخش «مالی و درآمد» پنل خودش ثبت می‌کند (PUT
 * /api/teacher/finance) و مدیر هم از تب «درآمد استاد و شبا» در دیالوگ
 * «پرداختی‌ها و اقساط» می‌تواند آن را ویرایش کند.
 *
 * قالب معتبر شماره شبا در ایران: «IR» + ۲۴ رقم (مجموعاً ۲۶ نویسه).
 */

/** نرمال‌سازی ورودی شبا — ارقام فارسی→انگلیسی، حذف فاصله/خط تیره، حروف بزرگ.
 *  اگر ۲۴ رقم بدون پیشوند IR داده شود، پیشوند IR خودکار افزوده می‌شود. */
export function normalizeShaba(raw: unknown): string {
  const clean = toEnDigits(String(raw ?? "")).replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{24}$/.test(clean)) return `IR${clean}`;
  return clean;
}

/** آیا رشته‌ی پاک‌شده‌شده شماره‌ی شبای معتبر ایرانی است؟ (IR + ۲۴ رقم) */
export function isValidShaba(v: string): boolean {
  return /^IR\d{24}$/.test(v);
}

/** پیام خطای مشترک اعتبارسنجی شبا */
export const SHABA_INVALID_MESSAGE =
  "شماره شبا معتبر نیست — قالب صحیح: IR و سپس ۲۴ رقم.";
