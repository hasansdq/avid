import { db } from "@/lib/db";
import type { InstalledFont } from "@prisma/client";

/**
 * رجیستری فونت‌های فارسی سایت — فونت‌های «نصب‌شده» در جدول InstalledFont نگهداری می‌شوند.
 *
 * ۵ فونت پیش‌فرض (builtin) همراه پروژه «نصب» شده‌اند و فایل‌شان به‌صورت محلی
 * در public/fonts سلف‌هاست است:
 *  • وزیرمتن  — از طریق next/font (متغیر --font-vazir)؛ بدون @font-face اضافه
 *  • ایران‌سنس — /fonts/iransans/*.woff2 (۵ وزن)
 *  • ایران‌یکان — /fonts/iranyekan/*.woff (۴ وزن)
 *  • شبنم      — /fonts/shabnam/*.woff2 (۴ وزن)
 *  • لاله‌زار  — /fonts/lalezar/*.woff2 (تزئینی)
 *
 * مدیر می‌تواند فونت جدید را (woff/woff2/ttf/otf) از ماژول «فونت‌ها» آپلود کند؛
 * فایل در public/uploads/fonts ذخیره و @font-face آن خودکار ساخته می‌شود.
 */

export interface FontSeed {
  key: string;
  label: string;
  family: string;
  cssText: string;
  sortOrder: number;
}

/** وزیرمتن: خانواده‌ی پیش‌فرض body — با next/font محلی بارگذاری می‌شود */
const VAZIR_FAMILY = "var(--font-vazir)";

/** ساخت قاعده‌ی فشرده‌ی @font-face */
function face(
  family: string,
  url: string,
  weight: number,
  format = "woff2"
): string {
  return `@font-face{font-family:'${family}';src:url('${url}') format('${format}');font-weight:${weight};font-style:normal;font-display:swap}`;
}

export const BUILTIN_FONT_SEEDS: FontSeed[] = [
  {
    key: "vazirmatn",
    label: "وزیرمتن",
    family: VAZIR_FAMILY,
    cssText: "",
    sortOrder: 1,
  },
  {
    key: "iransans",
    label: "ایران‌سنس",
    family: "IRANSans",
    cssText: [
      face("IRANSans", "/fonts/iransans/IRANSansWeb_UltraLight.woff2", 200),
      face("IRANSans", "/fonts/iransans/IRANSansWeb_Light.woff2", 300),
      face("IRANSans", "/fonts/iransans/IRANSansWeb.woff2", 400),
      face("IRANSans", "/fonts/iransans/IRANSansWeb_Medium.woff2", 500),
      face("IRANSans", "/fonts/iransans/IRANSansWeb_Bold.woff2", 700),
    ].join(""),
    sortOrder: 2,
  },
  {
    key: "iranyekan",
    label: "ایران‌یکان",
    family: "IRANYekanX",
    cssText: [
      face("IRANYekanX", "/fonts/iranyekan/IRANYekanX-Regular.woff", 400, "woff"),
      face("IRANYekanX", "/fonts/iranyekan/IRANYekanX-Medium.woff", 500, "woff"),
      face("IRANYekanX", "/fonts/iranyekan/IRANYekanX-Bold.woff", 700, "woff"),
      face("IRANYekanX", "/fonts/iranyekan/IRANYekanX-Black.woff", 900, "woff"),
    ].join(""),
    sortOrder: 3,
  },
  {
    key: "shabnam",
    label: "شبنم",
    family: "Shabnam",
    cssText: [
      face("Shabnam", "/fonts/shabnam/Shabnam-Light.woff2", 300),
      face("Shabnam", "/fonts/shabnam/Shabnam.woff2", 400),
      face("Shabnam", "/fonts/shabnam/Shabnam-Medium.woff2", 500),
      face("Shabnam", "/fonts/shabnam/Shabnam-Bold.woff2", 700),
    ].join(""),
    sortOrder: 4,
  },
  {
    key: "lalezar",
    label: "لاله‌زار",
    family: "Lalezar",
    cssText: face("Lalezar", "/fonts/lalezar/Lalezar-Regular.woff2", 400),
    sortOrder: 5,
  },
];

export const DEFAULT_FONT_KEY = "vazirmatn";

/** ساخت فونت‌های پیش‌فرض در صورت نبود (idempotent) — در اولین GET فونت‌ها صدا زده می‌شود */
export async function ensureFontsSeeded(): Promise<void> {
  for (const seed of BUILTIN_FONT_SEEDS) {
    await db.installedFont.upsert({
      where: { key: seed.key },
      update: {
        label: seed.label,
        family: seed.family,
        cssText: seed.cssText,
        builtin: true,
      },
      create: {
        key: seed.key,
        label: seed.label,
        family: seed.family,
        cssText: seed.cssText,
        builtin: true,
        sortOrder: seed.sortOrder,
      },
    });
  }
}

/** مقدار کامل font-family با fallback به وزیرمتن */
export function fontStack(family: string | null | undefined): string {
  const f = (family ?? "").trim();
  if (!f || f === VAZIR_FAMILY) {
    return `${VAZIR_FAMILY}, Tahoma, sans-serif`;
  }
  return `${f}, ${VAZIR_FAMILY}, Tahoma, sans-serif`;
}

/** پیدا کردن فونت نصب‌شده بر اساس کلید */
export function findFontByKey(
  fonts: InstalledFont[],
  key: string | null | undefined
): InstalledFont | undefined {
  const k = (key ?? "").trim();
  return fonts.find((f) => f.key === k);
}

/** مقدار font-family برای یک کلید از بین فونت‌های نصب‌شده — با جایگزین وزیرمتن */
export function fontStackByKey(
  fonts: InstalledFont[],
  key: string | null | undefined
): string {
  const font = findFontByKey(fonts, key);
  return fontStack(font?.family);
}

export interface ResolvedFontFamilies {
  slogan: string;
  header: string;
  footer: string;
}

/** تبدیل کلیدهای فونتِ تنظیمات به مقادیر font-family — استفاده در کامپوننت‌های سروری */
export function resolveFontFamilies(
  fonts: InstalledFont[],
  settings: {
    sloganFont?: string | null;
    headerFont?: string | null;
    footerFont?: string | null;
  } | null
): ResolvedFontFamilies {
  return {
    slogan: fontStackByKey(fonts, settings?.sloganFont),
    header: fontStackByKey(fonts, settings?.headerFont),
    footer: fontStackByKey(fonts, settings?.footerFont),
  };
}

/** استخراج cssText فونت‌های لازم برای کلیدهای داده‌شده (برای تزریق در <head>) */
export function cssTextForKeys(
  fonts: InstalledFont[],
  keys: (string | null | undefined)[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const font = findFontByKey(fonts, key);
    if (!font || !font.cssText.trim() || seen.has(font.key)) continue;
    seen.add(font.key);
    out.push(font.cssText);
  }
  return out;
}
