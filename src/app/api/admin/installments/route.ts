import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import { ensureInstallmentPlan } from "@/lib/installments";

/**
 * GET  /api/admin/installments?enrollmentId=X — اقساط یک ثبت‌نام + خلاصه
 * POST /api/admin/installments — دو حالت:
 *   ۱) { enrollmentId, generate: true } → ساخت خودکار طرح اقساط
 *   ۲) { enrollmentId, amount, dueDate, note? } → افزودن قسط دستی
 */

const MIN_AMOUNT = 1_000;
const MAX_AMOUNT = 500_000_000;

/** خلاصه‌ی وضعیت اقساط: تعدادها و مبالغ (تومان) */
function summarize(
  installments: { amount: number; status: string }[]
) {
  let paidCount = 0;
  let pendingCount = 0;
  let totalAmount = 0;
  let paidAmount = 0;
  for (const inst of installments) {
    totalAmount += inst.amount;
    if (inst.status === "paid") {
      paidCount += 1;
      paidAmount += inst.amount;
    } else {
      // پرداخت‌نشده: pending یا overdue
      pendingCount += 1;
    }
  }
  return {
    count: installments.length,
    paidCount,
    pendingCount,
    totalAmount,
    paidAmount,
    remainingAmount: totalAmount - paidAmount,
  };
}

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

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const enrollmentId = str(req.nextUrl.searchParams.get("enrollmentId"));
    if (!enrollmentId) {
      return bad("شناسه‌ی ثبت‌نام (enrollmentId) الزامی است.");
    }

    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment) return bad("ثبت‌نامی با این شناسه یافت نشد.", 404);

    const installments = await db.installment.findMany({
      where: { enrollmentId },
      orderBy: { index: "asc" },
    });

    return NextResponse.json({
      installments,
      summary: summarize(installments),
    });
  } catch (error) {
    console.error("admin installments GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت اقساط." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const enrollmentId = str(body.enrollmentId);
    if (!enrollmentId) {
      return bad("شناسه‌ی ثبت‌نام (enrollmentId) الزامی است.");
    }

    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment) return bad("ثبت‌نامی با این شناسه یافت نشد.", 404);

    /* — حالت ۱: ساخت خودکار طرح اقساط — */
    if (body.generate === true || body.generate === "true") {
      const existing = await db.installment.findFirst({
        where: { enrollmentId },
        select: { id: true },
      });
      if (existing) {
        return bad(
          "طرح اقساط برای این ثبت‌نام از قبل وجود دارد.",
          409
        );
      }

      // مبلغ کل طرح = شهریه‌ی اقساطی دوره منهای تخفیف ثبت‌شده (در صورت وجود)
      const course = await db.course.findFirst({
        where: { title: enrollment.course },
        select: { installmentTuition: true },
      });
      const total = course
        ? Math.max(
            0,
            course.installmentTuition - (enrollment.discountAmount ?? 0)
          )
        : undefined;

      const count = await ensureInstallmentPlan(enrollmentId, total);
      if (count === 0) {
        return bad(
          "برای این ثبت‌نام طرح اقساط ساخته نشد؛ دوره‌ی مرتبط یافت نشد یا شهریه‌ی اقساطی برای آن تعریف نشده است."
        );
      }
      return NextResponse.json({ ok: true, count }, { status: 201 });
    }

    /* — حالت ۲: افزودن قسط دستی — */
    const amount = parseAmount(body.amount);
    if (amount === null || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return bad(
        "مبلغ قسط باید عددی بین ۱٫۰۰۰ تا ۵۰۰٫۰۰۰٫۰۰۰ تومان باشد."
      );
    }

    const dueRaw = str(body.dueDate);
    const dueDate = new Date(dueRaw);
    if (!dueRaw || Number.isNaN(dueDate.getTime())) {
      return bad("تاریخ سررسید معتبر نیست (نمونه: 2025-06-01).");
    }

    const note = str(body.note ?? "");
    if (note.length > 200) {
      return bad("یادداشت قسط نمی‌تواند بیش از ۲۰۰ نویسه باشد.");
    }

    // شماره‌ی قسط = بزرگ‌ترین شماره‌ی موجود + ۱
    const last = await db.installment.findFirst({
      where: { enrollmentId },
      orderBy: { index: "desc" },
      select: { index: true },
    });
    const index = (last?.index ?? 0) + 1;

    const installment = await db.installment.create({
      data: {
        enrollmentId,
        index,
        amount,
        dueDate,
        status: "pending",
        ...(note ? { note } : {}),
      },
    });

    return NextResponse.json(
      { ok: true, id: installment.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("admin installments POST error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت قسط." },
      { status: 500 }
    );
  }
}
