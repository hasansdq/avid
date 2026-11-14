"use client";

import * as React from "react";
import Image from "next/image";
import {
  GraduationCap,
  ArrowRight,
  Sparkles,
  Phone,
  Mail,
} from "lucide-react";
import type { SiteSettings } from "@prisma/client";
import { EnrollForm, type PublicCourse } from "@/components/site/enroll-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { EditableText } from "@/components/site/editable-texts";
import { Button } from "@/components/ui/button";
import { faDigits } from "@/lib/fa";

/**
 * RegisterPage — برگه‌ی مستقل تمام‌صفحه‌ی «ثبت‌نام در دوره‌ها»
 *
 * فقط فرم پیش‌ثبت‌نام را در مرکز صفحه نمایش می‌دهد؛
 * همراه با هدر مینیمال (لوگو + تم + بازگشت به سایت).
 */
export function RegisterPage({
  courses,
  settings,
}: {
  courses: PublicCourse[];
  settings: SiteSettings;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background">
      {/* پس‌زمینه‌ی تزئینی نرم */}
      <div className="pointer-events-none absolute inset-0 -z-[1]">
        <div className="absolute -top-32 right-1/4 size-[26rem] rounded-full bg-teal-500/[0.08] blur-[130px] dark:bg-teal-400/[0.06]" />
        <div className="absolute -bottom-40 left-1/4 size-[26rem] rounded-full bg-violet-500/[0.07] blur-[130px] dark:bg-violet-400/[0.05]" />
      </div>

      {/* هدر مینیمال */}
      <header className="px-4 pt-5">
        <nav className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] px-4 backdrop-blur-md md:px-6 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <a href="/" className="flex items-center gap-3" aria-label="بازگشت به صفحه اصلی">
            {settings.logoUrl && !logoFailed ? (
              <Image
                src={settings.logoUrl}
                alt={settings.siteName}
                width={44}
                height={44}
                onError={() => setLogoFailed(true)}
                className="size-11 rounded-2xl border border-foreground/10 bg-background object-cover shadow-lg"
              />
            ) : (
              <span className="relative flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25">
                <GraduationCap className="size-6 text-teal-950" strokeWidth={2.2} />
                <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-violet-400 shadow shadow-violet-500/40">
                  <Sparkles className="size-2 text-violet-950" />
                </span>
              </span>
            )}
            <span className="leading-tight">
              <span className="block text-lg font-black tracking-tight text-foreground">
                {settings.siteName}
              </span>
              <span className="block text-[0.65rem] font-medium text-muted-foreground">
                {settings.tagline}
              </span>
            </span>
          </a>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              asChild
              variant="outline"
              className="hidden h-10 rounded-xl border-foreground/[0.12] bg-foreground/[0.04] px-4 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 sm:inline-flex dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
            >
              <a href="/">
                <ArrowRight className="size-4" />
                بازگشت به سایت
              </a>
            </Button>
          </div>
        </nav>
      </header>

      {/* فرم تمام‌صفحه */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 md:py-14">
        <div className="w-full max-w-xl">
          <div className="mb-8 text-center">
            <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
              <GraduationCap className="size-3.5" />
              <EditableText k="registerPage.badge">
                پیش‌ثبت‌نام در دوره‌ها
              </EditableText>
            </span>
            <h1 className="mt-4 text-3xl font-black leading-[1.3] tracking-tight text-foreground md:text-4xl">
              <EditableText k="registerPage.title">
                <>
                  ثبت‌نام کنید و به آوید <span className="text-gradient">بپیوندید</span>
                </>
              </EditableText>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">
              <EditableText k="registerPage.description">
                فرم زیر را پر کنید؛ پس از تایید شماره موبایل، دوره‌ی مورد نظر خود را
                انتخاب می‌کنید — انتخاب دوره برای تکمیل ثبت‌نام الزامی است. اگر فعلاً
                دوره‌ای نمی‌خواهید، از دکمه‌ی «ورود / ثبت‌نام» در هدر سایت حساب بسازید.
              </EditableText>
            </p>
          </div>

          <EnrollForm courses={courses} preselectFromUrl />

          {/* اطلاعات تماس زیر فرم */}
          <div className="mt-8 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground sm:flex-row sm:gap-6">
            <a
              href={`tel:${settings.contactPhone}`}
              className="flex items-center gap-1.5 transition-colors hover:text-teal-600 dark:hover:text-teal-300"
            >
              <Phone className="size-3.5" />
              {faDigits(settings.contactPhone)}
            </a>
            <span className="hidden h-3 w-px bg-foreground/10 sm:block dark:bg-white/10" />
            <a
              href={`mailto:${settings.contactEmail}`}
              className="flex items-center gap-1.5 transition-colors hover:text-teal-600 dark:hover:text-teal-300"
            >
              <Mail className="size-3.5" />
              {settings.contactEmail}
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
