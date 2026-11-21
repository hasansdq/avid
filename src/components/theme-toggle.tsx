"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * سوییچ ماه/خورشید برای تغییر حالت روشن/تیره کل سایت.
 *
 * ضدشکست (bulletproof): جهت تغییر از «واقعیت DOM» (کلاس <html>) خوانده
 * می‌شود — نه از state ری‌اکت؛ اگر به هر دلیل (نوسازی صفحه، ذخیره‌سازی
 * متفاوت، اجرای دوباره در iframe و…) state با کلاس ناهماهنگ شده باشد،
 * کلیک همیشه «حالتِ بصریِ فعلی» را معکوس می‌کند و کلاس بلافاصله و
 * هم‌زمان روی DOM اعمال می‌شود؛ سپس setTheme همان مقدار را ماندگار
 * می‌کند و state ری‌اکت هم همگام می‌شود.
 *
 * آیکون‌ها از طریق کلاس dark: از کلاس <html> پیروی می‌کنند — یعنی همیشه
 * با واقعیتِ بصری هم‌اندازه‌اند (بدون mismatch هیدریشن).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // همگام‌ساز کلاس <html> — even اگر next-themes state جای دیگری باشد
  const [domDark, setDomDark] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
    const el = document.documentElement;
    const sync = () => setDomDark(el.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    // — واقعیتِ فعلی از DOM خوانده می‌شود —
    const currentlyDark = document.documentElement.classList.contains("dark");
    const next = currentlyDark ? "light" : "dark";

    // اعمال فوری و هم‌زمان روی DOM — بازخورد بصری لحظه‌ای حتی اگر
    // افکت ری‌اکت با تاخیر برسد؛ MutationObserver آیکون‌ها را هم می‌سازد.
    const el = document.documentElement;
    el.classList.remove("light", "dark");
    el.classList.add(next);
    try {
      el.style.colorScheme = next;
    } catch {
      /* بی‌خطر */
    }

    // ماندگاری + هم‌گام‌سازی state (افکتِ next-themes همان کلاس را دوباره
    // اعمال می‌کند — بی‌اثر و بدون پرش)
    setTheme(next);
  };

  // آیکون از کلاس dark: می‌آید — قبل از mount همان خورشید (SSR) است.
  const isDark = mounted ? domDark : false;

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label="تغییر حالت روشن و تیره"
      title="تغییر حالت روشن و تیره"
      className={cn(
        // ۴۴px هدف لمسی — استاندارد موبایل؛ در هدر و تاپ‌بار پنل جای می‌گیرد
        "relative inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.04] text-foreground shadow-sm transition-all duration-300 hover:bg-foreground/[0.08] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95",
        className
      )}
    >
      {/* خورشید — نمایان در حالت روشن */}
      <Sun className="size-5 rotate-0 scale-100 text-amber-500 transition-all duration-500 dark:-rotate-90 dark:scale-0" />
      {/* ماه — نمایان در حالت تیره */}
      <Moon className="absolute size-5 rotate-90 scale-0 text-teal-300 transition-all duration-500 dark:rotate-0 dark:scale-100 dark:text-teal-200" />
      <span className="sr-only">حالت روشن یا تیره</span>
    </button>
  );
}
