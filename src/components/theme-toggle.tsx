"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * سوییچ ماه/خورشید برای تغییر حالت روشن و تیره کل سایت.
 * آیکون‌ها با کلاس `dark:` جابه‌جا می‌شوند (وابسته به کلاس html، بدون mismatch هیدریشن)
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // جلوگیری از mismatch هیدریشن: مقدار resolvedTheme فقط بعد از mount معتبر است
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  const toggle = () =>
    setTheme(resolvedTheme === "dark" ? "light" : "dark");

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label="تغییر حالت روشن و تیره"
      title="تغییر حالت روشن و تیره"
      className={cn(
        "relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.04] text-foreground shadow-sm transition-all duration-300 hover:bg-foreground/[0.08] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95",
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
