import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

const STATUSES = new Set(["new", "contacted", "enrolled", "archived"]);

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const status = str(body?.status);

    if (!STATUSES.has(status)) {
      return bad("وضعیت ثبت‌نام معتبر نیست.");
    }

    const enrollment = await db.enrollment
      .update({ where: { id }, data: { status } })
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
