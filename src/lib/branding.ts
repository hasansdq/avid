import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { db } from "@/lib/db";

/**
 * برندینگ سایت (سمت سرور) — منبع یگانه‌ی «لوگو و نام سایت» برای همه‌ی
 * نقاط پویا: favicon مرورگر، مانیفست وب‌اپ (PWA)، متادیتای صفحه و
 * لوگوی پنل مدیریت. خواندن مستقیم از SiteSettings انجام می‌شود تا
 * لوگوی جدید بلافاصله پس از ذخیره در «تنظیمات سایت» همه‌جا اعمال شود.
 */

export interface Branding {
  logoUrl: string;
  siteName: string;
  tagline: string;
  /** کلید کش‌شکن — با هر تغییر لوگو/تنظیمات عوض می‌شود */
  version: string;
}

/** خواندن برندینگ از تنظیمات — همیشه مقدار امن برمی‌گرداند */
export async function getBranding(): Promise<Branding> {
  const settings = await db.siteSettings
    .findUnique({ where: { id: "main" } })
    .catch(() => null);

  return {
    logoUrl: settings?.logoUrl?.trim() || "/images/logo.png",
    siteName: settings?.siteName?.trim() || "آوید",
    tagline: settings?.tagline?.trim() || "آکادمی مهارت‌های آینده",
    // نسخه از روی آدرس لوگو + زمان آخرین ذخیره — تغییر هرکدام = URL تازه
    version: `${settings?.updatedAt?.getTime() ?? 0}-${settings?.logoUrl ?? ""}`
      .replace(/[^a-z0-9-]/gi, "")
      .slice(0, 40)
      .toLowerCase(),
  };
}

/** پسوند Lowercase‌شده‌ی لوگو (بدون نقطه) — برای انتخاب MIME درست */
export function logoExt(logoUrl: string): string {
  try {
    const clean = logoUrl.split("?")[0].split("#")[0];
    return extname(new URL(clean, "http://x").pathname)
      .replace(/^\./, "")
      .toLowerCase();
  } catch {
    return extname(logoUrl).replace(/^\./, "").toLowerCase();
  }
}

/** MIME رایج تصاویر بر اساس پسوند */
export function imageMimeForExt(ext: string): string {
  switch (ext) {
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    case "ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

export interface LogoFile {
  abs: string;
  size: number;
  mime: string;
  ext: string;
}

/**
 * نقشه‌برداری «آدرس لوگو» به فایل روی دیسک —
 *  • /uploads/**              → public/uploads/**
 *  • /api/media/images/<name> → public/uploads/images/<name>
 *  • /images/** و /fonts/**…   → همان فایل استاتیک داخل public
 *  • آدرس خارجی (http/https)   → null (سرو از طریق ریدایرکت)
 */
export function resolveLocalLogo(logoUrl: string): LogoFile | null {
  const url = logoUrl.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return null;

  const PUBLIC_ROOT = resolve(process.cwd(), "public");
  let rel: string | null = null;

  if (url.startsWith("/api/media/images/")) {
    rel = `uploads/images/${url.slice("/api/media/images/".length)}`;
  } else if (url.startsWith("/uploads/")) {
    rel = url.slice("/uploads/".length);
  } else if (url.startsWith("/")) {
    rel = url.slice(1); // /images/logo.png → images/logo.png
  }
  if (!rel) return null;

  // گارد پیمایش مسیر — بخش‌ها باید ساده و امن باشند
  const parts = rel.split("/").filter(Boolean);
  if (
    parts.length === 0 ||
    parts.some((p) => !/^[A-Za-z0-9._-]+$/.test(p) || p === "..")
  ) {
    return null;
  }

  const abs = join(PUBLIC_ROOT, ...parts);
  if (!abs.startsWith(PUBLIC_ROOT)) return null;

  const ext = parts[parts.length - 1].includes(".")
    ? extname(abs).replace(/^\./, "").toLowerCase()
    : "";
  if (!ext || !imageMimeForExt(ext).startsWith("image/")) return null;

  // فایل واقعاً هست؟ (چک غیرمسدودکننده — خطا → null)
  try {
    const info = statSync(abs);
    if (!info.isFile()) return null;
    return { abs, size: info.size, mime: imageMimeForExt(ext), ext };
  } catch {
    return null;
  }
}

/** استریم خواندن فایل به WebStream برای Response */
export function fileWebStream(abs: string): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    createReadStream(abs)
  ) as unknown as ReadableStream<Uint8Array>;
}

/** برای متادیتا: آدرس favicon پویا (محلی یا خارجی) + نسخه‌ی کش‌شکن */
export async function faviconUrlForMetadata(): Promise<{
  url: string;
  isSvg: boolean;
}> {
  const branding = await getBranding();
  const isRemote = /^https?:\/\//i.test(branding.logoUrl);
  const isSvg = logoExt(branding.logoUrl) === "svg";
  if (isRemote) return { url: branding.logoUrl, isSvg };
  return {
    url: `/api/favicon?v=${branding.version || "0"}`,
    isSvg,
  };
}

/** آیکون‌های مانیفست PWA — پویا از روی لوگوی تنظیمات */
export async function manifestIcons(): Promise<
  { src: string; sizes: string; type: string; purpose: "any" | "maskable" }[]
> {
  const branding = await getBranding();
  const isRemote = /^https?:\/\//i.test(branding.logoUrl);
  const ext = logoExt(branding.logoUrl) || "png";
  const type = imageMimeForExt(ext);
  const src = isRemote
    ? branding.logoUrl
    : `/api/favicon?v=${branding.version || "0"}`;
  return [
    { src, sizes: "192x192", type, purpose: "any" },
    { src, sizes: "512x512", type, purpose: "any" },
    { src, sizes: "192x192", type, purpose: "maskable" },
    { src, sizes: "512x512", type, purpose: "maskable" },
  ];
}
