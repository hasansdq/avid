-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SiteSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "siteName" TEXT NOT NULL DEFAULT 'آوید',
    "tagline" TEXT NOT NULL DEFAULT 'آکادمی مهارت‌های آینده',
    "slogan" TEXT NOT NULL DEFAULT 'یادگیری هر مهارتی، سرمایه‌ی شما در آینده است',
    "heroDescription" TEXT NOT NULL DEFAULT 'در آکادمی آوید، از هوش مصنوعی تا برنامه‌نویسی کودکان، با پروژه‌های واقعی و پشتیبانی متخصص‌ها مهارت بسازید و آینده شغلی خود را تضمین کنید.',
    "logoUrl" TEXT NOT NULL DEFAULT '/images/logo.png',
    "studentsCount" INTEGER NOT NULL DEFAULT 270,
    "completedCoursesCount" INTEGER NOT NULL DEFAULT 13,
    "rating" REAL NOT NULL DEFAULT 4.9,
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "supportHours" TEXT NOT NULL DEFAULT '',
    "instagramUrl" TEXT NOT NULL DEFAULT '',
    "telegramUrl" TEXT NOT NULL DEFAULT '',
    "youtubeUrl" TEXT NOT NULL DEFAULT '',
    "linkedinUrl" TEXT NOT NULL DEFAULT '',
    "footerDescription" TEXT NOT NULL DEFAULT 'یادگیری هر مهارتی، سرمایه‌ی شما در آینده است. ما با دوره‌های پروژه‌محور و مربیان متخصص، همراه شما در این مسیر هستیم.',
    "enamadCode" TEXT NOT NULL DEFAULT '',
    "zarinpalCode" TEXT NOT NULL DEFAULT '',
    "sloganFont" TEXT NOT NULL DEFAULT 'vazirmatn',
    "headerFont" TEXT NOT NULL DEFAULT 'vazirmatn',
    "footerFont" TEXT NOT NULL DEFAULT 'vazirmatn',
    "pencilEditorEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SiteSettings" ("address", "completedCoursesCount", "contactEmail", "contactPhone", "enamadCode", "footerDescription", "footerFont", "headerFont", "heroDescription", "id", "instagramUrl", "linkedinUrl", "logoUrl", "pencilEditorEnabled", "rating", "siteName", "slogan", "sloganFont", "studentsCount", "supportHours", "tagline", "telegramUrl", "updatedAt", "youtubeUrl", "zarinpalCode") SELECT "address", "completedCoursesCount", "contactEmail", "contactPhone", "enamadCode", "footerDescription", "footerFont", "headerFont", "heroDescription", "id", "instagramUrl", "linkedinUrl", "logoUrl", "pencilEditorEnabled", "rating", "siteName", "slogan", "sloganFont", "studentsCount", "supportHours", "tagline", "telegramUrl", "updatedAt", "youtubeUrl", "zarinpalCode" FROM "SiteSettings";
DROP TABLE "SiteSettings";
ALTER TABLE "new_SiteSettings" RENAME TO "SiteSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
