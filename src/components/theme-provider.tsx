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
 * ناقص/خراب به نظر برسد.
 *
 * پیاده‌سازی (نسخه‌ی React — بدون دستکاری DOM): متا مستقیماً با JSX
 * رندر می‌شود و React آن را به <head> می‌برد و مالکیتش با React
 * می‌ماند. نسخه‌ی قبلی متاهای متعلق به React را با el.remove() از
 * DOM جدا می‌کرد — گره‌های یتیم می‌ساخت و در ناوبریِ نرم (next/link)
 * بین صفحات به کرشِ removeChild در react-dom می‌انجامید.
 * پیش‌فرضِ SSR همان تیره است (defaultTheme="dark")؛ پس از mount،
 * resolvedTheme resolves می‌شود و React content را در‌جای خود به‌روز
 * می‌کند (بدون حذف/ایجاد دستی).
 */
function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();
  const color =
    (resolvedTheme && THEME_COLORS[resolvedTheme]) ?? THEME_COLORS.dark;
  // React 19 این متا را خودش به <head> می‌برد
  return <meta name="theme-color" content={color} />;
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
