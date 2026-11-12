import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";

/**
 * PUT    /api/admin/installments/[id] — ویرایش قسط (مبلغ/سررسید/وضعیت/یادداشت)
 * DELETE /api/admin/installments/[id] — حذف قسط
 */

type Params = { params: Promise<{ id: string }> };

const STATUSES = new Set(["pending", "paid", "overdue"]);
const MIN_AMOUNT = 1_000;
const MAX_AMOUNT = 500_000_000;

/** تبدیل امن مقدار عددی بدنه (بدون سقف ابزار int) */
function parseAmount(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? parseInt(v, 10)
        : NaN;
  if (!Number.isFinite(n) || Math.round(n) !== n) return null;
  return n;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const installment = await db.installment.findUnique({ where: { id } });
    if (!installment) return bad("قسطی با این شناسه یافت نشد.", 404);

    const data: {
      amount?: number;
      dueDate?: Date;
      status?: string;
      paidAt?: Date | null;
      note?: string | null;
    } = {};

    // — مبلغ —
    if ("amount" in body) {
      const amount = parseAmount(body.amount);
      if (amount === null || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
        return bad(
          "مبلغ قسط باید عددی بین ۱٫۰۰۰ تا ۵۰۰٫۰۰۰٫۰۰۰ تومان باشد."
        );
      }
      data.amount = amount;
    }

    // — سررسید —
    if ("dueDate" in body) {
      const dueRaw = str(body.dueDate);
      const dueDate = new Date(dueRaw);
      if (!dueRaw || Number.isNaN(dueDate.getTime())) {
        return bad("تاریخ سررسید معتبر نیست (نمونه: 2025-06-01).");
      }
      data.dueDate = dueDate;
    }

    // — وضعیت —
    if ("status" in body) {
      const status = str(body.status);
      if (!STATUSES.has(status)) {
        return bad("وضعیت قسط باید «pending»، «paid» یا «overdue» باشد.");
      }
      data.status = status;
      if (status === "paid" && !("paidAt" in body)) {
        // پرداخت‌شده بدون تاریخ → همین حالا
        data.paidAt = new Date();
      } else if (status === "pending") {
        // بازگشت به پرداخت‌نشده → تاریخ پرداخت پاک می‌شود
        data.paidAt = null;
      }
    }

    // — تاریخ پرداخت (اختیاری؛ تاریخ ISO معتبر) —
    if ("paidAt" in body) {
      const paidRaw = str(body.paidAt);
      if (paidRaw === "") {
        data.paidAt = null;
      } else {
        const paidAt = new Date(paidRaw);
        if (Number.isNaN(paidAt.getTime())) {
          return bad("تاریخ پرداخت معتبر نیست.");
        }
        data.paidAt = paidAt;
      }
    }

    // — یادداشت (حداکثر ۲۰۰ نویسه؛ خالی = حذف) —
    if ("note" in body) {
      const rawNote = body.note;
      const note =
        rawNote === null || rawNote === undefined ? "" : str(String(rawNote));
      if (note.length > 200) {
        return bad("یادداشت قسط نمی‌تواند بیش از ۲۰۰ نویسه باشد.");
      }
      data.note = note === "" ? null : note;
    }

    if (Object.keys(data).length === 0) {
      return bad("هیچ فیلد قابل ویرایشی ارسال نشده است.");
    }

    await db.installment.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin installment PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش قسط." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const installment = await db.installment
      .delete({ where: { id } })
      .catch(() => null);
    if (!installment) return bad("قسطی با این شناسه یافت نشد.", 404);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin installment DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف قسط." },
      { status: 500 }
    );
  }
}
