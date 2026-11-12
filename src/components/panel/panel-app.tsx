"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Loader2, Phone, RotateCw, ShieldAlert, WifiOff } from "lucide-react";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { faDigits } from "@/lib/fa";
import { PanelLogin } from "@/components/panel/panel-login";
import { PanelDashboard } from "@/components/panel/panel-dashboard";
import type { PanelMe } from "@/components/panel/types";

/**
 * PanelApp — کنترل‌کننده‌ی نمای پنل کاربر.
 *
 * نمای اولیه: بررسی نشست با GET /api/panel/me
 *  · 401 → فرم ورود با پیامک (PanelLogin)
 *  · 403 → صفحه‌ی «حساب مسدود»
 *  · 200 → داشبورد (PanelDashboard)
 *  · خطای شبکه → صفحه‌ی تلاش مجدد
 *
 * پس از ورود موفق (PanelLogin → onLoggedIn) پیش از دریافت داده‌های
 * داشبورد، اسکلتِ داشبورد نمایش داده می‌شود.
 */

type View =
  | "loading" // بررسی نشست اولیه
  | "login" // فرم ورود با پیامک
  | "auth" // ورود موفق؛ در حال دریافت داده‌های داشبورد (اسکلت)
  | "dashboard" // داشبورد با داده
  | "blocked" // حساب مسدود
  | "error"; // خطای شبکه/سرور

export function PanelApp({ settings }: { settings: SiteSettings }) {
  const [view, setView] = React.useState<View>("loading");
  const [data, setData] = React.useState<PanelMe | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  /** دریافت/به‌روزرسانی داده‌ی پنل — مسیر کامل وضعیت‌ها */
  const load = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/panel/me", { cache: "no-store" });
      if (res.status === 401) {
        setData(null);
        setView("login");
        return;
      }
      if (res.status === 403) {
        setData(null);
        setView("blocked");
        return;
      }
      if (!res.ok) throw new Error("خطا در دریافت اطلاعات پنل.");
      const json = (await res.json()) as PanelMe;
      setData(json);
      setView("dashboard");
    } catch {
      setData(null);
      setView("error");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** ورود موفق از فرم لاگین → دریافت داده و رفتن به داشبورد */
  const handleLoggedIn = React.useCallback(() => {
    setView("auth");
    void load();
  }, [load]);

  /** به‌روزرسانی دستی داشبورد — داده‌ی قبلی حفظ می‌شود */
  const handleRefresh = React.useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/panel/me", { cache: "no-store" });
      if (res.status === 401) {
        setData(null);
        setView("login");
        return;
      }
      if (res.status === 403) {
        setData(null);
        setView("blocked");
        return;
      }
      if (!res.ok) throw new Error("خطا در دریافت اطلاعات پنل.");
      setData((await res.json()) as PanelMe);
      setView("dashboard");
    } catch {
      toast.error("به‌روزرسانی اطلاعات ناموفق بود؛ دوباره تلاش کنید.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  /** خروج — حذف نشست و بازگشت به فرم ورود */
  const handleLogout = React.useCallback(async (): Promise<void> => {
    try {
      await fetch("/api/user/session", { method: "DELETE" });
    } catch {
      // بی‌خطر: نشست سمت سرور در بهترین حالت منقضی می‌شود
    }
    setData(null);
    setView("login");
    toast.info("از حساب خود خارج شدید.");
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background">
      {/* پس‌زمینه‌ی تزئینی نرم — مطابق صفحه‌ی ثبت‌نام */}
      <div className="pointer-events-none absolute inset-0 -z-[1]">
        <div className="absolute -top-32 right-1/4 size-[26rem] rounded-full bg-teal-500/[0.08] blur-[130px] dark:bg-teal-400/[0.06]" />
        <div className="absolute -bottom-40 left-1/4 size-[26rem] rounded-full bg-violet-500/[0.07] blur-[130px] dark:bg-violet-400/[0.05]" />
      </div>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:py-12">
        {view === "loading" ? <LoadingScreen /> : null}

        {view === "login" ? (
          <div className="flex flex-1 items-center justify-center">
            <PanelLogin settings={settings} onLoggedIn={handleLoggedIn} />
          </div>
        ) : null}

        {view === "auth" ? (
          <PanelDashboard
            data={null}
            settings={settings}
            refreshing={false}
            onRefresh={handleRefresh}
            onLogout={handleLogout}
          />
        ) : null}

        {view === "dashboard" && data ? (
          <PanelDashboard
            data={data}
            settings={settings}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onLogout={handleLogout}
          />
        ) : null}

        {view === "blocked" ? (
          <BlockedScreen settings={settings} />
        ) : null}

        {view === "error" ? <ErrorScreen onRetry={load} /> : null}
      </main>
    </div>
  );
}

/* ————————————————— زیرنماهای مستقل ————————————————— */

/** بررسی نشست اولیه */
function LoadingScreen() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 py-24"
      role="status"
    >
      <Loader2 className="size-8 animate-spin text-teal-600 dark:text-teal-300" />
      <p className="select-none text-sm font-bold text-muted-foreground">
        در حال بررسی حساب کاربری شما...
      </p>
    </div>
  );
}

/** حساب مسدود — پیگیری از پشتیبانی */
function BlockedScreen({ settings }: { settings: SiteSettings }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div
        className="gradient-border relative w-full max-w-md rounded-[1.75rem] bg-card/85 p-7 text-center shadow-2xl shadow-black/10 backdrop-blur-xl md:p-9 dark:bg-[#08110e]/80 dark:shadow-black/30"
        role="alert"
      >
        <div className="pointer-events-none absolute -top-20 left-1/2 size-44 -translate-x-1/2 rounded-full bg-red-400/10 blur-[80px]" />

        <span className="relative mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-400 to-rose-600 shadow-lg shadow-red-500/25">
          <ShieldAlert className="size-8 text-white" strokeWidth={2.2} />
        </span>

        <h1 className="relative mt-5 text-xl font-black leading-8 text-foreground">
          حساب شما مسدود شده است
        </h1>
        <p className="relative mt-3 text-sm leading-7 text-muted-foreground">
          حساب شما توسط مدیر مسدود شده است. برای پیگیری با پشتیبانی تماس
          بگیرید.
        </p>

        <a
          href={`tel:${settings.contactPhone}`}
          className="relative mt-5 inline-flex select-none items-center gap-2 rounded-2xl border border-teal-500/30 bg-teal-500/[0.07] px-5 py-3 text-sm font-black text-teal-700 transition-colors hover:bg-teal-500/[0.12] dark:border-teal-400/25 dark:bg-teal-400/[0.08] dark:text-teal-300 dark:hover:bg-teal-400/[0.12]"
        >
          <Phone className="size-4" />
          <span dir="ltr" className="tabular-nums">
            {faDigits(settings.contactPhone)}
          </span>
        </a>

        <div className="relative mt-6">
          <Button
            asChild
            variant="outline"
            className="h-11 w-full rounded-xl border-foreground/[0.12] bg-foreground/[0.04] px-4 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
          >
            <Link href="/">
              <ArrowRight className="size-4" />
              بازگشت به صفحه اصلی
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** خطای شبکه/سرور — تلاش مجدد */
function ErrorScreen({ onRetry }: { onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = React.useState(false);

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    await onRetry();
    setRetrying(false);
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div
        className="gradient-border relative w-full max-w-md rounded-[1.75rem] bg-card/85 p-7 text-center shadow-2xl shadow-black/10 backdrop-blur-xl md:p-9 dark:bg-[#08110e]/80 dark:shadow-black/30"
        role="alert"
      >
        <div className="pointer-events-none absolute -top-20 left-1/2 size-44 -translate-x-1/2 rounded-full bg-amber-400/10 blur-[80px]" />

        <span className="relative mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
          <WifiOff className="size-8 text-amber-950" strokeWidth={2.2} />
        </span>

        <h1 className="relative mt-5 text-xl font-black leading-8 text-foreground">
          ارتباط با سرور برقرار نشد
        </h1>
        <p className="relative mt-3 text-sm leading-7 text-muted-foreground">
          در دریافت اطلاعات پنل خطایی رخ داد. اتصال اینترنت خود را بررسی کنید
          و دوباره تلاش کنید.
        </p>

        <Button
          onClick={() => void handleRetry()}
          disabled={retrying}
          className="relative mt-6 h-12 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 text-sm font-black text-teal-950 shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.01] hover:shadow-teal-400/40 disabled:opacity-60"
        >
          {retrying ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              در حال تلاش...
            </>
          ) : (
            <>
              <RotateCw className="size-5" />
              تلاش مجدد
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
