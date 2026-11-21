import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildStatsCharts } from "@/lib/stats";

/**
 * GET /api/admin/stats/charts — داده‌ی نمودارهای «آمار سایت» پنل مدیر.
 *
 * پاسخ: ۳۰ روز اخیر (بازدید/بازدیدکننده‌ی یکتا/ثبت‌نام/ورود/درآمد
 * پرداخت‌ها) + کاربران آنلاین (شمار لحظه‌ای، سری ساعتی امروز و فهرست
 * کاربران) + جمع‌ها (شامل درآمد امروز و مجموع درآمد اقساط پرداخت‌شده).
 */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const data = await buildStatsCharts();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("admin stats charts error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت آمار سایت." },
      { status: 500 }
    );
  }
}
