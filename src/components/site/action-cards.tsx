"use client";

import * as React from "react";
import {
  UserPlus,
  MonitorPlay,
  ShieldCheck,
  ArrowLeft,
  Compass,
  Check,
  Timer,
  PlayCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading, Reveal } from "@/components/reveal";
import { EditableText, renderGradientText } from "@/components/site/editable-texts";

interface Action {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  cta: string;
  points: string[];
  accent: {
    tile: string;
    ring: string;
    text: string;
    hover: string;
    btn: string;
    glow: string;
  };
}

const actions: Action[] = [
  {
    href: "#register",
    icon: UserPlus,
    title: "ثبت‌نام در دوره‌ها",
    description:
      "در چند ثانیه دوره دلخواه خود را انتخاب کنید؛ مشاوران ما برای برنامه‌ریزی مسیر یادگیری با شما تماس می‌گیرند.",
    cta: "همین حالا ثبت‌نام کنید",
    points: ["کمتر از یک دقیقه زمان می‌برد", "مشاوره رایگان قبل از شروع"],
    accent: {
      tile: "from-teal-400 to-emerald-600",
      ring: "shadow-teal-500/30",
      text: "text-teal-600 dark:text-teal-300",
      hover: "hover:border-teal-500/40 hover:shadow-teal-500/[0.15] dark:hover:border-teal-400/40",
      btn: "hover:bg-teal-500 hover:text-white hover:shadow-teal-500/30 dark:hover:bg-teal-400 dark:hover:text-teal-950",
      glow: "bg-teal-500/25 dark:bg-teal-400/20",
    },
  },
  {
    href: "/videos",
    icon: MonitorPlay,
    title: "ویدئوهای آموزشی",
    description:
      "دسترسی رایگان به مجموعه‌ای از آموزش‌های کوتاه و کاربردی برای شروع مسیر یادگیری هر مهارت.",
    cta: "تماشای ویدئوها",
    points: ["پخش آنلاین بدون نیاز به نصب", "بدون هزینه و به‌روزرسانی مداوم"],
    accent: {
      tile: "from-amber-400 to-orange-500",
      ring: "shadow-amber-500/30",
      text: "text-amber-600 dark:text-amber-300",
      hover: "hover:border-amber-500/40 hover:shadow-amber-500/[0.15] dark:hover:border-amber-400/40",
      btn: "hover:bg-amber-500 hover:text-white hover:shadow-amber-500/30 dark:hover:bg-amber-400 dark:hover:text-amber-950",
      glow: "bg-amber-500/25 dark:bg-amber-400/20",
    },
  },
  {
    href: "/certificate",
    icon: ShieldCheck,
    title: "استعلام گواهی‌نامه",
    description:
      "اصالت گواهی‌نامه‌های پایان دوره را فقط با کد ملی دارنده‌ی آن بررسی کنید و فایل گواهی‌نامه را دانلود کنید.",
    cta: "استعلام گواهی‌نامه",
    points: ["بدون نیاز به ورود به حساب کاربری", "دانلود مستقیم فایل گواهی‌نامه"],
    accent: {
      tile: "from-violet-400 to-purple-600",
      ring: "shadow-violet-500/30",
      text: "text-violet-600 dark:text-violet-300",
      hover: "hover:border-violet-500/40 hover:shadow-violet-500/[0.15] dark:hover:border-violet-400/40",
      btn: "hover:bg-violet-500 hover:text-white hover:shadow-violet-500/30 dark:hover:bg-violet-400 dark:hover:text-violet-950",
      glow: "bg-violet-500/25 dark:bg-violet-400/20",
    },
  },
];

export function ActionCards() {
  return (
    <section className="relative py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4">
        <SectionHeading
          icon={Compass}
          badge="از کجا شروع کنید؟"
          title={
            <EditableText k="actions.title" renderText={renderGradientText}>
              <>
                سه مسیر برای <span className="text-gradient">شروع سریع</span> شما
              </>
            </EditableText>
          }
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {actions.map((action, i) => (
            <Reveal key={action.href} delay={i * 0.12} className="h-full">
              <a
                href={action.href}
                className={`group glass relative flex h-full flex-col items-start overflow-hidden rounded-3xl p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${action.accent.hover}`}
              >
                {/* corner glow */}
                <span
                  className={`pointer-events-none absolute -left-16 -top-16 size-44 rounded-full blur-[70px] transition-opacity duration-300 opacity-0 group-hover:opacity-100 ${action.accent.glow}`}
                />

                <span
                  className={`flex size-16 items-center justify-center rounded-[1.35rem] bg-gradient-to-br shadow-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${action.accent.tile} ${action.accent.ring}`}
                >
                  <action.icon className="size-8 text-white" strokeWidth={1.8} />
                </span>

                <h3 className="mt-6 text-xl font-black text-foreground">
                  {action.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {action.description}
                </p>

                {/* mini points */}
                <ul className="mt-4 flex flex-col gap-2">
                  {action.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-center gap-2 text-xs font-semibold text-foreground/80"
                    >
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] dark:bg-white/[0.05] ${action.accent.text}`}
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>

                <span
                  className={`mt-6 inline-flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.05] px-5 py-2.5 text-sm font-bold text-foreground transition-all dark:border-white/10 dark:bg-white/[0.05] ${action.accent.btn}`}
                >
                  {action.cta}
                  <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
                </span>

                <span className={`absolute bottom-0 right-0 h-1 w-0 transition-all duration-500 group-hover:w-full bg-gradient-to-l ${action.accent.tile}`} />
              </a>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-8 text-center">
          <p className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-muted-foreground">
            <Timer className="size-3.5 text-teal-600 dark:text-teal-300" />
            فرآیند ثبت‌نام آنلاین و بدون کاغذبازی است
            <span className="hidden h-3 w-px bg-foreground/10 dark:bg-white/10 sm:block" />
            <PlayCircle className="size-3.5 text-amber-600 dark:text-amber-300" />
            ویدئوها بدون نیاز به پیش‌نیاز قابل مشاهده هستند
            <span className="hidden h-3 w-px bg-foreground/10 dark:bg-white/10 sm:block" />
            <ShieldCheck className="size-3.5 text-violet-600 dark:text-violet-300" />
            اصالت گواهی‌نامه‌ها با کد ملی قابل استعلام است
          </p>
        </Reveal>
      </div>
    </section>
  );
}
