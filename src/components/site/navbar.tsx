"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { GraduationCap, Menu, Rocket, Sparkles, UserRound } from "lucide-react";
import type { NavLink, SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { anchorProps } from "@/lib/nav-links";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

function Logo({ settings }: { settings: SiteSettings }) {
  const [logoFailed, setLogoFailed] = React.useState(false);

  return (
    <a href="#home" className="flex items-center gap-3">
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
  );
}

export function Navbar({
  settings,
  links,
  fontFamily,
}: {
  settings: SiteSettings;
  /** لینک‌ها و دکمه‌های هدر — از ماژول «ویرایش هدر و فوتر» مدیریت می‌شوند */
  links: NavLink[];
  /** مقدار font-family فونت هدر (از فونت‌های نصب‌شده) */
  fontFamily: string;
}) {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // لینک‌های منو و دکمه‌ی برجسته (CTA) از داده‌ی هدر جدا می‌شوند
  const menuLinks = links.filter((l) => !l.isButton);
  const ctaLinks = links.filter((l) => l.isButton);
  const cta = ctaLinks[0];

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4" style={{ fontFamily }}>
      <nav
        className={cn(
          "mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 rounded-2xl border px-4 transition-all duration-300 md:px-6",
          scrolled
            ? "border-border bg-background/85 shadow-xl shadow-black/10 backdrop-blur-xl dark:border-white/10 dark:bg-[#050b09]/80 dark:shadow-black/30"
            : "border-foreground/[0.06] bg-foreground/[0.02] backdrop-blur-md dark:border-white/[0.06] dark:bg-white/[0.02]"
        )}
      >
        <Logo settings={settings} />

        <ul className="hidden items-center gap-1 lg:flex">
          {menuLinks.map((link) => (
            <li key={link.id}>
              <a
                {...anchorProps(link)}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-teal-600 dark:hover:text-teal-300"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          {/* دکمه‌ی حساب کاربری — همیشه در هدر (دسکتاپ و موبایل) و خارج از منوی همبرگری */}
          {/* موبایل: فقط آیکون؛ دسکتاپ: آیکون + برچسب — هدایت به پنل کاربر /panel */}
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-xl border-teal-500/30 bg-teal-500/[0.08] text-teal-700 shadow-sm transition-all hover:bg-teal-500/[0.15] hover:text-teal-800 hover:shadow-md active:scale-95 dark:border-teal-400/30 dark:bg-teal-400/[0.1] dark:text-teal-300 dark:hover:bg-teal-400/[0.16] dark:hover:text-teal-200"
          >
            <Link
              href="/panel"
              aria-label="حساب کاربری — ورود به پنل"
              title="ورود به پنل حساب کاربری"
            >
              <UserRound className="size-5" />
              <span className="hidden text-sm font-bold sm:inline">
                حساب کاربری
              </span>
            </Link>
          </Button>

          {/* سوییچ حالت روشن/تیره — ماه و خورشید */}
          <ThemeToggle />

          {cta ? (
            <Button
              asChild
              className="hidden h-10 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-sm font-bold text-teal-950 shadow-lg shadow-teal-500/25 transition-transform hover:scale-[1.03] hover:shadow-teal-400/30 sm:inline-flex"
            >
              <a {...anchorProps(cta)}>
                <Rocket className="size-4" />
                {cta.label}
              </a>
            </Button>
          ) : null}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="باز کردن منو"
                className="size-10 rounded-xl border-foreground/10 bg-foreground/[0.03] dark:border-white/10 dark:bg-white/[0.03] lg:hidden"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 border-border bg-background/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#060c0a]/95"
            >
              <SheetHeader className="border-b border-foreground/[0.07] pb-4 text-right dark:border-white/5">
                <SheetTitle className="flex justify-start">
                  <Logo settings={settings} />
                </SheetTitle>
                <SheetDescription className="sr-only">
                  منوی دسترسی سریع به بخش‌های سایت {settings.siteName}
                </SheetDescription>
              </SheetHeader>
              <nav className="mt-4 flex flex-col gap-1 px-4">
                {menuLinks.map((link) => (
                  <a
                    key={link.id}
                    {...anchorProps(link)}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-4 py-3 text-sm font-semibold text-foreground/90 transition-colors hover:bg-foreground/[0.05] hover:text-teal-600 dark:hover:text-teal-300"
                  >
                    {link.label}
                  </a>
                ))}

                {/* سوییچ روشن/تیره در منوی موبایل */}
                <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-foreground/[0.07] bg-foreground/[0.03] px-4 py-3 dark:border-white/[0.07] dark:bg-white/[0.03]">
                  <span className="text-sm font-semibold text-muted-foreground">
                    حالت نمایش
                  </span>
                  <ThemeToggle />
                </div>

                {cta ? (
                  <a
                    {...anchorProps(cta)}
                    onClick={() => setOpen(false)}
                    className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-4 py-3 text-sm font-bold text-teal-950 shadow-lg shadow-teal-500/20"
                  >
                    <Rocket className="size-4" />
                    {cta.label}
                  </a>
                ) : null}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
