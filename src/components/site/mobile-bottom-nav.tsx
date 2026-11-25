"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Film,
  FileQuestion,
  House,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MobileBottomNav — منوی موبایلی زیبا و جذاب در پایین صفحه (فقط موبایل).
 *
 * ترتیب آیتم‌ها: خانه ← حساب کاربری ← نمونه سوال ← ویدئوها.
 *  • خانه → صفحه‌ی اول (/) — کلیک در همان صفحه به بالای صفحه اسکرول می‌کند
 *  • حساب کاربری → /panel (پروفایل و همه‌ی بخش‌های پنل)
 *  • نمونه سوال → صفحه‌ی اختصاصی /samples (برای دسته‌ی خاص: /samples?cat=…)
 *  • ویدئوها → صفحه‌ی ویدئوها (/videos)
 *
 * نوار شیشه‌ای با پس‌زمینه‌ی مات (frosted) و نشانگر آیتمِ فعال؛
 * ارتفاع نوار در فضای امن پایین (iOS notch) رعایت می‌شود.
 */

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** مقصد لینک */
  href: string;
  /** آیتم فعال؟ */
  active: boolean;
  /** کلیک روی خانه در صفحه‌ی اول → اسکرول نرم به بالای صفحه */
  scrollTopOnHome?: boolean;
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  // صفحات‌ی که منوی پایین در آن‌ها نمایش داده نمی‌شود:
  // کلاس آنلاین (/stream/…) — تجربه‌ی «اتاق جلسه»ی متمرکز؛ منوی سایت
  // هم روی نمایش افقی تمام‌صفحه‌ی معلم (LandscapeOverlay) می‌افتاد و هم
  // کنترل‌های پایین کلاس را می‌پوشاند. (برگرداندن null بعد از همه‌ی هوک‌ها)
  const isStreamRoom = pathname.startsWith("/stream");

  // آیتمِ فعال در هر بار مسیریابی دوباره محاسبه می‌شود
  const items: NavItem[] = React.useMemo(() => {
    const onPanel = pathname === "/panel" || pathname.startsWith("/panel");
    return [
      {
        key: "home",
        label: "خانه",
        icon: House,
        href: "/",
        active: isHome,
        scrollTopOnHome: true,
      },
      {
        key: "account",
        label: "حساب کاربری",
        icon: User,
        href: "/panel",
        active: onPanel,
      },
      {
        key: "samples",
        label: "نمونه سوال",
        icon: FileQuestion,
        href: "/samples",
        active: pathname.startsWith("/samples"),
      },
      {
        key: "videos",
        label: "ویدئوها",
        icon: Film,
        href: "/videos",
        active: pathname.startsWith("/videos"),
      },
    ];
  }, [pathname, isHome]);

  if (isStreamRoom) return null;

  /** در صفحه‌ی اول: کلیک روی «خانه» به‌جای جابه‌جایی، به بالای صفحه اسکرول می‌کند */
  function handleClick(
    e: React.MouseEvent<HTMLAnchorElement>,
    item: NavItem
  ) {
    if (isHome && item.scrollTopOnHome) {
      e.preventDefault();
      window.scrollTo({ behavior: "smooth", top: 0 });
    }
    // در غیر این صورت، لینک معمولی (Link) مسیر را عوض می‌کند
  }

  return (
    <nav
      aria-label="منوی موبایل"
      className="fixed inset-x-0 bottom-0 z-[46] md:hidden"
    >
      <div className="mx-auto max-w-md px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-1">
        <div className="flex items-stretch justify-around gap-1 rounded-2xl border border-foreground/[0.08] bg-background/90 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#050b09]/90 dark:shadow-black/40">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.active;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={(e) => handleClick(e, item)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-all active:scale-95",
                  active
                    ? "bg-gradient-to-b from-teal-500/15 to-emerald-500/10 text-teal-700 dark:from-teal-400/15 dark:to-emerald-400/10 dark:text-teal-300"
                    : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground dark:hover:bg-white/[0.05]"
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full transition-all",
                    active &&
                      "bg-gradient-to-l from-teal-400 to-emerald-500 shadow-md shadow-teal-500/30"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[1.15rem]",
                      active ? "text-teal-950" : ""
                    )}
                    strokeWidth={active ? 2.6 : 2.2}
                  />
                </span>
                <span
                  className={cn(
                    "w-full truncate text-center text-[0.6rem] leading-4",
                    active ? "font-black" : "font-semibold"
                  )}
                >
                  {item.label}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 w-5 rounded-full transition-all",
                    active
                      ? "bg-gradient-to-l from-teal-400 to-emerald-500 opacity-100"
                      : "opacity-0"
                  )}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
