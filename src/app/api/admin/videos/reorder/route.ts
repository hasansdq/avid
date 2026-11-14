import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reorderItems } from "@/lib/reorder";

/**
 * POST /api/admin/videos/reorder — ذخیره‌ی ترتیب جدید ویدئوها
 * (جابه‌جایی با کشیدن و رها کردن در لیست ماژول ویدئوها).
 */
export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    return await reorderItems("video", await req.json().catch(() => null));
  } catch (error) {
    console.error("videos reorder error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی ترتیب ویدئوها." },
      { status: 500 }
    );
  }
}
