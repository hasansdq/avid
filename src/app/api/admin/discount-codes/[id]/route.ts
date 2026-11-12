import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, parseDiscountFields } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT    /api/admin/discount-codes/[id] — ویرایش کد تخفیف
 * DELETE /api/admin/discount-codes/[id] — حذف کد تخفیف
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const exists = await db.discountCode.findUnique({
      where: { id },
      select: { id: true, code: true },
    });
    if (!exists) return bad("کد تخفیف یافت نشد.", 404);

    const body = await req.json().catch(() => null);
    const data = parseDiscountFields(body);
    if (typeof data === "string") return bad(data);

    // یکتایی کد (در صورت تغییر متن کد)
    if (data.code && data.code !== exists.code) {
      const clash = await db.discountCode.findUnique({
        where: { code: data.code },
        select: { id: true },
      });
      if (clash) return bad("کد تخفیف با همین متن از قبل ثبت شده است.", 409);
    }

    const updated = await db.discountCode.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("discount-code PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش کد تخفیف." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const deleted = await db.discountCode
      .delete({ where: { id } })
      .catch(() => null);
    if (!deleted) return bad("کد تخفیف یافت نشد.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("discount-code DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف کد تخفیف." },
      { status: 500 }
    );
  }
}
