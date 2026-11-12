import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import { parseNavLinkPatch } from "@/lib/nav-link-input";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const existing = await db.navLink.findUnique({ where: { id } });
    if (!existing) return bad("لینکی با این شناسه یافت نشد.", 404);

    const body = await req.json().catch(() => null);
    const parsed = parseNavLinkPatch(body, existing);
    if (typeof parsed === "string") return bad(parsed);

    const link = await db.navLink.update({ where: { id }, data: parsed.data });
    return NextResponse.json(link);
  } catch (error) {
    console.error("nav-link PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش لینک. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const link = await db.navLink
      .delete({ where: { id } })
      .catch(() => null);

    if (!link) return bad("لینکی با این شناسه یافت نشد.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("nav-link DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف لینک. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
