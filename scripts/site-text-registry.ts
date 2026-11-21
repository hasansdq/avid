/**
 * رجیستری مشترکِ کلیدهای «ویرایشگر ظاهری مدادی» برای ابزارهای عملیات
 * (scripts/migrate.ts و scripts/restore-site-texts.ts).
 *
 * این فایل عمداً «بدون هیچ وابستگی» است (نه @prisma/client، نه @/lib/…)
 * تا در ایمیج tools سرویس migrate — که فقط scripts/ و prisma/ را کپی
 * می‌کند — با bun خالی قابل اجرا باشد. سمت اپ، src/lib/site-texts.ts
 * همین نگاشت‌ها را re-export می‌کند تا یک منبع واحد بماند.
 */

/**
 * نام‌های مستعار کلیدها: «کلید قدیمی/منسوخ → کلید جاری».
 *
 * قرارداد پایداری کلیدها (الزام نسخه‌ها): کلید جایگاه‌های SiteText بین
 * نسخه‌ها «ثابت» می‌ماند؛ تاریخچه تا امروز فقط «افزودنی» بوده است
 * (۱۵ → ۲۷ → ۳۴ → ۳۶ جایگاه، بدون هیچ تغییر نام). اگر در آینده نام کلیدی
 * تغییر کرد، مدخل قدیمی→جدید را فقط همین‌جا اضافه کنید؛ مهاجرت در هر
 * آپدیت به‌صورت خودکار رکوردهای قدیمی را منتقل می‌کند:
 *   • رکورد با کلید قدیمی موجود و کلید جدید ناموجود → انتقال (rename)؛
 *   • هر دو موجود → آخرین ویرایش مدیر (updatedAt بزرگ‌تر) برنده می‌شود
 *     و رکورد دیگر حذف می‌شود.
 */
export const SITE_TEXT_KEY_ALIASES: Record<string, string> = {};

/**
 * فیلدهای آینه در SiteSettings برای کلیدهایی که مدیر از مداد ویرایششان
 * می‌کند — باید با mirrorSettingsField/mirrorFontField/mirrorNumberSettingsField
 * در SITE_TEXT_SLOTS (src/lib/site-texts.ts) همیشه هم‌گام بماند.
 *
 * بعد از بازیابی/انتقال رکوردهای SiteText، فیلد آینه از متنِ برنده به‌روز
 * می‌شود تا صفحاتی که مستقیماً از SiteSettings می‌خوانند (اطلاعات تماسِ
 * صفحه‌ی ثبت‌نام و استعلام گواهی‌نامه، شمارنده‌ها) هم درست نمایش بدهند.
 */
export const SITE_TEXT_MIRROR_FIELDS: Record<
  string,
  {
    /** فیلد متنی SiteSettings که متن جایگاه در آن آینه می‌شود */
    settingsField?:
      | "slogan"
      | "heroDescription"
      | "footerDescription"
      | "contactPhone"
      | "contactEmail"
      | "address"
      | "supportHours";
    /** فیلد فونت SiteSettings (کلید InstalledFont) */
    fontField?: "sloganFont";
    /** فیلد عددی SiteSettings برای جایگاه‌های شمارنده */
    numberField?: "studentsCount" | "completedCoursesCount";
  }
> = {
  "hero.slogan": { settingsField: "slogan", fontField: "sloganFont" },
  "hero.description": { settingsField: "heroDescription" },
  "footer.description": { settingsField: "footerDescription" },
  "footer.contactPhone": { settingsField: "contactPhone" },
  "footer.contactEmail": { settingsField: "contactEmail" },
  "footer.address": { settingsField: "address" },
  "footer.supportHours": { settingsField: "supportHours" },
  "stats.students": { numberField: "studentsCount" },
  "stats.completed": { numberField: "completedCoursesCount" },
};

/** کلید نهایی پس از اعمال زنجیره‌ی نام‌های مستعار (حلقه مجاز نیست) */
export function canonicalSiteTextKey(key: string): string {
  let current = key;
  for (let i = 0; i < 8; i++) {
    const next = SITE_TEXT_KEY_ALIASES[current];
    if (!next || next === current) break;
    current = next;
  }
  return current;
}
