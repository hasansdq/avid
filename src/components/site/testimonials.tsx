"use client";

import * as React from "react";
import { Quote, Star, MessagesSquare, Sparkles } from "lucide-react";
import type { Testimonial } from "@prisma/client";
import { getCourseTheme } from "@/lib/course-theme";
import { faDigits } from "@/lib/fa";
import { SectionHeading, Reveal } from "@/components/reveal";

export function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <section
      id="testimonials"
      className="relative scroll-mt-28 py-12 md:py-16"
    >
      <div className="pointer-events-none absolute inset-x-0 top-1/3 -z-[1] mx-auto h-72 max-w-4xl rounded-full bg-fuchsia-500/[0.05] blur-[120px]" />

      <div className="mx-auto max-w-7xl px-4">
        <SectionHeading
          icon={MessagesSquare}
          badge="نظرات کاربران"
          title={
            <>
              کارآموزان ما چه{" "}
              <span className="text-gradient">می‌گویند؟</span>
            </>
          }
          description="تجربه واقعی افرادی که مسیر یادگیری خود را با ما شروع کردند و امروز به هدفشان رسیده‌اند."
        />

        {testimonials.length === 0 ? (
          <Reveal>
            <div className="glass mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl px-6 py-16 text-center">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-400 to-pink-600 shadow-lg shadow-fuchsia-500/25">
                <Sparkles className="size-8 text-white" />
              </span>
              <p className="text-sm font-black text-foreground">
                به‌زودی نظرات کارآموزان جدید اضافه می‌شود.
              </p>
            </div>
          </Reveal>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t, i) => {
              const caption = [t.role, t.course].filter(Boolean).join(" · ");
              return (
                <Reveal key={t.id} delay={(i % 3) * 0.1} className="h-full">
                  <figure className="group glass relative flex h-full flex-col rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-foreground/20 hover:shadow-2xl hover:shadow-violet-500/10 dark:hover:border-white/20">
                    <Quote className="absolute left-6 top-6 size-8 text-foreground/[0.07] transition-colors group-hover:text-teal-500/25 dark:text-white/[0.07] dark:group-hover:text-teal-400/20" />

                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star
                          key={s}
                          className={
                            s < t.rating
                              ? "size-4 fill-amber-400 text-amber-400"
                              : "size-4 text-foreground/15 dark:text-white/15"
                          }
                        />
                      ))}
                    </div>

                    <blockquote className="mt-4 flex-1 text-sm leading-8 text-foreground/90">
                      {t.text}
                    </blockquote>

                    <figcaption className="mt-6 flex items-center gap-3 border-t border-foreground/[0.07] pt-5 dark:border-white/[0.07]">
                      <span
                        className={`flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg font-black text-white shadow-lg ${getCourseTheme(t.theme).tile}`}
                      >
                        {t.name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-foreground">
                          {t.name}
                        </p>
                        {caption ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {caption}
                          </p>
                        ) : null}
                      </div>
                    </figcaption>
                  </figure>
                </Reveal>
              );
            })}
          </div>
        )}

        <Reveal delay={0.2} className="mt-10 text-center">
          <p className="text-xs font-semibold text-muted-foreground">
            میانگین رضایت {faDigits("4.9")} از {faDigits(5)} بر اساس نظرات
            کارآموزان
          </p>
        </Reveal>
      </div>
    </section>
  );
}
