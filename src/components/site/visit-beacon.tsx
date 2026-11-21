"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * بیکن آمار بازدید — در layout ریشه‌ی سایت نصب می‌شود و هر «لود صفحه‌ی
 * عمومی» را یک بار به POST /api/stats/visit گزارش می‌کند.
 *
 *  • صفحات پنل مدیریت (superadmin) شمرده نمی‌شوند.
 *  • ارسال fire-and-forget با keepalive است تا حتی هنگام ترکِ سریع صفحه
 *    هم از بین نرود؛ خطا کاملا بی‌صدا نادیده گرفته می‌شود (آمار هرگز
 *    تجربه‌ی سایت را نمی‌شکند).
 *  • از sessionStorage برای جلوگیری از دوباره‌شماریِ «بازآمدن سریعِ همان
 *    صفحه» در همان لحظه (StrictMode دو اجرا) استفاده می‌کند.
 */
export function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // مسیرهای مدیریت جزو «بازدید سایت» نیستند
    if (pathname.startsWith("/superadmin")) return;

    // — دوباره‌شماریِ فوری را می‌بندیم (دو اجرای افکت در StrictMode یا
    // ری‌مانتِ همان لحظه) ولی بازدید واقعیِ بعدی (چند ثانیه بعد) شمرده
    // می‌شود: پنجره‌ی ۱۰ ثانیه‌ای per-path —
    const key = `avid_visit_${pathname}`;
    const now = Date.now();
    try {
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (Number.isFinite(last) && now - last < 10_000) return;
      sessionStorage.setItem(key, String(now));
    } catch {
      /* بی‌خطر */
    }

    const controller = new AbortController();
    fetch("/api/stats/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
      signal: controller.signal,
    }).catch(() => {
      /* آمار هرگز تجربه‌ی سایت را نمی‌شکند */
    });

    return () => controller.abort();
  }, [pathname]);

  return null;
}
