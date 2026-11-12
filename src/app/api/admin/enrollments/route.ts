import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const enrollments = await db.enrollment.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(enrollments);
  } catch (error) {
    console.error("enrollments GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت ثبت‌نام‌ها." },
      { status: 500 }
    );
  }
}
