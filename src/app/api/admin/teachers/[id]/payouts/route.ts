import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import {
  isTeacherPayoutStatus,
  PAYOUT_MAX_AMOUNT,
} from "@/lib/teacher-finance";

/**
 * POST /api/admin/teachers/[id]/payouts — ثبت دستی واریزی درآمد استاد.
 *
 * مدیر از تب «درآمد استاد و شبا» در دیالوگ «پرداختی‌ها و اقساط» مبلغ واریزی،
 * وضعیت (واریز‌شده / در انتظار واریز)، تاریخ و یادداشت را ثبت می‌کند.
 * body: { amount: number, status?: "paid"|"pending", paidAt?: string, note?: string }
 */
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const teacher = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!teacher) return bad("کاربری با این شناسه یافت نشد.", 404);
    if (teacher.role !== "teacher") {
      return bad("این کاربر استاد نیست — واریزی فقط برای استادها ثبت می‌شود.");
    }

    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه‌ی درخواست نامعتبر است.");

    // — مبلغ (تومان) — عدد صحیح مثبت تا سقف سیستم
    const rawAmount = typeof body.amount === "number" ? body.amount : NaN;
    if (!Number.isFinite(rawAmount) || rawAmount <= 0 || Math.round(rawAmount) !== rawAmount) {
      return bad("مبلغ واریزی باید عددی صحیح و مثبت (تومان) باشد.");
    }
    if (rawAmount > PAYOUT_MAX_AMOUNT) {
      return bad("مبلغ واریزی بیش از سقف مجاز است.");
    }
    const amount = rawAmount;

    // — وضعیت: واریز‌شده (پیش‌فرض) یا در انتظار واریز —
    let status = "paid";
    if (body.status !== undefined && body.status !== null && body.status !== "") {
      const s = str(String(body.status));
      if (!isTeacherPayoutStatus(s)) {
        return bad("وضعیت واریزی باید «paid» یا «pending» باشد.");
      }
      status = s;
    }

    // — تاریخ واریز (اختیاری — YYYY-MM-DD یا ISO)؛ واریزِ «شده» بدون تاریخ = الان —
    let paidAt: Date | null = null;
    const rawPaidAt = body.paidAt;
    if (rawPaidAt !== undefined && rawPaidAt !== null && String(rawPaidAt).trim() !== "") {
      const d = new Date(String(rawPaidAt));
      if (Number.isNaN(d.getTime())) return bad("تاریخ واریز معتبر نیست.");
      paidAt = d;
    } else if (status === "paid") {
      paidAt = new Date();
    }

    // — یادداشت مدیر (اختیاری — مثل شماره پیگیری واریز) —
    const noteRaw = body.note;
    const note =
      noteRaw === null || noteRaw === undefined ? "" : str(String(noteRaw));
    if (note.length > 300) {
      return bad("یادداشت واریزی نمی‌تواند بیش از ۳۰۰ نویسه باشد.");
    }

    const payout = await db.teacherPayout.create({
      data: {
        teacherId: teacher.id,
        amount,
        status,
        ...(paidAt ? { paidAt } : {}),
        ...(note ? { note } : {}),
      },
    });

    return NextResponse.json(payout, { status: 201 });
  } catch (error) {
    console.error("admin teacher payout POST error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت واریزی دستی." },
      { status: 500 }
    );
  }
}
