import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
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
 * GET /api/admin/teachers/[id]/finance — تب «درآمد استاد و شبا» در دیالوگ
 * «پرداختی‌ها و اقساط» استاد: درآمد (همان محاسبه‌ی پنل خود استاد)،
 * شماره‌ی شبا و واریزهای درآمد + وضعیت تسویه.
 *
 * PUT /api/admin/teachers/[id]/finance — ویرایش شماره‌ی شبای استاد توسط مدیر.
 * body: { shabaNumber: string } — رشته‌ی خالی = حذف.
 */
type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const teacher = await db.user.findUnique({ where: { id } });
    if (!teacher) return bad("کاربری با این شناسه یافت نشد.", 404);
    if (teacher.role !== "teacher") {
      return bad("این کاربر استاد نیست — درآمد و شبا فقط برای استادها معنی دارد.");
    }

    const [finance, payouts] = await Promise.all([
      computeTeacherFinance(teacher.id),
      listTeacherPayouts(teacher.id),
    ]);

    return NextResponse.json(
      {
        teacher: {
          id: teacher.id,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          phone: teacher.phone,
          shabaNumber: teacher.shabaNumber,
        },
        summary: finance.summary,
        payouts,
        payoutSummary: payoutSummaryOf(
          finance.summary.totalIncome,
          payouts
        ),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("admin teacher finance GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت درآمد استاد." },
      { status: 500 }
    );
  }
}

/** PUT — ویرایش شماره‌ی شبا (مقدار خالی = حذف شبا) */
export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const teacher = await db.user.findUnique({ where: { id } });
    if (!teacher) return bad("کاربری با این شناسه یافت نشد.", 404);
    if (teacher.role !== "teacher") {
      return bad("این کاربر استاد نیست — شبا فقط برای استادها ثبت می‌شود.");
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.shabaNumber !== "string") {
      return bad("بدنه‌ی درخواست نامعتبر است.");
    }

    const clean = normalizeShaba(body.shabaNumber);
    if (clean !== "" && !isValidShaba(clean)) {
      return bad(SHABA_INVALID_MESSAGE);
    }

    const updated = await db.user.update({
      where: { id },
      data: { shabaNumber: clean === "" ? null : clean },
    });

    return NextResponse.json(
      { ok: true, shabaNumber: updated.shabaNumber },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("admin teacher finance PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی شماره شبا." },
      { status: 500 }
    );
  }
}
