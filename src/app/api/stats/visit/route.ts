import { NextRequest, NextResponse } from "next/server";
import { trackVisit, visitorCookieOptions } from "@/lib/stats";

/**
 * POST /api/stats/visit — بیکن بازدید صفحات سایت (سمت کاربر).
 *
 * هر بار لود یک صفحه‌ی عمومی سایت (نه پنل مدیر) یک بار فراخوانده می‌شود؛
 * شمارنده‌ی بازدید روز جاری و — برای بازدیدکننده‌ی تازه — شمارنده‌ی
 * «بازدیدکننده‌ی یکتا» افزایش می‌یابد. کوکی «avid_vid» بازدیدکننده را
 * در روزهای متوالی یکتا نگه می‌دارد.
 */
export async function POST(req: NextRequest) {
  try {
    const { visitorId, setCookie } = await trackVisit(req);
    const res = NextResponse.json({ ok: true }, {
      headers: { "Cache-Control": "no-store" },
    });
    if (setCookie) visitorCookieOptions(res, visitorId);
    return res;
  } catch (error) {
    // آمار هرگز تجربه‌ی سایت را نمی‌شکند
    console.error("stats visit error:", error);
    return NextResponse.json({ ok: false }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
