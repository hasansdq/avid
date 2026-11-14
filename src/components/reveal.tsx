"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reveal — پیاده‌سازی سبک و سریع (بدون framer-motion):
 *
 * • محتوا در HTML اولیه (SSR) کاملاً نمایان رندر می‌شود تا اولین نقاشی صفحه
 *   بدون انتظار برای بارگذاری و هیدریشن جاوااسکریپت انجام شود؛
 *   نتیجه: لود ادراک‌شده‌ی سایت به‌شدت سریع‌تر می‌شود.
 * • پس از mount فقط عناصری که هنوز وارد دید کاربر نشده‌اند مخفی می‌شوند
 *   و با اسکرول، با ترنزیشن CSS نرم ظاهر می‌گردند.
 * • با «کاهش حرکت» (prefers-reduced-motion) کاملاً غیرفعال می‌شود.
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  duration = 0.65,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setInView(true);
      setMounted(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -48px 0px", threshold: 0.05 }
    );
    io.observe(el);
    setMounted(true);

    return () => io.disconnect();
  }, []);

  // قبل از mount (SSR و اولین رندر) محتوا نمایان است؛
  // بعد از mount فقط عناصر خارج از دید مخفی می‌شوند.
  const hidden = mounted && !inView;

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] ease-out",
        hidden && "will-change-[opacity,transform]",
        className
      )}
      style={{
        transitionDuration: `${duration}s`,
        transitionDelay: inView && delay > 0 ? `${delay}s` : undefined,
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translate3d(0, ${y}px, 0)` : "translate3d(0, 0, 0)",
      }}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  badge,
  title,
  description,
  icon: Icon,
  className,
}: {
  badge: string;
  title: React.ReactNode;
  /** متن توضیح زیر تیتر — می‌تواند جایگاه متن قابل‌ویرایش (ویرایشگر مدادی) باشد */
  description?: React.ReactNode;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <Reveal className={cn("mx-auto mb-12 max-w-2xl text-center md:mb-16", className)}>
      <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
        <Icon className="size-3.5" />
        {badge}
      </span>
      <h2 className="mt-5 text-3xl font-black leading-[1.25] text-foreground md:text-[2.6rem] md:leading-[1.2]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-sm leading-8 text-muted-foreground md:text-base md:leading-8">
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
