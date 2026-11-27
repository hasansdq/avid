/**
 * ابزارهای مشترک نمادهای اعتماد (اینماد + زرین‌پال) —
 * مشترک بین ماژول «تنظیمات سایت» و ماژول «ویرایش هدر و فوتر».
 */

/**
 * URL رسمی لوگوی «تایید درگاه پرداخت» زرین‌پال.
 *
 * ⚠️ آدرس قدیمی www.zarinpal.com/badges/trustLogo/1.svg پاسخ 404 می‌داد
 * (زرین‌پال نشان‌ها را به CDN و فرمت PNG منتقل کرده است). آدرس رسمیِ فعلی
 * مطابق خروجی webservice رسمی زرین‌پال (www.zarinpal.com/webservice/TrustCode):
 *   document.write('<a ...><img src="https://cdn.zarinpal.com/badges/trustLogo/1.png" ...></a>')
 * و صفحه‌ی تأیید همان https://www.zarinpal.com/trustPage/{دامنه} است.
 */
export const ZARINPAL_BADGE_URL = "https://cdn.zarinpal.com/badges/trustLogo/1.png";

/**
 * خوددرمانیِ URL لوگوی زرین‌پال در هر کد HTML —
 * آدرس‌های مُرده‌ی نشان (www.zarinpal.com/badges/trustLogo/…) که در کدهای
 * ذخیره‌شده‌ی قدیمی (قبل از انتقال زرین‌پال به CDN) وجود دارد، به آدرس
 * رسمیِ زنده‌ی CDN تبدیل می‌شوند تا لوگو همیشه نمایش داده شود؛ لینکِ
 * صفحه‌ی تأیید (trustPage) دست‌نخورده می‌ماند.
 */
export function normalizeZarinpalBadgeUrl(html: string): string {
  if (!html) return html;
  // هر میزبان نشانِ زرین‌پال (www / بدون www / cdn) با هر پسوندی
  // (svg/png/شماره‌ی دیگر) → آدرس رسمیِ فعلی
  return html.replace(
    /https?:\/\/(?:www\.)?(?:zarinpal\.com|cdn\.zarinpal\.com)\/badges\/trustLogo\/[^"'\s<>)]+/gi,
    ZARINPAL_BADGE_URL
  );
}

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
 * مستندات رسمی زرین‌پال — docs.zarinpal.com → لوگوی تایید زرین‌پال؛
 * خروجی webservice رسمی TrustCode):
 *   تصویر:  https://cdn.zarinpal.com/badges/trustLogo/1.png
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
  return `<a href="https://www.zarinpal.com/trustPage/${d}" target="_blank" rel="noopener noreferrer nofollow" title="دروازه پرداخت معتبر"><img src="${ZARINPAL_BADGE_URL}" border="0" alt="دروازه پرداخت معتبر"></a>`;
}

/**
 * نرمال‌سازی ورودی کاربر برای ذخیره‌ی کد زرین‌پال —
 * دامنه → کد رسمی ساخته می‌شود؛ کد HTML خام → عیناً (فقط URL لوگوی
 * مُرده به آدرس رسمیِ زنده اصلاح می‌شود — خوددرمانی)؛ خالی → "".
 * نامعتبر → null (فراخواننده پیام خطا نشان می‌دهد).
 */
export function zarinpalCodeFromInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return "";
  if (/<[a-z!/]/i.test(raw)) return normalizeZarinpalBadgeUrl(raw);
  return buildZarinpalCode(raw);
}
