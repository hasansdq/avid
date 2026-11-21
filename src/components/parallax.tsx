"use client";

import * as React from "react";
import {
  Brain,
  Cpu,
  GitBranch,
  Binary,
  Database,
  Cloud,
  Network,
  Code,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Parallax engine: a single rAF loop drives every registered layer   */
/* ------------------------------------------------------------------ */

const ParallaxContext = React.createContext<
  ((el: HTMLElement, depth: number) => () => void) | null
>(null);

export function ParallaxProvider({ children }: { children: React.ReactNode }) {
  const items = React.useRef(new Map<HTMLElement, number>());

  const register = React.useCallback((el: HTMLElement, depth: number) => {
    items.current.set(el, depth);
    return () => {
      items.current.delete(el);
    };
  }, []);

  React.useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    // روی دستگاه‌های لمسی/موبایل حلقه‌ی rAF اصلاً اجرا نمی‌شود —
    // نوشتن transform در هر فریم روی موبایل عامل لگ هنگام اسکرول است.
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (reduceMotion || !finePointer) return;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;
    let running = false;

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX / window.innerWidth - 0.5;
      target.y = e.clientY / window.innerHeight - 0.5;
      wake();
    };

    const loop = () => {
      // smooth interpolation
      current.x += (target.x - current.x) * 0.055;
      current.y += (target.y - current.y) * 0.055;
      items.current.forEach((depth, el) => {
        const dx = (-current.x * depth).toFixed(2);
        const dy = (-current.y * depth).toFixed(2);
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      });
      // وقتی حرکت کاملاً فروکش کرد، حلقه متوقف می‌شود (با حرکت بعدی موس دوباره روشن می‌شود)
      if (
        Math.abs(target.x - current.x) < 0.0005 &&
        Math.abs(target.y - current.y) < 0.0005
      ) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    const wake = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    wake();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <ParallaxContext.Provider value={register}>
      {children}
    </ParallaxContext.Provider>
  );
}

/** Wraps children in a layer that drifts with the mouse. */
export function ParallaxLayer({
  depth = 20,
  className,
  style,
  children,
}: {
  depth?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const register = React.useContext(ParallaxContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!register || !ref.current) return;
    return register(ref.current, depth);
  }, [register, depth]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Decorative fixed background                                        */
/* ------------------------------------------------------------------ */

/** deterministic pseudo random (SSR-safe, no hydration mismatch) */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const floatingChips = [
  { Icon: Brain, left: "7%", top: "17%", color: "text-teal-600/70 dark:text-teal-300/70", dur: 6.5, cls: "animate-float-rotate" },
  { Icon: Cpu, left: "88%", top: "13%", color: "text-violet-600/70 dark:text-violet-300/70", dur: 7.5, cls: "animate-float" },
  { Icon: Database, left: "4%", top: "46%", color: "text-emerald-600/70 dark:text-emerald-300/70", dur: 5.5, cls: "animate-float-soft" },
  { Icon: Cloud, left: "91%", top: "42%", color: "text-sky-600/60 dark:text-sky-200/60", dur: 8, cls: "animate-float-rotate" },
  { Icon: GitBranch, left: "13%", top: "72%", color: "text-fuchsia-600/60 dark:text-fuchsia-300/60", dur: 6, cls: "animate-float" },
  { Icon: Binary, left: "84%", top: "70%", color: "text-amber-600/60 dark:text-amber-200/60", dur: 7, cls: "animate-float-soft" },
  { Icon: Network, left: "32%", top: "12.5%", color: "text-teal-600/50 dark:text-teal-200/50", dur: 9, cls: "animate-float" },
  { Icon: Code, left: "66%", top: "88%", color: "text-violet-600/50 dark:text-violet-200/50", dur: 8.5, cls: "animate-float-rotate" },
];

function Particles() {
  const dots = React.useMemo(() => {
    const rand = mulberry32(42);
    return Array.from({ length: 26 }, (_, i) => ({
      id: i,
      left: `${(rand() * 100).toFixed(2)}%`,
      top: `${(rand() * 100).toFixed(2)}%`,
      size: 2 + Math.round(rand() * 2),
      delay: `${(rand() * 5).toFixed(2)}s`,
      duration: `${(3.5 + rand() * 4).toFixed(2)}s`,
      opacity: 0.25 + rand() * 0.4,
    }));
  }, []);

  return (
    <>
      {dots.map((d) => (
        <span
          key={d.id}
          className="animate-pulse-glow absolute rounded-full bg-teal-600 dark:bg-teal-200"
          style={{
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            opacity: d.opacity,
            animationDelay: d.delay,
            animationDuration: d.duration,
          }}
        />
      ))}
    </>
  );
}

function CursorGlow() {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = { x: window.innerWidth / 2, y: window.innerHeight * 0.35 };
    const current = { ...target };
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
    };
    const loop = () => {
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      el.style.transform = `translate3d(${(current.x - 260).toFixed(1)}px, ${(
        current.y - 260
      ).toFixed(1)}px, 0)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-0 size-[520px] rounded-full"
      style={{
        background:
          "radial-gradient(circle, rgba(45,212,191,0.09) 0%, rgba(167,139,250,0.05) 38%, transparent 70%)",
      }}
    />
  );
}

export function ParallaxBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* base vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(20,184,166,0.12),transparent_60%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(20,184,166,0.13),transparent_60%)]" />

      {/* tech grid */}
      <ParallaxLayer depth={14} className="absolute inset-[-70px]">
        <div className="bg-grid-tech absolute inset-0" />
      </ParallaxLayer>

      {/*
       * موبایل (< md): پس‌زمینه‌ی کاملاً ثابت و سبک —
       * درخشش‌های گرادیانی بدون blur و بدون هیچ انیمیشنی؛
       * رنگ درخشش‌ها برای «هر دو تم» جداگانه تنظیم شده است
       * (تم روشن: سایه‌ی ملایمِ سبز/بنفشِ تیره؛ تم تیره: نورِ
       * teal/violet ملایم) تا پس‌زمینه‌ی موبایل همیشه هم‌خانواده‌ی
       * تم فعال باشد؛
       * لایه‌های انیمیشنی (orbها، ذرات، چیپ‌ها و نویز) فقط دسکتاپ رندر می‌شوند.
       */}
      <div className="absolute inset-0 md:hidden">
        <div className="absolute -top-24 right-[8%] size-[300px] rounded-full bg-[radial-gradient(circle,rgba(13,148,136,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(45,212,191,0.13),transparent_70%)]" />
        <div className="absolute bottom-[18%] -left-20 size-[280px] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.06),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(167,139,250,0.10),transparent_70%)]" />
      </div>

      {/* glowing orbs — فقط دسکتاپ */}
      <ParallaxLayer depth={30} className="absolute inset-0 hidden md:block">
        <div className="animate-drift absolute -top-40 right-[6%] size-[440px] rounded-full bg-teal-400/25 blur-[130px] dark:bg-teal-500/[0.16]" />
      </ParallaxLayer>
      <ParallaxLayer depth={46} className="absolute inset-0 hidden md:block">
        <div
          className="animate-drift absolute top-[52%] -left-44 size-[480px] rounded-full bg-violet-400/20 blur-[140px] dark:bg-violet-500/[0.14]"
          style={{ animationDelay: "-6s" }}
        />
        <div
          className="animate-drift absolute -bottom-44 right-[28%] size-[320px] rounded-full bg-emerald-400/20 blur-[120px] dark:bg-emerald-500/[0.12]"
          style={{ animationDelay: "-12s" }}
        />
      </ParallaxLayer>

      {/* particles — فقط دسکتاپ */}
      <ParallaxLayer depth={62} className="absolute inset-0 hidden md:block">
        <Particles />
      </ParallaxLayer>

      {/* floating tech icon chips — فقط دسکتاپ */}
      <ParallaxLayer depth={88} className="absolute inset-0 hidden md:block">
        {floatingChips.map(({ Icon, left, top, color, dur, cls }, i) => (
          <div
            key={i}
            className={`absolute hidden md:block ${cls}`}
            style={{
              left,
              top,
              animationDuration: `${dur}s`,
              animationDelay: `${-(i * 1.3).toFixed(1)}s`,
            }}
          >
            <div className="flex size-11 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03] shadow-lg shadow-black/10 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-black/20 lg:size-12">
              <Icon className={`size-5 lg:size-6 ${color}`} strokeWidth={1.6} />
            </div>
          </div>
        ))}
      </ParallaxLayer>

      {/* cursor glow — فقط دسکتاپ با موس */}
      <div className="hidden md:block">
        <CursorGlow />
      </div>

      {/* film grain — فقط دسکتاپ (feTurbulence روی موبایل سنگین است) */}
      <div className="noise-overlay absolute inset-0 hidden opacity-[0.04] mix-blend-overlay md:block" />
    </div>
  );
}
