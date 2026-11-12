"use client";

import * as React from "react";
import {
  Play,
  Rocket,
  BadgeCheck,
  Bot,
  Code,
} from "lucide-react";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ParallaxLayer } from "@/components/parallax";

function FloatingChip({
  depth,
  className,
  animClass,
  duration,
  delay,
  children,
}: {
  depth: number;
  className?: string;
  animClass: string;
  duration: number;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <ParallaxLayer
      depth={depth}
      className={`pointer-events-none absolute hidden lg:block ${className ?? ""}`}
    >
      <div
        className={animClass}
        style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
      >
        {children}
      </div>
    </ParallaxLayer>
  );
}

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

  return (
    <section
      id="home"
      className="relative flex items-center justify-center overflow-visible px-4 pb-8 pt-36 md:pb-10"
    >
      {/* floating parallax chips (desktop) */}
      <FloatingChip depth={42} className="right-[7%] top-[30%]" animClass="animate-float-rotate" duration={7} delay={-2}>
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl shadow-black/10 dark:shadow-black/30">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600">
            <Bot className="size-5 text-teal-950" />
          </span>
          <span className="text-xs font-bold text-foreground/90">
            هوش مصنوعی
            <span className="block text-[0.6rem] font-medium text-muted-foreground">
              محبوب‌ترین دوره
            </span>
          </span>
        </div>
      </FloatingChip>

      <FloatingChip depth={62} className="left-[6%] top-[38%]" animClass="animate-float" duration={6} delay={-1}>
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl shadow-black/10 dark:shadow-black/30">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-purple-600">
            <Code className="size-5 text-violet-950" />
          </span>
          <span className="text-xs font-bold text-foreground/90">
            طراحی وب
            <span className="block text-[0.6rem] font-medium text-muted-foreground">
              پروژه‌محور و عملی
            </span>
          </span>
        </div>
      </FloatingChip>

      <FloatingChip depth={52} className="bottom-[30%] left-[10%]" animClass="animate-float" duration={8} delay={-4}>
        <div className="glass flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-xl shadow-black/10 dark:shadow-black/30">
          <BadgeCheck className="size-5 text-violet-600 dark:text-violet-300" />
          <span className="text-xs font-bold text-foreground/90">
            مربیان متخصص و حرفه‌ای
          </span>
        </div>
      </FloatingChip>

      {/* main content — ورود پلکانی فقط با CSS؛ بدون انتظار برای بارگذاری JS */}
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <h1
          className="animate-hero-in text-balance text-4xl font-black leading-[1.35] tracking-tight text-foreground md:text-6xl md:leading-[1.3]"
          style={{
            animationDelay: "0.12s",
            fontFamily,
          }}
        >
          {sloganHead}
          {sloganTail ? (
            <span className="text-shine mt-2 block pb-2">{sloganTail}</span>
          ) : null}
        </h1>

        <p
          className="animate-hero-in mx-auto mt-6 max-w-2xl text-sm leading-8 text-muted-foreground md:text-base md:leading-9"
          style={{ animationDelay: "0.24s" }}
        >
          {settings.heroDescription}
        </p>

        <div
          className="animate-hero-in mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
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
        </div>
      </div>
    </section>
  );
}
