"use client";

import {
  Play,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/site/editable-texts";
import { AtomFingerprintScene } from "@/components/site/atom-fingerprint-scene";
import {
  DEFAULT_SECTION_VISIBILITY,
  sectionVisibilityClass,
  type SectionVisibility,
} from "@/lib/homepage-sections";
import type { HeroAnimationVisibilityMap } from "@/lib/hero-animations";

export function Hero({
  settings,
  fontFamily,
  animations,
}: {
  settings: SiteSettings;
  /** مقدار font-family فونت اسلوگان (از فونت‌های نصب‌شده) */
  fontFamily: string;
  /** «انیمیشن‌های هیرو» — روشن/خاموش به تفکیک موبایل/تبلت/دسکتاپ
   *  (از مدیریت صفحه‌ی اول؛ نبودِ prop = انیمیشن همه‌جا روشن).
   *  فقط صحنه‌ی «اتم ↔ اثر انگشت» را کنترل می‌کند؛ نمادهای شناور،
   *  آیکون‌ها و متن‌ها همیشه نمایان می‌مانند */
  animations?: HeroAnimationVisibilityMap;
}) {
  const sceneVisibility: SectionVisibility =
    animations?.scene ?? DEFAULT_SECTION_VISIBILITY;

  // شکستن اسلوگان به دو خط (تیتر + بخش درخشان) — برای متن پیش‌فرض و متن
  // سفارشی مداد با «همان منطق واحد» رندر می‌شود؛ اگر متن ویرگول «،» نداشته
  // باشد، کل متن همان افکت درخشش (text-shine) را حفظ می‌کند — صرفِ تغییر
  // متن، افکت ظاهری قبلی اسلوگان را از بین نمی‌برد.
  const splitSlogan = (text: string) => {
    const i = text.indexOf("،");
    const head = i >= 0 ? text.slice(0, i + 1) : "";
    const tail = i >= 0 ? text.slice(i + 1).trim() : "";
    if (!head || !tail) {
      return <span className="text-shine">{text}</span>;
    }
    return (
      <>
        {head}
        <span className="text-shine mt-2 block pb-2">{tail}</span>
      </>
    );
  };

  return (
    <section
      id="home"
      /* موبایل: محتوا از زیر هدر شروع می‌شود و «روی» اتمِ پس‌زمینه می‌نشیند
         (اتمِ تیره زیرِ متن‌ها/دکمه‌ها رندر می‌شود؛ اسلوگان پنل شیشه‌ای دارد) */
      className="relative isolate flex min-h-[580px] max-md:min-h-[430px] items-center overflow-hidden px-4 pb-16 max-md:items-start max-md:pt-28 pt-36 max-md:pb-6 md:min-h-[640px] md:pb-20 md:pt-40"
    >
      {/* پس‌زمینه‌ی هیرو — صحنه‌ی ترکیبی «اتم ↔ اثر انگشت» (هسته + مدارهای
          مورف‌شونده به رگه‌های اثر انگشت + الکترون‌های کروی + المان‌های شناور).
          «انیمیشن‌های هیرو» از مدیریت صفحه‌ی اول: فقط همین صحنه به تفکیک
          موبایل/تبلت/دسکتاپ خاموش/روشن می‌شود؛ نمادهای شناور، آیکون‌ها و
          متن‌ها همیشه نمایان می‌مانند (مخفی‌سازی کل هیرو = سوئیچ‌های سکشن هیرو) */}
      <AtomFingerprintScene
        sceneClassName={sectionVisibilityClass(sceneVisibility)}
      />

      {/* محتوای اصلی — در RTL ستون نخست (متن) سمت راست و ستون آیکون‌ها سمت چپ */}
      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16 lg:gap-24">
        {/* سمت راست: اسلوگان اصلی + متن معرفی هیرو */}
        <div className="text-center md:text-start">
          {/* اسلوگان — فقط در موبایل ۲۰٪ کوچک‌تر (۲۶ ← ۲۰.۸px) و داخل
              پنل شیشه‌ای گوشه‌گرد (blur کمتر از هدر، بدون بوردر) */}
          <h1
            className="animate-hero-in-right hero-slogan-glass text-balance text-[20.8px] font-black leading-[1.45] tracking-tight text-foreground max-md:p-4 md:text-5xl md:leading-[1.3] lg:text-6xl"
            style={{
              animationDelay: "0.14s",
              fontFamily,
            }}
          >
            <EditableText k="hero.slogan" renderText={splitSlogan}>
              {splitSlogan(settings.slogan)}
            </EditableText>
          </h1>

          <p
            className="animate-hero-in-right mx-auto mt-6 max-w-xl text-sm leading-8 text-muted-foreground md:mx-0 md:text-base md:leading-9"
            style={{ animationDelay: "0.26s" }}
          >
            <EditableText k="hero.description">
              {settings.heroDescription}
            </EditableText>
          </p>
        </div>

        {/* سمت چپ: ستون عمودی آیکون‌های سه‌گانه (در موبایل فقط «ثبت‌نام در دوره‌ها») */}
        <div
          className="animate-hero-in-left mx-auto flex w-full max-w-[340px] flex-col items-stretch gap-3.5 md:mx-0 md:max-w-none md:w-64"
          style={{ animationDelay: "0.38s" }}
        >
          <Button
            asChild
            className="h-12 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 px-6 text-base font-bold text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.03] hover:shadow-teal-400/40"
          >
            <a href="/register" target="_blank" rel="noopener">
              <Rocket className="size-5" />
              ثبت‌نام در دوره‌ها
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            className="hidden h-12 w-full rounded-2xl border-foreground/[0.12] bg-foreground/[0.04] px-6 text-base font-bold text-foreground backdrop-blur-sm transition-all hover:border-teal-500/40 hover:bg-foreground/[0.07] hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:bg-white/[0.07] dark:hover:text-teal-200 md:inline-flex"
          >
            <a href="/videos">
              <Play className="size-5 text-teal-600 dark:text-teal-300" />
              تماشای ویدئوها
            </a>
          </Button>
          {/* استعلام گواهی‌نامه — همان زبان بصری کارت «استعلام» (ShieldCheck + تم بنفش) */}
          <Button
            asChild
            variant="outline"
            className="hidden h-12 w-full rounded-2xl border-foreground/[0.12] bg-foreground/[0.04] px-6 text-base font-bold text-foreground backdrop-blur-sm transition-all hover:border-violet-500/40 hover:bg-foreground/[0.07] hover:text-violet-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-violet-400/40 dark:hover:bg-white/[0.07] dark:hover:text-violet-200 md:inline-flex"
          >
            <a href="/certificate">
              <ShieldCheck className="size-5 text-violet-600 dark:text-violet-300" />
              استعلام گواهی‌نامه
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
