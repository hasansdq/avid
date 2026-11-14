"use client";

import { useState } from "react";
import {
  CalendarClock,
  Download,
  ExternalLink,
  LogOut,
  Menu,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MODULES } from "@/components/admin/modules/registry";
import type { ModuleKey } from "@/components/admin/types";
import { LogoMark } from "@/components/admin/shared/logo-mark";
import {
  DueSoonContent,
  useInstallmentsOverview,
} from "@/components/admin/shared/installments-overview";
import { ThemeToggle } from "@/components/theme-toggle";

/** آیتم ناوبری ماژول‌ها — مشترک بین سایدبار دسکتاپ و Sheet موبایل */
function ModuleNavItem({
  moduleKey,
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  moduleKey: ModuleKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onSelect: (key: ModuleKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(moduleKey)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/15 text-accent-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
      )}
    >
      {active ? (
        <span className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-primary" />
      ) : null}
      <Icon
        className={cn(
          "size-4.5 transition-colors",
          active ? "text-teal-600 dark:text-teal-300" : "group-hover:text-teal-600 dark:group-hover:text-teal-300"
        )}
      />
      {label}
    </button>
  );
}

/** ناوبری کامل + برند — محتوای مشترک سایدبار و Sheet */
function SidebarContent({
  activeKey,
  onSelect,
  onLogout,
  logoutPending,
}: {
  activeKey: ModuleKey;
  onSelect: (key: ModuleKey) => void;
  onLogout: () => void;
  logoutPending: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-2">
      {/* برند */}
      <div className="flex items-center gap-3 border-b border-border px-2 pb-4 pt-2">
        <LogoMark className="size-10" iconClassName="size-5" />
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-black text-foreground">آوید</p>
          <p className="text-[0.65rem] text-muted-foreground">پنل مدیریت</p>
        </div>
      </div>

      {/* ماژول‌ها */}
      <nav className="flex-1 space-y-1 overflow-y-auto py-2 pe-1" aria-label="ماژول‌های مدیریت">
        {MODULES.map((m) => (
          <ModuleNavItem
            key={m.key}
            moduleKey={m.key}
            label={m.label}
            icon={m.icon}
            active={activeKey === m.key}
            onSelect={onSelect}
          />
        ))}
      </nav>

      {/* دانلود پروژه + خروج */}
      <div className="space-y-1 border-t border-border pt-2">
        {/* آخرین نسخه‌ی پروژه — همیشه در پوشه‌ی Download به‌روز می‌شود */}
        <a
          href="/Download/avid-latest.zip"
          download
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-muted-foreground transition-all hover:bg-primary/10 hover:text-accent-foreground"
          title="آخرین نسخه‌ی کامل پروژه (ZIP)"
        >
          <Download className="size-4.5 text-teal-600 dark:text-teal-300" />
          دانلود پروژه (ZIP)
        </a>
        <button
          type="button"
          onClick={onLogout}
          disabled={logoutPending}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <LogOut className="size-4.5" />
          خروج از حساب
        </button>
      </div>
    </div>
  );
}

/** پوسته‌ی اصلی پنل: سایدبار راست (RTL) + تاپ‌بار + محتوای ماژول فعال */
export function AdminShell({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => Promise<void> | void;
}) {
  const [activeKey, setActiveKey] = useState<ModuleKey>("dashboard");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  const active = MODULES.find((m) => m.key === activeKey) ?? MODULES[0];
  const ActiveModule = active.component;

  const handleSelect = (key: ModuleKey) => {
    setActiveKey(key);
    setSheetOpen(false);
  };

  const handleLogout = async () => {
    setLogoutPending(true);
    try {
      await onLogout();
    } finally {
      setLogoutPending(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* سایدبار دسکتاپ — سمت راست در RTL */}
      <aside className="hidden w-64 shrink-0 border-l border-border bg-sidebar lg:block">
        <div className="h-full max-h-screen p-4">
          <SidebarContent
            activeKey={activeKey}
            onSelect={handleSelect}
            onLogout={handleLogout}
            logoutPending={logoutPending}
          />
        </div>
      </aside>

      {/* سایدبار موبایل — Sheet از سمت راست فیزیکی */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-72 bg-sidebar p-4 sm:max-w-72"
        >
          <SheetHeader className="p-0">
            <SheetTitle className="sr-only">منوی پنل مدیریت</SheetTitle>
            <SheetDescription className="sr-only">
              انتخاب ماژول مدیریت
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 pt-8">
            <SidebarContent
              activeKey={activeKey}
              onSelect={handleSelect}
              onLogout={handleLogout}
              logoutPending={logoutPending}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ستون اصلی */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* تاپ‌بار — پس‌زمینه‌ی تمام‌opaque با رنگ پیش‌فرض سایت (بدون شفافیت glass) */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSheetOpen(true)}
            aria-label="باز کردن منوی ماژول‌ها"
          >
            <Menu className="size-5" />
          </Button>

          <div className="min-w-0">
            <h2 className="truncate text-base font-black text-foreground sm:text-lg">
              {active.label}
            </h2>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {active.description}
            </p>
          </div>

          {/* ————— رسید قسط‌های امروز — اعلان اقساط سررسیدنزدیک ————— */}
          <InstallmentsBell />

          <div className="ms-auto flex items-center gap-2 sm:gap-3">
            {/* سوییچ حالت روشن/تیره */}
            <ThemeToggle />

            <Button
              asChild
              variant="outline"
              size="sm"
              className="glass rounded-xl text-xs font-bold"
            >
              <a href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                <span className="hidden sm:inline">مشاهده سایت</span>
                <span className="sm:hidden">سایت</span>
              </a>
            </Button>

            <div className="flex items-center gap-2 rounded-full border border-border bg-foreground/[0.03] py-1 pe-3 ps-1 dark:bg-white/[0.03]">
              <span
                className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 text-xs font-black text-teal-950"
                aria-hidden
              >
                {username.charAt(0).toUpperCase()}
              </span>
              <span className="hidden text-xs font-bold text-foreground md:inline">
                {username}
              </span>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="خروج از حساب کاربری"
                  title="خروج از حساب"
                >
                  <LogOut className="size-4.5 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl" className="max-w-sm rounded-2xl">
                <AlertDialogHeader className="text-right">
                  <AlertDialogTitle className="text-base">
                    خروج از پنل
                  </AlertDialogTitle>
                  <AlertDialogDescription className="leading-6">
                    آیا از حساب خود خارج می‌شوید؟ برای بازگشت باید دوباره وارد شوید.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2 sm:justify-start">
                  <AlertDialogAction
                    dir="rtl"
                    onClick={handleLogout}
                    disabled={logoutPending}
                  >
                    خروج
                  </AlertDialogAction>
                  <AlertDialogCancel dir="rtl">انصراف</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </header>

        {/* محتوای ماژول فعال */}
        <main className="relative mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 pb-16 sm:p-6 lg:p-8">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-[1] h-64 bg-teal-500/[0.05] blur-[110px]"
            aria-hidden
          />
          <ActiveModule setActive={setActiveKey} />
        </main>
      </div>
    </div>
  );
}

/* ————— زنگ اعلان اقساط سررسیدنزدیک — پاپ‌آور «رسید قسط‌های امروز» ————— */

function InstallmentsBell() {
  const { data, loading, refreshing, reload } = useInstallmentsOverview();
  const [open, setOpen] = useState(false);

  // شمارنده‌ی badge: همه‌ی اقساص نیازمند اقدام — معوق‌های گذشته + امروز تا پس‌فردا
  // (dueSoon در API همین مجموعه است)
  const badgeCount = loading ? null : data?.dueSoon.length ?? 0;

  // حساسیت رنگ: اگر قسط معوقی (سررسید گذشته) وجود دارد قرمز، وگرنه کهربایی
  const urgent = (data?.dueSoon ?? []).some((i) => i.relative === "overdue");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="رسید قسط‌های امروز"
          title="رسید قسط‌های امروز — اقساط امروز، فردا و پس‌فردا"
          className={cn(
            "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-black shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
            urgent
              ? "border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-400/35 dark:bg-red-400/10 dark:text-red-300"
              : "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
          )}
        >
          <CalendarClock className="size-4.5 shrink-0" />
          <span className="hidden whitespace-nowrap sm:inline">
            رسید قسط‌های امروز
          </span>
          {badgeCount ? (
            <span
              className={cn(
                "absolute -top-2 -start-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.6rem] font-black tabular-nums text-white shadow-md",
                urgent ? "bg-red-500 dark:bg-red-400 dark:text-red-950" : "bg-amber-500"
              )}
            >
              {new Intl.NumberFormat("fa-IR").format(badgeCount)}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        dir="rtl"
        className="w-[min(28rem,calc(100vw-2rem))] rounded-2xl p-4"
      >
        <p className="mb-3 flex items-center gap-2 text-sm font-black text-foreground">
          <CalendarClock className="size-4 text-amber-500 dark:text-amber-300" />
          رسید قسط‌های امروز
        </p>
        <DueSoonContent
          data={data}
          refreshing={refreshing}
          onRefresh={() => reload(true)}
          onChanged={() => reload(true)}
        />
      </PopoverContent>
    </Popover>
  );
}
