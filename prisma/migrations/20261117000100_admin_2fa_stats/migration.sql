BEGIN;

-- ————————————————————————————————————————————————————————————————
--  تایید دومرحله‌ای پیامکی مدیر + آمار سایت (نمودارهای پنل)
--  ۱) AdminUser: شماره موبایل + کلید فعال‌سازی تایید دومرحله‌ای
--  ۲) UserSession: lastSeenAt (ضربان حضور/کاربران آنلاین)
--  ۳) جدول‌های آمار: StatsDaily / VisitVisitorDay / PresencePulse
-- ————————————————————————————————————————————————————————————————

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserSession" ADD COLUMN "lastSeenAt" DATETIME;

-- CreateTable
-- شمارنده‌های روزانه‌ی آمار سایت (کلید روز YYYY-MM-DD)
CREATE TABLE "StatsDaily" (
    "day" TEXT NOT NULL PRIMARY KEY,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "signups" INTEGER NOT NULL DEFAULT 0,
    "logins" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
-- بازدیدکننده‌ی یکتا در روز (درج تکراری = قبلاً شمرده شده)
CREATE TABLE "VisitVisitorDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitVisitorDay_day_visitorId_key" ON "VisitVisitorDay"("day", "visitorId");

-- CreateIndex
CREATE INDEX "VisitVisitorDay_day_idx" ON "VisitVisitorDay"("day");

-- CreateTable
-- ضربان حضور کاربران آنلاین
CREATE TABLE "PresencePulse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PresencePulse_at_idx" ON "PresencePulse"("at");

COMMIT;
