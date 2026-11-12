import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * حذف فونت نصب‌شده — فقط فونت‌های آپلودی (غیرپیش‌فرض) قابل حذف‌اند.
 * اگر فونت در تنظیمات سایت (اسلوگان/هدر/فوتر) در حال استفاده باشد،
 * آن تنظیم به وزیرمتن (پیش‌فرض) برمی‌گردد.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const font = await db.installedFont.findUnique({ where: { id } });
    if (!font) {
      return NextResponse.json({ error: "فونت یافت نشد." }, { status: 404 });
    }
    if (font.builtin) {
      return NextResponse.json(
        { error: "فونت‌های پیش‌فرض سایت قابل حذف نیستند." },
        { status: 400 }
      );
    }

    // اگر در حال استفاده است، تنظیمات به وزیرمتن برگردند
    const settings = await db.siteSettings.findUnique({
      where: { id: "main" },
    });
    if (settings) {
      const patch: Record<string, string> = {};
      if (settings.sloganFont === font.key) patch.sloganFont = "vazirmatn";
      if (settings.headerFont === font.key) patch.headerFont = "vazirmatn";
      if (settings.footerFont === font.key) patch.footerFont = "vazirmatn";
      if (Object.keys(patch).length > 0) {
        await db.siteSettings.update({ where: { id: "main" }, data: patch });
      }
    }

    await db.installedFont.delete({ where: { id } });

    // حذف فایل آپلودی (در صورت وجود و مسیر امن)
    const match = /\/uploads\/fonts\/([a-z0-9-]+\.[a-z0-9]+)$/i.exec(
      font.cssText
    );
    if (match?.[1]) {
      await unlink(
        path.join(process.cwd(), "public", "uploads", "fonts", match[1])
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("font DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف فونت. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
