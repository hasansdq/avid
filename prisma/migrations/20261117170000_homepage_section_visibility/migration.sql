BEGIN;

-- ————————————————————————————————————————————————————————————————
--  مدیریت صفحه‌ی اول سایت — نمایش/مخفی‌سازی هر سکشن به تفکیک پلتفرم
--  (موبایل < 768px · تبلت 768–1023px · دسکتاپ ≥ 1024px)
--  جدول فقط override های مدیر را نگه می‌دارد؛ نبود رکورد = نمایان.
-- ————————————————————————————————————————————————————————————————

-- CreateTable
CREATE TABLE "HomepageSection" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "mobile" BOOLEAN NOT NULL DEFAULT true,
    "tablet" BOOLEAN NOT NULL DEFAULT true,
    "desktop" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

COMMIT;
