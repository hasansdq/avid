"use client";

import * as React from "react";
import { Users, CircleCheck, BarChart3, type LucideIcon } from "lucide-react";
import type { SiteSettings } from "@prisma/client";
import { faDigits } from "@/lib/fa";
import { Reveal } from "@/components/reveal";

function CountUp({
  end,
  duration = 1800,
}: {
  end: number;
  duration?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const started = React.useRef(false);
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const tick = (t: number) => {
            const p = Math.min((t - t0) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(Math.round(eased * end));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{faDigits(display)}</span>;
}

interface Stat {
  icon: LucideIcon;
  value: number;
  label: string;
  description: string;
  tile: string;
  bar: string;
  shadow: string;
  width: string;
}

export function Counters({ settings }: { settings: SiteSettings }) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [barsOn, setBarsOn] = React.useState(false);

  React.useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setBarsOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setBarsOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const studentsWidth = Math.min(
    92,
    Math.max(15, Math.round(settings.studentsCount / 3))
  );
  const coursesWidth = Math.min(
    85,
    Math.max(12, settings.completedCoursesCount * 7)
  );

  const stats: Stat[] = [
    {
      icon: Users,
      value: settings.studentsCount,
      label: "کارآموزان",
      description: "در حال یادگیری در دوره‌های مختلف آکادمی",
      tile: "from-teal-400 to-emerald-600",
      bar: "from-teal-400 to-emerald-500",
      shadow: "shadow-teal-500/25",
      width: `${studentsWidth}%`,
    },
    {
      icon: CircleCheck,
      value: settings.completedCoursesCount,
      label: "دوره‌های پایان‌یافته",
      description: "دوره‌ی برگزارشده با موفقیت تا امروز",
      tile: "from-violet-400 to-purple-600",
      bar: "from-violet-400 to-fuchsia-500",
      shadow: "shadow-violet-500/25",
      width: `${coursesWidth}%`,
    },
  ];

  return (
    <section className="relative py-12 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-[1] mx-auto h-56 max-w-4xl rounded-full bg-violet-500/[0.07] blur-[110px]" />

      <div className="mx-auto max-w-5xl px-4">
        <Reveal className="mb-10 text-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
            <BarChart3 className="size-3.5" />
            رشد آکادمی در یک نگاه
          </span>
        </Reveal>

        <div ref={gridRef} className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.15}>
              <div className="gradient-border group relative overflow-hidden rounded-[1.75rem] bg-foreground/[0.02] p-8 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-teal-500/10 dark:bg-white/[0.03]">
                {/* decorative icon watermark */}
                <stat.icon className="pointer-events-none absolute -bottom-8 -left-8 size-36 text-foreground/[0.04] transition-transform duration-500 group-hover:scale-110 dark:text-white/[0.03]" />

                <div className="flex items-center gap-5">
                  <span
                    className={`flex size-16 shrink-0 items-center justify-center rounded-[1.35rem] bg-gradient-to-br shadow-xl sm:size-[4.5rem] ${stat.tile} ${stat.shadow}`}
                  >
                    <stat.icon className="size-8 text-white sm:size-9" strokeWidth={1.8} />
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-gradient text-5xl font-black tabular-nums tracking-tight sm:text-6xl">
                        <CountUp end={stat.value} />
                      </span>
                    </div>
                    <p className="mt-1 text-base font-black text-foreground sm:text-lg">
                      {stat.label}
                    </p>
                  </div>
                </div>

                <p className="mt-5 text-sm leading-7 text-muted-foreground">
                  {stat.description}
                </p>

                <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06] dark:bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full bg-gradient-to-l ${stat.bar} transition-[width] duration-[1400ms] ease-out`}
                    style={{
                      width: barsOn ? stat.width : "0%",
                      transitionDelay: "0.3s",
                    }}
                  />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
