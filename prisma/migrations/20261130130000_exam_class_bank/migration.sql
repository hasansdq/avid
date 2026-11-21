-- ————————————————————————————————————————————————————————————————
--  تکمیل شکل جدول Exam (آزمون):
--    • classId       — آزمونِ وابسته به کلاس حضوری (FK → ClassRoom)
--    • isBankCopy    — نسخه‌ی کپی از بانک سؤال
--    • bankOriginId  — آزمون مبدأِ نسخه‌ی بانکی
--  این ستون‌ها پیش‌تر فقط با «خودترمیمی بوت» (ensure-schema) به
--  دیتابیس‌های موجود اضافه می‌شدند و در زنجیره‌ی مهاجرت‌ها جا افتاده
--  بودند؛ در «نصب تازه» باید همین‌جا ساخته شوند.
--  جدول ClassRoom در مهاجرتِ پیشین (20261130120000) ساخته شده و
--  کلید خارجی Exam_classId_fkey معتبر است.
--
--  کلید خارجی روی جدولِ موجود با «بازسازی جدول» (الگوی SQLite —
--  همان 20261115000100) افزوده می‌شود؛ ستون‌ها پیش از بازسازی با
--  ALTER اضافه می‌شوند تا داده‌ی دیتابیس‌هایی که ستون‌ها را از
--  خودترمیمی بوت گرفته‌اند در INSERT…SELECT حفظ شود (جمله‌های
--  duplicate در بازپخش migrate.ts بی‌خطر رد می‌شوند).
-- ————————————————————————————————————————————————————————————————

ALTER TABLE "Exam" ADD COLUMN "classId" TEXT;
ALTER TABLE "Exam" ADD COLUMN "isBankCopy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Exam" ADD COLUMN "bankOriginId" TEXT;

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Exam_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exam_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Exam" ("id", "title", "description", "accessType", "courseId", "classId", "password", "durationMinutes", "allowBack", "published", "sortOrder", "isBankCopy", "bankOriginId", "createdAt", "updatedAt") SELECT "id", "title", "description", "accessType", "courseId", "classId", "password", "durationMinutes", "allowBack", "published", "sortOrder", "isBankCopy", "bankOriginId", "createdAt", "updatedAt" FROM "Exam";
DROP TABLE "Exam";
ALTER TABLE "new_Exam" RENAME TO "Exam";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ایندکس‌ها (ایندکس‌های قدیمیِ جدولِ قبلی با DROP آن برداشته شده‌اند)
CREATE INDEX "Exam_courseId_idx" ON "Exam"("courseId");
CREATE INDEX "Exam_classId_idx" ON "Exam"("classId");
CREATE INDEX "Exam_isBankCopy_idx" ON "Exam"("isBankCopy");
