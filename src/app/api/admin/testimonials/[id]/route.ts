import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseTestimonial, bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const data = parseTestimonial(body);
    if (typeof data === "string") return bad(data);

    const testimonial = await db.testimonial
      .update({ where: { id }, data })
      .catch(() => null);

    if (!testimonial) return bad("نظری با این شناسه یافت نشد.", 404);
    return NextResponse.json(testimonial);
  } catch (error) {
    console.error("testimonial PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش نظر. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const testimonial = await db.testimonial
      .delete({ where: { id } })
      .catch(() => null);

    if (!testimonial) return bad("نظری با این شناسه یافت نشد.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("testimonial DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف نظر. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
