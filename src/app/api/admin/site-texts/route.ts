import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import { ensureFontsSeeded } from "@/lib/fonts";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import {
  findSiteTextSlot,
  normalizeSiteTextColor,
  normalizeSiteTextFontSize,
  parseSiteCounterNumber,
  SITE_TEXT_MAX_LEN,
  SITE_TEXT_FONT_MAX,
  SITE_TEXT_FONT_MIN,
} from "@/lib/site-texts";

/**
 * ویرایشگر ظاهری مدادی — ذخیره/بازگردانی متن‌های قابل‌ویرایش صفحه‌ی اول.
 *
 * POST  : upsert رکورد SiteText برای یک جایگاه متن
 *         (متن/رنگ/فونت/اندازه به تفکیک دسکتاپ-تبلت-موبایل/مخفی‌سازی مجزای هر دستگاه).
 *         متن و فونتِ دو جایگاه هیرو در SiteSettings (slogan و heroDescription
 *         و sloganFont) آینه می‌شوند تا با ماژول «تنظیمات سایت» همگام بمانند.
 *         عددهای شمارنده‌ی «رشد آکادمی در یک نگاه» (stats.students و
 *         stats.completed) در SiteSettings (studentsCount و
 *         completedCoursesCount) آینه می‌شوند.
 * DELETE: حذف رکورد و بازگردانی همه‌چیز به پیش‌فرض (؟key=...).
 * GET   : فهرست رکوردها (برای بررسی/دیباگ پنل مدیر).
 */

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;
  const rows = await db.siteText.findMany({ orderBy: { key: "asc" } });
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body) return bad("بدنه درخواست نامعتبر است.");

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const slot = findSiteTextSlot(key);
  if (!slot) return bad("جایگاه متن مشخص نیست یا معتبر نیست.");

  const existing = await db.siteText.findUnique({ where: { key } });

  // — جایگاه‌های عددی (شمارنده‌های «رشد آکادمی در یک نگاه») —
  // متن باید عدد قابل‌قبولی (فارسی یا انگلیسی) باشد تا در تنظیمات آینه شود.
  if (slot.mirrorNumberSettingsField && typeof body.text === "string") {
    const t = body.text.trim();
    if (t) {
      const n = parseSiteCounterNumber(t);
      if (n === null) {
        return bad(
          "برای جایگاه‌های عددیِ شمارنده، متن باید یک عدد باشد (مثلاً ۳۲۰ یا 320)."
        );
      }
    }
  }

  // — متن — خالی = بازگشت به پیش‌فرض قطعه (null)؛ ارسال‌نشده = حفظ مقدار قبلی
  let text: string | null;
  if (typeof body.text === "string") {
    const t = body.text.trim();
    if (t.length > SITE_TEXT_MAX_LEN) {
      return bad(`متن حداکثر ${SITE_TEXT_MAX_LEN} نویسه می‌تواند باشد.`);
    }
    text = t || null;
  } else {
    text = existing?.text ?? null;
  }

  // — رنگ — خالی/نامعتبر = رنگ پیش‌فرض قالب (null)
  let color: string | null;
  if ("color" in body) color = normalizeSiteTextColor(body.color);
  else color = existing?.color ?? null;

  // — فونت — خالی = فونت پیش‌فرض قطعه؛ مقدار باید کلید فونت نصب‌شده باشد
  let fontKey: string | null;
  if ("fontKey" in body) {
    const rawFont = typeof body.fontKey === "string" ? body.fontKey.trim() : "";
    if (!rawFont) {
      fontKey = null;
    } else {
      await ensureFontsSeeded();
      const font = await db.installedFont.findUnique({ where: { key: rawFont } });
      if (!font) return bad("کلید فونت انتخاب‌شده معتبر نیست یا فونت نصب نشده است.");
      fontKey = rawFont;
    }
  } else {
    fontKey = existing?.fontKey ?? null;
  }

  // — اندازه فونت (پیکسل) — خالی/صفر = پیش‌فرض قطعه؛ خارج از بازه = خطا
  // هر دستگاه (دسکتاپ/تبلت/موبایل) جداگانه و با همان بازه‌ی اعتبارسنجی؛
  // خالیِ تبلت/موبایل یعنی «همان اندازه‌ی دسکتاپ» (رندر از fontSize ارث می‌برد).
  const parseDeviceFontSize = (raw: unknown): number | null | "invalid" => {
    if (raw === null || raw === undefined || raw === "" || raw === 0) {
      return null;
    }
    const n = normalizeSiteTextFontSize(raw);
    if (n === null) return "invalid";
    return n;
  };

  let fontSize: number | null;
  if ("fontSize" in body) {
    const parsed = parseDeviceFontSize(body.fontSize);
    if (parsed === "invalid") {
      return bad(
        `اندازه فونت دسکتاپ باید بین ${SITE_TEXT_FONT_MIN} تا ${SITE_TEXT_FONT_MAX} پیکسل باشد.`
      );
    }
    fontSize = parsed;
  } else {
    fontSize = existing?.fontSize ?? null;
  }

  let fontSizeTablet: number | null;
  if ("fontSizeTablet" in body) {
    const parsed = parseDeviceFontSize(body.fontSizeTablet);
    if (parsed === "invalid") {
      return bad(
        `اندازه فونت تبلت باید بین ${SITE_TEXT_FONT_MIN} تا ${SITE_TEXT_FONT_MAX} پیکسل باشد.`
      );
    }
    fontSizeTablet = parsed;
  } else {
    fontSizeTablet = existing?.fontSizeTablet ?? null;
  }

  let fontSizeMobile: number | null;
  if ("fontSizeMobile" in body) {
    const parsed = parseDeviceFontSize(body.fontSizeMobile);
    if (parsed === "invalid") {
      return bad(
        `اندازه فونت موبایل باید بین ${SITE_TEXT_FONT_MIN} تا ${SITE_TEXT_FONT_MAX} پیکسل باشد.`
      );
    }
    fontSizeMobile = parsed;
  } else {
    fontSizeMobile = existing?.fontSizeMobile ?? null;
  }

  // — نمایش/مخفی برای کاربران (سراسری) —
  const hidden =
    "hidden" in body
      ? body.hidden === true || body.hidden === "true"
      : (existing?.hidden ?? false);

  // — نمایش/مخفی به تفکیک دستگاه (دسکتاپ/تبلت/موبایل) —
  const parseDeviceHidden = (raw: unknown, fallback: boolean): boolean =>
    raw === true || raw === "true" ? true : raw === false || raw === "false" ? false : fallback;
  const hiddenDesktop =
    "hiddenDesktop" in body
      ? parseDeviceHidden(body.hiddenDesktop, false)
      : (existing?.hiddenDesktop ?? false);
  const hiddenTablet =
    "hiddenTablet" in body
      ? parseDeviceHidden(body.hiddenTablet, false)
      : (existing?.hiddenTablet ?? false);
  const hiddenMobile =
    "hiddenMobile" in body
      ? parseDeviceHidden(body.hiddenMobile, false)
      : (existing?.hiddenMobile ?? false);

  const row = await db.siteText.upsert({
    where: { key },
    update: {
      text,
      color,
      fontKey,
      fontSize,
      fontSizeTablet,
      fontSizeMobile,
      hidden,
      hiddenDesktop,
      hiddenTablet,
      hiddenMobile,
    },
    create: {
      key,
      text,
      color,
      fontKey,
      fontSize,
      fontSizeTablet,
      fontSizeMobile,
      hidden,
      hiddenDesktop,
      hiddenTablet,
      hiddenMobile,
    },
  });

  // — آینه‌سازی در تنظیمات سایت (همگام‌سازی با ماژول «تنظیمات سایت») —
  const settingsData: Record<string, string | number> = {};
  if (slot.mirrorSettingsField && "text" in body) {
    settingsData[slot.mirrorSettingsField] =
      text ?? DEFAULT_SETTINGS[slot.mirrorSettingsField];
  }
  if (slot.mirrorFontField && "fontKey" in body) {
    settingsData[slot.mirrorFontField] = fontKey ?? "vazirmatn";
  }
  // — عددهای شمارنده: عدد استخراج‌شده از متن در فیلد عددی تنظیمات آینه می‌شود —
  if (slot.mirrorNumberSettingsField && "text" in body) {
    const n = text ? parseSiteCounterNumber(text) : null;
    settingsData[slot.mirrorNumberSettingsField] =
      n ?? DEFAULT_SETTINGS[slot.mirrorNumberSettingsField];
  }
  if (Object.keys(settingsData).length > 0) {
    await db.siteSettings
      .update({ where: { id: "main" }, data: settingsData })
      .catch(() => {
        // رکورد تنظیمات نباید حذف شده باشد؛ در نبود آن صفحه اول از پیش‌فرض‌ها استفاده می‌کند
      });
  }

  return NextResponse.json({ row });
}

export async function DELETE(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  const key = new URL(req.url).searchParams.get("key") ?? "";
  const slot = findSiteTextSlot(key);
  if (!slot) return bad("جایگاه متن مشخص نیست یا معتبر نیست.");

  await db.siteText.deleteMany({ where: { key } });

  // بازگردانی فیلدهای همگام‌شده در تنظیمات به پیش‌فرض‌های اصلی
  const resetSettings: Record<string, string | number> = {};
  if (slot.mirrorSettingsField) {
    resetSettings[slot.mirrorSettingsField] =
      DEFAULT_SETTINGS[slot.mirrorSettingsField];
  }
  if (slot.mirrorFontField) {
    resetSettings[slot.mirrorFontField] = "vazirmatn";
  }
  if (slot.mirrorNumberSettingsField) {
    resetSettings[slot.mirrorNumberSettingsField] =
      DEFAULT_SETTINGS[slot.mirrorNumberSettingsField];
  }
  if (Object.keys(resetSettings).length > 0) {
    await db.siteSettings
      .update({ where: { id: "main" }, data: resetSettings })
      .catch(() => {});
  }

  const resetText =
    slot.mirrorSettingsField || slot.mirrorNumberSettingsField
      ? slot.mirrorNumberSettingsField
        ? String(DEFAULT_SETTINGS[slot.mirrorNumberSettingsField])
        : DEFAULT_SETTINGS[slot.mirrorSettingsField!]
      : slot.defaultText;

  return NextResponse.json({ ok: true, resetText });
}
