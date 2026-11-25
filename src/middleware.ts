import { NextRequest, NextResponse } from "next/server";
import { allowedOriginsFor, normalizeOrigin } from "@/lib/http";

/**
 * محافظت CSRF/مبدأ برای درخواست‌های تغییردهنده‌ی متکی بر کوکی —
 * (بند ۶ اصلاحات امنیتی)
 *
 * قاعده: هر درخواست POST/PUT/PATCH/DELETE که کوکی نشست (avid_admin یا
 * avid_user) همراه داشته باشد، باید «هم‌مبدأ/از مبدای مجاز» باشد؛
 * درخواست‌های بدون کوکی نشست (ورود، OTP، پیام چت بازدیدکننده و …)
 * آزادند چون هنوز هویتی برای جعل ندارند.
 *
 *  • مبدأ درخواست از هدر Origin (و در نبودش Referer) خوانده می‌شود و
 *    باید در فهرست مجاز باشد: SITE_URL، ALLOWED_ORIGINS، مبدا خودِ
 *    درخواست (هم‌مبدأ) و در محیط توسعه localhost.
 *  • بدون Origin و Referer (کلاینت غیرمرورگری مثل curl) درخواست مسدود
 *    نمی‌شود — اما Sec-Fetch-Site متفرقه در صورت وجود رد می‌شود.
 *  • callbackهای واقعی پرداخت (Payping POST / Zarinpal GET) عمداً
 *    معاف‌اند: اعتبارشان از «روش اختصاصی خود درگاه» (تایید سمت سرور +
 *  کد تلاش یکتا + تطبیق مبلغ) سنجیده می‌شود، نه از کوکی/مبدأ —
 *    پس دروازه‌ی پرداخت مسدود نمی‌شود.
 *  • مسیر سوکت (socket.io / stream-socket) خارج از /api است و اصلاً
 *    توسط این میان‌افزار دیده نمی‌شود.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** کوکی‌های نشست — فقط درخواست‌های حامل این‌ها گیت مبدأ را می‌بینند */
const AUTH_COOKIES = ["avid_admin", "avid_user"];

/** مسیرهای callback درگاه پرداخت — اعتبارسنجی اختصاصی درگاه دارند */
const EXEMPT_PATHS = new Set([
  "/api/payment/callback",
  "/api/payment/installment/callback",
]);

function deny(): NextResponse {
  return NextResponse.json(
    { error: "درخواست از مبدأ غیرمجاز پذیرفته نمی‌شود." },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}

export function middleware(req: NextRequest): NextResponse {
  if (!MUTATING.has(req.method)) return NextResponse.next();

  const pathname = req.nextUrl.pathname;
  if (EXEMPT_PATHS.has(pathname)) return NextResponse.next();

  // بدون کوکی نشست، جعل درخواست متقابل (CSRF) بی‌معنی است — بگذران
  const hasAuthCookie = AUTH_COOKIES.some(
    (name) => Boolean(req.cookies.get(name)?.value)
  );
  if (!hasAuthCookie) return NextResponse.next();

  // مبدأ ادعایی درخواست: اول Origin، سپس Referer
  const originHeader = req.headers.get("origin");
  const referer = req.headers.get("referer");

  let candidate: string | null = null;
  if (originHeader && originHeader !== "null") {
    candidate = originHeader;
  } else if (referer) {
    try {
      candidate = new URL(referer).origin;
    } catch {
      candidate = null;
    }
  }

  if (!candidate) {
    // مرورگرهای مدرن روی هر درخواستی Origin می‌فرستند؛ نبودِ هر دو یعنی
    // کلاینت غیرمرورگری — اما اگر Sec-Fetch-Site «cross-site» گزارش
    // دهد، درخواست را رد می‌کنیم.
    const secFetchSite = req.headers.get("sec-fetch-site");
    if (
      secFetchSite &&
      secFetchSite !== "same-origin" &&
      secFetchSite !== "same-site" &&
      secFetchSite !== "none"
    ) {
      return deny();
    }
    return NextResponse.next();
  }

  const allowed = allowedOriginsFor(req);
  if (!allowed.includes(normalizeOrigin(candidate))) {
    return deny();
  }
  return NextResponse.next();
}

export const config = {
  // فقط API — صفحه‌ها و مسیرهای سوکت دست‌نخورده‌اند
  matcher: ["/api/:path*"],
};
