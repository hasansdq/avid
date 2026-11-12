import { NextRequest } from "next/server";

/**
 * ابزارهای استقرار پشت پروکسی معکوس (Apache/nginx — DirectAdmin).
 *
 * Next.js پشت پروکسی فقط «Host» را می‌بیند؛ برای تشخیص HTTPS و ساخت
 * آدرس‌های بیرونی (مثل callback درگاه پرداخت) باید هدرهای استاندارد
 * «X-Forwarded-Proto» و «X-Forwarded-Host» را خودمان بخوانیم —
 * این هدرها توسط Apache (mod_proxy) و nginx تنظیم می‌شوند.
 */

/** آیا درخواست از طریق HTTPS به پروکسی رسیده است؟ */
export function requestSecure(req: NextRequest): boolean {
  const proto = req.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (proto) return proto === "https";
  return req.nextUrl.protocol === "https:";
}

/**
 * مبدا بیرونی درخواست — با احترام به هدرهای پروکسی.
 * برای ساخت URL های بازگشت (callback درگاه، ریدایرکت‌ها) پشت DirectAdmin.
 */
export function forwardedOrigin(req: NextRequest): string {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host");
  if (!host) return req.nextUrl.origin;
  const proto =
    req.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase() ||
    (req.nextUrl.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}
