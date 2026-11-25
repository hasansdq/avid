import { NextRequest } from "next/server";
import { getBranding, resolveLocalLogo, fileWebStream } from "@/lib/branding";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { resolve } from "node:path";

/**
 * favicon پویا — GET /api/favicon?v=<کش‌شکن>
 *
 * لوگوی فعال از «تنظیمات سایت» سرو می‌شود؛ به این ترتیب آپلود لوگوی جدید
 * بلافاصله در favicon مرورگر (و آیکون‌های PWA/مانیفست که همین مسیر را
 * اشاره می‌کنند) اعمال می‌شود — بدون نیاز به جایگزینی فایل‌های ایستا.
 *
 *  • لوگوی محلی (/uploads/…، /api/media/images/…، /images/…):
 *      سرو مستقیم همان فایل — شفافیت PNG/WebP/SVG عیناً حفظ می‌شود.
 *  • لوگوی خارجی (http/https): ریدایرکت ۳۰۲ به همان آدرس.
 *  • بدون لوگو / فایل مفقود: آیکون ایستای پیش‌فرض (icon-192.png).
 *
 * کش: یک روز — پارامتر ?v با هر ذخیره‌ی تنظیمات عوض می‌شود و مرورگر
 * نسخه‌ی تازه را فوراً می‌گیرد.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_ICON = resolve(
  process.cwd(),
  "public",
  "images",
  "icons",
  "icon-192.png"
);

function streamStaticIcon(): Response {
  try {
    const info = statSync(FALLBACK_ICON);
    const stream = Readable.toWeb(
      createReadStream(FALLBACK_ICON)
    ) as unknown as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("favicon unavailable", { status: 500 });
  }
}

export async function GET(_req: NextRequest): Promise<Response> {
  const branding = await getBranding().catch(() => null);
  if (!branding) return streamStaticIcon();

  // لوگوی خارجی → ریدایرکت شفاف
  if (/^https?:\/\//i.test(branding.logoUrl)) {
    return Response.redirect(branding.logoUrl, 302);
  }

  const logo = resolveLocalLogo(branding.logoUrl);
  if (!logo) return streamStaticIcon();

  return new Response(fileWebStream(logo.abs), {
    status: 200,
    headers: {
      "Content-Type": logo.mime,
      "Content-Length": String(logo.size),
      // v = کش‌شکن — بدون v هم کش کوتاه؛ با v تازه = دانلود تازه
      "Cache-Control": "public, max-age=86400",
    },
  });
}

/** HEAD — برای بررسی سلامت لینک favicon */
export async function HEAD(): Promise<Response> {
  const branding = await getBranding().catch(() => null);
  const logo = branding ? resolveLocalLogo(branding.logoUrl) : null;
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": logo?.mime ?? "image/png",
      "Content-Length": String(logo?.size ?? 0),
    },
  });
}
