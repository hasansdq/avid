"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Banknote,
  BarChart3,
  Coins,
  Eye,
  LogIn,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { cn } from "@/lib/utils";
import { faDigits, faTime } from "@/lib/fa";

/* ------------------------------------------------------------------ */
/*  ماژول «آمار سایت» — نمودارها با چهار تب:                              */
/*    ۱) کاربران آنلاین (لحظه‌ای + سری ساعتی امروز + فهرست)              */
/*    ۲) بازدید از سایت (۳۰ روز: بازدید + بازدیدکننده‌ی یکتا)            */
/*    ۳) ثبت‌نام و ورود (۳۰ روز: دو سری)                                 */
/*    ۴) پرداخت‌ها (۳۰ روز: درآمد روزانه از اقساط تسویه‌شده)              */
/* ------------------------------------------------------------------ */

interface StatsChartsData {
  days: {
    day: string;
    visits: number;
    uniqueVisitors: number;
    signups: number;
    logins: number;
    revenue: number;
  }[];
  onlineNow: number;
  onlineByHourToday: number[];
  onlineUsers: {
    userId: string;
    firstName: string;
    lastName: string;
    phone: string;
    lastSeenAt: string;
  }[];
  totals: {
    todayVisits: number;
    todayUnique: number;
    todaySignups: number;
    todayLogins: number;
    totalVisits: number;
    totalUsers: number;
    todayRevenue: number;
    totalRevenue: number;
    paidInstallments: number;
  };
}

/** تبدیل کلید روز «YYYY-MM-DD» به برچسب کوتاه شمسی (مثل «۱۷ آبان») */
function faDayLabel(dayKey: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      month: "short",
      day: "numeric",
    }).format(new Date(`${dayKey}T12:00:00`));
  } catch {
    return dayKey;
  }
}

/** برچسب شمسی کامل برای تولتیپ (مثل «۱۷ آبان ۱۴۰۵») */
function faDayFull(dayKey: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(`${dayKey}T12:00:00`));
  } catch {
    return dayKey;
  }
}

const visitsChartConfig = {
  visits: { label: "بازدید صفحه", color: "var(--chart-1)" },
  uniqueVisitors: { label: "بازدیدکننده‌ی یکتا", color: "var(--chart-2)" },
} satisfies ChartConfig;

const authChartConfig = {
  signups: { label: "ثبت‌نام", color: "var(--chart-2)" },
  logins: { label: "ورود", color: "var(--chart-4)" },
} satisfies ChartConfig;

const onlineChartConfig = {
  online: { label: "کاربر آنلاین", color: "var(--chart-5)" },
} satisfies ChartConfig;

const revenueChartConfig = {
  revenue: { label: "درآمد روزانه", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/** مبلغ فشرده برای محور عمودی نمودار (میلیون‌ها با یک رقم اعشار) */
function faAxisAmount(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    const txt = Number.isInteger(m) ? String(m) : m.toFixed(1).replace(".", "٫");
    return `${faDigits(txt)}میلیون`;
  }
  return faDigits(v.toLocaleString("en-US"));
}

/** کارت خلاصه‌ی بالای ماژول */
function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone: "teal" | "violet" | "emerald" | "amber";
}) {
  const toneCls = {
    teal: "text-teal-700 dark:text-teal-300",
    violet: "text-violet-700 dark:text-violet-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
  }[tone];
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05]">
        <Icon className={cn("size-5", toneCls)} />
      </span>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-bold text-muted-foreground">{label}</p>
        <p className={cn("truncate text-lg font-black tabular-nums", toneCls)}>
          {value}
        </p>
        {hint ? (
          <p className="truncate text-[0.6rem] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export function StatsModule() {
  const [data, setData] = useState<StatsChartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("online");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const fresh = await apiFetch<StatsChartsData>("/api/admin/stats/charts");
      setData(fresh);
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // نوسازی خودکار — هر ۶۰ ثانیه (تم tabs هم تازه می‌شود؛ «کاربران آنلاین»)
  useEffect(() => {
    timerRef.current = setInterval(() => void load(true), 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  // — سری داده‌ی نمودار بازدید (۳۰ روز) —
  const visitsSeries = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        ...d,
        label: faDayLabel(d.day),
      })),
    [data]
  );

  // — سری داده‌ی ثبت‌نام/ورود (۳۰ روز) —
  const authSeries = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        ...d,
        label: faDayLabel(d.day),
      })),
    [data]
  );

  // — سری داده‌ی درآمد پرداخت‌ها (۳۰ روز) —
  const paymentsSeries = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        ...d,
        label: faDayLabel(d.day),
      })),
    [data]
  );

  // — سری ساعتی امروز (۲۴ خانه؛ فقط تا ساعت جاری) —
  const onlineSeries = useMemo(() => {
    const hours = data?.onlineByHourToday ?? new Array(24).fill(0) as number[];
    let currentHour = 23;
    try {
      currentHour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Tehran",
          hour: "2-digit",
          hour12: false,
        }).format(new Date())
      ) || 0;
    } catch {
      currentHour = 23;
    }
    return hours.slice(0, Math.max(currentHour + 1, 1)).map((count, h) => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      online: count,
    }));
  }, [data]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-52 animate-pulse rounded-xl bg-foreground/[0.04]" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass h-20 animate-pulse rounded-2xl" />
          ))}
        </div>
        <div className="glass h-72 animate-pulse rounded-2xl" />
      </div>
    );
  }

  const totals = data?.totals;

  // — جمع‌های درآمد (برای کارت‌های تب «پرداخت‌ها») —
  const revenue30 = (data?.days ?? []).reduce(
    (sum, d) => sum + (d.revenue ?? 0),
    0
  );
  const avgDailyRevenue = Math.round(revenue30 / 30);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="آمار سایت"
        description="کاربران آنلاین، بازدیدها، ثبت‌نام‌ها، ورودها و درآمد روزانه‌ی پرداخت‌ها"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/20">
          <BarChart3 className="size-5 text-white" strokeWidth={1.9} />
        </span>
      </ModuleHeader>

      {/* ————— کارت‌های خلاصه ————— */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Users}
          label="کاربران آنلاین (۵ دقیقه‌ی اخیر)"
          value={faDigits(data?.onlineNow ?? 0)}
          hint="نوسازی خودکار هر ۶۰ ثانیه"
          tone="teal"
        />
        <SummaryCard
          icon={Eye}
          label="بازدید امروز"
          value={faDigits(totals?.todayVisits ?? 0)}
          hint={`بازدیدکننده‌ی یکتا: ${faDigits(totals?.todayUnique ?? 0)}`}
          tone="violet"
        />
        <SummaryCard
          icon={UserPlus}
          label="ثبت‌نام امروز"
          value={faDigits(totals?.todaySignups ?? 0)}
          hint={`مجموع کاربران: ${faDigits(totals?.totalUsers ?? 0)}`}
          tone="emerald"
        />
        <SummaryCard
          icon={LogIn}
          label="ورود امروز"
          value={faDigits(totals?.todayLogins ?? 0)}
          hint={`مجموع بازدیدها: ${faDigits(totals?.totalVisits ?? 0)}`}
          tone="amber"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="max-w-full overflow-x-auto rounded-xl p-1">
            <TabsTrigger
              value="online"
              className="shrink-0 gap-2 rounded-lg px-4 text-xs font-bold sm:text-sm"
            >
              <Users className="size-4" />
              کاربران آنلاین
            </TabsTrigger>
            <TabsTrigger
              value="visits"
              className="shrink-0 gap-2 rounded-lg px-4 text-xs font-bold sm:text-sm"
            >
              <Eye className="size-4" />
              بازدید از سایت
            </TabsTrigger>
            <TabsTrigger
              value="auth"
              className="shrink-0 gap-2 rounded-lg px-4 text-xs font-bold sm:text-sm"
            >
              <UserPlus className="size-4" />
              ثبت‌نام و ورود
            </TabsTrigger>
            <TabsTrigger
              value="payments"
              className="shrink-0 gap-2 rounded-lg px-4 text-xs font-bold sm:text-sm"
            >
              <Banknote className="size-4" />
              پرداخت‌ها
            </TabsTrigger>
          </TabsList>

          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex h-9 items-center gap-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03]"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            نوسازی
          </button>
        </div>

        {/* ————— تب ۱: کاربران آنلاین ————— */}
        <TabsContent value="online" className="mt-4 space-y-4">
          <section className="glass space-y-4 rounded-2xl p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="relative flex size-3">
                  <span className="absolute inline-flex size-3 animate-ping rounded-full bg-teal-400 opacity-60" />
                  <span className="relative inline-flex size-3 rounded-full bg-teal-500" />
                </span>
                <h2 className="text-sm font-black text-foreground">
                  کاربران آنلاین به تفکیک ساعت (امروز)
                </h2>
              </div>
              <span className="rounded-xl bg-foreground/[0.04] px-3 py-1.5 text-xs font-bold text-muted-foreground">
                آنلاین همین حالا:{" "}
                <span className="font-black text-teal-700 dark:text-teal-300">
                  {faDigits(data?.onlineNow ?? 0)}
                </span>
              </span>
            </div>

            <ChartContainer
              config={onlineChartConfig}
              className="h-56 w-full aspect-auto"
            >
              <AreaChart data={onlineSeries} margin={{ left: 12, right: 12 }}>
                <defs>
                  <linearGradient id="fillOnline" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-online)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-online)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                {/* RTL: محور افیکس معکوس تا ساعت از راست به چپ بخواند */}
                <XAxis
                  dataKey="hour"
                  reversed
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={(v: string) => faDigits(v)}
                />
                <YAxis
                  orientation="right"
                  width={36}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickFormatter={(v: number) => faDigits(v)}
                />
                <ChartTooltip
                  cursor={{ strokeDasharray: "4 4" }}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(v) => faDigits(String(v))}
                      formatter={(value) => (
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-[2px] bg-[var(--color-online)]" />
                          {onlineChartConfig.online.label}:{" "}
                          <span className="font-black tabular-nums">
                            {faDigits(value as number)}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="online"
                  type="monotone"
                  fill="url(#fillOnline)"
                  stroke="var(--color-online)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          </section>

          {/* فهرست کاربران آنلاین */}
          <section className="glass space-y-3 rounded-2xl p-4 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-black text-foreground">
              <Activity className="size-4 text-teal-600 dark:text-teal-300" />
              فهرست کاربران آنلاین
            </h2>
            {(data?.onlineUsers ?? []).length === 0 ? (
              <p className="rounded-xl bg-foreground/[0.03] px-4 py-6 text-center text-sm text-muted-foreground dark:bg-white/[0.03]">
                در ۵ دقیقه‌ی اخیر کاربر آنلاینی دیده نشده است. کاربرانِ واردشده
                با باز کردن صفحات سایت، همین‌جا ظاهر می‌شوند.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-foreground/[0.02] dark:bg-white/[0.02]">
                      <TableHead className="text-start">کاربر</TableHead>
                      <TableHead className="text-start">شماره موبایل</TableHead>
                      <TableHead className="text-start">آخرین دیده‌شدن</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.onlineUsers ?? []).map((u) => (
                      <TableRow key={u.userId}>
                        <TableCell className="font-bold">
                          {u.firstName} {u.lastName}
                        </TableCell>
                        <TableCell dir="ltr" className="tabular-nums">
                          {faDigits(u.phone)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {faTime(u.lastSeenAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </TabsContent>

        {/* ————— تب ۲: بازدید از سایت ————— */}
        <TabsContent value="visits" className="mt-4">
          <section className="glass space-y-4 rounded-2xl p-4 sm:p-6">
            <h2 className="text-sm font-black text-foreground">
              بازدید از سایت — ۳۰ روز اخیر
            </h2>
            <p className="text-xs leading-6 text-muted-foreground">
              هر بار لود صفحه‌ی سایت یک «بازدید» است؛ «بازدیدکننده‌ی یکتا» بر
              اساس کوکیِ مرورگر، روزانه یکبار شمرده می‌شود. روزها مطابق تقویم
              ایران است.
            </p>
            <ChartContainer
              config={visitsChartConfig}
              className="h-72 w-full aspect-auto"
            >
              <AreaChart data={visitsSeries} margin={{ left: 12, right: 12 }}>
                <defs>
                  <linearGradient id="fillVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-visits)"
                      stopOpacity={0.7}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-visits)"
                      stopOpacity={0.08}
                    />
                  </linearGradient>
                  <linearGradient id="fillUnique" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-uniqueVisitors)"
                      stopOpacity={0.7}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-uniqueVisitors)"
                      stopOpacity={0.08}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  reversed
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={18}
                />
                <YAxis
                  orientation="right"
                  width={36}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickFormatter={(v: number) => faDigits(v)}
                />
                <ChartTooltip
                  cursor={{ strokeDasharray: "4 4" }}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(_, payload) => {
                        const day = payload?.[0]?.payload?.day as
                          | string
                          | undefined;
                        return day ? faDayFull(day) : "";
                      }}
                      formatter={(value, name) => (
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-[2px]"
                            style={{
                              backgroundColor:
                                name === "visits"
                                  ? "var(--color-visits)"
                                  : "var(--color-uniqueVisitors)",
                            }}
                          />
                          {name === "visits"
                            ? visitsChartConfig.visits.label
                            : visitsChartConfig.uniqueVisitors.label}
                          :{" "}
                          <span className="font-black tabular-nums">
                            {faDigits(value as number)}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="visits"
                  type="monotone"
                  fill="url(#fillVisits)"
                  stroke="var(--color-visits)"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  dataKey="uniqueVisitors"
                  type="monotone"
                  fill="url(#fillUnique)"
                  stroke="var(--color-uniqueVisitors)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          </section>
        </TabsContent>

        {/* ————— تب ۳: ثبت‌نام و ورود ————— */}
        <TabsContent value="auth" className="mt-4">
          <section className="glass space-y-4 rounded-2xl p-4 sm:p-6">
            <h2 className="text-sm font-black text-foreground">
              ثبت‌نام و ورود کاربران — ۳۰ روز اخیر
            </h2>
            <p className="text-xs leading-6 text-muted-foreground">
              «ثبت‌نام» = ساخت حساب تازه از فرم ورود/ثبت‌نام یا افزودن دستی
              توسط مدیر؛ «ورود» = ورود موفق حساب‌های موجود با تایید پیامکی.
            </p>
            <ChartContainer
              config={authChartConfig}
              className="h-72 w-full aspect-auto"
            >
              <BarChart data={authSeries} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  reversed
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={18}
                />
                <YAxis
                  orientation="right"
                  width={36}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickFormatter={(v: number) => faDigits(v)}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--chart-1)", opacity: 0.08 }}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(_, payload) => {
                        const day = payload?.[0]?.payload?.day as
                          | string
                          | undefined;
                        return day ? faDayFull(day) : "";
                      }}
                      formatter={(value, name) => (
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-[2px]"
                            style={{
                              backgroundColor:
                                name === "signups"
                                  ? "var(--color-signups)"
                                  : "var(--color-logins)",
                            }}
                          />
                          {name === "signups"
                            ? authChartConfig.signups.label
                            : authChartConfig.logins.label}
                          :{" "}
                          <span className="font-black tabular-nums">
                            {faDigits(value as number)}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="signups"
                  fill="var(--color-signups)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={16}
                />
                <Bar
                  dataKey="logins"
                  fill="var(--color-logins)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={16}
                />
              </BarChart>
            </ChartContainer>
          </section>
        </TabsContent>

        {/* ————— تب ۴: پرداخت‌ها ————— */}
        <TabsContent value="payments" className="mt-4 space-y-4">
          {/* کارت‌های خلاصه‌ی درآمد */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={Banknote}
              label="درآمد امروز"
              value={faAmount(totals?.todayRevenue ?? 0)}
              hint="تومان — تسویه‌های امروز"
              tone="emerald"
            />
            <SummaryCard
              icon={Coins}
              label="درآمد ۳۰ روز اخیر"
              value={faAmount(revenue30)}
              hint="تومان — مجموع بازه‌ی نمودار"
              tone="teal"
            />
            <SummaryCard
              icon={TrendingUp}
              label="میانگین درآمد روزانه"
              value={faAmount(avgDailyRevenue)}
              hint="تومان — در ۳۰ روز اخیر"
              tone="violet"
            />
            <SummaryCard
              icon={Wallet}
              label="مجموع درآمد از ابتدا"
              value={faAmount(totals?.totalRevenue ?? 0)}
              hint={`تومان — ${faDigits(totals?.paidInstallments ?? 0)} قسط پرداخت‌شده`}
              tone="amber"
            />
          </div>

          {/* نمودار درآمد روزانه */}
          <section className="glass space-y-4 rounded-2xl p-4 sm:p-6">
            <h2 className="text-sm font-black text-foreground">
              درآمد روزانه از پرداخت‌ها — ۳۰ روز اخیر
            </h2>
            <p className="text-xs leading-6 text-muted-foreground">
              درآمد هر روز = مجموع مبلغ اقساطی که همان روز تسویه شده‌اند؛
              تسویه‌ی دستی مدیر و پرداخت آنلاین از درگاه هر دو شامل می‌شوند.
              روزها مطابق تقویم ایران است.
            </p>
            <ChartContainer
              config={revenueChartConfig}
              className="h-72 w-full aspect-auto"
            >
              <BarChart data={paymentsSeries} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  reversed
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={18}
                />
                <YAxis
                  orientation="right"
                  width={56}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickFormatter={(v: number) => faAxisAmount(v)}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--chart-3)", opacity: 0.1 }}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(_, payload) => {
                        const day = payload?.[0]?.payload?.day as
                          | string
                          | undefined;
                        return day ? faDayFull(day) : "";
                      }}
                      formatter={(value) => (
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-2">
                            <span className="size-2.5 rounded-[2px] bg-[var(--color-revenue)]" />
                            درآمد:
                          </span>
                          <span className="font-black tabular-nums">
                            {faAmount(value as number)} تومان
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="revenue"
                  fill="var(--color-revenue)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={14}
                />
              </BarChart>
            </ChartContainer>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
