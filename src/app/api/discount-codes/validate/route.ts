import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bad, str } from "@/lib/api-helpers";
import { checkDiscountCode, findDiscountCode } from "@/lib/payment";

/**
 * POST /api/discount-codes/validate — بررسی کد تخفیف از فرم پیش‌ثبت‌نام.
 *
 * body: { code: string, method: "cash" | "installment", course: string }
 *
 * مبلغ پایه از شهریه‌ی نقدی/اقساطی همان دوره خوانده می‌شود و پاسخ،
 * مبلغ تخفیف و مبلغ نهایی را برمی‌گرداند. شمارنده‌ی استفاده‌ی کد
 * «اینجا» افزایش نمی‌یابد — تنها هنگام ثبت نهایی ثبت‌نام.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const code = str(body.code);
    if (!code) return bad("متن کد تخفیف را وارد کنید.");

    const method =
      body.method === "installment" ? "installment" : "cash";
    const courseTitle = str(body.course);
    if (!courseTitle) return bad("دوره‌ی انتخاب‌شده ارسال نشده است.");

    // — دوره‌ی منتشرشده با این عنوان —
    const course = await db.course.findFirst({
      where: { title: courseTitle, published: true },
      select: { cashTuition: true, installmentTuition: true },
    });
    if (!course) return bad("دوره‌ی انتخاب‌شده در سیستم یافت نشد.", 404);

    // — مبلغ پایه بر اساس روش پرداخت —
    const baseAmount =
      method === "installment"
        ? course.installmentTuition
        : course.cashTuition;
    if (baseAmount <= 0) {
      return bad(
        method === "installment"
          ? "برای این دوره پرداخت اقساطی تعریف نشده است."
          : "این دوره رایگان است و نیازی به کد تخفیف ندارد."
      );
    }

    // — یافتن و اعتبارسنجی کد —
    const record = await findDiscountCode(code);
    if (!record) return bad("کد تخفیف یافت نشد.", 404);

    const check = checkDiscountCode(record, method, baseAmount);
    if (!check.ok) return bad(check.reason);

    return NextResponse.json({
      ok: true,
      code: record.code,
      paymentType: record.paymentType,
      valueType: record.valueType,
      value: record.value,
      discountAmount: check.discountAmount,
      baseAmount,
      finalAmount: Math.max(0, baseAmount - check.discountAmount),
    });
  } catch (error) {
    console.error("discount validate error:", error);
    return NextResponse.json(
      { error: "خطا در بررسی کد تخفیف. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
