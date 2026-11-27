import { NextRequest } from "next/server";
import { getBranding, effectiveFaviconUrl, resolveLocalLogo, fileWebStream } from "@/lib/branding";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { resolve } from "node:path";

/**
 * favicon پویا — GET /api/favicon?v=<کش‌شکن>
 *
 * favicon اختصاصی «تنظیمات سایت» سرو می‌شود؛ اگر تنظیم نشده باشد همان
 * لوگوی فعال (به این ترتیب آپلود favicon یا لوگوی جدید بلافاصله در تب
 * مرورگر و آیکون‌های PWA/مانیفست اعمال می‌شود — بدون نیاز به جایگزینی
 * فایل‌های ایستا).
 *
 *  • فایل محلی (/uploads/…، /api/media/images/…، /images/…):
 *      سرو مستقیم همان فایل — شفافیت PNG/WebP/SVG عیناً حفظ می‌شود.
 *  • فایل خارجی (http/https): ریدایرکت ۳۰۲ به همان آدرس.
 *  • بدون favicon / فایل مفقود: آیکون ایستای پیش‌فرض (icon-192.png).
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

  // favicon مؤثر — اختصاصی تنظیمات؛ در نبود آن، لوگوی سایت
  const favicon = effectiveFaviconUrl(branding);

  // favicon خارجی → ریدایرکت شفاف
  if (/^https?:\/\//i.test(favicon)) {
    return Response.redirect(favicon, 302);
  }

  const logo = resolveLocalLogo(favicon);
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
  const favicon = branding ? effectiveFaviconUrl(branding) : "";
  const logo = branding ? resolveLocalLogo(favicon) : null;
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": logo?.mime ?? "image/png",
      "Content-Length": String(logo?.size ?? 0),
    },
  });
}
