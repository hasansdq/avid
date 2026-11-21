import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import {
  isTeacherPayoutStatus,
  PAYOUT_MAX_AMOUNT,
} from "@/lib/teacher-finance";

/**
 * PUT/DELETE /api/admin/teachers/[id]/payouts/[payoutId] — ویرایش/حذف یک
 * واریزی درآمد استاد (مبلغ، وضعیت واریز/در انتظار، تاریخ و یادداشت).
 *
 * PUT body: { amount?, status?, paidAt?, note? } — فقط فیلدهای ارسال‌شده
 * تغییر می‌کنند؛ paidAt با رشته‌ی خالی صریحاً حذف می‌شود.
 */
type Params = { params: Promise<{ id: string; payoutId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id, payoutId } = await params;
    const payout = await db.teacherPayout.findUnique({
      where: { id: payoutId },
    });
    if (!payout || payout.teacherId !== id) {
      return bad("واریزی موردنظر برای این استاد یافت نشد.", 404);
    }

    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه‌ی درخواست نامعتبر است.");

    const data: {
      amount?: number;
      status?: string;
      note?: string | null;
      paidAt?: Date | null;
    } = {};

    // — مبلغ —
    if ("amount" in body) {
      const raw = typeof body.amount === "number" ? body.amount : NaN;
      if (!Number.isFinite(raw) || raw <= 0 || Math.round(raw) !== raw) {
        return bad("مبلغ واریزی باید عددی صحیح و مثبت (تومان) باشد.");
      }
      if (raw > PAYOUT_MAX_AMOUNT) {
        return bad("مبلغ واریزی بیش از سقف مجاز است.");
      }
      data.amount = raw;
    }

    // — وضعیت —
    if ("status" in body) {
      const s = str(String(body.status));
      if (!isTeacherPayoutStatus(s)) {
        return bad("وضعیت واریزی باید «paid» یا «pending» باشد.");
      }
      data.status = s;
    }

    // — تاریخ واریز: رشته‌ی خالی = حذف تاریخ؛ واریز «شده» بدون تاریخ = الان —
    if ("paidAt" in body) {
      const rawPaidAt = body.paidAt;
      if (rawPaidAt === null || String(rawPaidAt).trim() === "") {
        data.paidAt = null;
      } else {
        const d = new Date(String(rawPaidAt));
        if (Number.isNaN(d.getTime())) return bad("تاریخ واریز معتبر نیست.");
        data.paidAt = d;
      }
    }

    // — یادداشت (رشته‌ی خالی = حذف) —
    if ("note" in body) {
      const rawNote = body.note;
      const note =
        rawNote === null || rawNote === undefined ? "" : str(String(rawNote));
      if (note.length > 300) {
        return bad("یادداشت واریزی نمی‌تواند بیش از ۳۰۰ نویسه باشد.");
      }
      data.note = note === "" ? null : note;
    }

    if (Object.keys(data).length === 0) {
      return bad("هیچ فیلد قابل ویرایشی ارسال نشده است.");
    }

    // تبدیل وضعیت به «واریز‌شده» بدون تاریخ → تاریخ همین حالا
    if (data.status === "paid" && data.paidAt === undefined && !payout.paidAt) {
      data.paidAt = new Date();
    }

    const updated = await db.teacherPayout.update({
      where: { id: payoutId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("admin teacher payout PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش واریزی." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id, payoutId } = await params;
    const payout = await db.teacherPayout.findUnique({
      where: { id: payoutId },
      select: { id: true, teacherId: true },
    });
    if (!payout || payout.teacherId !== id) {
      return bad("واریزی موردنظر برای این استاد یافت نشد.", 404);
    }

    await db.teacherPayout.delete({ where: { id: payoutId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin teacher payout DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف واریزی." },
      { status: 500 }
    );
  }
}
