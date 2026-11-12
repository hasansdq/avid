import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getPaymentSettings, isGateway } from "@/lib/payment";

/** GET /api/admin/payment-settings — تنظیمات درگاه و شهریه */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const settings = await getPaymentSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("payment-settings GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت تنظیمات پرداخت." },
      { status: 500 }
    );
  }
}

/** PUT /api/admin/payment-settings — ذخیره‌ی تنظیمات درگاه و طرح اقساطی
 * (مبالغ شهریه‌ی نقدی/اقساطی هر دوره در فرم خود دوره تعیین می‌شود) */
export async function PUT(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "درخواست نامعتبر است." },
        { status: 400 }
      );
    }

    // — درگاه —
    const gateway =
      typeof body.gateway === "string" && isGateway(body.gateway)
        ? body.gateway
        : undefined;

    // — کلیدهای درگاه —
    const zarinpalMerchantId =
      typeof body.zarinpalMerchantId === "string"
        ? body.zarinpalMerchantId.trim().slice(0, 80)
        : undefined;
    const paypingApiKey =
      typeof body.paypingApiKey === "string"
        ? body.paypingApiKey.trim().slice(0, 120)
        : undefined;

    // — پارامتر طرح اقساطی —
    const installmentCount =
      typeof body.installmentCount === "number" &&
      Number.isFinite(body.installmentCount)
        ? Math.min(36, Math.max(1, Math.round(body.installmentCount)))
        : undefined;

    // اعتبارسنجی کلید درگاه انتخاب‌شده
    const current = await getPaymentSettings();
    const nextGateway = gateway ?? current.gateway;
    if (
      nextGateway === "zarinpal" &&
      !(zarinpalMerchantId || current.zarinpalMerchantId)
    ) {
      return NextResponse.json(
        { error: "برای فعال‌سازی زرین‌پال، شناسه‌ی پذیرنده الزامی است." },
        { status: 400 }
      );
    }
    if (nextGateway === "payping" && !(paypingApiKey || current.paypingApiKey)) {
      return NextResponse.json(
        { error: "برای فعال‌سازی پی‌پینگ، توکن API الزامی است." },
        { status: 400 }
      );
    }

    const settings = await db.paymentSettings.update({
      where: { id: "main" },
      data: {
        ...(gateway !== undefined ? { gateway } : {}),
        ...(zarinpalMerchantId !== undefined ? { zarinpalMerchantId } : {}),
        ...(paypingApiKey !== undefined ? { paypingApiKey } : {}),
        ...(installmentCount !== undefined ? { installmentCount } : {}),
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("payment-settings PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی تنظیمات پرداخت." },
      { status: 500 }
    );
  }
}
