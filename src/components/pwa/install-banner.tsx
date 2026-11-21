"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * بنر «نصب وب‌اپلیکیشن آوید» —
 *
 *  • اندروید/ویندوز/دسکتاپ (Chrome/Edge/…): رویداد beforeinstallprompt
 *    گرفته می‌شود و بنر با دکمه‌ی «نصب» نشان داده می‌شود؛ کلیک = پرسش
 *    رسمی نصب مرورگر.
 *  • iOS/Safari (بدون beforeinstallprompt): راهنمای «افزودن به صفحه
 *    اصلی» از منوی اشتراک‌گذاری نمایش داده می‌شود.
 *  • اگر اپ از قبل نصب شده باشد (display-mode: standalone) بنر هرگز
 *    نشان داده نمی‌شود؛ ردکردن کاربر (X) هم به‌صورت دائمی در
 *    localStorage ثبت می‌شود.
 *  • در پنل مدیریت (superadmin) نمایش داده نمی‌شود.
 */

const DISMISS_KEY = "avid_pwa_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** آیا وب‌اپ از قبل نصب/اجرا شده است؟ */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    nav.standalone === true
  );
}

/** تشخیص iOS (شامل iPadOS با pointer لمسی) */
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  const ipadTouch =
    /Macintosh/.test(ua) && typeof document !== "undefined" &&
    "ontouchend" in document;
  return ios || ipadTouch;
}

export function InstallBanner() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback((permanent: boolean) => {
    setVisible(false);
    if (permanent) {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* بی‌خطر */
      }
    }
    setDeferred(null);
  }, []);

  useEffect(() => {
    // پنل مدیریت و حالت نصب‌شده یا ردِ دائمی → هیچ بنری نیست
    if (pathname?.startsWith("/superadmin")) return;
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* بی‌خطر */
    }

    // — اندروید/ویندوز/دسکتاپ: پرسش نصب مرورگر —
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      setDeferred(evt);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    // — نصب موفق/رد پرسش مرورگر —
    const onAppInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onAppInstalled);

    // — iOS: راهنمای «افزودن به صفحه اصلی» (پس از تعامل کوتاه) —
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIos() && !("beforeinstallprompt" in window)) {
      iosTimer = setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        onBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", onAppInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, [pathname]);

  /** نصب — پرسش رسمی مرورگر */
  const install = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false); // appinstalled هم می‌آید
      }
    } catch {
      /* بی‌خطر */
    } finally {
      setDeferred(null);
    }
  }, [deferred]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="نصب وب‌اپلیکیشن آوید"
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(76px+env(safe-area-inset-bottom))] md:bottom-6 md:pb-6"
    >
      {/* پس‌زمینه‌ی رنگی غیرشفاف + افکت بلور — در هر دو حالت روشن/تیره */}
      <div
        className="gradient-border w-full max-w-md rounded-2xl border border-teal-700/10 bg-[rgba(245,250,248,0.94)] p-4 shadow-2xl shadow-black/25 backdrop-blur-xl dark:border-white/10 dark:bg-[rgba(6,15,13,0.94)]"
      >
        <div className="flex items-start gap-3">
          {/* آیکون اپ */}
          <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-foreground/10 bg-gradient-to-br from-teal-400 to-emerald-600">
            <img
              src="/images/icons/icon-192.png"
              alt="آوید"
              className="size-11 rounded-lg object-cover"
            />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-foreground">
              نصب وب‌اپلیکیشن آوید
            </p>
            {showIosHint ? (
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs leading-5 text-muted-foreground">
                <Share className="inline size-3.5" />
                از منوی اشتراک‌گذاری سافاری
                <SquarePlus className="inline size-3.5" />
                «افزودن به صفحه اصلی» را بزنید.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                روی اندروید، iOS و ویندوز مثل اپ نصب می‌شود — سریع‌تر و بدون
                مرورگر باز می‌شود.
              </p>
            )}
          </div>

          <button
            type="button"
            aria-label="بستن پیشنهاد نصب"
            onClick={() => dismiss(true)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {!showIosHint ? (
          <Button
            type="button"
            onClick={() => void install()}
            className="mt-3 h-10 w-full rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01] hover:shadow-teal-400/35"
          >
            <Download className="size-4" />
            نصب وب‌اپلیکیشن
          </Button>
        ) : null}
      </div>
    </div>
  );
}
