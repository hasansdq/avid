import { NextResponse } from "next/server";
import { getPaymentSettings, isPaymentEnabled } from "@/lib/payment";

/**
 * GET /api/payment/config — پیکربندی عمومی پرداخت برای فرم پیش‌ثبت‌نام.
 *
 * مبالغ شهریه هر دوره (نقدی/اقساطی) از رکورد خود دوره خوانده می‌شود و
 * از طریق props صفحه (Course[]) به فرم می‌رسد؛ این endpoint فقط وضعیت
 * درگاه و پارامتر طرح اقساطی (تعداد اقساط) را برمی‌گرداند.
 * کلیدهای درگاه هرگز فاش نمی‌شوند.
 */
export async function GET() {
  try {
    const settings = await getPaymentSettings();
    const enabled = isPaymentEnabled(settings);

    return NextResponse.json({
      enabled,
      gateway: enabled ? settings.gateway : "none",
      installmentCount: Math.max(1, settings.installmentCount),
    });
  } catch (error) {
    console.error("payment config error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت تنظیمات پرداخت." },
      { status: 500 }
    );
  }
}
