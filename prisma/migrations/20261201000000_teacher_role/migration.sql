-- ————————————————————————————————————————————————————————————————
--  نقش استاد (استاد) و مالکیت دوره/کلاس/استریم
--  چهار نقش سیستم: مدیر کل (AdminUser) | استاد (User.role=teacher) | فراگیر (محاسبه‌ای) | کاربر عادی
--
--  ★ سازگار با SQLite — نسخه‌ی بازنویسی‌شده:
--    دستورِ «ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY» در SQLite معتبر
--    نیست و ارتقای VPS دقیقاً همین‌جا شکست خورد (بکاپ بازیابی شد).
--    کلید خارجی روی جدولِ موجود با «بازسازی جدول» افزوده می‌شود — همان
--    الگوی استاندارد SQLite و همان الگوی مهاجرت 20261115000100
--    (PRAGMA foreign_keys=OFF → CREATE TABLE new_* → INSERT … SELECT →
--    DROP → RENAME → PRAGMA foreign_keys=ON).
--
--  جدول‌های کلاس/استریم (ClassRoom/ClassMembership/LiveStream/
--  StreamInvitation/StreamParticipant) در مهاجرتِ پیشینِ
--  20261130120000_class_stream_tables «با شکل کامل» (teacherId/hostId/
--  inviteSlug + کلیدهای خارجی) ساخته می‌شوند؛ این‌جا فقط:
--    ۱) ستون role روی User،
--    ۲) ستون teacherId روی Course (جدولِ موجود از 0_init)،
--    ۳) و کلیدهای خارجی مالکیت (Course/ClassRoom/LiveStream → User)
--       با بازسازیِ جدول‌های سه‌گانه — بازسازیِ بی‌قیدوشرط تضمین می‌کند
--       حتی دیتابیس‌هایی که ستون‌ها را از «خودترمیمی بوت» (بدون کلید
--       خارجی) گرفته‌اند هم به شکلِ نهاییِ اسکیما همگرا شوند.
-- ————————————————————————————————————————————————————————————————

-- ۱) نقش حساب کاربر — پیش‌فرض student؛ استاد = teacher
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'student';

-- ۲) ستون مالک دوره — پیش از بازسازی جدول افزوده می‌شود تا داده‌ی
--    دیتابیس‌هایی که ستون را از «خودترمیمی بوت» گرفته‌اند حفظ شود؛
--    در دیتابیس‌هایی که ستون از قبل هست، جمله با «duplicate column»
--    بی‌خطر رد می‌شود ( سازوکار تحمل migrate.ts ).
ALTER TABLE "Course" ADD COLUMN "teacherId" TEXT;

-- ۳) کلیدهای خارجی مالکیت — بازسازی جدول‌های سه‌گانه (الگوی SQLite)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- — بازسازی Course: افزودن Course_teacherId_fkey → User —
CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'عمومی',
    "type" TEXT NOT NULL DEFAULT 'online',
    "level" TEXT NOT NULL DEFAULT 'مقدماتی',
    "hours" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "instructor" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL DEFAULT 0,
    "cashTuition" INTEGER NOT NULL DEFAULT 10000000,
    "installmentTuition" INTEGER NOT NULL DEFAULT 12000000,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "schedule" TEXT NOT NULL DEFAULT '',
    "students" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT NOT NULL DEFAULT 'Sparkles',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "theme" TEXT NOT NULL DEFAULT 'teal',
    "tag" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "teacherId" TEXT,
    CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Course" ("id", "title", "description", "category", "type", "level", "hours", "sessions", "instructor", "price", "cashTuition", "installmentTuition", "capacity", "schedule", "students", "icon", "imageUrl", "theme", "tag", "sortOrder", "published", "createdAt", "updatedAt", "teacherId") SELECT "id", "title", "description", "category", "type", "level", "hours", "sessions", "instructor", "price", "cashTuition", "installmentTuition", "capacity", "schedule", "students", "icon", "imageUrl", "theme", "tag", "sortOrder", "published", "createdAt", "updatedAt", "teacherId" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";

-- — بازسازی ClassRoom: افزودن ClassRoom_teacherId_fkey → User —
CREATE TABLE "new_ClassRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "inviteSlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "teacherId" TEXT,
    CONSTRAINT "ClassRoom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClassRoom" ("id", "title", "description", "inviteSlug", "createdAt", "updatedAt", "teacherId") SELECT "id", "title", "description", "inviteSlug", "createdAt", "updatedAt", "teacherId" FROM "ClassRoom";
DROP TABLE "ClassRoom";
ALTER TABLE "new_ClassRoom" RENAME TO "ClassRoom";

-- — بازسازی LiveStream: افزودن LiveStream_hostId_fkey → User —
CREATE TABLE "new_LiveStream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "inviteSlug" TEXT,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "hostId" TEXT,
    CONSTRAINT "LiveStream_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LiveStream" ("id", "title", "description", "status", "inviteSlug", "startedAt", "endedAt", "createdAt", "updatedAt", "hostId") SELECT "id", "title", "description", "status", "inviteSlug", "startedAt", "endedAt", "createdAt", "updatedAt", "hostId" FROM "LiveStream";
DROP TABLE "LiveStream";
ALTER TABLE "new_LiveStream" RENAME TO "LiveStream";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ۴) ایندکس‌های مالکیت — پس از بازسازی (ایندکس‌های قدیمیِ هم‌نام با
--    DROP جدول برداشت شده‌اند؛ این‌جا روی جدولِ نو ساخته می‌شوند)
CREATE INDEX "Course_teacherId_idx" ON "Course"("teacherId");
CREATE INDEX "ClassRoom_teacherId_idx" ON "ClassRoom"("teacherId");
CREATE INDEX "LiveStream_hostId_idx" ON "LiveStream"("hostId");

-- ۵) لینک دعوت یکتای استریم — inviteSlug → /stream/inviteSlug؛
--    لینک خودش دعوت است
CREATE UNIQUE INDEX "LiveStream_inviteSlug_key" ON "LiveStream"("inviteSlug");
CREATE UNIQUE INDEX "ClassRoom_inviteSlug_key" ON "ClassRoom"("inviteSlug");
