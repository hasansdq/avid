import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseTestimonial, bad } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const testimonials = await db.testimonial.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(testimonials);
  } catch (error) {
    console.error("testimonials GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت نظرات." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const data = parseTestimonial(body);
    if (typeof data === "string") return bad(data);

    const testimonial = await db.testimonial.create({ data });
    return NextResponse.json(testimonial, { status: 201 });
  } catch (error) {
    console.error("testimonials POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد نظر. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
