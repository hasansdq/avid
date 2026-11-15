/**
 * ابزارهای مشترک نمادهای اعتماد (اینماد + زرین‌پال) —
 * مشترک بین ماژول «تنظیمات سایت» و ماژول «ویرایش هدر و فوتر».
 */

/**
 * دامنه‌ی صفحه‌ی تأیید زرین‌پال را از کد ذخیره‌شده برمی‌دارد؛ اگر کد
 * الگوی رسمی ما نباشد (کد سفارشی)، عیناً برگردانده می‌شود.
 */
export function zarinpalDisplayValue(stored: string | null | undefined): string {
  const code = (stored ?? "").trim();
  if (!code) return "";
  const m = /zarinpal\.com\/trustPage\/([^"'\s<>]+)/i.exec(code);
  if (m && /badges\/trustLogo/i.test(code)) return m[1];
  return code;
}

/**
 * کد رسمی «لوگو تایید درگاه پرداخت» زرین‌پال را از دامنه می‌سازد (طبق
 * مستندات رسمی زرین‌پال — docs → لوگوی تایید):
 *   تصویر:  https://www.zarinpal.com/badges/trustLogo/1.svg
 *   تأیید:  https://www.zarinpal.com/trustPage/{دامنه‌ی سایت}
 * نامعتبر → null؛ خالی → "" (حذف لوگو).
 */
export function buildZarinpalCode(input: string): string | null {
  const d = input
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim();
  if (!d) return "";
  if (
    !/^[a-z0-9\u0600-\u06FF]([a-z0-9\u0600-\u06FF.-]*[a-z0-9\u0600-\u06FF])?$/i.test(
      d
    ) ||
    !d.includes(".")
  ) {
    return null;
  }
  return `<a href="https://www.zarinpal.com/trustPage/${d}" target="_blank" title="دروازه پرداخت معتبر"><img src="https://www.zarinpal.com/badges/trustLogo/1.svg" border="0" alt="دروازه پرداخت معتبر"></a>`;
}

/**
 * نرمال‌سازی ورودی کاربر برای ذخیره‌ی کد زرین‌پال —
 * دامنه → کد رسمی ساخته می‌شود؛ کد HTML خام → عیناً؛ خالی → "".
 * نامعتبر → null (فراخواننده پیام خطا نشان می‌دهد).
 */
export function zarinpalCodeFromInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return "";
  if (/<[a-z!/]/i.test(raw)) return raw;
  return buildZarinpalCode(raw);
}
