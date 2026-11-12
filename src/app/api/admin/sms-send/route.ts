import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import { getSmsSettings, isSmsConfigured, sendSms } from "@/lib/sms";

/**
 * POST /api/admin/sms-send — ارسال پیامک دستی.
 *
 * body: { text, targets: "one" | "all-users", phone? }
 *  • targets=one       → ارسال به یک شماره (phone الزامی)
 *  • targets=all-users → ارسال پیاپی به همه‌ی کاربران فعال (حداکثر ۵۰۰ شماره‌ی یکتا)
 *
 * پاسخ: { ok: true, sent, failed }
 */
export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const text = str(body.text);
    if (text.length < 2 || text.length > 450) {
      return bad("متن پیامک باید بین ۲ تا ۴۵۰ نویسه باشد.");
    }

    const targets = str(body.targets, "one");
    if (targets !== "one" && targets !== "all-users") {
      return bad("نوع گیرندگان باید «one» یا «all-users» باشد.");
    }

    // سرویس متصل نیست → ارسال واقعی ممکن نیست
    const settings = await getSmsSettings();
    if (!isSmsConfigured(settings)) {
      return bad("ابتدا سرویس پیامکی را در تنظیمات متصل کنید.");
    }

    /* — ارسال به یک شماره — */
    if (targets === "one") {
      const phone = str(body.phone).replace(/[\s-]/g, "");
      if (!/^09\d{9}$/.test(phone)) {
        return bad("شماره موبایل معتبر نیست (مثال: 09123456789).");
      }

      const sms = await sendSms(phone, text, "manual");
      return NextResponse.json({
        ok: true,
        sent: sms.delivered ? 1 : 0,
        failed: sms.delivered ? 0 : 1,
      });
    }

    /* — ارسال به همه‌ی کاربران فعال (حداکثر ۵۰۰ شماره‌ی یکتا) — */
    const users = await db.user.findMany({
      where: { status: "active" },
      select: { phone: true },
      distinct: ["phone"],
      take: 500,
    });

    let sent = 0;
    let failed = 0;
    for (const u of users) {
      // ارسال پیاپی (بدون فشار هم‌زمان به سرویس)
      const sms = await sendSms(u.phone, text, "manual");
      if (sms.delivered) sent += 1;
      else failed += 1;
    }

    return NextResponse.json({ ok: true, sent, failed });
  } catch (error) {
    console.error("sms-send POST error:", error);
    return NextResponse.json(
      { error: "خطا در ارسال پیامک." },
      { status: 500 }
    );
  }
}
