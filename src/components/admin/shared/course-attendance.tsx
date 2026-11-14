"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCheck,
  Loader2,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { JalaliCalendar } from "@/components/ui/jalali-calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiFetch, toastApiError } from "@/components/admin/api";
import type { CourseWithUsage } from "@/components/admin/types";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import {
  COURSE_TYPES,
  getCourseIcon,
  getCourseTheme,
  isCourseType,
} from "@/lib/course-theme";
import {
  jalaliMonthName,
  toJalali,
} from "@/lib/jalali";
import { faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/* ————— انواع داده‌ی حضور و غیاب (پاسخ GET /api/admin/courses/[id]/attendance) ————— */

interface AttSession {
  index: number;
  active: boolean;
  heldAt: string | null;
}

interface AttEnrollment {
  id: string;
  name: string;
  phone: string;
  status: string;
  /** معدل کارآموز در این دوره (۰ تا ۲۰) — null یعنی ثبت نشده */
  grade: number | null;
  /** پیوند به حساب کاربری (برای آمار و شناسایی کاربر) */
  userId: string | null;
}

interface AttRecord {
  enrollmentId: string;
  index: number;
  present: boolean;
}

interface AttendanceData {
  course: { id: string; title: string; sessions: number; type: string };
  sessions: AttSession[];
  enrollments: AttEnrollment[];
  records: AttRecord[];
}

/* ————— ابزارهای کمکی ————— */

/** تبدیل تاریخ به قالب ورودی date (YYYY-MM-DD) — میلادی، برای input type="date" */
function toDateInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** تاریخ کوتاه شمسی با ارقام فارسی (مثل ۱۴۰۵/۸/۲۰) — برای انتهای ستون‌ها */
function faShortDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(d);
  } catch {
    return faDigits(
      `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
  }
}

/** رنگ ملایم درون‌سازی برای ستونِ «در حال حضور و غیاب» (روی هر پس‌زمینه‌ای کار می‌کند) */
const ACTIVE_TINT =
  "shadow-[inset_0_0_0_9999px_rgba(20,184,166,0.08)] dark:shadow-[inset_0_0_0_9999px_rgba(45,212,191,0.10)]";

/* ————— سلول تاریخ جلسه (ردیف پابرگ جدول) — قابل کلیک و ویرایش ————— */

/** تاریخ طولانی جلالی با ارقام فارسی (مثل «۲۴ آبان ۱۴۰۵») */
function faLongDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  const j = toJalali(d);
  return `${faDigits(j.jd)} ${jalaliMonthName(j.jm)} ${faDigits(j.jy)}`;
}

/**
 * تاریخ برگزاری جلسه در انتهای ستون — با کلیک روی آن، پاپ‌آور تغییر تاریخ
 * باز می‌شود و **تقویم شمسی (جلالی)** نمایش داده می‌شود؛ روز جاری و روز
 * انتخاب‌شده برجسته‌اند، ماه/سال قابل پیمایش است و «امروز» میان‌بر دارد.
 * ذخیره با action=setDate در API ثبت می‌شود (قالب ISO میلادی، بدون تغییر).
 */
function SessionDateCell({
  index,
  heldAt,
  active,
  saving,
  onSave,
}: {
  index: number;
  heldAt: string | null;
  active: boolean;
  saving: boolean;
  onSave: (index: number, date: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  // هنگام باز شدن پاپ‌آور، تقویم با تاریخ فعلی جلسه (یا امروز) هم‌گام می‌شود
  useEffect(() => {
    if (open) {
      const base = heldAt ? new Date(heldAt) : new Date();
      setSel(Number.isNaN(base.getTime()) ? new Date() : base);
    }
  }, [open, heldAt]);

  async function save() {
    if (!sel || busy) return;
    setBusy(true);
    try {
      const ok = await onSave(index, toDateInput(sel));
      if (ok) setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={saving}
          aria-label={`تاریخ جلسه ${faDigits(index)} — ${
            heldAt ? faShortDate(heldAt) : "بدون تاریخ"
          } — تغییر تاریخ`}
          title={
            heldAt
              ? `تاریخ جلسه ${faDigits(index)}: ${faShortDate(heldAt)} — کلیک برای تغییر`
              : `تعیین تاریخ برگزاری جلسه ${faDigits(index)}`
          }
          className="mx-auto flex w-full flex-col items-center gap-0.5 rounded-lg py-1 outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {saving ? (
            <Loader2
              className="size-3.5 animate-spin text-teal-500 dark:text-teal-300"
              aria-label="در حال ثبت"
            />
          ) : (
            <>
              {heldAt ? (
                <span
                  className={cn(
                    "text-[0.6rem] font-bold tabular-nums",
                    active
                      ? "text-teal-700 dark:text-teal-300"
                      : "text-foreground/75 dark:text-foreground/80"
                  )}
                >
                  {faShortDate(heldAt)}
                </span>
              ) : (
                <span className="text-[0.6rem] text-muted-foreground/60">—</span>
              )}
              <CalendarDays
                className={cn(
                  "size-2.5",
                  heldAt
                    ? "text-muted-foreground/70"
                    : "text-teal-500/60 dark:text-teal-300/50"
                )}
                aria-hidden
              />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        side="top"
        align="center"
        className="w-auto rounded-xl p-3"
      >
        <p className="text-xs font-black text-foreground">
          تاریخ جلسه {faDigits(index)}
        </p>
        <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
          {heldAt ? `اکنون: ${faLongDate(heldAt)}` : "تاریخی ثبت نشده است"}
        </p>
        {sel ? (
          <JalaliCalendar value={sel} onChange={setSel} className="mt-2" />
        ) : null}
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={!sel || busy}
            onClick={save}
            className="h-8 flex-1 rounded-lg text-xs font-bold"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            ثبت تاریخ
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSel(new Date())}
            className="h-8 rounded-lg px-2 text-[0.65rem] font-bold"
            title="قرار دادن تاریخ امروز"
          >
            امروز
          </Button>
        </div>
        {sel ? (
          <p className="mt-1.5 text-center text-[0.65rem] font-bold text-teal-700 dark:text-teal-300">
            انتخاب فعلی: {faLongDate(sel)}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}


/* ————— صفحه‌ی حضور و غیاب یک دوره ————— */

/**
 * جدول حضور و غیاب دوره —
 * هر دوره از «بخش دوره‌ها» با کلیک روی عنوانش به این صفحه می‌آید:
 *  · ردیف = ثبت‌نام‌کنندگان دوره
 *  · ستون = جلسه‌های دوره (شماره‌ی جلسه در سرستون به‌صورت عمودی نوشته می‌شود)
 *  · چک‌باکس بالای هر سرستون، جلسه را فعال می‌کند → همه حاضر ثبت می‌شوند
 *    و تاریخ امروز به‌صورت خودکار در انتهای همان ستون ثبت می‌شود
 *  · سلول‌ها فقط آیکون تیک/ضربدر دارند (بدون متن حاضر/غایب)
 */
export function CourseAttendancePage({
  course,
  onBack,
}: {
  course: CourseWithUsage;
  onBack: () => void;
}) {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  /** شماره‌ی جلسه‌ای که عملیات فعال/غیرفعال برایش در جریان است */
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  /** کلید toggle در جریان (index:enrollmentId) */
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  /** شماره‌ی جلسه‌ای که تاریخ آن در حال ذخیره است */
  const [pendingDate, setPendingDate] = useState<number | null>(null);

  /** پیش‌نویس ورودی‌های معدل — enrollmentId → رشته */
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  /** ثبت‌نامی که معدل آن در حال ذخیره است */
  const [pendingGrade, setPendingGrade] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(
        await apiFetch<AttendanceData>(
          `/api/admin/courses/${course.id}/attendance`
        )
      );
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, [course.id]);

  useEffect(() => {
    load();
  }, [load]);

  /* — نقشه‌های دسترسی سریع — */
  const sessionByIndex = useMemo(() => {
    const m = new Map<number, AttSession>();
    (data?.sessions ?? []).forEach((s) => m.set(s.index, s));
    return m;
  }, [data]);

  const recordMap = useMemo(() => {
    const m = new Map<string, boolean>();
    (data?.records ?? []).forEach((r) =>
      m.set(`${r.index}:${r.enrollmentId}`, r.present)
    );
    return m;
  }, [data]);

  /** آمار حضور هر ثبت‌نام — تعداد حاضر/ثبت‌شده از روی رکوردها */
  const recordedByEnrollment = useMemo(() => {
    const m = new Map<string, { present: number; total: number }>();
    (data?.records ?? []).forEach((r) => {
      const cur = m.get(r.enrollmentId) ?? { present: 0, total: 0 };
      cur.total += 1;
      if (r.present) cur.present += 1;
      m.set(r.enrollmentId, cur);
    });
    return m;
  }, [data]);

  // پیش‌نویس ورودی‌های معدل با داده‌ی تازه هم‌گام می‌شود
  useEffect(() => {
    if (!data) return;
    setGradeDrafts(
      Object.fromEntries(
        data.enrollments.map((e) => [
          e.id,
          e.grade === null || e.grade === undefined ? "" : String(e.grade),
        ])
      )
    );
  }, [data]);

  const enrollments = useMemo(() => data?.enrollments ?? [], [data]);
  const sessionCount = data?.course.sessions ?? course.sessions;
  const activeIndex = useMemo(
    () => (data?.sessions ?? []).find((s) => s.active)?.index ?? null,
    [data]
  );
  const heldCount = useMemo(
    () => (data?.sessions ?? []).length,
    [data]
  );

  /* ————— عملیات ————— */

  async function put(body: Record<string, unknown>) {
    await apiFetch(`/api/admin/courses/${course.id}/attendance`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  /** فعال‌سازی جلسه — همه‌ی ثبت‌نام‌ها حاضر ثبت می‌شوند و تاریخ امروز در انتهای ستون می‌نشیند */
  async function activateSession(index: number) {
    setPendingIndex(index);
    try {
      await put({ action: "activate", index });
      toast.success(
        `جلسه ${faDigits(index)} فعال شد — همه حاضر ثبت شدند`
      );
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setPendingIndex(null);
    }
  }

  /** غیرفعال‌سازی جلسه (رکوردهای ثبت‌شده حفظ می‌شوند) */
  async function deactivateSession(index: number) {
    setPendingIndex(index);
    try {
      await put({ action: "deactivate", index });
      toast.info(`جلسه ${faDigits(index)} غیرفعال شد`);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setPendingIndex(null);
    }
  }

  /** تغییر تاریخ برگزاری جلسه — تاریخ پایین ستون قابل کلیک و ویرایش است */
  async function setSessionDate(index: number, date: string): Promise<boolean> {
    setPendingDate(index);
    try {
      await put({ action: "setDate", index, date });
      toast.success(
        `تاریخ جلسه ${faDigits(index)} به ${faShortDate(date)} تغییر کرد`
      );
      await load();
      return true;
    } catch (error) {
      toastApiError(error);
      return false;
    } finally {
      setPendingDate(null);
    }
  }

  /** تغییر حضور/غیاب یک ثبت‌نام در یک جلسه — به‌روی کور (آپدیت فوری محلی + ذخیره در پس‌زمینه) */
  async function toggleRecord(
    index: number,
    enrollmentId: string,
    current: boolean | undefined
  ) {
    const next = current === undefined ? true : !current;
    const key = `${index}:${enrollmentId}`;

    // آپدیت خوش‌بینانه‌ی محلی — در صورت خطا کل داده دوباره بارگذاری می‌شود
    setData((prev) =>
      prev
        ? {
            ...prev,
            records: [
              ...prev.records.filter(
                (r) => !(r.index === index && r.enrollmentId === enrollmentId)
              ),
              { enrollmentId, index, present: next },
            ],
          }
        : prev
    );

    setPendingCell(key);
    try {
      await put({ action: "toggle", index, enrollmentId, present: next });
    } catch (error) {
      toastApiError(error);
      await load();
    } finally {
      setPendingCell(null);
    }
  }

  /* ————— معدل و گواهینامه‌ی کارآموزان ————— */

  /** ثبت/حذف معدل یک کارآموز (۰ تا ۲۰؛ رشته‌ی خالی = حذف نمره) */
  async function saveGrade(
    enrollmentId: string,
    raw: string
  ): Promise<void> {
    setPendingGrade(enrollmentId);
    try {
      const res = await apiFetch<{ grade: number | null }>(
        `/api/admin/courses/${course.id}/attendance`,
        {
          method: "PUT",
          body: JSON.stringify({
            action: "setGrade",
            enrollmentId,
            grade: raw === "" ? null : raw,
          }),
        }
      );
      setData((prev) =>
        prev
          ? {
              ...prev,
              enrollments: prev.enrollments.map((e) =>
                e.id === enrollmentId ? { ...e, grade: res.grade } : e
              ),
            }
          : prev
      );
      toast.success(res.grade === null ? "معدل حذف شد." : "معدل ثبت شد.");
    } catch (error) {
      toastApiError(error);
    } finally {
      setPendingGrade(null);
    }
  }

  /** ذخیره‌ی پیش‌نویس فیلد معدل — با خروج از فیلد یا کلید Enter */
  function commitGrade(e: AttEnrollment) {
    const draft = (gradeDrafts[e.id] ?? "").trim();
    const saved =
      e.grade === null || e.grade === undefined ? "" : String(e.grade);
    if (draft === saved) return;

    // اعتبارسنجی سریع سمت کلاینت — سرور هم چک می‌کند
    if (draft !== "") {
      const n = parseFloat(draft);
      if (!Number.isFinite(n) || n < 0 || n > 20) {
        toast.error("معدل باید عددی بین ۰ تا ۲۰ باشد.");
        return;
      }
    }
    void saveGrade(e.id, draft);
  }

  /* — نمایش هدر — */
  const Icon = getCourseIcon(course.icon);
  const theme = getCourseTheme(course.theme);
  const type = COURSE_TYPES[isCourseType(course.type) ? course.type : "online"];
  const TypeIcon = type.icon;

  const sessionList = useMemo(
    () => Array.from({ length: Math.max(sessionCount, 0) }, (_, i) => i + 1),
    [sessionCount]
  );

  return (
    <div className="space-y-6">
      <ModuleHeader
        title={`حضور و غیاب — ${course.title}`}
        description="لیست ثبت‌نام‌کنندگان دوره و وضعیت حضور آن‌ها در جلسه‌ها؛ با فعال‌سازی هر جلسه، همه حاضر ثبت می‌شوند. در بخش «نمرات» معدل هر کارآموز را ثبت کنید."
      >
        <Button
          variant="outline"
          onClick={onBack}
          className="rounded-xl font-bold"
        >
          <ArrowRight className="size-4" />
          بازگشت به دوره‌ها
        </Button>
      </ModuleHeader>

      {/* — خلاصه‌ی دوره — */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`flex size-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-md ${theme.tile}`}
          aria-hidden
        >
          <Icon className="size-4.5 text-white" strokeWidth={1.9} />
        </span>
        <Badge
          variant="outline"
          className={`gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-bold ${type.badge}`}
        >
          <TypeIcon className="size-3" />
          {type.label}
        </Badge>
        <Badge
          variant="outline"
          className="rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[0.65rem] font-bold text-muted-foreground"
        >
          {faDigits(sessionCount)} جلسه
        </Badge>
        <Badge
          variant="outline"
          className="rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[0.65rem] font-bold text-muted-foreground"
        >
          <UsersRound className="size-3" />
          {faDigits(enrollments.length)} ثبت‌نام‌کننده
        </Badge>
        {activeIndex !== null ? (
          <Badge className="gap-1.5 rounded-full border-0 bg-teal-500/15 px-2.5 py-1 text-[0.65rem] font-black text-teal-700 dark:bg-teal-400/15 dark:text-teal-300">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-teal-500 dark:bg-teal-300" />
            </span>
            جلسه {faDigits(activeIndex)} در حال حضور و غیاب
          </Badge>
        ) : heldCount > 0 ? (
          <Badge
            variant="outline"
            className="rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[0.65rem] font-bold text-muted-foreground"
          >
            {faDigits(heldCount)} جلسه برگزار شده
          </Badge>
        ) : null}
      </div>

      <p className="text-xs leading-6 text-muted-foreground">
        با چک‌باکس بالای هر سرستون، جلسه را فعال کنید — همه‌ی ثبت‌نام‌کنندگان
        حاضر ثبت می‌شوند و تاریخ امروز به‌صورت خودکار در انتهای همان ستون
        نمایش داده می‌شود؛ سپس با کلیک روی تیک/ضربدر هر کاربر می‌توانید حضور یا
        غیاب او را اصلاح کنید. در هر لحظه فقط یک جلسه می‌تواند در حال حضور و
        غیاب باشد. تاریخ برگزاری هر جلسه (انتهای ستون) قابل کلیک و تغییر است.
      </p>

      {/* ————— جدول حضور و غیاب ————— */}
      {loading && !data ? (
        <TableSkeleton rows={6} cols={8} />
      ) : enrollments.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="هنوز کسی در این دوره ثبت‌نام نکرده"
          description="وقتی کاربران در دوره ثبت‌نام کنند، لیست حضور و غیاب آن‌ها همین‌جا ساخته می‌شود."
        />
      ) : sessionCount <= 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="این دوره جلسه‌ای ندارد"
          description="تعداد جلسات این دوره صفر است؛ از «ویرایش دوره» تعداد جلسات را تعیین کنید تا ستون‌های حضور و غیاب ساخته شود."
        />
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <div className="max-h-[68vh] overflow-auto">
            {/* جدول اختصاصی حضور و غیاب — سرستون چسبان از بالا و ستون نام کاربر چسبان از راست */}
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 right-0 z-30 min-w-44 border-b border-e border-border bg-background px-3 py-2 text-start align-middle"
                  >
                    <p className="text-xs font-black text-foreground">کاربر</p>
                    <p className="text-[0.6rem] font-medium text-muted-foreground">
                      {faDigits(enrollments.length)} ثبت‌نام‌کننده
                    </p>
                  </th>
                  {sessionList.map((i) => {
                    const sess = sessionByIndex.get(i);
                    const active = sess?.active ?? false;
                    return (
                      <th
                        key={i}
                        scope="col"
                        className={cn(
                          "sticky top-0 z-20 w-14 min-w-14 border-b border-e border-border bg-background p-1 text-center align-middle",
                          active && ACTIVE_TINT
                        )}
                      >
                        <div className="flex flex-col items-center gap-2 py-2.5">
                          {/* چک‌باکس جداگانه‌ی فعال‌سازی جلسه — بالای سرستون */}
                          {pendingIndex === i ? (
                            <Loader2
                              className="size-4 animate-spin text-teal-500 dark:text-teal-300"
                              aria-label="در حال ثبت"
                            />
                          ) : (
                            <span className="relative flex items-center justify-center">
                              {active ? (
                                <span className="absolute -end-1 -top-1 flex size-1.5">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                                  <span className="relative inline-flex size-1.5 rounded-full bg-teal-500 dark:bg-teal-300" />
                                </span>
                              ) : null}
                              <Checkbox
                                checked={active}
                                onCheckedChange={(checked) =>
                                  checked
                                    ? activateSession(i)
                                    : deactivateSession(i)
                                }
                                aria-label={`فعال‌سازی جلسه ${faDigits(i)}`}
                                title={
                                  active
                                    ? `غیرفعال‌سازی جلسه ${faDigits(i)} (رکوردها حفظ می‌شود)`
                                    : `فعال‌سازی جلسه ${faDigits(i)} — همه حاضر ثبت می‌شوند و تاریخ امروز در انتهای ستون ثبت می‌شود`
                                }
                                className="size-4"
                              />
                            </span>
                          )}
                          {/* شماره‌ی جلسه — به‌صورت عمودی */}
                          <span
                            style={{ writingMode: "vertical-rl" }}
                            className="min-h-14 text-[0.65rem] font-black leading-tight text-muted-foreground"
                          >
                            جلسه {faDigits(i)}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {enrollments.map((e) => (
                  <tr key={e.id} className="group/row">
                    <th
                      scope="row"
                      className={cn(
                        "sticky right-0 z-10 min-w-44 border-b border-e border-border bg-background px-3 py-2 text-start align-middle",
                        "transition-colors group-hover/row:bg-muted/40"
                      )}
                    >
                      <p className="truncate text-sm font-bold text-foreground">
                        {e.name}
                      </p>
                      <p
                        dir="ltr"
                        className="text-[0.65rem] tabular-nums text-muted-foreground"
                      >
                        {faDigits(e.phone)}
                      </p>
                    </th>
                    {sessionList.map((i) => {
                      const sess = sessionByIndex.get(i);
                      const active = sess?.active ?? false;
                      const present = recordMap.get(`${i}:${e.id}`);
                      const cellKey = `${i}:${e.id}`;
                      return (
                        <td
                          key={i}
                          className={cn(
                            "w-14 min-w-14 border-e border-b border-border/60 p-0 text-center align-middle",
                            "transition-colors group-hover/row:bg-muted/40",
                            active && ACTIVE_TINT
                          )}
                        >
                          {sess ? (
                            <button
                              type="button"
                              onClick={() =>
                                toggleRecord(i, e.id, present)
                              }
                              disabled={pendingCell !== null}
                              aria-label={`${e.name} — جلسه ${faDigits(i)} — ${
                                present === undefined
                                  ? "بدون ثبت"
                                  : present
                                    ? "حاضر"
                                    : "غایب"
                              }`}
                              title={
                                present === undefined
                                  ? "ثبت حضور"
                                  : present
                                    ? "ثبت غیاب"
                                    : "ثبت حضور"
                              }
                              className="mx-auto flex size-7 items-center justify-center rounded-full transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                            >
                              {pendingCell === cellKey ? (
                                <Loader2 className="size-3.5 animate-spin text-teal-500 dark:text-teal-300" />
                              ) : present === true ? (
                                <Check
                                  className="size-4.5 text-emerald-500 dark:text-emerald-400"
                                  strokeWidth={3}
                                  aria-hidden
                                />
                              ) : present === false ? (
                                <X
                                  className="size-4 text-red-500 dark:text-red-400"
                                  strokeWidth={2.5}
                                  aria-hidden
                                />
                              ) : (
                                <span
                                  className="size-3 rounded-full border border-dashed border-foreground/30"
                                  aria-hidden
                                />
                              )}
                            </button>
                          ) : (
                            <span
                              className="mx-auto flex size-7 items-center justify-center"
                              aria-label="جلسه فعال نشده"
                              title="این جلسه هنوز فعال نشده است"
                            >
                              <span
                                className="size-1.5 rounded-full bg-foreground/15"
                                aria-hidden
                              />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className="sticky right-0 z-10 min-w-44 border-e bg-background px-3 py-1.5 text-start align-middle"
                  >
                    <p className="text-[0.65rem] font-black text-muted-foreground">
                      تاریخ برگزاری
                    </p>
                  </th>
                  {sessionList.map((i) => {
                    const sess = sessionByIndex.get(i);
                    const active = sess?.active ?? false;
                    return (
                      <td
                        key={i}
                        className={cn(
                          "w-14 min-w-14 border-e p-0.5 text-center align-middle",
                          active && ACTIVE_TINT
                        )}
                      >
                        <SessionDateCell
                          index={i}
                          heldAt={sess?.heldAt ?? null}
                          active={active}
                          saving={pendingDate === i}
                          onSave={setSessionDate}
                        />
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ————— نمرات کارآموزان ————— */}
      {enrollments.length > 0 ? (
        <section className="space-y-3" aria-label="نمرات کارآموزان">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-black text-foreground">
              <ClipboardCheck className="size-5 text-teal-600 dark:text-teal-300" />
              نمرات کارآموزان
            </h3>
            <p className="text-[0.65rem] font-semibold text-muted-foreground">
              معدل از ۲۰ — با خروج از فیلد ثبت می‌شود
            </p>
          </div>

          <div className="glass overflow-hidden rounded-2xl">
            <div className="max-h-[45vh] overflow-auto">
              <table className="w-full min-w-[420px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky top-0 z-10 border-b border-border bg-background px-3 py-2 text-start text-xs font-black text-muted-foreground"
                    >
                      کارآموز
                    </th>
                    <th
                      scope="col"
                      className="sticky top-0 z-10 border-b border-border bg-background px-3 py-2 text-center text-xs font-black text-muted-foreground"
                    >
                      حضور
                    </th>
                    <th
                      scope="col"
                      className="sticky top-0 z-10 border-b border-border bg-background px-3 py-2 text-center text-xs font-black text-muted-foreground"
                    >
                      معدل (از ۲۰)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => {
                    const att =
                      recordedByEnrollment.get(e.id) ??
                      { present: 0, total: 0 };
                    const attPct =
                      att.total > 0
                        ? Math.round((att.present / att.total) * 100)
                        : null;
                    const draft = gradeDrafts[e.id] ?? "";
                    const saving = pendingGrade === e.id;

                    return (
                      <tr key={e.id} className="group/row">
                        <td className="border-b border-border/60 px-3 py-2.5 align-middle transition-colors group-hover/row:bg-muted/40">
                          <p className="text-sm font-bold text-foreground">
                            {e.name}
                          </p>
                          <p
                            dir="ltr"
                            className="text-[0.65rem] tabular-nums text-muted-foreground"
                          >
                            {faDigits(e.phone)}
                          </p>
                        </td>
                        <td className="border-b border-border/60 px-3 py-2.5 text-center align-middle transition-colors group-hover/row:bg-muted/40">
                          {att.total > 0 ? (
                            <span
                              className={cn(
                                "text-xs font-black tabular-nums",
                                (attPct ?? 0) >= 80
                                  ? "text-emerald-600 dark:text-emerald-300"
                                  : (attPct ?? 0) >= 50
                                    ? "text-amber-600 dark:text-amber-300"
                                    : "text-red-600 dark:text-red-300"
                              )}
                              title={`${faDigits(att.present)} از ${faDigits(att.total)} جلسه‌ی ثبت‌شده`}
                            >
                              {faDigits(att.present)} از {faDigits(att.total)} (
                              {faDigits(attPct ?? 0)}٪)
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              بدون ثبت
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border/60 px-3 py-2.5 text-center align-middle transition-colors group-hover/row:bg-muted/40">
                          <div className="flex items-center justify-center gap-1.5">
                            <Input
                              type="number"
                              inputMode="decimal"
                              dir="ltr"
                              min={0}
                              max={20}
                              step={0.25}
                              value={draft}
                              disabled={saving}
                              onChange={(ev) =>
                                setGradeDrafts((prev) => ({
                                  ...prev,
                                  [e.id]: ev.target.value,
                                }))
                              }
                              onBlur={() => commitGrade(e)}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter")
                                  ev.currentTarget.blur();
                              }}
                              aria-label={`معدل ${e.name}`}
                              title="عددی بین ۰ تا ۲۰ — با خروج از فیلد ثبت می‌شود"
                              className="h-9 w-24 text-center tabular-nums"
                              placeholder="—"
                            />
                            {saving ? (
                              <Loader2
                                className="size-4 animate-spin text-teal-500 dark:text-teal-300"
                                aria-label="در حال ثبت معدل"
                              />
                            ) : e.grade !== null &&
                              e.grade !== undefined ? (
                              <Check
                                className="size-4 text-emerald-500 dark:text-emerald-400"
                                strokeWidth={3}
                                aria-label="ثبت‌شده"
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {/* — راهنمای آیکون‌ها — */}
      {enrollments.length > 0 && sessionCount > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[0.65rem] font-semibold text-muted-foreground">
          <span className="flex items-center gap-1">
            <Check
              className="size-3.5 text-emerald-500 dark:text-emerald-400"
              strokeWidth={3}
              aria-hidden
            />
            حاضر
          </span>
          <span className="flex items-center gap-1">
            <X
              className="size-3 text-red-500 dark:text-red-400"
              strokeWidth={2.5}
              aria-hidden
            />
            غایب
          </span>
          <span className="flex items-center gap-1">
            <span
              className="size-3 rounded-full border border-dashed border-foreground/30"
              aria-hidden
            />
            بدون ثبت
          </span>
          <span className="flex items-center gap-1">
            <span
              className="size-1.5 rounded-full bg-foreground/15"
              aria-hidden
            />
            جلسه فعال نشده
          </span>
        </div>
      ) : null}
    </div>
  );
}
