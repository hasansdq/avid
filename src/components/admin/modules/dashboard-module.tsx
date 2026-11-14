"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  MonitorPlay,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { StatusBadge } from "@/components/admin/shared/status-badge";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import type { ModuleKey, ModuleProps, Stats } from "@/components/admin/types";
import { faDate, faDigits } from "@/lib/fa";
import { isEnrollmentStatus } from "@/lib/course-theme";

interface StatCard {
  icon: LucideIcon;
  label: string;
  tile: string;
  value: number;
  badge?: string;
  subtitle: string;
}

/** ماژول داشبورد — آمار کلی + ثبت‌نام‌های اخیر + دسترسی سریع */
export function DashboardModule({ setActive }: ModuleProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setStats(await apiFetch<Stats>("/api/admin/stats"));
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards: StatCard[] = stats
    ? [
        {
          icon: GraduationCap,
          label: "دوره‌ها",
          tile: "from-teal-400 to-emerald-600",
          value: stats.courses.total,
          subtitle: [
            `${faDigits(stats.courses.online)} آنلاین`,
            `${faDigits(stats.courses.inperson)} حضوری`,
            // دوره‌های ترکیبی — فقط وقتی دیده می‌شود که وجود داشته باشند
            ...(stats.courses.hybrid > 0
              ? [`${faDigits(stats.courses.hybrid)} حضوری و آنلاین`]
              : []),
          ].join(" · "),
        },
        {
          icon: MonitorPlay,
          label: "ویدئوها",
          tile: "from-violet-400 to-purple-600",
          value: stats.videos.total,
          subtitle: `${faDigits(stats.videos.published)} ویدئو منتشرشده`,
        },
        {
          icon: MessagesSquare,
          label: "نظرات کاربران",
          tile: "from-amber-400 to-orange-500",
          value: stats.testimonials.total,
          subtitle: `${faDigits(stats.testimonials.published)} نظر منتشرشده`,
        },
        {
          icon: ClipboardList,
          label: "ثبت‌نام‌ها",
          tile: "from-rose-400 to-red-600",
          value: stats.enrollments.total,
          badge:
            stats.enrollments.new > 0
              ? `${faDigits(stats.enrollments.new)} جدید`
              : undefined,
          subtitle: "مجموع ثبت‌نام‌های دریافتی",
        },
      ]
    : [];

  const quickLinks: { key: ModuleKey; label: string; icon: LucideIcon }[] = [
    { key: "courses", label: "مدیریت دوره‌ها", icon: GraduationCap },
    { key: "videos", label: "مدیریت ویدئوها", icon: MonitorPlay },
    { key: "testimonials", label: "نظرات کاربران", icon: MessagesSquare },
    { key: "enrollments", label: "ثبت‌نام‌ها", icon: ClipboardList },
  ];

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-52 animate-pulse rounded-xl bg-foreground/[0.04]" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass h-32 animate-pulse rounded-2xl" />
          ))}
        </div>
        <div className="glass h-56 animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (!stats) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="دریافت آمار ناموفق بود"
        description="برای تلاش مجدد دوباره امتحان کنید."
      >
        <Button variant="outline" size="sm" onClick={load}>
          تلاش مجدد
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="داشبورد"
        description={`نمای کلی وضعیت سایت — آخرین ثبت‌نام: ${
          stats.recentEnrollments[0]
            ? faDate(stats.recentEnrollments[0].createdAt)
            : "موجود نیست"
        }`}
      />

      {/* کارت‌های آمار */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="glass relative flex flex-col gap-3 rounded-2xl p-4 transition-colors hover:border-foreground/20 sm:p-5"
          >
            <div className="flex items-center gap-3">
              <span
                className={`relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ${card.tile}`}
              >
                <card.icon className="size-5.5 text-white" strokeWidth={1.9} />
                {card.badge ? (
                  <Badge className="absolute -top-2.5 -start-2 h-auto rounded-full border-0 bg-background px-1.5 py-0.5 text-[0.6rem] font-black text-teal-600 dark:text-teal-300 shadow-md">
                    {card.badge}
                  </Badge>
                ) : null}
              </span>
              <p className="text-xs font-bold text-muted-foreground sm:text-sm">
                {card.label}
              </p>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                {faDigits(card.value)}
              </p>
              <p className="mt-1 text-[0.65rem] leading-5 text-muted-foreground sm:text-xs">
                {card.subtitle}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ثبت‌نام‌های اخیر + دسترسی سریع */}
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="glass overflow-hidden rounded-2xl xl:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
            <h3 className="text-sm font-black text-foreground">
              ثبت‌نام‌های اخیر
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs font-bold text-teal-600 dark:text-teal-300 hover:bg-teal-500/10 dark:hover:bg-teal-400/10"
              onClick={() => setActive("enrollments")}
            >
              مشاهده همه
              <ArrowLeft className="size-3.5" />
            </Button>
          </div>
          {loading ? (
            <div className="p-4">
              <TableSkeleton rows={4} cols={5} />
            </div>
          ) : stats.recentEnrollments.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="هنوز ثبت‌نامی دریافت نشده است"
              description="با انتشار دوره‌ها و معرفی سایت، ثبت‌نام‌ها اینجا نمایش داده می‌شوند."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>دوره</TableHead>
                  <TableHead>شماره تماس</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-left">تاریخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentEnrollments.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-bold">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.course}
                    </TableCell>
                    <TableCell dir="ltr" className="text-left text-xs">
                      <span className="flex items-center gap-1.5 text-teal-600 dark:text-teal-300">
                        <Phone className="size-3" />
                        {e.phone}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={isEnrollmentStatus(e.status) ? e.status : "new"}
                      />
                    </TableCell>
                    <TableCell className="text-left text-xs text-muted-foreground">
                      {faDate(e.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* دسترسی سریع */}
        <section className="glass flex flex-col gap-4 rounded-2xl p-4 sm:p-5">
          <h3 className="text-sm font-black text-foreground">دسترسی سریع</h3>
          <div className="grid flex-1 grid-cols-2 gap-3">
            {quickLinks.map((link) => (
              <Button
                key={link.key}
                variant="outline"
                onClick={() => setActive(link.key)}
                className="glass h-auto flex-col items-start gap-2 rounded-xl p-4 text-right"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400/20 to-emerald-600/20">
                  <link.icon className="size-4.5 text-teal-600 dark:text-teal-300" />
                </span>
                <span className="text-xs font-bold">{link.label}</span>
              </Button>
            ))}
          </div>
          <p className="text-[0.65rem] leading-5 text-muted-foreground">
            هر بخش پنل به‌صورت ماژول مستقل مدیریت می‌شود؛ از اینجا مستقیم به
            بخش موردنظر بروید.
          </p>
        </section>
      </div>
    </div>
  );
}
