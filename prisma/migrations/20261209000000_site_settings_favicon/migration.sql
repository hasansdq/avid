-- favicon اختصاصی سایت (آیکون تب مرورگر) — خالی یعنی همان لوگوی سایت استفاده می‌شود.
ALTER TABLE "SiteSettings" ADD COLUMN "faviconUrl" TEXT NOT NULL DEFAULT '';
