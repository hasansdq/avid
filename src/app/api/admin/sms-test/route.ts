import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import { getSmsSettings, isSmsConfigured, sendSms } from "@/lib/sms";

/**
 * POST /api/admin/sms-test — ارسال پیامک آزمایشی به یک شماره.
 *
 * body: { phone }
 * اگر سرویس پیامکی متصل نباشد ۴۰۰ برمی‌گردد.
 * پاسخ: نتیجه‌ی کامل ارسال + { ok }
 */
export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const phone = str(body?.phone).replace(/[\s-]/g, "");

    if (!/^09\d{9}$/.test(phone)) {
      return bad("شماره موبایل معتبر نیست (مثال: 09123456789).");
    }

    // سرویس متصل نیست → قبل از ارسال، راهنمایی برگردان
    const settings = await getSmsSettings();
    if (!isSmsConfigured(settings)) {
      return bad("ابتدا سرویس پیامکی را در تنظیمات متصل کنید.");
    }

    const sms = await sendSms(
      phone,
      "پیامک آزمایشی از پنل مدیریت آوید ✅",
      "test"
    );

    return NextResponse.json({ ...sms, ok: sms.delivered });
  } catch (error) {
    console.error("sms-test POST error:", error);
    return NextResponse.json(
      { error: "خطا در ارسال پیامک آزمایشی." },
      { status: 500 }
    );
  }
}
