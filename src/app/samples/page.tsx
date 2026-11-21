import type { Metadata } from "next";
import { db } from "@/lib/db";
import { resolveFontFamilies } from "@/lib/fonts";
import { SamplesPage } from "@/components/site/samples-page";
import { SiteTextsProvider } from "@/components/site/editable-texts";
import { getSiteTextsServerContext } from "@/lib/site-texts-server";
import { ChatWidget } from "@/components/chat/chat-widget";
import { getPublishedCategoriesWithItems } from "@/lib/sample-questions-server";
import { SAMPLE_QUESTIONS_GALLERY_SECTION } from "@/lib/sample-questions";

/**
 * صفحه‌ی مستقل «نمونه سوالات» — شبکه‌ی کارت‌های مربعی دسته‌بندی‌ها
 * با پس‌زمینه‌ی موضوعی + نمای تفصیلی نمونه سوال‌های هر دسته
 * (تصویر / PDF / ویدئو).
 *
 * ویرایشگر ظاهری مدادی روی تیتر و توضیح فعال است (SiteTextsProvider)
 * با همان کلیدهای samples.title / samples.description صفحه‌ی اول —
 * یعنی ویرایش مدیر روی هر دو صفحه اعمال می‌شود.
 */
export const metadata: Metadata = {
  title: "نمونه سوالات | آکادمی آوید",
  description:
    "نمونه سوالات دوره‌های آکادمی آوید به تفکیک دسته‌بندی موضوعی — مشاهده و دانلود رایگان فایل‌ها (تصویر، PDF، ویدئو).",
};

export default async function SamplesRoute() {
  const textsCtx = await getSiteTextsServerContext();

  const [categories, fonts] = await Promise.all([
    getPublishedCategoriesWithItems(),
    db.installedFont.findMany().catch(() => []),
  ]);

  // فایل‌های گالری «نمونه سوالات» فقط وقتی هیچ دسته/رکوردی نباشد —
  // همان مسیر جایگزین صفحه‌ی اول (آپلود از گالری با بخش نمونه سوالات)
  const files =
    categories.length === 0
      ? await db.uploadedFile
          .findMany({
            where: { section: SAMPLE_QUESTIONS_GALLERY_SECTION },
            orderBy: { createdAt: "desc" },
            take: 24,
          })
          .catch(() => [])
      : [];

  const fontFamilies = resolveFontFamilies(fonts, textsCtx.settings);

  return (
    <>
      <SiteTextsProvider
        enabled={textsCtx.settings.pencilEditorEnabled}
        isAdmin={textsCtx.isAdmin}
        rows={textsCtx.rows}
        fonts={textsCtx.fonts}
        defaults={textsCtx.defaults}
      >
        <SamplesPage
          settings={textsCtx.settings}
          fontFamily={fontFamilies.header}
          categories={categories}
          files={files}
        />
      </SiteTextsProvider>
      {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ */}
      <ChatWidget />
    </>
  );
}
