import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reorderItems } from "@/lib/reorder";

/**
 * POST /api/admin/courses/reorder — ذخیره‌ی ترتیب جدید دوره‌ها
 * (جابه‌جایی با کشیدن و رها کردن در لیست ماژول دوره‌ها).
 */
export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    return await reorderItems("course", await req.json().catch(() => null));
  } catch (error) {
    console.error("courses reorder error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی ترتیب دوره‌ها." },
      { status: 500 }
    );
  }
}
