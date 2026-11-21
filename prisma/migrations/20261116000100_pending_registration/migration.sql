BEGIN;

-- CreateTable
-- ثبت‌نام نیمه‌کاره‌ی فرم یکپارچه‌ی ورود/ثبت‌نام: پس از تایید شماره‌ی موبایلِ
-- ثبت‌نشده (کد پیامکی مصرف‌شده) و پیش از دریافت مشخصات؛ توکن یک‌بارمصرفِ
-- کوتاه‌مدت برای ساخت حساب بدون درخواست دوباره‌ی کد پیامکی.
CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_phone_key" ON "PendingRegistration"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_token_key" ON "PendingRegistration"("token");

COMMIT;
