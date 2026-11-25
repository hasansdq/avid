-- ————————————————————————————————————————————————————————————————
--  «سازنده‌ی آزمون در پنل استاد (ساخت آزمون)»
--  ستون creatorId روی جدول Exam (جدولِ موجود از 0_init) + کلید خارجی
--  سازنده → User (SetNull: حذف کاربرِ سازنده آزمون را «رها» می‌کند تا
--  دسترسِ آزمون در پنل کاربران سالم بماند).
--  null = آزمونِ ساخته‌ی مدیر؛ پنل استادِ بخش «ساخت آزمون» فقط
--  آزمون‌های creatorId خودش را می‌بیند و ویرایش می‌کند.
--
--  ★ سازگار با SQLite — همان الگوی مهاجرت 20261201000000_teacher_role:
--    دستور «ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY» در SQLite معتبر
--    نیست؛ کلید خارجی روی جدولِ موجود با «بازسازی جدول» افزوده می‌شود
--    (PRAGMA foreign_keys=OFF → CREATE TABLE new_* → INSERT … SELECT →
--    DROP → RENAME → PRAGMA foreign_keys=ON).
--    ۱) ALTER ADD COLUMN ابتدا اجرا می‌شود تا مقدارِ دیتابیس‌هایی که
--       ستون را از «خودترمیمی بوت» (ensure-schema/db push) گرفته‌اند
--       حفظ شود؛ جمله با «duplicate column» بی‌خطر رد می‌شود
--       (سازوکار تحمل migrate.ts).
--    ۲) INSERT شامل creatorId است تا داده‌ی همان ستون در انتقال
--       جدول حفظ شود.
-- ————————————————————————————————————————————————————————————————

-- ۱) ستون سازنده آزمون
ALTER TABLE "Exam" ADD COLUMN "creatorId" TEXT;

-- ۲) کلید خارجی سازنده — بازسازی جدول (الگوی استاندارد SQLite)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "accessType" TEXT NOT NULL DEFAULT 'open',
    "courseId" TEXT,
    "classId" TEXT,
    "password" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "allowBack" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isBankCopy" BOOLEAN NOT NULL DEFAULT false,
    "bankOriginId" TEXT,
    "creatorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Exam_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exam_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Exam_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Exam" ("id", "title", "description", "accessType", "courseId", "classId", "password", "durationMinutes", "allowBack", "published", "sortOrder", "isBankCopy", "bankOriginId", "creatorId", "createdAt", "updatedAt") SELECT "id", "title", "description", "accessType", "courseId", "classId", "password", "durationMinutes", "allowBack", "published", "sortOrder", "isBankCopy", "bankOriginId", "creatorId", "createdAt", "updatedAt" FROM "Exam";
DROP TABLE "Exam";
ALTER TABLE "new_Exam" RENAME TO "Exam";

-- ۳) ایندکس‌ها (حذف جدول قدیمی ایندکس‌هایش را هم برداشت)
CREATE INDEX "Exam_courseId_idx" ON "Exam"("courseId");
CREATE INDEX "Exam_classId_idx" ON "Exam"("classId");
CREATE INDEX "Exam_isBankCopy_idx" ON "Exam"("isBankCopy");
CREATE INDEX "Exam_creatorId_idx" ON "Exam"("creatorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
