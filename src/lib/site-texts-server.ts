import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import { fontStack } from "@/lib/fonts";
import { buildSiteTextDefaults } from "@/lib/site-texts";
import { SESSION_COOKIE } from "@/lib/auth";
import type { SiteSettings } from "@prisma/client";
import type {
  SiteTextFontOption,
  SiteTextRowValue,
} from "@/components/site/editable-texts";

/**
 * زمینه‌ی سرویس‌ساید «ویرایشگر ظاهری مدادی» — برای صفحات مستقل
 * (ویدئوها، ثبت‌نام و…) که Navbar/Footer مشترک ندارند.
 *
 * همان منطق صفحه‌ی اول: بررسی کوکی نشست مدیر (فقط مدیر آیکون مداد را
 * می‌بیند)، ساخت نقشه‌ی ردیف‌های SiteText (متن جایگاه‌های مخفی برای
 * ناشناس‌ها حذف می‌شود)، فونت‌های نصب‌شده و متن‌های پیش‌فرض (فقط مدیر).
 */
export interface SiteTextsServerContext {
  settings: SiteSettings;
  isAdmin: boolean;
  rows: Record<string, SiteTextRowValue>;
  fonts: SiteTextFontOption[];
  defaults: Record<string, string>;
}

export async function getSiteTextsServerContext(): Promise<SiteTextsServerContext> {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(SESSION_COOKIE)?.value;

  const [settings, fonts, siteTextRows, adminSession] = await Promise.all([
    db.siteSettings.findUnique({ where: { id: "main" } }),
    db.installedFont.findMany(),
    db.siteText.findMany(),
    adminToken
      ? db.adminSession.findUnique({ where: { token: adminToken } })
      : Promise.resolve(null),
  ]);

  const siteSettings = settings ?? DEFAULT_SETTINGS;
  const isAdmin =
    Boolean(adminSession) && adminSession!.expiresAt >= new Date();

  const rowsMap: Record<string, SiteTextRowValue> = {};
  for (const row of siteTextRows) {
    rowsMap[row.key] = {
      text: row.text,
      color: row.color,
      fontKey: row.fontKey,
      fontSize: row.fontSize,
      hidden: row.hidden,
    };
  }

  // ناشناس‌ها متنِ جایگاه‌های مخفی را حتی در داده‌ی صفحه (RSC) دریافت نمی‌کنند
  if (!isAdmin) {
    for (const key of Object.keys(rowsMap)) {
      if (rowsMap[key].hidden) {
        rowsMap[key] = { ...rowsMap[key], text: null };
      }
    }
  }

  const fontOptions: SiteTextFontOption[] = fonts.map((f) => ({
    key: f.key,
    label: f.label,
    stack: fontStack(f.family),
    cssText: f.cssText,
  }));

  const defaults = isAdmin ? buildSiteTextDefaults(siteSettings) : {};

  return {
    settings: siteSettings,
    isAdmin,
    rows: rowsMap,
    fonts: fontOptions,
    defaults,
  };
}
