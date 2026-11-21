"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
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
import {
  MODULES,
  NAV_CATEGORIES,
  type AdminModule,
  type NavCategory,
} from "@/components/admin/modules/registry";
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

/* ————— دسته‌بندی آکاردئونی ناوبری ————— */

/** ماژول‌ها به کلید — رندر سریع آیتم‌های دسته‌ها */
const MODULES_BY_KEY = new Map<string, AdminModule>(
  MODULES.map((m) => [m.key, m])
);

/** کلیدهای ماژول‌هایی که داخل دسته‌ها قرار گرفته‌اند */
const CATEGORIZED_KEYS = new Set<string>(
  NAV_CATEGORIES.flatMap((c) => c.items)
);

/** آیتم‌های مستقلِ بالای دسته‌ها (نمای کلی پنل) */
const TOP_STANDALONE: ModuleKey[] = ["dashboard", "stats"];

/** سرصفحه‌ی دسته — کلیک: باز/بسته کردن کشویی زیرمجموعه‌ها */
function CategoryHeader({
  category,
  open,
  containsActive,
  onToggle,
}: {
  category: NavCategory;
  open: boolean;
  containsActive: boolean;
  onToggle: () => void;
}) {
  const Icon = category.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`nav-cat-${category.key}`}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-black transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
        open ? "text-foreground" : "text-foreground/90 hover:bg-foreground/[0.04]"
      )}
    >
      <Icon
        className={cn(
          "size-4.5 shrink-0 transition-colors",
          open
            ? "text-teal-600 dark:text-teal-300"
            : "text-muted-foreground group-hover:text-teal-600 dark:group-hover:text-teal-300"
        )}
      />
      <span className="flex-1 text-start">{category.label}</span>
      {/* نقطه — نشان می‌دهد ماژول فعال داخل این دسته است (وقتی جمع است) */}
      {containsActive && !open ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-primary"
          aria-hidden
        />
      ) : null}
      <ChevronDown
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
          open && "rotate-180"
        )}
      />
    </button>
  );
}

/** یک دسته‌ی آکاردئونی: سرصفحه + زیرمجموعه‌ها با انیمیشن کشویی */
function NavCategoryBlock({
  category,
  open,
  activeKey,
  onSelect,
  onToggle,
}: {
  category: NavCategory;
  open: boolean;
  activeKey: ModuleKey;
  onSelect: (key: ModuleKey) => void;
  onToggle: (key: string) => void;
}) {
  const containsActive = category.items.includes(activeKey);
  return (
    <div className="space-y-0.5">
      <CategoryHeader
        category={category}
        open={open}
        containsActive={containsActive}
        onToggle={() => onToggle(category.key)}
      />
      {/*
        انیمیشن کشویی: 0fr → 1fr روی grid-template-rows (مرورگرهای مدرن)
        + محو شدن؛ visibility در انتهای بسته‌شدن خاموش می‌شود تا زیرمجموعه‌های
        جمع‌شده از دسترس کیبورد/صفحه‌خوان خارج بمانند.
      */}
      <div
        id={`nav-cat-${category.key}`}
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out",
          open
            ? "visible grid-rows-[1fr] opacity-100"
            : "invisible grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div
            className="ms-2.5 space-y-0.5 border-s border-border/70 py-1 ps-2.5"
          >
            {category.items.map((key) => {
              const m = MODULES_BY_KEY.get(key);
              if (!m) return null;
              return (
                <ModuleNavItem
                  key={key}
                  moduleKey={m.key}
                  label={m.label}
                  icon={m.icon}
                  active={activeKey === key}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** ناوبری کامل + برند — محتوای مشترک سایدبار و Sheet */
function SidebarContent({
  activeKey,
  onSelect,
  onLogout,
  logoutPending,
  openCategory,
  onToggleCategory,
}: {
  activeKey: ModuleKey;
  onSelect: (key: ModuleKey) => void;
  onLogout: () => void;
  logoutPending: boolean;
  openCategory: string | null;
  onToggleCategory: (key: string) => void;
}) {
  // آیتم‌های مستقلِ پس از دسته‌ها — هر ماژولی که در دسته‌ای نرفته (مانند چت، فونت‌ها، گالری…)
  const bottomStandalone = MODULES.filter(
    (m) => !CATEGORIZED_KEYS.has(m.key) && !TOP_STANDALONE.includes(m.key)
  );

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
      <nav
        className="flex-1 space-y-1 overflow-y-auto py-2 pe-1"
        aria-label="ماژول‌های مدیریت"
      >
        {/* آیتم‌های مستقل بالای دسته‌ها */}
        {MODULES.filter((m) => TOP_STANDALONE.includes(m.key)).map((m) => (
          <ModuleNavItem
            key={m.key}
            moduleKey={m.key}
            label={m.label}
            icon={m.icon}
            active={activeKey === m.key}
            onSelect={onSelect}
          />
        ))}

        {/* دسته‌های آکاردئونی */}
        {NAV_CATEGORIES.map((category) => (
          <NavCategoryBlock
            key={category.key}
            category={category}
            open={openCategory === category.key}
            activeKey={activeKey}
            onSelect={onSelect}
            onToggle={onToggleCategory}
          />
        ))}

        {/* بقیه‌ی آیتم‌های مستقل (خارج از دسته‌ها) */}
        {bottomStandalone.map((m) => (
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

      {/* خروج — دانلود پروژه به ماژول «بکاپ و بازیابی» منتقل شد */}
      <div className="space-y-1 border-t border-border pt-2">
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

  /** دسته‌ی بازِ یگانه — آکاردئون: با باز کردن دسته‌ای، دسته‌های باز بسته می‌شوند */
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  // با تغییر ماژول فعال، دسته‌ی همان ماژول خودکار باز می‌شود تا محل ماژول در
  // سایدبار دیده شود (شامل پرش‌های درون‌ماژولی مثل «مشاهده همه» داشبورد)
  useEffect(() => {
    const cat = NAV_CATEGORIES.find((c) => c.items.includes(activeKey));
    setOpenCategory(cat?.key ?? null);
  }, [activeKey]);

  const toggleCategory = (key: string) => {
    setOpenCategory((prev) => (prev === key ? null : key));
  };

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
            openCategory={openCategory}
            onToggleCategory={toggleCategory}
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
              openCategory={openCategory}
              onToggleCategory={toggleCategory}
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
