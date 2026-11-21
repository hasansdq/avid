-- ————————————————————————————————————————————————————————————————
--  «شماره شبا استاد + واریزهای درآمد استاد»
--  ۱) User.shabaNumber — شماره شبای بانکی استاد برای برداشت/واریز درآمد
--     (استاد خودش در بخش «مالی و درآمد» پنلش ثبت می‌کند؛ مدیر هم از
--      دیالوگ «پرداختی‌ها و اقساط» → تب «درآمد استاد و شبا» ویرایش می‌کند)
--  ۲) TeacherPayout — واریزی‌های دستی درآمد استاد (مبلغ + وضعیت
--     paid/pending + تاریخ و یادداشت) که مدیر ثبت/ویرایش می‌کند.
--  (بدون BEGIN/COMMIT — همان سبک 0_init تا با prisma migrate deploy
--  سازگار باشد. ALTER فقط ADD COLUMN بدون قید سطح-جدول — سازگار با SQLite.)
-- ————————————————————————————————————————————————————————————————

-- AlterTable
ALTER TABLE "User" ADD COLUMN "shabaNumber" TEXT;

-- CreateTable
CREATE TABLE "TeacherPayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "note" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeacherPayout_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TeacherPayout_teacherId_idx" ON "TeacherPayout"("teacherId");
