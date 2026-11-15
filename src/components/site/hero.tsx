"use client";

import {
  Play,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/site/editable-texts";

export function Hero({
  settings,
  fontFamily,
}: {
  settings: SiteSettings;
  /** مقدار font-family فونت اسلوگان (از فونت‌های نصب‌شده) */
  fontFamily: string;
}) {
  const commaIndex = settings.slogan.indexOf("،");
  const sloganHead =
    commaIndex >= 0 ? settings.slogan.slice(0, commaIndex + 1) : settings.slogan;
  const sloganTail =
    commaIndex >= 0 ? settings.slogan.slice(commaIndex + 1).trim() : "";

  // شکستن اسلوگان به دو خط (تیتر + بخش درخشان) — برای متن سفارشی مداد هم اعمال می‌شود
  const splitSlogan = (text: string) => {
    const i = text.indexOf("،");
    const head = i >= 0 ? text.slice(0, i + 1) : text;
    const tail = i >= 0 ? text.slice(i + 1).trim() : "";
    return (
      <>
        {head}
        {tail ? (
          <span className="text-shine mt-2 block pb-2">{tail}</span>
        ) : null}
      </>
    );
  };

  return (
    <section
      id="home"
      className="relative flex items-center justify-center overflow-visible px-4 pb-8 pt-36 md:pb-10"
    >
      {/* main content — ورود پلکانی فقط با CSS؛ بدون انتظار برای بارگذاری JS */}
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <h1
          className="animate-hero-in text-balance text-4xl font-black leading-[1.35] tracking-tight text-foreground md:text-6xl md:leading-[1.3]"
          style={{
            animationDelay: "0.12s",
            fontFamily,
          }}
        >
          <EditableText k="hero.slogan" renderText={splitSlogan}>
            {sloganHead}
            {sloganTail ? (
              <span className="text-shine mt-2 block pb-2">{sloganTail}</span>
            ) : null}
          </EditableText>
        </h1>

        <p
          className="animate-hero-in mx-auto mt-6 max-w-2xl text-sm leading-8 text-muted-foreground md:text-base md:leading-9"
          style={{ animationDelay: "0.24s" }}
        >
          <EditableText k="hero.description">
            {settings.heroDescription}
          </EditableText>
        </p>

        <div
          className="animate-hero-in mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap"
          style={{ animationDelay: "0.36s" }}
        >
          <Button
            asChild
            className="h-12 rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 px-8 text-base font-bold text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.04] hover:shadow-teal-400/40"
          >
            <a href="/register" target="_blank" rel="noopener">
              <Rocket className="size-5" />
              ثبت‌نام در دوره‌ها
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-12 rounded-2xl border-foreground/[0.12] bg-foreground/[0.04] px-8 text-base font-bold text-foreground backdrop-blur-sm transition-all hover:border-teal-500/40 hover:bg-foreground/[0.07] hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:bg-white/[0.07] dark:hover:text-teal-200"
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
            className="h-12 rounded-2xl border-foreground/[0.12] bg-foreground/[0.04] px-8 text-base font-bold text-foreground backdrop-blur-sm transition-all hover:border-violet-500/40 hover:bg-foreground/[0.07] hover:text-violet-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-violet-400/40 dark:hover:bg-white/[0.07] dark:hover:text-violet-200"
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
