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

/* ------------------------------------------------------------------ */
/*  SITE_URL / allowed origins (CSRF + socket + payment return URL)     */
/* ------------------------------------------------------------------ */

/**
 * مبدا رسمی سایت — SITE_URL (مثلاً https://academy.example.com).
 * وقتی تنظیم شود، آدرس بازگشت درگاه پرداخت و ریدایرکت‌های پس از پرداخت
 * از همین مقدار ساخته می‌شوند — دیگر به هدرهای قابل‌جعلِ درخواست
 * (Host / X-Forwarded-Host / X-Forwarded-Proto) متکی نیستیم.
 */
export function officialOrigin(): string | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin; // بدون مسیر/اسلش انتهایی و با حذف پورت پیش‌فرض
  } catch {
    return null;
  }
}

/** مبداهای اضافه‌ی مجاز (ALLOWED_ORIGINS — جداشده با ویرگول) */
export function extraAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const t = piece.trim();
    if (!t) continue;
    try {
      out.push(new URL(t).origin);
    } catch {
      /* ورودی نامعتبر نادیده گرفته می‌شود */
    }
  }
  return out;
}

/** نرمال‌سازی یک مبدا برای مقایسه (حروف کوچک، بدون اسلش انتهایی) */
export function normalizeOrigin(raw: string): string {
  let t = raw.trim().toLowerCase();
  if (!t) return "";
  if (t.endsWith("/")) t = t.slice(0, -1);
  try {
    const u = new URL(t);
    return u.origin;
  } catch {
    return t;
  }
}

/**
 * فهرست مبداهای مجاز برای همین درخواست:
 *  ۱) SITE_URL — مبدا رسمی
 *  ۲) ALLOWED_ORIGINS اضافی
 *  ۳) مبدا خودِ درخواست (Host/پروکسی) — یعنی درخواست‌های هم‌مبدأ
 *  ۴) در محیط غیر production: localhost/127.0.0.1 و مبدا سرور توسعه
 */
export function allowedOriginsFor(req: NextRequest): string[] {
  const list: string[] = [];
  const official = officialOrigin();
  if (official) list.push(official);
  list.push(...extraAllowedOrigins());
  list.push(normalizeOrigin(forwardedOrigin(req)));
  if (req.nextUrl.origin) list.push(normalizeOrigin(req.nextUrl.origin));
  if (process.env.NODE_ENV !== "production") {
    list.push("http://localhost:3000", "http://127.0.0.1:3000");
  }
  return Array.from(new Set(list.filter(Boolean)));
}

/**
 * مبدا بیرونی درخواست — با احترام به هدرهای پروکسی.
 * برای ساخت URL های بازگشت (callback درگاه، ریدایرکت‌ها) پشت DirectAdmin.
 */
export function forwardedOrigin(req: NextRequest): string {
  // SITE_URL (مبدا رسمی) بر هدرهای درخواست اولویت دارد — آدرس بازگشت
  // پرداخت دیگر به هدرهای دلخواه/قابل‌جعلِ درخواست متکی نیست.
  const official = officialOrigin();
  if (official) return official;
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
