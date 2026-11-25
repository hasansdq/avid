import { NextResponse } from "next/server";
import { getBranding } from "@/lib/branding";

/**
 * برندینگ عمومی سایت — GET /api/branding
 *
 * { logoUrl, siteName, tagline, version } — بدون احراز هویت، برای
 * مؤلفه‌های کلاینتی که مستقیم به تنظیمات دسترسی ندارند (لوگوی پنل
 * مدیریت، صفحه‌ی ورود مدیر، بنر نصب وب‌اپ و…). no-store تا تغییر لوگو
 * بلافاصله پس از ذخیره در همه‌جا دیده شود.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const branding = await getBranding().catch(() => null);
  if (!branding) {
    return NextResponse.json(
      {
        logoUrl: "/images/logo.png",
        siteName: "آوید",
        tagline: "آکادمی مهارت‌های آینده",
        version: "0",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(branding, {
    headers: { "Cache-Control": "no-store" },
  });
}
