"use client";

import * as React from "react";
import Image from "next/image";
import {
  GraduationCap,
  Instagram,
  Send,
  Linkedin,
  Youtube,
  Phone,
  Mail,
  MapPin,
  Heart,
  Clock,
  type LucideIcon,
} from "lucide-react";
import type { Course, NavLink, SiteSettings } from "@prisma/client";
import { faDigits } from "@/lib/fa";
import { anchorProps } from "@/lib/nav-links";
import { TrustSeal } from "@/components/site/trust-seal";
import { EditableText } from "@/components/site/editable-texts";

interface SocialLink {
  icon: LucideIcon;
  label: string;
  href: string;
  hover: string;
}

export function Footer({
  settings,
  courses,
  links,
  fontFamily,
}: {
  settings: SiteSettings;
  courses: Course[];
  /** لینک‌های ستون «دسترسی سریع» — از ماژول «ویرایش هدر و فوتر» مدیریت می‌شوند */
  links: NavLink[];
  /** مقدار font-family فونت فوتر (از فونت‌های نصب‌شده) */
  fontFamily: string;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);

  const socials: SocialLink[] = [
    {
      icon: Instagram,
      label: "اینستاگرام",
      href: settings.instagramUrl,
      hover: "hover:bg-pink-500/20 hover:text-pink-600 dark:hover:text-pink-300",
    },
    {
      icon: Send,
      label: "تلگرام",
      href: settings.telegramUrl,
      hover: "hover:bg-sky-400/20 hover:text-sky-600 dark:hover:text-sky-300",
    },
    {
      icon: Youtube,
      label: "یوتیوب",
      href: settings.youtubeUrl,
      hover: "hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300",
    },
    {
      icon: Linkedin,
      label: "لینکدین",
      href: settings.linkedinUrl,
      hover: "hover:bg-teal-500/20 hover:text-teal-600 dark:hover:text-teal-300",
    },
  ].filter((s) => s.href);

  return (
    <footer
      // mb موبایل: فاصله‌ی امن تا منوی موبایلی ثابتِ پایین صفحه (منوی پایین
      // فوتر را نمی‌پوشاند و فوترِ چسبان به پایینِ «بالای منو» می‌نشیند)
      className="mt-auto border-t border-foreground/[0.07] bg-foreground/[0.02] backdrop-blur-xl md:mb-0 dark:border-white/[0.07] dark:bg-[#030605]/70 max-md:mb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]"
      style={{ fontFamily }}
    >
      <div className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3">
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
                <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/20">
                  <GraduationCap className="size-6 text-teal-950" strokeWidth={2.2} />
                </span>
              )}
              <span className="leading-tight">
                <span className="block text-lg font-black text-foreground">
                  {settings.siteName}
                </span>
                <span className="block text-[0.65rem] text-muted-foreground">
                  {settings.tagline}
                </span>
              </span>
            </div>
            <p className="mt-5 text-xs leading-7 text-muted-foreground">
              <EditableText k="footer.description">
                {settings.footerDescription}
              </EditableText>
            </p>

            {/* نمادهای اعتماد — طبق درخواست، زیر متن معرفی؛ زرین‌پال سمت
                راست اینماد (در RTL، فرزند اول flex در سمت راست قرار می‌گیرد).
                کدهای رسمی عیناً رندر می‌شوند و تا بارگذاری تصویر/در خطا، نشان
                جایگزین دیده می‌شود تا جای لوگو هیچ‌وقت خالی نماند. */}
            {settings.zarinpalCode || settings.enamadCode ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {settings.zarinpalCode ? (
                  <TrustSeal
                    html={settings.zarinpalCode}
                    tone="amber"
                    fallbackLabel="زرین‌پال"
                    provider="زرین‌پال"
                  />
                ) : null}
                {settings.enamadCode ? (
                  <TrustSeal
                    html={settings.enamadCode}
                    tone="teal"
                    fallbackLabel="اینماد"
                    provider="اینماد"
                  />
                ) : null}
              </div>
            ) : null}

            {socials.length > 0 ? (
              <div className="mt-5 flex items-center gap-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={s.label}
                    className={`flex size-10 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03] text-muted-foreground transition-all hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[0.03] ${s.hover}`}
                  >
                    <s.icon className="size-4.5" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          {/* quick links */}
          <nav aria-label="دسترسی سریع">
            <h4 className="text-sm font-black text-foreground">دسترسی سریع</h4>
            <ul className="mt-5 space-y-3">
              {links.map((l) => (
                <li key={l.id}>
                  <a
                    {...anchorProps(l)}
                    className="text-xs text-muted-foreground transition-colors hover:text-teal-600 dark:hover:text-teal-300"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* popular courses */}
          {courses.length > 0 ? (
            <nav aria-label="دوره‌های محبوب">
              <h4 className="text-sm font-black text-foreground">دوره‌های محبوب</h4>
              <ul className="mt-5 space-y-3">
                {courses.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <a
                      href="#courses"
                      className="text-xs text-muted-foreground transition-colors hover:text-teal-600 dark:hover:text-teal-300"
                    >
                      {c.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {/* contact */}
          <div>
            <h4 className="text-sm font-black text-foreground">تماس با ما</h4>
            <ul className="mt-5 space-y-3 text-xs text-muted-foreground">
              {settings.contactPhone ? (
                <li className="flex items-center gap-2.5">
                  <Phone className="size-4 shrink-0 text-teal-600 dark:text-teal-300" />
                  <span dir="ltr">
                    <EditableText
                      k="footer.contactPhone"
                      renderText={(t) => faDigits(t)}
                    >
                      {faDigits(settings.contactPhone)}
                    </EditableText>
                  </span>
                </li>
              ) : null}
              {settings.contactEmail ? (
                <li className="flex items-center gap-2.5">
                  <Mail className="size-4 shrink-0 text-teal-600 dark:text-teal-300" />
                  <span dir="ltr">
                    <EditableText k="footer.contactEmail">
                      {settings.contactEmail}
                    </EditableText>
                  </span>
                </li>
              ) : null}
              {settings.address ? (
                <li className="flex items-start gap-2.5">
                  <MapPin className="size-4 shrink-0 translate-y-0.5 text-teal-600 dark:text-teal-300" />
                  <span className="leading-6">
                    <EditableText k="footer.address">
                      {settings.address}
                    </EditableText>
                  </span>
                </li>
              ) : null}
              {settings.supportHours ? (
                <li className="flex items-center gap-2.5">
                  <Clock className="size-4 shrink-0 text-teal-600 dark:text-teal-300" />
                  <span>
                    پشتیبانی:{" "}
                    <EditableText
                      k="footer.supportHours"
                      renderText={(t) => faDigits(t)}
                    >
                      {faDigits(settings.supportHours)}
                    </EditableText>
                  </span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-foreground/[0.06] dark:border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:text-right">
          <p className="text-[0.7rem] text-muted-foreground">
            © {faDigits(1404)} آکادمی {settings.siteName} — تمامی حقوق محفوظ است.
          </p>

          <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            ساخته‌شده با
            <Heart className="size-3.5 fill-red-400 text-red-400" />
            برای یادگیرندگان آینده
          </p>
        </div>
      </div>
    </footer>
  );
}
