import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/teacher";
import { bad } from "@/lib/api-helpers";
import {
  computeTeacherFinance,
  listTeacherPayouts,
  payoutSummaryOf,
} from "@/lib/teacher-finance";
import {
  isValidShaba,
  normalizeShaba,
  SHABA_INVALID_MESSAGE,
} from "@/lib/shaba";

/**
 * GET /api/teacher/finance — گزارش مالی استاد + شماره شبا و واریزهای درآمد:
 * خلاصه‌ی درآمد، تفکیک درآمد هر دوره، صورت حساب فروش، اقساط سررسیددار،
 * شماره‌ی شبای ثبت‌شده برای برداشت درآمد و واریزهای ثبت‌شده‌ی مدیر.
 *
 * Enrollment با «عنوان دوره» به Course وصل است؛ بنابراین فروش‌ها با
 * عنوان دوره‌های خودِ استاد جمع می‌شوند.
 *
 * PUT /api/teacher/finance — استاد شماره‌ی شبای بانکی خود را برای واریز
 * درآمد ثبت می‌کند. body: { shabaNumber: string } — رشته‌ی خالی = حذف.
 */
export async function GET(req: NextRequest) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const [finance, payouts] = await Promise.all([
      computeTeacherFinance(teacher.id),
      listTeacherPayouts(teacher.id),
    ]);

    return NextResponse.json(
      {
        ...finance,
        shabaNumber: teacher.shabaNumber,
        payouts,
        payoutSummary: payoutSummaryOf(
          finance.summary.totalIncome,
          payouts
        ),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("مالی استاد — GET:", error);
    return NextResponse.json(
      { error: "خطا در دریافت اطلاعات مالی استاد." },
      { status: 500 }
    );
  }
}

/** PUT /api/teacher/finance — ثبت/ویرایش شماره‌ی شبا برای واریز درآمد (توسط خود استاد) */
export async function PUT(req: NextRequest) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.shabaNumber !== "string") {
      return bad("بدنه‌ی درخواست نامعتبر است.");
    }

    const clean = normalizeShaba(body.shabaNumber);
    if (clean !== "" && !isValidShaba(clean)) {
      return bad(SHABA_INVALID_MESSAGE);
    }

    const updated = await db.user.update({
      where: { id: teacher.id },
      data: { shabaNumber: clean === "" ? null : clean },
    });

    return NextResponse.json(
      { ok: true, shabaNumber: updated.shabaNumber },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("مالی استاد — PUT:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی شماره شبا." },
      { status: 500 }
    );
  }
}
