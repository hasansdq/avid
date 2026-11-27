-- حباب پیام خوش‌آمدگویی چت: مخفی‌شدن خودکارِ انیمیت‌دار پس از N ثانیه
-- (۰ = بدون مخشی‌شدن خودکار) — قابل ویرایش از ماژول «مدیریت چت» پنل مدیر.
ALTER TABLE "ChatSettings" ADD COLUMN "welcomeAutoHideSeconds" INTEGER NOT NULL DEFAULT 7;
