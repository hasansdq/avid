/**
 * کلاچ بوت سرور Next.js —
 * پیش از پذیرش درخواست‌ها، «خودترمیمی افزایشی» اسکیمای دیتابیس اجرا
 * می‌شود تا روی استقرارهایی که سرویس migrate را دور زده‌اند (دیتابیس
 * قدیمی با ستون/جدول‌های جاافتاده)، ماژول‌های پنل مدیر مانند «تنظیمات
 * سایت»، «ویرایش هدر و فوتر» و «فونت‌ها» به جای خطای ۵۰۰ («خطای
 * ناشناخته رخ داد») سالم کار کنند.
 *
 * بی‌خطر و idempotent است: فقط جدول/ستون/ایندکسِ جاافتاده «می‌افزاید»،
 * هرگز چیزی حذف/تغییر نمی‌دهد و هر خطایش فقط ثبت می‌شود (بوتِ سرور
 * هرگز متوقف نمی‌شود). برای غیرفعال‌کردن: AVID_SKIP_SCHEMA_HEAL=1
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AVID_SKIP_SCHEMA_HEAL === "1") return;
  try {
    const { ensureSchemaOnBoot } = await import("@/lib/ensure-schema");
    await ensureSchemaOnBoot();
  } catch (error) {
    console.warn(
      `instrumentation: خودترمیمی اسکیما انجام نشد — ${(error as Error | undefined)?.message ?? error}`
    );
  }
}
