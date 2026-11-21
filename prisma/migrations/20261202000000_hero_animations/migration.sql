-- ————————————————————————————————————————————————————————————————
--  «انیمیشن‌های هیرو» — زیرمجموعه‌ی سکشن هیرو در مدیریت صفحه‌ی اول
--  نمایش/مخفی‌سازی هر انیمیشن به تفکیک پلتفرم
--  (موبایل < 768px · تبلت 768–1023px · دسکتاپ ≥ 1024px)
--  scene  = صحنه‌ی مورفینگ «اتم ↔ اثر انگشت» (هسته، مدارها، الکترون‌ها، رگه‌ها)
--  جدول فقط override های مدیر را نگه می‌دارد؛ نبود رکورد = روشن (نمایان).
--  (بدون BEGIN/COMMIT — همان سبک 0_init تا با prisma migrate deploy
--  سازگار باشد.)
-- ————————————————————————————————————————————————————————————————

-- CreateTable
CREATE TABLE "HeroAnimation" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "mobile" BOOLEAN NOT NULL DEFAULT true,
    "tablet" BOOLEAN NOT NULL DEFAULT true,
    "desktop" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
