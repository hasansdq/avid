import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import { resolveFontFamilies } from "@/lib/fonts";
import { getPublishedLinks } from "@/lib/nav-links";
import type { SiteSettings } from "@prisma/client";
import { ParallaxProvider, ParallaxBackground } from "@/components/parallax";
import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { Courses } from "@/components/site/courses";
import { ActionCards } from "@/components/site/action-cards";
import { Counters } from "@/components/site/counters";
import { Register } from "@/components/site/register";
import { Videos } from "@/components/site/videos";
import { Testimonials } from "@/components/site/testimonials";
import { Footer } from "@/components/site/footer";
import { ChatWidget } from "@/components/chat/chat-widget";

/** تنظیمات پیش‌فرض هویت سایت — از lib/default-settings */
const FALLBACK_SETTINGS: SiteSettings = DEFAULT_SETTINGS;

export default async function Home() {
  const [settings, courses, videos, playlists, testimonials, headerLinks, footerLinks, fonts] =
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
    ]);

  const siteSettings = settings ?? FALLBACK_SETTINGS;
  const fontFamilies = resolveFontFamilies(fonts, siteSettings);

  return (
    <ParallaxProvider>
      <div className="relative flex min-h-screen flex-col">
        <ParallaxBackground />
        <Navbar
          settings={siteSettings}
          links={headerLinks}
          fontFamily={fontFamilies.header}
        />

        <main className="flex-1">
          <Hero settings={siteSettings} fontFamily={fontFamilies.slogan} />
          <Courses courses={courses} />
          <ActionCards />
          <Counters settings={siteSettings} />
          <Register courses={courses} settings={siteSettings} />
          <Videos videos={videos} playlists={playlists} />
          <Testimonials testimonials={testimonials} />
        </main>

        <Footer
          settings={siteSettings}
          courses={courses}
          links={footerLinks}
          fontFamily={fontFamilies.footer}
        />

        {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ در همه‌ی صفحات */}
        <ChatWidget />
      </div>
    </ParallaxProvider>
  );
}
