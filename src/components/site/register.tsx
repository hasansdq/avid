"use client";

import {
  ClipboardList,
  Check,
  Headphones,
  ShieldCheck,
} from "lucide-react";
import type { SiteSettings } from "@prisma/client";
import { SectionHeading, Reveal } from "@/components/reveal";
import { EditableText } from "@/components/site/editable-texts";
import { EnrollForm, type PublicCourse } from "@/components/site/enroll-form";

const benefits = [
  "دسترسی به پنل کاربری و کلیه جلسات به صورت ضبط‌شده",
  "پشتیبانی مستقیم مربی در طول دوره",
  "برنامه یادگیری شخصی‌سازی‌شده بر اساس هدف شما",
  "پروژه‌های واقعی برای رزومه حرفه‌ای",
];

export function Register({
  courses,
  settings,
}: {
  courses: PublicCourse[];
  settings: SiteSettings;
}) {
  return (
    <section id="register" className="relative scroll-mt-28 py-12 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-[1] mx-auto h-80 max-w-4xl rounded-full bg-teal-500/[0.07] blur-[130px]" />

      <div className="mx-auto max-w-7xl px-4">
        <SectionHeading
          icon={ClipboardList}
          badge="ثبت‌نام در دوره‌ها"
          title={
            <EditableText k="register.title">
              <>
                جای خود را در دوره‌ها{" "}
                <span className="text-gradient">رزرو کنید</span>
              </>
            </EditableText>
          }
          description={
            <EditableText k="register.description">
              فرم زیر را پر کنید؛ ثبت‌نام نهایی پس از تماس کارشناسان آموزشی و
              پرداخت شهریه انجام می‌شود.
            </EditableText>
          }
        />

        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* info side */}
          <Reveal>
            <div className="space-y-6">
              <h3 className="text-2xl font-black leading-10 text-foreground md:text-3xl">
                <EditableText k="register.whyTitle">
                  <>
                    چرا آکادمی{" "}
                    <span className="text-gradient">{settings.siteName}</span>؟
                  </>
                </EditableText>
              </h3>
              <ul className="space-y-4">
                {benefits.map((b, i) => (
                  <li key={b} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    <EditableText
                      k={`register.benefit-${i + 1}`}
                      className="text-sm leading-7 text-foreground/85"
                    >
                      {b}
                    </EditableText>
                  </li>
                ))}
              </ul>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="glass rounded-2xl p-4">
                  <Headphones className="size-6 text-violet-600 dark:text-violet-300" />
                  <p className="mt-3 text-sm font-bold text-foreground">پشتیبانی ۷ روز هفته</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    پاسخ‌گویی به سوالات آموزشی در سریع‌ترین زمان
                  </p>
                </div>
                <div className="glass rounded-2xl p-4">
                  <ShieldCheck className="size-6 text-teal-600 dark:text-teal-300" />
                  <p className="mt-3 text-sm font-bold text-foreground">ضمانت بازگشت وجه</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    تا سه جلسه اول بدون قید و شرط
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* form side */}
          <Reveal delay={0.15}>
            <EnrollForm courses={courses} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
