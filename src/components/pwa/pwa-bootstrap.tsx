"use client";

import { useEffect } from "react";

/**
 * بوت‌استرپ وب‌اپلیکیشن (PWA) — نصب Service Worker در بارگذاری سایت.
 *
 *  • فقط در زمینه‌ی امن (HTTPS یا localhost) ثبت می‌شود؛ در سایر حالت‌ها
 *    بی‌صدا رد می‌شود تا هیچ خطایی در کنسول تولید نشود.
 *  • خطای ثبت (مثل محدودیت iframe پیش‌نمایش) کاملاً بی‌صدا نادیده
 *    گرفته می‌شود — تجربه‌ی سایت هرگز به SW وابسته نیست.
 *  • نشانی ثبت «نسخه‌دار» است (sw.js?v=3): اگر مرورگر کاربر هنوز
 *    نسخه‌ی قدیمیِ SW را کنترل کند، تغییر نشانی، به‌روزرسانی و فعال‌سازی
 *    نسخه‌ی تازه را قطعی می‌کند و کش‌های کهنه پاک می‌شوند.
 *  • همین‌جا «نشانه‌ی هیدراتاسیون» ست می‌شود؛ نگهبانِ خودترمیمی
 *    (اسکریپت درون‌خطی layout) اگر تا مهلت مشخص هیدراتاسیون را نبیند،
 *    SW/کش‌ها را پاک و صفحه را یک‌بار نوسازی می‌کند.
 */
const SW_REGISTER_URL = "/sw.js?v=3";

/** پارامتری که نگهبان خودترمیمی برای دور زدن کشِ سند به URL می‌افزاید */
const HEAL_PARAM = "_avidHeal";

export function PwaBootstrap() {
  useEffect(() => {
    // نشانه‌ی «ری‌اکت با موفقیت هیدراته شد» — قبل از هر چیز ست می‌شود
    try {
      (window as { __avidHydrated?: boolean }).__avidHydrated = true;
    } catch {
      /* نشانه اختیاری است */
    }

    // پاک‌سازی پارامتر خودترمیمی از URL پس از بارگذاری موفق
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(HEAL_PARAM)) {
        url.searchParams.delete(HEAL_PARAM);
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    } catch {
      /* اگر URL قابل تحلیل نبود مهم نیست */
    }

    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;

    const secure =
      location.protocol === "https:" ||
      ["localhost", "127.0.0.1"].includes(location.hostname);
    if (!secure) return;

    const register = () => {
      navigator.serviceWorker
        .register(SW_REGISTER_URL, { scope: "/" })
        .catch(() => {
          /* ثبت SW هرگز نباید خطای کاربر بسازد */
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
