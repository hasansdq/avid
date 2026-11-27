-- ویرایشگر ظاهری مدادی: اندازه‌ی فونت و نمایش/مخفی‌بودن به تفکیک دستگاه
-- (دسکتاپ ≥۱۰۲۴ / تبلت ۷۶۸–۱۰۲۳ / موبایل زیر ۷۶۸) — همه با ADD COLUMN
-- سازگار SQLite و پیش‌فرض ثابت؛ رکوردهای موجود به‌راحتی ارتقا می‌یابند.
ALTER TABLE "SiteText" ADD COLUMN "fontSizeTablet" INTEGER;
ALTER TABLE "SiteText" ADD COLUMN "fontSizeMobile" INTEGER;
ALTER TABLE "SiteText" ADD COLUMN "hiddenDesktop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteText" ADD COLUMN "hiddenTablet" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteText" ADD COLUMN "hiddenMobile" BOOLEAN NOT NULL DEFAULT false;
