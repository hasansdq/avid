import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, parseDiscountFields } from "@/lib/api-helpers";

/**
 * GET  /api/admin/discount-codes — فهرست همه‌ی کدهای تخفیف
 * POST /api/admin/discount-codes — ایجاد کد تخفیف جدید
 *
 * کدها برای «پرداخت نقدی»، «پرداخت اقساطی» یا هر دو تعریف می‌شوند و
 * مقدار تخفیف درصدی یا مبلغ ثابت (تومان) است.
 */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const codes = await db.discountCode.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(codes);
  } catch (error) {
    console.error("discount-codes GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت کدهای تخفیف." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const data = parseDiscountFields(body);
    if (typeof data === "string") return bad(data);

    if (!data.code) return bad("متن کد تخفیف الزامی است.");
    if (!data.valueType) data.valueType = "percent";
    if (data.value === undefined) {
      return bad("مقدار تخفیف الزامی است.");
    }

    // یکتایی کد
    const clash = await db.discountCode.findUnique({
      where: { code: data.code },
      select: { id: true },
    });
    if (clash) return bad("کد تخفیف با همین متن از قبل ثبت شده است.", 409);

    const created = await db.discountCode.create({
      data: {
        code: data.code,
        paymentType: data.paymentType ?? "both",
        valueType: data.valueType,
        value: data.value,
        maxUses: data.maxUses ?? 0,
        expiresAt: data.expiresAt ?? null,
        active: data.active ?? true,
        note: data.note ?? null,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("discount-codes POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد کد تخفیف." },
      { status: 500 }
    );
  }
}
