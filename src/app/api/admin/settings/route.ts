import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseSettings, bad } from "@/lib/api-helpers";
import { ensureFontsSeeded } from "@/lib/fonts";

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const settings = await db.siteSettings.findUnique({ where: { id: "main" } });
    return NextResponse.json(settings);
  } catch (error) {
    console.error("settings GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت تنظیمات." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    // کلیدهای فونت مجاز = فونت‌های نصب‌شده (پیش‌فرض + آپلودی)؛ ساخت پیش‌فرض‌ها در صورت نبود
    await ensureFontsSeeded();
    const fonts = await db.installedFont.findMany({
      select: { key: true },
    });
    const validFontKeys = new Set(fonts.map((f) => f.key));
    const data = parseSettings(body, validFontKeys);
    if (typeof data === "string") return bad(data);

    const settings = await db.siteSettings.update({
      where: { id: "main" },
      data,
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error("settings PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره تنظیمات. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
