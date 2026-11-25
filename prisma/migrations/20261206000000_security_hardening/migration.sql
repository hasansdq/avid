-- امنیت: هدف‌مندی کدهای یک‌بارمصرف + محدودیت پایدار نرخ درخواست‌ها
-- (صرفاً افزایشی — سازگار با نصب‌های موجود؛ دست‌نخورده نسبت به مهاجرت‌های قبل)

-- ۱) هدف‌مندی کد یک‌بارمصرف: کدِ صادرشده برای یک هدف (ورود کاربر/ورود پنل/
--    دومرحله‌ای مدیر/تایید شماره‌ی جدید مدیر) فقط در همان هدف مصرف می‌شود.
--    ردیف‌های موجود مقدار پیش‌فرض «general» می‌گیرند و کدهای فعالِ قدیمی
--    طی اعتبار ۵ دقیقه‌ای خودشان منقضی می‌شوند.
ALTER TABLE "OtpCode" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'general';
CREATE INDEX "OtpCode_phone_purpose_createdAt_idx" ON "OtpCode"("phone", "purpose", "createdAt");

-- ۲) شمارنده‌ی پایدارِ محدودیت نرخ — محدودیت‌ها (ورود مدیر، ارسال/تایید OTP)
--    پس از ری‌استارت باقی می‌مانند؛ ذخیره در همان SQLite موجود بدون
--    وابستگی زیرساختی تازه (Redis و…).
CREATE TABLE "RateLimitEntry" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "windowStart" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "RateLimitEntry_windowStart_idx" ON "RateLimitEntry"("windowStart");
