"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Provider سراسری حالت روشن/تیره — کلاس `dark` روی <html>
 * پیش‌فرض تیره است تا هویت «تِک» سایت حفظ شود و با سوییچ ماه/خورشید تغییر کند.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="avid-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
