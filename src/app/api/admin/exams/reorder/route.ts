import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reorderItems } from "@/lib/reorder";

/**
 * POST /api/admin/exams/reorder — ذخیره‌ی ترتیب جدید آزمون‌ها
 * (جابه‌جایی با کشیدن و رها کردن در لیست ماژول آزمون‌ها).
 */
export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    return await reorderItems("exam", await req.json().catch(() => null));
  } catch (error) {
    console.error("exams reorder error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی ترتیب آزمون‌ها." },
      { status: 500 }
    );
  }
}
