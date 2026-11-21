"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

/**
 * Provider سراسری حالت روشن/تیره — کلاس `dark` روی <html>
 * پیش‌فرض تیره است تا هویت «تِک» سایت حفظ شود و با سوییچ ماه/خورشید تغییر کند.
 * (ترجیح‌های ذخیره‌شده‌ی نسخه‌ی قبل با تغییر کلید، بازنشانی می‌شوند.)
 */

/**
 * کلید ذخیره‌سازی تم — نسخه‌ی دوم.
 *
 * چرا عوض شد؟ مقدار پیش‌فرض سایت «تیره» است، اما مرورگرهایی که قبلاً
 * با سوییچ ماه/خورشید حالت «روشن» را انتخاب کرده بودند، همان ترجیح
 * ذخیره‌شده را نگه می‌داشتند و سایت برایشان همیشه روشن باز می‌شد.
 * با تغییر کلید، ترجیح‌های قدیمی نادیده گرفته می‌شوند و سایت برای همه
 * پیش‌فرضِ تیره باز می‌شود؛ انتخاب جدیدِ کاربر (بعد از تاگل) زیر همین
 * کلید جدید ذخیره و ماندگار می‌ماند.
 */
const THEME_STORAGE_KEY = "avid-theme-v2";

/** کلیدهای قدیمی که دیگر خوانده نمی‌شوند — پاک‌سازی می‌شوند */
const LEGACY_THEME_KEYS = ["avid-theme"];

/**
 * پاک‌ساز کلیدهای قدیمی — داده‌ی مرده را از localStorage حذف می‌کند تا
 * فضای ذخیره‌سازی تمیز بماند (خواندن/نوشتن فقط با کلید جدید است).
 */
function LegacyThemeKeyCleanup() {
  React.useEffect(() => {
    try {
      LEGACY_THEME_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* حالت خصوصی مرورگر — بی‌خطر */
    }
  }, []);

  return null;
}

/**
 * رنگ‌های زمینه‌ی مرورگر موبایل (نوار آدرس و رابط سیستم) برای هر تم
 */
const THEME_COLORS: Record<string, string> = {
  light: "#f5faf8", // --background در تم روشن
  dark: "#04080a", // --background در تم تیره
};

/**
 * ThemeColorMeta — متای `theme-color` را «پویا» با تم سایت همگام می‌کند.
 *
 * چرا؟ متای استاتیک فقط به prefers-color-scheme سیستم گوش می‌دهد و
 * وقتی کاربر از داخل سایت تم را عوض می‌کند، نوار رنگی مرورگر موبایل
 * همان حالت قبلی می‌ماند — همین باعث می‌شود «حالت تیره در موبایل»
 * ناقص/خراب به نظر برسد. این مؤلفه متاهای ایستا را حذف و یک متای
 * پویا می‌نویسد که دقیقاً با resolvedTheme هم‌گام است.
 */
function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    const color =
      (resolvedTheme && THEME_COLORS[resolvedTheme]) ?? THEME_COLORS.dark;

    let tag = document.head.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][data-avid-dynamic]'
    );
    if (!tag) {
      // متاهای ایستا (مبنای prefers-color-scheme) دیگر لازم نیستند —
      // تم سایت منبعِ درست رنگ نوار مرورگر است.
      document.head
        .querySelectorAll(
          'meta[name="theme-color"]:not([data-avid-dynamic])'
        )
        .forEach((el) => el.remove());
      tag = document.createElement("meta");
      tag.name = "theme-color";
      tag.setAttribute("data-avid-dynamic", "1");
      document.head.appendChild(tag);
    }
    tag.content = color;
  }, [resolvedTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      {children}
      <ThemeColorMeta />
      <LegacyThemeKeyCleanup />
    </NextThemesProvider>
  );
}
