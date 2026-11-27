import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import { fontStack, resolveFontFamilies } from "@/lib/fonts";
import { getPublishedLinks } from "@/lib/nav-links";
import { buildSiteTextDefaults } from "@/lib/site-texts";
import { SESSION_COOKIE } from "@/lib/auth";
import {
  resolveSectionVisibility,
  sectionVisibilityClass,
} from "@/lib/homepage-sections";
import { resolveHeroAnimations } from "@/lib/hero-animations";
import type { SiteSettings } from "@prisma/client";
import { ParallaxProvider, ParallaxBackground } from "@/components/parallax";
import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { Courses } from "@/components/site/courses";
import { Samples } from "@/components/site/samples";
import { ActionCards } from "@/components/site/action-cards";
import { Counters } from "@/components/site/counters";
import { Register } from "@/components/site/register";
import { Videos } from "@/components/site/videos";
import { Testimonials } from "@/components/site/testimonials";
import { Footer } from "@/components/site/footer";
import { ChatWidget } from "@/components/chat/chat-widget";
import {
  SiteTextsProvider,
  type SiteTextFontOption,
  type SiteTextRowValue,
} from "@/components/site/editable-texts";

/** تنظیمات پیش‌فرض هویت سایت — از lib/default-settings */
const FALLBACK_SETTINGS: SiteSettings = DEFAULT_SETTINGS;

export default async function Home() {
  // — ویرایشگر مدادی: کوکی نشست مدیر بررسی می‌شود تا فقط مدیر آیکون مداد ببیند —
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(SESSION_COOKIE)?.value;

  const [settings, courses, videos, playlists, testimonials, headerLinks, footerLinks, fonts, siteTextRows, adminSession, sampleCategories, homepageSectionRows, heroAnimationRows] =
    await Promise.all([
      db.siteSettings.findUnique({ where: { id: "main" } }),
      db.course.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        // قالب اقساط هر دوره (تعداد و سررسیدها) برای نمایش در فرم
        include: { installmentTemplate: { orderBy: { index: "asc" } } },
      }),
      db.video.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      db.playlist.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      db.testimonial.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      getPublishedLinks("header"),
      getPublishedLinks("footer"),
      db.installedFont.findMany(),
      db.siteText.findMany(),
      adminToken
        ? db.adminSession.findUnique({ where: { token: adminToken } })
        : Promise.resolve(null),
      // — نمونه سوالات: دسته‌های منتشرشده با آیتم‌های خودشان —
      db.sampleQuestionCategory.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          items: {
            where: { published: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          },
        },
      }),
      // — مدیریت صفحه‌ی اول: override های نمایش/مخفی‌سازی سکشن‌ها —
      db.homepageSection.findMany(),
      // — «انیمیشن‌های هیرو»: override های روشن/خاموش انیمیشن‌ها —
      db.heroAnimation.findMany(),
    ]);

  const siteSettings = settings ?? FALLBACK_SETTINGS;
  const fontFamilies = resolveFontFamilies(fonts, siteSettings);

  // — فایل‌های گالری «نمونه سوالات» فقط وقتی لازم‌اند که هیچ رکورد دسته/آیتمی
  // نباشد — مسیر جایگزین برای مدیر (آپلود از گالری با بخش نمونه سوالات)
  const sampleFiles =
    sampleCategories.length === 0
      ? await db.uploadedFile
          .findMany({
            where: { section: "sampleQuestions" },
            orderBy: { createdAt: "desc" },
            take: 24,
          })
          .catch(() => [])
      : [];

  // — وضعیت ویرایشگر مدادی —
  const isAdmin =
    Boolean(adminSession) && adminSession!.expiresAt >= new Date();

  const siteTextRowsMap: Record<string, SiteTextRowValue> = {};
  for (const row of siteTextRows) {
    siteTextRowsMap[row.key] = {
      text: row.text,
      color: row.color,
      fontKey: row.fontKey,
      fontSize: row.fontSize,
      fontSizeTablet: row.fontSizeTablet ?? null,
      fontSizeMobile: row.fontSizeMobile ?? null,
      hidden: row.hidden,
      hiddenDesktop: row.hiddenDesktop ?? false,
      hiddenTablet: row.hiddenTablet ?? false,
      hiddenMobile: row.hiddenMobile ?? false,
    };
  }

  // ناشناس‌ها متنِ جایگاه‌های مخفی را حتی در داده‌های صفحه (RSC) هم دریافت
  // نمی‌کنند؛ متن‌های نمایان کامل ارسال می‌شوند.
  if (!isAdmin) {
    for (const key of Object.keys(siteTextRowsMap)) {
      const row = siteTextRowsMap[key];
      if (row.hidden) {
        siteTextRowsMap[key] = { ...row, text: null };
      }
    }
  }

  const fontOptions: SiteTextFontOption[] = fonts.map((f) => ({
    key: f.key,
    label: f.label,
    stack: fontStack(f.family),
    cssText: f.cssText,
  }));

  // متن‌های پیش‌فرض فقط برای مدیر لازم‌اند (پیش‌پر کردن فرم ویرایشگر مدادی)
  const textDefaults = isAdmin
    ? buildSiteTextDefaults(siteSettings)
    : {};

  // برای ناشناس‌ها، متن جایگاه‌های مخفیِ هیرو از props تنظیمات هم حذف می‌شود
  // تا در داده‌های صفحه (RSC) ارسال نشود.
  let viewSettings = siteSettings;
  if (!isAdmin) {
    const hideSlogan = siteTextRowsMap["hero.slogan"]?.hidden ?? false;
    const hideHeroDesc =
      siteTextRowsMap["hero.description"]?.hidden ?? false;
    if (hideSlogan || hideHeroDesc) {
      viewSettings = {
        ...siteSettings,
        slogan: hideSlogan ? "" : siteSettings.slogan,
        heroDescription: hideHeroDesc
          ? ""
          : siteSettings.heroDescription,
      };
    }
  }

  // — مدیریت صفحه‌ی اول: نمایش/مخفی‌سازی هر سکشن به تفکیک موبایل/تبلت/دسکتاپ —
  // (لفافِ block دور هر سکشن؛ سکشن داخلی display خودش را حفظ می‌کند)
  const sectionVisibility = resolveSectionVisibility(homepageSectionRows);

  // — «انیمیشن‌های هیرو»: روشن/خاموش هر انیمیشن به تفکیک موبایل/تبلت/دسکتاپ —
  const heroAnimations = resolveHeroAnimations(heroAnimationRows);

  return (
    <ParallaxProvider>
      <div className="relative flex min-h-screen flex-col">
        <ParallaxBackground />
        <SiteTextsProvider
          enabled={siteSettings.pencilEditorEnabled}
          isAdmin={isAdmin}
          rows={siteTextRowsMap}
          fonts={fontOptions}
          defaults={textDefaults}
        >
          <Navbar
            settings={siteSettings}
            links={headerLinks}
            fontFamily={fontFamilies.header}
          />

          <main className="flex-1">
            <div className={sectionVisibilityClass(sectionVisibility.hero)}>
              <Hero
                settings={viewSettings}
                fontFamily={fontFamilies.slogan}
                animations={heroAnimations}
              />
            </div>
            <div className={sectionVisibilityClass(sectionVisibility.courses)}>
              <Courses courses={courses} />
            </div>
            <div className={sectionVisibilityClass(sectionVisibility.actionCards)}>
              <ActionCards />
            </div>
            <div className={sectionVisibilityClass(sectionVisibility.counters)}>
              <Counters settings={siteSettings} />
            </div>
            <div className={sectionVisibilityClass(sectionVisibility.register)}>
              <Register courses={courses} settings={siteSettings} />
            </div>
            <div className={sectionVisibilityClass(sectionVisibility.videos)}>
              <Videos videos={videos} playlists={playlists} />
            </div>
            <div className={sectionVisibilityClass(sectionVisibility.samples)}>
              <Samples categories={sampleCategories} files={sampleFiles} />
            </div>
            <div className={sectionVisibilityClass(sectionVisibility.testimonials)}>
              <Testimonials testimonials={testimonials} />
            </div>
          </main>

          <Footer
            settings={siteSettings}
            courses={courses}
            links={footerLinks}
            fontFamily={fontFamilies.footer}
          />
        </SiteTextsProvider>

        {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ در همه‌ی صفحات */}
        <ChatWidget />
      </div>
    </ParallaxProvider>
  );
}
