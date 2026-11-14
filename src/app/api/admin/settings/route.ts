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

/**
 * همگام‌سازی ویرایشگر مدادی — تغییر متن‌های وابسته به تنظیمات از ماژول
 * «تنظیمات سایت» نیز در رکوردهای SiteText آینه می‌شود تا ویرایشگر مدادی
 * روی سایت دقیقاً همان مقادیر را نشان دهد و ویرایش کند:
 *  • اسلوگان/متن هیرو و فونت اسلوگان
 *  • متن معرفی فوتر و اطلاعات تماس (شماره/ایمیل/آدرس/ساعات پشتیبانی)
 *  • عددهای شمارنده‌ی «رشد آکادمی در یک نگاه» (کارآموزان و دوره‌های پایان‌یافته)
 */
async function mirrorSettingsToSiteText(
  data: Record<string, unknown>
): Promise<void> {
  const patches: { key: string; patch: Record<string, unknown> }[] = [];
  if (typeof data.slogan === "string") {
    patches.push({ key: "hero.slogan", patch: { text: data.slogan.trim() || null } });
  }
  if (typeof data.heroDescription === "string") {
    patches.push({
      key: "hero.description",
      patch: { text: data.heroDescription.trim() || null },
    });
  }
  if (typeof data.sloganFont === "string") {
    patches.push({ key: "hero.slogan", patch: { fontKey: data.sloganFont } });
  }
  if (typeof data.footerDescription === "string") {
    patches.push({
      key: "footer.description",
      patch: { text: data.footerDescription.trim() || null },
    });
  }
  if (typeof data.contactPhone === "string") {
    patches.push({
      key: "footer.contactPhone",
      patch: { text: data.contactPhone.trim() || null },
    });
  }
  if (typeof data.contactEmail === "string") {
    patches.push({
      key: "footer.contactEmail",
      patch: { text: data.contactEmail.trim() || null },
    });
  }
  if (typeof data.address === "string") {
    patches.push({
      key: "footer.address",
      patch: { text: data.address.trim() || null },
    });
  }
  if (typeof data.supportHours === "string") {
    patches.push({
      key: "footer.supportHours",
      patch: { text: data.supportHours.trim() || null },
    });
  }
  // — عددهای شمارنده‌ی «رشد آکادمی در یک نگاه» —
  if (typeof data.studentsCount === "number") {
    patches.push({
      key: "stats.students",
      patch: { text: String(data.studentsCount) },
    });
  }
  if (typeof data.completedCoursesCount === "number") {
    patches.push({
      key: "stats.completed",
      patch: { text: String(data.completedCoursesCount) },
    });
  }
  for (const { key, patch } of patches) {
    await db.siteText
      .upsert({
        where: { key },
        update: patch,
        create: { key, ...patch },
      })
      .catch(() => {
        // آینه‌سازی بهترین‌تلاشی است؛ خطای آن ذخیره‌ی تنظیمات را خراب نمی‌کند
      });
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

    // آینه‌سازی متن‌های هیرو برای ویرایشگر مدادی سایت
    await mirrorSettingsToSiteText(data);

    return NextResponse.json(settings);
  } catch (error) {
    console.error("settings PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره تنظیمات. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
