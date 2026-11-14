import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

const STATUSES = new Set(["new", "contacted", "enrolled", "archived"]);
const PAYMENT_STATUSES = new Set(["pending", "paid", "failed"]);
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

/**
 * PUT /api/admin/enrollments/[id] — ویرایش ثبت‌نام.
 *
 * body (همه‌ی فیلدها اختیاری):
 *   status:        وضعیت پیگیری — new | contacted | enrolled | archived
 *   paymentStatus: وضعیت پرداخت — pending | paid | failed
 *                  (تبدیل دستی به هر وضعیتی؛ مخصوص پرداخت‌های نقدی)
 *   paymentAmount: مبلغ پرداخت (تومان) — ۱٫۰۰۰ تا ۵۰۰٫۰۰۰٫۰۰۰؛
 *                  null/خالی/صفر = حذف رکورد مبلغ (بدون پرداخت)
 *   paidAt:        تاریخ پرداخت (ISO یا YYYY-MM-DD) — خالی = خودکار
 *                  (paid → همین حالا؛ غیر paid → پاک‌شدن)
 *
 * منطق تاریخ پرداخت: تغییر وضعیت به «پرداخت‌شده» بدون تاریخ صریح، همین حالا
 * را ثبت می‌کند؛ هر وضعیت دیگر تاریخ پرداخت را پاک می‌کند.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const data: {
      status?: string;
      paymentStatus?: string;
      paymentAmount?: number | null;
      paidAt?: Date | null;
    } = {};

    // — وضعیت پیگیری (اختیاری) —
    if ("status" in body) {
      const status = str(body.status);
      if (!STATUSES.has(status)) {
        return bad("وضعیت ثبت‌نام معتبر نیست.");
      }
      data.status = status;
    }

    // — وضعیت پرداخت (دستی — هر وضعیتی به دیگری قابل تبدیل است) —
    if ("paymentStatus" in body) {
      const paymentStatus = str(body.paymentStatus);
      if (!PAYMENT_STATUSES.has(paymentStatus)) {
        return bad(
          "وضعیت پرداخت باید «pending»، «paid» یا «failed» باشد."
        );
      }
      data.paymentStatus = paymentStatus;
      if (!("paidAt" in body)) {
        data.paidAt = paymentStatus === "paid" ? new Date() : null;
      }
    }

    // — مبلغ پرداخت (دستی) — null/خالی/صفر = بدون پرداخت —
    if ("paymentAmount" in body) {
      const raw = body.paymentAmount;
      if (raw === null || raw === undefined || raw === "") {
        data.paymentAmount = null;
      } else {
        const amount = parseAmount(raw);
        if (amount === null || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
          return bad(
            "مبلغ پرداخت باید عددی بین ۱٫۰۰۰ تا ۵۰۰٫۰۰۰٫۰۰۰ تومان باشد (یا خالی برای حذف پرداخت)."
          );
        }
        data.paymentAmount = amount === 0 ? null : amount;
      }
    }

    // — تاریخ پرداخت (اختیاری؛ ISO/YYYY-MM-DD معتبر) —
    if ("paidAt" in body) {
      const paidRaw = str(body.paidAt as string);
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

    if (Object.keys(data).length === 0) {
      return bad("هیچ فیلد قابل ویرایشی ارسال نشده است.");
    }

    const enrollment = await db.enrollment
      .update({ where: { id }, data })
      .catch(() => null);

    if (!enrollment) return bad("ثبت‌نامی با این شناسه یافت نشد.", 404);
    return NextResponse.json(enrollment);
  } catch (error) {
    console.error("enrollment PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش ثبت‌نام. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const enrollment = await db.enrollment
      .delete({ where: { id } })
      .catch(() => null);

    if (!enrollment) return bad("ثبت‌نامی با این شناسه یافت نشد.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("enrollment DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف ثبت‌نام. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
