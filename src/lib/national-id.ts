/**
 * ابزار کد ملی (اختیاری) کاربران — اعتبارسنجی سمت کلاینت و سرور.
 *
 * قاعده‌ی کد ملی ایران: ۱۰ رقم؛ رقم دهم (رقم کنترل) از روی جمع حاصل‌ضرب
 * ۹ رقم اول در وزن‌های ۱۰ تا ۲ محاسبه می‌شود:
 *   r = (Σ digit[i] × (10 - i)) mod 11  (برای i = 0..8)
 *   رقم دهم = r اگر r < 2 بود، وگرنه 11 - r
 */

/** تبدیل ارقام فارسی/عربی به لاتین + پاک‌سازی نویسه‌های غیررقمی رایج */
export function toEnDigits(input: string): string {
  return String(input ?? "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** نرمال‌سازی ورودی کد ملی → فقط ۱۰ رقم لاتین یا رشته‌ی کوتاه‌تر (نامعتبر) */
export function normalizeNationalId(input: string): string {
  return toEnDigits(String(input ?? "")).replace(/[\s-]/g, "");
}

/** اعتبارسنجی کامل کد ملی (قیمت و رقم کنترل) */
export function isValidNationalId(id: string): boolean {
  const code = normalizeNationalId(id);
  if (!/^\d{10}$/.test(code)) return false;
  if (/^(\d)\1{9}$/.test(code)) return false; // هر ده رقم یکسان — نامعتبر
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(code[i]) * (10 - i);
  const r = sum % 11;
  const check = Number(code[9]);
  return r < 2 ? check === r : check === 11 - r;
}

/** پیام خطای یکسان کد ملی — برای فرم‌ها و API */
export const NATIONAL_ID_INVALID_MESSAGE =
  "کد ملی باید ۱۰ رقم و طبق الگوی رسمی کد ملی ایران معتبر باشد.";
