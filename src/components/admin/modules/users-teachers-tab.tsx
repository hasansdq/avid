"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Eye,
  GraduationCap,
  IdCard,
  Loader2,
  LogIn,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  User as UserIcon,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import { btnGradient, tileGradient } from "@/components/admin/shared/styles";
import type {
  TeacherWithStats,
  User,
  UserWithStats,
} from "@/components/admin/types";
import { faDate, faDigits } from "@/lib/fa";
import {
  isValidNationalId,
  NATIONAL_ID_INVALID_MESSAGE,
  normalizeNationalId,
  toEnDigits,
} from "@/lib/national-id";

/**
 * تب «اساتید»‌ی ماژول مدیریت کاربران —
 * فهرست اساتید (جست‌وجوی سمت-کاربر)، آمار هر استاد (دوره، کلاس، استریم،
 * دانشجو) و عملیات کامل اساتید. دیالوگ‌های ویرایش/پرونده/ثبت‌نام و… همان
 * دیالوگ‌های ماژول کاربران‌اند که از طریق props باز می‌شوند (بدون کپی).
 */

/** پاسخ GET /api/admin/teachers */
export interface TeachersListResponse {
  teachers: TeacherWithStats[];
  total: number;
}

/** پاسخ جست‌وجوی کاربران برای تبدیل به استاد (GET /api/admin/users?q=) */
interface UsersSearchResponse {
  users: UserWithStats[];
  total: number;
  page: number;
  pageCount: number;
}

/** نام نمایشی کاربر (یا شماره‌ی او اگر نامی نداشت) */
function displayName(
  u: Pick<User, "firstName" | "lastName" | "phone">
): string {
  const name = `${u.firstName} ${u.lastName}`.trim();
  return name || faDigits(u.phone);
}

/** نشان وضعیت حساب کاربر — همان نگاشت ماژول کاربران */
const ACCOUNT_STATUS: Record<string, { label: string; badge: string }> = {
  active: {
    label: "فعال",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  blocked: {
    label: "مسدود",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
};

/* ------------------------------------------------------------------ */
/*  نقش کاربر — استاد / فراگیر / کاربر عادی                            */
/* ------------------------------------------------------------------ */

/**
 * برچسب نقش حساب:
 *  • استاد → role="teacher"
 *  • فراگیر → حداقل یک ثبت‌نام دوره یا عضویت کلاس
 *  • کاربر عادی → فقط ثبت‌نام سایت
 */
export function userRoleLabel(
  u: Pick<User, "role"> &
    Partial<Pick<UserWithStats, "enrollmentsCount" | "classesCount">>
): { label: string; badge: string; icon: LucideIcon } {
  if (u.role === "teacher") {
    return {
      label: "استاد",
      badge:
        "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
      icon: GraduationCap,
    };
  }
  if ((u.enrollmentsCount ?? 0) > 0 || (u.classesCount ?? 0) > 0) {
    return {
      label: "فراگیر",
      badge:
        "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300",
      icon: BookOpen,
    };
  }
  return {
    label: "کاربر عادی",
    badge: "border-foreground/15 bg-foreground/[0.05] text-muted-foreground",
    icon: UserIcon,
  };
}

/** نشان کوچک نقش کاربر — در جدول/کارت کاربران و ردیف‌های جست‌وجوی استاد */
export function RoleChip({
  u,
  className,
}: {
  u: Pick<User, "role"> &
    Partial<Pick<UserWithStats, "enrollmentsCount" | "classesCount">>;
  className?: string;
}) {
  const meta = userRoleLabel(u);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[0.6rem] font-bold",
        meta.badge,
        className
      )}
    >
      <Icon className="size-2.5" />
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  تب «اساتید» — جدول/کارت‌ها + عملیات                                */
/* ------------------------------------------------------------------ */

/**
 * بدنه‌ی تب «اساتید» — فهرست اساتید با آمار؛ همه‌ی دیالوگ‌ها از طریق
 * props (دستگیره‌های والد) باز می‌شوند تا همان دیالوگ‌های کاربران استفاده شوند.
 */
export function TeachersTab({
  teachers,
  loading,
  busyId,
  onRefresh,
  onAdd,
  onEdit,
  onDetail,
  onEnroll,
  onLogin,
  onPayments,
  onToggleBlock,
  onDemote,
  onDelete,
}: {
  /** فهرست اساتید (null یعنی هنوز بارگذاری نشده) */
  teachers: TeacherWithStats[] | null;
  loading: boolean;
  /** شناسه‌ی استادی که عملیاتش در جریان است — برای اسپینر دکمه‌ها */
  busyId: string | null;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (user: User) => void;
  onDetail: (user: User) => void;
  onEnroll: (user: User) => void;
  onLogin: (user: User) => void;
  onPayments: (user: User) => void;
  onToggleBlock: (user: User) => void;
  onDemote: (teacher: TeacherWithStats) => void;
  onDelete: (user: User) => void;
}) {
  const [q, setQ] = useState("");

  /** فهرست اساتید کوچک است — فیلتر سمت-کاربر روی نام/شماره */
  const filtered = useMemo(() => {
    if (!teachers) return null;
    const query = q.trim().toLowerCase();
    if (!query) return teachers;
    return teachers.filter(
      (t) =>
        `${t.firstName} ${t.lastName}`.toLowerCase().includes(query) ||
        t.phone.includes(query)
    );
  }, [teachers, q]);

  const showSkeleton = loading && !teachers;
  const showEmpty = !showSkeleton && teachers !== null && teachers.length === 0;
  const showNoMatch =
    !showSkeleton &&
    !showEmpty &&
    filtered !== null &&
    filtered.length === 0;

  /** دکمه‌های عملیات هر استاد — مشترک جدول (فشرده) و کارت موبایل (۴۴px) */
  function teacherActions(teacher: TeacherWithStats, compact: boolean) {
    const blocked = teacher.status === "blocked";
    const busy = busyId === teacher.id;
    return (
      <div className={cn("flex items-center gap-1.5", compact ? "" : "flex-wrap")}>
        {/* افزودن به دانشجویان یک دوره (دکمه‌ی +) */}
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => onEnroll(teacher)}
          aria-label={`افزودن ${displayName(teacher)} به دانشجویان یک دوره`}
          title="افزودن به دانشجویان یک دوره"
          className={cn(
            compact ? "size-8" : "size-11 rounded-xl",
            "text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-200"
          )}
        >
          <UserPlus className="size-4" />
        </Button>
        {/* ورود مدیر به سایت با هویت این استاد */}
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => onLogin(teacher)}
          disabled={blocked}
          aria-label={`ورود به سایت به عنوان ${displayName(teacher)}`}
          title={blocked ? "کاربر مسدود است" : "ورود به سایت به عنوان کاربر"}
          className={cn(
            compact ? "size-8" : "size-11 rounded-xl",
            "text-violet-600 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-300 dark:hover:bg-violet-400/10 dark:hover:text-violet-200"
          )}
        >
          <LogIn className="size-4" />
        </Button>
        {/* پرداختی‌ها و اقساط */}
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => onPayments(teacher)}
          aria-label={`پرداختی‌ها و اقساط ${displayName(teacher)}`}
          title="پرداختی‌ها و اقساط"
          className={cn(
            compact ? "size-8" : "size-11 rounded-xl",
            "text-violet-600 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-300 dark:hover:bg-violet-400/10 dark:hover:text-violet-200"
          )}
        >
          <Wallet className="size-4" />
        </Button>
        {/* مشاهده‌ی پرونده (همان دیالوگ پرونده‌ی کاربر) */}
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => onDetail(teacher)}
          aria-label={`مشاهده‌ی پرونده‌ی ${displayName(teacher)}`}
          title="مشاهده‌ی پرونده"
          className={cn(
            compact ? "size-8" : "size-11 rounded-xl",
            "text-teal-600 hover:bg-teal-500/10 hover:text-teal-700 dark:text-teal-300 dark:hover:bg-teal-500/10 dark:hover:text-teal-200"
          )}
        >
          <Eye className="size-4" />
        </Button>
        {/* ویرایش اطلاعات حساب */}
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => onEdit(teacher)}
          aria-label={`ویرایش ${displayName(teacher)}`}
          title="ویرایش"
          className={cn(
            compact ? "size-8" : "size-11 rounded-xl",
            "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          )}
        >
          <Pencil className="size-4" />
        </Button>
        {/* مسدودسازی / رفع مسدودی */}
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => onToggleBlock(teacher)}
          disabled={busy}
          aria-label={blocked ? "رفع مسدودی" : "مسدودسازی"}
          title={blocked ? "رفع مسدودی" : "مسدودسازی"}
          className={cn(
            compact ? "size-8" : "size-11 rounded-xl",
            blocked
              ? "text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-200"
              : "text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-300 dark:hover:bg-amber-400/10 dark:hover:text-amber-200"
          )}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : blocked ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Ban className="size-4" />
          )}
        </Button>
        {/* سلب نقش استاد → تبدیل به کاربر عادی (دارایی‌ها دست‌نخورده می‌مانند) */}
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => onDemote(teacher)}
          disabled={busy}
          aria-label={`سلب نقش استاد از ${displayName(teacher)}`}
          title="سلب نقش استاد (دوره‌ها و کلاس‌ها دست‌نخورده می‌مانند)"
          className={cn(
            compact ? "size-8" : "size-11 rounded-xl",
            "text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-300 dark:hover:bg-amber-400/10 dark:hover:text-amber-200"
          )}
        >
          <UserMinus className="size-4" />
        </Button>
        {/* حذف حساب استاد */}
        <ConfirmDelete
          title="حذف استاد"
          description={`حساب استاد «${displayName(teacher)}» حذف شود؟ دوره‌ها، کلاس‌ها و استریم‌های ساخته‌شده‌ی او باقی می‌مانند ولی مالکِ استاد ندارند؛ ثبت‌نام‌هایش بدون حساب کاربری می‌ماند و نشست ورودش بسته می‌شود.`}
          onConfirm={() => onDelete(teacher)}
        >
          <Button
            variant="ghost"
            size={compact ? "icon" : "default"}
            aria-label={`حذف ${displayName(teacher)}`}
            title="حذف"
            className={cn(
              compact ? "size-8" : "size-11 rounded-xl",
              "text-destructive hover:bg-destructive/10 hover:text-destructive"
            )}
          >
            <Trash2 className="size-4" />
          </Button>
        </ConfirmDelete>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* — فیلترها: جست‌وجو + افزودن استاد + به‌روزرسانی — */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نام یا شماره موبایل استاد..."
            aria-label="جستجوی استاد"
            className="h-11 rounded-xl bg-foreground/[0.03] pr-10 text-sm dark:bg-white/[0.04]"
          />
        </div>
        <Button
          onClick={onAdd}
          aria-label="افزودن استاد جدید"
          className={`h-11 rounded-xl px-5 text-xs font-bold ${btnGradient}`}
        >
          <GraduationCap className="size-4" />
          افزودن استاد
        </Button>
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          aria-label="به‌روزرسانی فهرست اساتید"
          title="به‌روزرسانی"
          className="h-11 rounded-xl px-4 font-bold"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          <span className="sm:hidden">به‌روزرسانی</span>
        </Button>
      </div>

      {/* — جدول (دسکتاپ) + کارت (موبایل) — */}
      {showSkeleton ? (
        <>
          <div className="hidden md:block">
            <TableSkeleton rows={6} cols={7} />
          </div>
          <div className="space-y-3 md:hidden" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass h-36 animate-pulse rounded-2xl" />
            ))}
          </div>
        </>
      ) : showEmpty ? (
        <EmptyState
          icon={GraduationCap}
          title="هنوز استادی تعیین نشده است"
          description="اساتید آکادمی همین‌جا مدیریت می‌شوند؛ کاربر جدیدی با نقش استاد بسازید یا یکی از کاربران موجود را به استاد تبدیل کنید."
        >
          <Button
            onClick={onAdd}
            size="sm"
            className={`rounded-xl ${btnGradient}`}
          >
            <UserPlus className="size-4" />
            افزودن اولین استاد
          </Button>
        </EmptyState>
      ) : showNoMatch ? (
        <EmptyState
          icon={Search}
          title="استادی با این جست‌وجو پیدا نشد"
          description="عبارت دیگری را امتحان کنید یا فهرست را به‌روزرسانی کنید."
        />
      ) : filtered ? (
        <>
          {/* — جدول دسکتاپ — */}
          <div className="glass hidden overflow-hidden rounded-2xl md:block">
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>استاد</TableHead>
                    <TableHead>دوره‌ها</TableHead>
                    <TableHead>کلاس‌ها</TableHead>
                    <TableHead>استریم‌ها</TableHead>
                    <TableHead>وضعیت حساب</TableHead>
                    <TableHead>تاریخ عضویت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const statusMeta =
                      t.status in ACCOUNT_STATUS
                        ? ACCOUNT_STATUS[t.status]
                        : ACCOUNT_STATUS.active;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="max-w-44">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white ${tileGradient} shadow-md`}
                              aria-hidden
                            >
                              {displayName(t).charAt(0)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-foreground">
                                {displayName(t)}
                              </p>
                              <a
                                href={`tel:${t.phone}`}
                                dir="ltr"
                                className="flex w-fit items-center justify-start gap-1 text-xs font-semibold text-teal-600 transition-colors hover:underline dark:text-teal-300 dark:hover:text-teal-200"
                                title="تماس با استاد"
                              >
                                <Phone className="size-3" />
                                {faDigits(t.phone)}
                              </a>
                              {t.nationalId ? (
                                <p
                                  dir="ltr"
                                  className="flex w-fit items-center justify-start gap-1 text-[0.6rem] font-bold tabular-nums text-muted-foreground"
                                  title="کد ملی — برای استعلام گواهی‌نامه"
                                >
                                  <IdCard className="size-3" />
                                  {faDigits(t.nationalId)}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs font-bold tabular-nums text-foreground">
                              <BookOpen className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                              {faDigits(t.coursesCount)}
                            </span>
                            <p className="text-[0.6rem] font-medium tabular-nums text-muted-foreground">
                              {faDigits(t.studentsCount)} دانشجو
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs font-bold tabular-nums text-foreground">
                            <Users className="size-3.5 text-violet-600/70 dark:text-violet-300/70" />
                            {faDigits(t.classesCount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs font-bold tabular-nums text-foreground">
                              <Video className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                              {faDigits(t.streamsCount)}
                            </span>
                            {t.streamsEndedCount > 0 ? (
                              <p className="whitespace-nowrap text-[0.6rem] font-medium tabular-nums text-muted-foreground">
                                {faDigits(t.streamsEndedCount)} پایان‌یافته
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                              statusMeta.badge
                            )}
                          >
                            {t.status === "blocked" ? (
                              <Ban className="size-3" />
                            ) : (
                              <CheckCircle2 className="size-3" />
                            )}
                            {statusMeta.label}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarDays className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                            {faDate(t.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-left">
                          {teacherActions(t, true)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* — کارت‌های موبایل — */}
          <div className="space-y-3 md:hidden">
            {filtered.map((t) => {
              const statusMeta =
                t.status in ACCOUNT_STATUS
                  ? ACCOUNT_STATUS[t.status]
                  : ACCOUNT_STATUS.active;
              return (
                <article key={t.id} className="glass space-y-3 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-base font-black text-white ${tileGradient} shadow-md`}
                      aria-hidden
                    >
                      {displayName(t).charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-black text-foreground">
                          {displayName(t)}
                        </p>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
                            statusMeta.badge
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                      <a
                        href={`tel:${t.phone}`}
                        dir="ltr"
                        className="mt-0.5 flex w-fit items-center justify-start gap-1 text-xs font-semibold text-teal-600 dark:text-teal-300"
                        title="تماس با استاد"
                      >
                        <Phone className="size-3" />
                        {faDigits(t.phone)}
                      </a>
                      {t.nationalId ? (
                        <p
                          dir="ltr"
                          className="mt-0.5 flex w-fit items-center justify-start gap-1 text-[0.65rem] font-bold tabular-nums text-muted-foreground"
                          title="کد ملی — برای استعلام گواهی‌نامه"
                        >
                          <IdCard className="size-3" />
                          {faDigits(t.nationalId)}
                        </p>
                      ) : null}
                      <p className="mt-1 flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                        <CalendarDays className="size-3" />
                        عضویت: {faDate(t.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[0.6rem] font-bold">
                    <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-foreground">
                      {faDigits(t.coursesCount)} دوره
                    </span>
                    <span className="rounded-full bg-teal-500/10 px-2.5 py-1 tabular-nums text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">
                      {faDigits(t.studentsCount)} دانشجو
                    </span>
                    <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-muted-foreground">
                      {faDigits(t.classesCount)} کلاس
                    </span>
                    <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-muted-foreground">
                      {faDigits(t.streamsCount)} استریم ·{" "}
                      {faDigits(t.streamsEndedCount)} پایان‌یافته
                    </span>
                  </div>

                  <div className="border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
                    {teacherActions(t, false)}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  دیالوگ افزودن استاد — کاربر جدید یا تبدیل کاربر موجود              */
/* ------------------------------------------------------------------ */

/**
 * افزودن استاد به دو صورت:
 *  ۱) «کاربر جدید» — فرمی مثل افزودن کاربر (نام/نام خانوادگی/شماره/کد ملی/یادداشت)
 *  ۲) «تبدیل کاربر موجود» — جست‌وجوی کاربران سایت و ارتقای نقش او به استاد
 */
export function AddTeacherDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [draft, setDraft] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    nationalId: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  /* — جست‌وجوی کاربر موجود (با تأخیر، مثل جست‌وجوی لیست کاربران) — */
  const [searchQ, setSearchQ] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserWithStats[] | null>(null);
  const [selected, setSelected] = useState<UserWithStats | null>(null);

  useEffect(() => {
    if (open) {
      setMode("new");
      setDraft({ firstName: "", lastName: "", phone: "", nationalId: "", note: "" });
      setSaving(false);
      setSearchQ("");
      setSearchQuery("");
      setResults(null);
      setSelected(null);
    }
  }, [open]);

  /* — جست‌وجو با تأخیر — */
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchQ.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    if (!open || mode !== "existing") return;
    let cancelled = false;
    if (!searchQuery) {
      setResults(null);
      setSelected(null);
      return;
    }
    (async () => {
      try {
        setSearching(true);
        setSelected(null);
        const data = await apiFetch<UsersSearchResponse>(
          `/api/admin/users?q=${encodeURIComponent(searchQuery)}`
        );
        if (!cancelled) setResults(data.users.slice(0, 8));
      } catch (error) {
        if (!cancelled) toastApiError(error);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, mode, open]);

  /** حالت ۱ — ساخت کاربر جدید با نقش استاد (اعتبارسنجی مثل افزودن کاربر) */
  async function saveNew() {
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    const phone = draft.phone.replace(/[\s-]/g, "");

    if (firstName.length < 2 || firstName.length > 40) {
      toast.error("نام باید ۲ تا ۴۰ نویسه باشد.");
      return;
    }
    if (lastName.length < 2 || lastName.length > 40) {
      toast.error("نام خانوادگی باید ۲ تا ۴۰ نویسه باشد.");
      return;
    }
    if (!/^09\d{9}$/.test(phone)) {
      toast.error("شماره موبایل معتبر نیست (مثال: 09123456789).");
      return;
    }
    // کد ملی اختیاری — اگر چیزی وارد شده باشد باید معتبر باشد
    const nationalId = normalizeNationalId(draft.nationalId);
    if (nationalId !== "" && !isValidNationalId(nationalId)) {
      toast.error(NATIONAL_ID_INVALID_MESSAGE);
      return;
    }
    if (draft.note.trim().length > 500) {
      toast.error("یادداشت نمی‌تواند بیش از ۵۰۰ نویسه باشد.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/admin/teachers", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          ...(nationalId !== "" ? { nationalId } : {}),
          note: draft.note.trim(),
        }),
      });
      toast.success(`استاد «${firstName} ${lastName}» افزوده شد`);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  /** حالت ۲ — ارتقای نقش کاربر موجود به استاد */
  async function promoteExisting() {
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch("/api/admin/teachers", {
        method: "POST",
        body: JSON.stringify({ userId: selected.id }),
      });
      toast.success(`«${displayName(selected)}» استاد شد`);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-base">افزودن استاد</DialogTitle>
          <DialogDescription className="leading-6">
            یک کاربر جدید با نقش استاد بسازید یا یکی از کاربران موجود سایت را
            به استاد تبدیل کنید؛ اساتید در پنل خود دوره، کلاس و استریم می‌سازند.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v === "existing" ? "existing" : "new")}
          dir="rtl"
          className="gap-4"
        >
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl p-1">
            <TabsTrigger
              value="new"
              className="rounded-lg px-3 py-2 text-xs font-bold"
            >
              <UserPlus className="size-4" />
              کاربر جدید
            </TabsTrigger>
            <TabsTrigger
              value="existing"
              className="rounded-lg px-3 py-2 text-xs font-bold"
            >
              <GraduationCap className="size-4" />
              تبدیل کاربر موجود
            </TabsTrigger>
          </TabsList>

          {/* — حالت «کاربر جدید» — */}
          <TabsContent value="new" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="add-teacher-first-name" className="text-xs font-black text-foreground/90">
                  نام <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="add-teacher-first-name"
                  value={draft.firstName}
                  onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
                  placeholder="مثلاً: سارا"
                  maxLength={40}
                  className="h-11 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-teacher-last-name" className="text-xs font-black text-foreground/90">
                  نام خانوادگی <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="add-teacher-last-name"
                  value={draft.lastName}
                  onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
                  placeholder="مثلاً: محمدی"
                  maxLength={40}
                  className="h-11 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="add-teacher-phone" className="text-xs font-black text-foreground/90">
                  شماره موبایل <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="add-teacher-phone"
                  value={draft.phone}
                  onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                  inputMode="tel"
                  dir="ltr"
                  placeholder="09123456789"
                  maxLength={13}
                  className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="add-teacher-national-id" className="text-xs font-black text-foreground/90">
                  کد ملی <span className="font-semibold text-muted-foreground">(اختیاری)</span>
                </Label>
                <div className="relative">
                  <IdCard className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="add-teacher-national-id"
                    value={draft.nationalId}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        nationalId: toEnDigits(e.target.value)
                          .replace(/\D/g, "")
                          .slice(0, 10),
                      }))
                    }
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="1234567891"
                    className="h-11 rounded-xl bg-foreground/[0.03] pr-10 text-center font-black tabular-nums dark:bg-white/[0.04]"
                  />
                </div>
                <p className="text-[0.6rem] font-semibold leading-5 text-muted-foreground">
                  با ثبت کد ملی، گواهی‌نامه‌های استاد با استعلام کد ملی قابل بررسی است.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="add-teacher-note" className="text-xs font-black text-foreground/90">
                  یادداشت مدیر (اختیاری)
                </Label>
                <Textarea
                  id="add-teacher-note"
                  value={draft.note}
                  onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                  placeholder="یادداشت خصوصی درباره‌ی این استاد — فقط در پنل مدیر دیده می‌شود"
                  rows={3}
                  maxLength={500}
                  className="rounded-xl bg-foreground/[0.03] text-sm leading-6 dark:bg-white/[0.04]"
                />
              </div>
            </div>
          </TabsContent>

          {/* — حالت «تبدیل کاربر موجود» — */}
          <TabsContent value="existing" className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="جستجوی نام یا شماره موبایل کاربر..."
                aria-label="جستجوی کاربر برای تبدیل به استاد"
                className="h-11 rounded-xl bg-foreground/[0.03] pr-10 text-sm dark:bg-white/[0.04]"
              />
            </div>

            {searching ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : !searchQuery ? (
              <p className="glass rounded-2xl px-5 py-6 text-center text-sm leading-6 text-muted-foreground">
                نام یا شماره‌ی کاربر مورد نظر را بنویسید تا در فهرست کاربران سایت
                جست‌وجو شود.
              </p>
            ) : results === null || results.length === 0 ? (
              <p className="glass rounded-2xl px-5 py-6 text-center text-sm text-muted-foreground">
                کاربری با این جست‌وجو پیدا نشد.
              </p>
            ) : (
              <div className="space-y-2">
                {results.map((u) => {
                  const isTeacher = u.role === "teacher";
                  const isSelected = selected?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={isTeacher}
                      onClick={() => setSelected(isTeacher ? null : u)}
                      aria-pressed={isSelected}
                      aria-label={`انتخاب ${displayName(u)} برای تبدیل به استاد`}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-right transition-colors",
                        isTeacher
                          ? "cursor-not-allowed border-foreground/10 opacity-60"
                          : isSelected
                            ? "border-teal-500/60 bg-teal-500/10"
                            : "border-foreground/10 hover:bg-foreground/[0.04]"
                      )}
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white ${tileGradient} shadow-md`}
                        aria-hidden
                      >
                        {displayName(u).charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-foreground">
                          {displayName(u)}
                        </span>
                        <span
                          dir="ltr"
                          className="mt-0.5 flex w-fit items-center justify-start gap-1 text-[0.65rem] font-semibold tabular-nums text-muted-foreground"
                        >
                          <Phone className="size-3" />
                          {faDigits(u.phone)}
                        </span>
                      </span>
                      {isTeacher ? (
                        <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[0.6rem] font-bold text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
                          قبلاً استاد شده
                        </span>
                      ) : (
                        <RoleChip u={u} className="shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          {mode === "new" ? (
            <Button
              onClick={saveNew}
              disabled={saving}
              className={`h-10 rounded-xl px-6 text-xs ${btnGradient}`}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  در حال افزودن...
                </>
              ) : (
                <>
                  <UserPlus className="size-4" />
                  افزودن استاد
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={promoteExisting}
              disabled={saving || !selected}
              className={`h-10 rounded-xl px-6 text-xs ${btnGradient}`}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  در حال تبدیل...
                </>
              ) : (
                <>
                  <GraduationCap className="size-4" />
                  تبدیل به استاد
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-10 rounded-xl px-6 text-xs font-bold"
          >
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
