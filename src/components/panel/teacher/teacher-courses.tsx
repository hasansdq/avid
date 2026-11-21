"use client";

import * as React from "react";
import Image from "next/image";
import {
  Banknote,
  CalendarClock,
  CalendarDays,
  Check,
  Clock,
  Eye,
  GraduationCap,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { JalaliDateField } from "@/components/admin/shared/jalali-date-field";
import {
  COURSE_ICON_OPTIONS,
  COURSE_LEVELS,
  COURSE_THEME_OPTIONS,
  COURSE_TYPES,
  ENROLLMENT_STATUSES,
  getCourseIcon,
  getCourseTheme,
  isCourseType,
  isEnrollmentStatus,
  type CourseType,
} from "@/lib/course-theme";
import { faDigits, faDate } from "@/lib/fa";
import { toEnDigits } from "@/lib/national-id";
import { cn } from "@/lib/utils";

/* ————————————————— انواع (قرارداد API /api/teacher/*) ————————————————— */

/** گروه زمان‌بندی دوره‌ی حضوری/ترکیبی */
interface TeacherCourseGroup {
  id?: string;
  title: string;
  schedule: string;
  capacity: number;
  sortOrder?: number;
  enrolledCount?: number;
}

/** ردیف دوره‌ی استاد — GET /api/teacher/courses (فیلدهای Prisma Course + افزوده‌ها) */
export interface TeacherCourseRow {
  id: string;
  title: string;
  description: string;
  category: string;
  type: string;
  level: string;
  instructor: string;
  hours: number;
  sessions: number;
  price: number;
  cashTuition: number;
  installmentTuition: number;
  capacity: number;
  sortOrder: number;
  schedule: string;
  icon: string;
  imageUrl: string | null;
  theme: string;
  tag: string | null;
  published: boolean;
  enrolledCount?: number;
  groups?: TeacherCourseGroup[];
  installmentTemplate?: Array<{ index: number; dueDate: string }>;
}

/** ردیف کاربرِ ثبت‌نام‌شده در دوره‌ی استاد — GET /api/teacher/courses/[id]/enrollees (فقط مشاهده) */
export interface TeacherEnrolleeRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
  groupTitle: string | null;
  paymentStatus: string;
  createdAt: string;
  user: { nationalId: string | null } | null;
}

/* ————————————————— ثابت‌ها و ابزارهای محلی ————————————————— */

/** کارت شیشه‌ای هماهنگ با بقیه‌ی پنل (کپی محلی از استایل داشبورد) */
const CARD =
  "rounded-2xl border border-foreground/[0.08] bg-card/85 p-4 shadow-xl shadow-black/[0.04] backdrop-blur-xl sm:p-6 dark:border-white/[0.08] dark:bg-[#08110e]/70 dark:shadow-black/20";

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/** فقط ارقام (فارسی/عربی → لاتین) برای ورودی‌های عددی */
function digitsOnly(v: string): string {
  return toEnDigits(v).replace(/\D/g, "");
}

/** تبدیل امن رشته به عدد صحیح (منفی‌پذیر نیست — ورودی‌ها فیلتر شده‌اند) */
function toInt(v: string): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** پیش‌فرض ظرفیت بر اساس نوع دوره (نفر) */
const DEFAULT_CAPACITY: Record<CourseType, string> = {
  inperson: "10",
  online: "20",
  hybrid: "20",
};

/** عنوان گروه بعدی بر اساس شمارش موجود */
const faGroupTitle = (n: number) => `گروه ${faDigits(n)}`;

/** پیش‌فرض تعداد اقساط دوره (طرح سه‌قسطی سایت) */
const DEFAULT_INSTALLMENT_COUNT = 3;

/** تبدیل تاریخ به قالب YYYY-MM-DD (ورودی تقویم شمسی) */
function toDateInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** تاریخ پیش‌فرض قسط k: امروز + ۳۰×k روز */
function defaultInstallmentDate(k: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 30 * k);
  return toDateInput(d);
}

/** ساخت فهرست سررسید پیش‌فرض (۳۰ روز فاصله) با حفظ مقادیر موجود */
function buildInstallmentDates(count: number, existing: string[]): string[] {
  const rows: string[] = [];
  for (let i = 0; i < count; i++) {
    rows.push(
      existing[i] && !Number.isNaN(new Date(existing[i]).getTime())
        ? existing[i]
        : defaultInstallmentDate(i + 1)
    );
  }
  return rows;
}

/** توزیع مبلغ کل طرح بین اقساط (سهم هر قسط برای پیش‌نمایش فرم) */
function installmentShares(total: number, count: number): number[] {
  if (total <= 0 || count <= 0) return [];
  const first = Math.ceil(total / count);
  const remaining = total - first;
  const base = count > 1 ? Math.floor(remaining / (count - 1)) : 0;
  const last = count > 1 ? remaining - base * (count - 2) : 0;
  return Array.from(
    { length: count },
    (_, i) => (i === 0 ? first : i === count - 1 ? last : base)
  );
}

/** پیش‌نویس گروه زمانی در فرم (همه‌چیز رشته؛ هنگام ذخیره تبدیل می‌شود) */
interface GroupDraft {
  id?: string | null;
  title: string;
  schedule: string;
  capacity: string;
}

/** فرم دوره — همه‌ی ورودی‌ها رشته و هنگام ذخیره به عدد تبدیل می‌شوند */
interface CourseFormDraft {
  title: string;
  description: string;
  category: string;
  type: CourseType;
  level: string;
  instructor: string;
  hours: string;
  sessions: string;
  cashTuition: string;
  installmentTuition: string;
  capacity: string;
  schedule: string;
  icon: string;
  imageUrl: string;
  theme: string;
  tag: string;
  published: boolean;
  groups: GroupDraft[];
  installments: string[];
}

/* ————————————————— بخش «دوره‌های من» ————————————————— */

/**
 * TeacherCoursesSection — بخش «دوره‌های من» در پنل استاد:
 * ایجاد/ویرایش/حذف دوره‌ها با همان فرم کامل دوره‌ی مدیر (گروه‌ها و طرح اقساط
 * همراه) — داده‌ها از /api/teacher/courses و فقط دوره‌های خودِ استاد.
 */
export function TeacherCoursesSection() {
  const [courses, setCourses] = React.useState<TeacherCourseRow[] | null>(null);
  const [denied, setDenied] = React.useState(false);

  // — دیالوگ ایجاد/ویرایش —
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TeacherCourseRow | null>(null);
  const [form, setForm] = React.useState<CourseFormDraft | null>(null);
  const [saving, setSaving] = React.useState(false);

  // — دیالوگ کاربران دوره (فقط مشاهده) —
  const [enrolleesCourse, setEnrolleesCourse] =
    React.useState<TeacherCourseRow | null>(null);
  const [enrollees, setEnrollees] = React.useState<TeacherEnrolleeRow[] | null>(
    null
  );
  const [enrolleesLoading, setEnrolleesLoading] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/teacher/courses", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setDenied(true);
        setCourses([]);
        toast.error(json.error ?? "دسترسی استاد ندارید.");
        return;
      }
      if (!res.ok) throw new Error();
      const json = (await res.json()) as TeacherCourseRow[];
      setCourses(Array.isArray(json) ? json : []);
      setDenied(false);
    } catch {
      setCourses([]);
      toast.error("دریافت دوره‌ها ناموفق بود؛ دوباره تلاش کنید.");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /* ————————————— کاربران دوره (فقط مشاهده) ————————————— */

  /** باز کردن دیالوگ کاربران دوره‌ی خودِ استاد — بدون هیچ امکان ویرایش */
  async function openEnrollees(course: TeacherCourseRow): Promise<void> {
    setEnrolleesCourse(course);
    setEnrollees(null);
    setEnrolleesLoading(true);
    try {
      const res = await fetch(`/api/teacher/courses/${course.id}/enrollees`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        enrollees?: TeacherEnrolleeRow[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "خطا در دریافت کاربران دوره.");
      }
      setEnrollees(Array.isArray(json.enrollees) ? json.enrollees : []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در دریافت کاربران دوره."
      );
      setEnrollees([]);
    } finally {
      setEnrolleesLoading(false);
    }
  }

  /* ————————————— ایجاد / ویرایش ————————————— */

  function openCreate() {
    setEditing(null);
    setForm({
      title: "",
      description: "",
      category: "",
      type: "online",
      level: COURSE_LEVELS[0],
      instructor: "",
      hours: "0",
      sessions: "0",
      cashTuition: "10000000",
      installmentTuition: "12000000",
      capacity: DEFAULT_CAPACITY.online,
      schedule: "",
      icon: "Sparkles",
      imageUrl: "",
      theme: "teal",
      tag: "",
      published: true,
      groups: [],
      // پیش‌فرض: سه قسط با سررسید ۳۰ روزه
      installments: buildInstallmentDates(DEFAULT_INSTALLMENT_COUNT, []),
    });
    setDialogOpen(true);
  }

  function openEdit(course: TeacherCourseRow) {
    setEditing(course);
    const template = course.installmentTemplate ?? [];
    setForm({
      title: course.title,
      description: course.description,
      category: course.category,
      type: isCourseType(course.type) ? course.type : "online",
      level: course.level,
      instructor: course.instructor,
      hours: String(course.hours),
      sessions: String(course.sessions),
      cashTuition: String(course.cashTuition),
      installmentTuition: String(course.installmentTuition),
      capacity: String(course.capacity),
      schedule: course.schedule,
      icon: course.icon,
      imageUrl: course.imageUrl ?? "",
      theme: course.theme,
      tag: course.tag ?? "",
      published: course.published,
      groups: (course.groups ?? []).map((g) => ({
        id: g.id ?? null,
        title: g.title,
        schedule: g.schedule,
        capacity: String(g.capacity),
      })),
      // قالب اقساط موجود؛ در نبود قالب، پیش‌فرض سه‌قسطی
      installments:
        template.length > 0
          ? template.map((t) => toDateInput(t.dueDate))
          : course.installmentTuition > 0
            ? buildInstallmentDates(DEFAULT_INSTALLMENT_COUNT, [])
            : [],
    });
    setDialogOpen(true);
  }

  const set = <K extends keyof CourseFormDraft>(
    key: K,
    value: CourseFormDraft[K]
  ) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  /** مجموع ظرفیت گروه‌های تعریف‌شده (نفر) */
  const groupsCapacitySum = (form?.groups ?? []).reduce(
    (sum, g) => sum + toInt(g.capacity),
    0
  );

  /**
   * تغییر نوع دوره — برای حضوری و ترکیبی، اگر گروهی تعریف نشده یک گروه
   * پیش‌فرض ساخته می‌شود؛ آنلاین گروه ندارد.
   */
  function changeType(nextType: CourseType) {
    setForm((prev) => {
      if (!prev) return prev;
      const nextGroups =
        nextType === "online"
          ? []
          : prev.groups.length === 0
            ? [
                {
                  title: faGroupTitle(1),
                  schedule: "",
                  capacity: DEFAULT_CAPACITY.inperson,
                },
              ]
            : prev.groups;
      return { ...prev, type: nextType, groups: nextGroups };
    });
  }

  /* — گروه‌های زمان‌بندی (دوره‌ی حضوری/ترکیبی) — */

  const setGroup = (index: number, patch: Partial<GroupDraft>) => {
    setForm((prev) => {
      if (!prev) return prev;
      const groups = prev.groups.map((g, i) =>
        i === index ? { ...g, ...patch } : g
      );
      return { ...prev, groups };
    });
  };

  const addGroup = () => {
    setForm((prev) => {
      if (!prev) return prev;
      const n = prev.groups.length + 1;
      return {
        ...prev,
        groups: [
          ...prev.groups,
          { title: faGroupTitle(n), schedule: "", capacity: "10" },
        ],
      };
    });
  };

  const removeGroup = (index: number) => {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, groups: prev.groups.filter((_, i) => i !== index) };
    });
  };

  /* — طرح اقساط (وقتی شهریه‌ی اقساطی مثبت است) — */

  const setInstallmentDate = (index: number, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        installments: prev.installments.map((d, i) =>
          i === index ? value : d
        ),
      };
    });
  };

  const addInstallment = () => {
    setForm((prev) => {
      if (!prev || prev.installments.length >= 36) return prev;
      return {
        ...prev,
        installments: [
          ...prev.installments,
          defaultInstallmentDate(prev.installments.length + 1),
        ],
      };
    });
  };

  const removeInstallment = () => {
    setForm((prev) => {
      if (!prev || prev.installments.length <= 1) return prev;
      return { ...prev, installments: prev.installments.slice(0, -1) };
    });
  };

  /* — ذخیره — */

  async function handleSave() {
    if (!form || saving) return;
    const title = form.title.trim();
    const description = form.description.trim();
    if (title.length < 2 || title.length > 120) {
      toast.error("عنوان دوره باید ۲ تا ۱۲۰ نویسه باشد.");
      return;
    }
    if (description.length < 5 || description.length > 600) {
      toast.error("توضیحات دوره باید بین ۵ تا ۶۰۰ نویسه باشد.");
      return;
    }

    // — گروه‌های زمان‌بندی (حضوری) —
    const groups = form.groups.map((g, i) => ({
      ...(g.id ? { id: g.id } : {}),
      title: g.title.trim(),
      schedule: g.schedule.trim(),
      capacity: toInt(g.capacity),
      sortOrder: i,
    }));
    if (groups.some((g) => g.title.length < 1 || g.title.length > 60)) {
      toast.error("عنوان هر گروه باید ۱ تا ۶۰ نویسه باشد (مثلاً: گروه ۱).");
      return;
    }
    if (groups.some((g) => g.capacity < 0)) {
      toast.error("ظرفیت گروه‌ها نمی‌تواند منفی باشد.");
      return;
    }

    const cashTuition = toInt(form.cashTuition);
    const installmentTuition = toInt(form.installmentTuition);
    const capacity =
      form.type !== "online" && groups.length > 0
        ? groups.reduce((sum, g) => sum + g.capacity, 0)
        : toInt(form.capacity);
    const numbers = {
      hours: toInt(form.hours),
      sessions: toInt(form.sessions),
      // «قیمت» همان شهریه‌ی نقدی را دنبال می‌کند (ستون price پایگاه داده)
      price: cashTuition,
      cashTuition,
      installmentTuition,
      capacity,
    };
    if (Object.values(numbers).some((n) => n < 0)) {
      toast.error("مقادیر عددی نمی‌توانند منفی باشند.");
      return;
    }
    // صفر = بدون گزینه اقساطی؛ مقدار مثبت نمی‌تواند کمتر از نقدی باشد
    if (numbers.installmentTuition > 0 && numbers.installmentTuition < numbers.cashTuition) {
      toast.error(
        "مبلغ کل اقساطی نمی‌تواند کمتر از شهریه‌ی نقدی همین دوره باشد."
      );
      return;
    }

    // — اعتبارسنجی طرح اقساط (وقتی گزینه اقساطی فعال است) —
    const installmentPlan =
      numbers.installmentTuition > 0 ? form.installments : [];
    if (numbers.installmentTuition > 0) {
      if (installmentPlan.length < 1) {
        toast.error(
          "برای دوره‌ی اقساطی، حداقل یک قسط با تاریخ سررسید تعریف کنید."
        );
        return;
      }
      for (let i = 0; i < installmentPlan.length; i++) {
        if (!installmentPlan[i]) {
          toast.error(`تاریخ سررسید قسط ${faDigits(i + 1)} را مشخص کنید.`);
          return;
        }
        if (Number.isNaN(new Date(installmentPlan[i]).getTime())) {
          toast.error(`تاریخ سررسید قسط ${faDigits(i + 1)} معتبر نیست.`);
          return;
        }
      }
    }

    const payload = {
      title,
      description,
      category: form.category.trim() || "عمومی",
      type: form.type,
      level: form.level,
      instructor: form.instructor.trim(),
      ...numbers,
      schedule: form.schedule.trim(),
      icon: form.icon,
      imageUrl: form.imageUrl.trim(),
      theme: form.theme,
      tag: form.tag.trim() || null,
      published: form.published,
      groups,
      installments: installmentPlan.map((dueDate) => ({ dueDate })),
    };

    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/teacher/courses/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/teacher/courses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "خطا در ذخیره‌ی دوره.");
      toast.success(editing ? "دوره ویرایش شد" : "دوره ایجاد شد");
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در ذخیره‌ی دوره.");
    } finally {
      setSaving(false);
    }
  }

  /* — حذف — */

  async function handleDelete(course: TeacherCourseRow) {
    try {
      const res = await fetch(`/api/teacher/courses/${course.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "خطا در حذف دوره.");
      toast.success(`دوره «${course.title}» حذف شد`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در حذف دوره.");
      throw err; // دیالوگ تأیید باز بماند
    }
  }

  const FormIcon = form ? getCourseIcon(form.icon) : null;
  const formTheme = form ? getCourseTheme(form.theme) : null;

  /* ————————————— رندر ————————————— */

  return (
    <section aria-label="دوره‌های من (استاد)" className="space-y-4">
      {/* سربرگ + دکمه‌ی ایجاد */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 sm:mb-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
            <GraduationCap className="size-5 text-teal-600 dark:text-teal-300" />
            دوره‌های من
          </h2>
          <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            {courses ? `${faDigits(courses.length)} دوره` : "…"}
          </span>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          className="h-11 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.02]"
        >
          <Plus className="size-4" />
          ایجاد دوره
        </Button>
      </div>

      {denied ? (
        <DeniedNotice />
      ) : courses === null ? (
        <CourseListSkeleton />
      ) : courses.length === 0 ? (
        <div
          className={cn(
            CARD,
            "flex flex-col items-center gap-4 px-6 py-12 text-center"
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
            <GraduationCap className="size-7 text-muted-foreground" />
          </span>
          <div>
            <p className="text-base font-black text-foreground">
              هنوز دوره‌ای نساخته‌اید
            </p>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              اولین دوره‌ی خود را بسازید — همان فرم کامل دوره‌ی مدیر با گروه‌های
              زمان‌بندی، شهریه و طرح اقساط در دسترس شماست.
            </p>
          </div>
          <Button
            type="button"
            onClick={openCreate}
            className="h-11 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.02]"
          >
            <Plus className="size-4" />
            ایجاد اولین دوره
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6">
          {courses.map((c) => (
            <TeacherCourseCard
              key={c.id}
              course={c}
              onEdit={() => openEdit(c)}
              onDelete={() => handleDelete(c)}
              onUsers={() => void openEnrollees(c)}
            />
          ))}
        </div>
      )}

      {/* ————— دیالوگ ایجاد/ویرایش دوره ————— */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          dir="rtl"
          className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl"
        >
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editing ? `ویرایش دوره «${editing.title}»` : "ایجاد دوره جدید"}
            </DialogTitle>
            <DialogDescription className="leading-6">
              اطلاعات دوره را کامل کنید؛ فیلدهای عنوان، توضیحات و نوع الزامی
              هستند. گروه‌های زمان‌بندی فقط برای دوره‌های حضوری و ترکیبی کاربرد
              دارند.
            </DialogDescription>
          </DialogHeader>

          {form && FormIcon && formTheme ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="عنوان دوره" htmlFor="tc-title">
                  <Input
                    id="tc-title"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="مثلاً: دوره جامع هوش مصنوعی"
                    maxLength={120}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="توضیحات" htmlFor="tc-description">
                  <Textarea
                    id="tc-description"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="توضیح کوتاهی درباره محتوا و نتایج دوره..."
                    className="min-h-20"
                    maxLength={600}
                  />
                </Field>
              </div>

              {/* تصویر شاخص — ورودی آدرس + پیش‌نمایش */}
              <div className="sm:col-span-2">
                <Field
                  label="تصویر دوره (اختیاری)"
                  htmlFor="tc-imageUrl"
                  hint="در کارت دوره به‌جای آیکون نمایش داده می‌شود — آدرس تصویر را وارد کنید."
                >
                  <CourseImageInput
                    value={form.imageUrl}
                    onChange={(v) => set("imageUrl", v)}
                    themeTile={formTheme.tile}
                  />
                </Field>
              </div>

              <Field label="دسته‌بندی" htmlFor="tc-category">
                <Input
                  id="tc-category"
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  placeholder="مثلاً: هوش مصنوعی"
                />
              </Field>
              <Field label="نوع دوره" htmlFor="tc-type">
                <Select
                  value={form.type}
                  onValueChange={(v) => changeType(v as CourseType)}
                >
                  <SelectTrigger id="tc-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COURSE_TYPES).map(([value, meta]) => (
                      <SelectItem key={value} value={value}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="سطح دوره" htmlFor="tc-level">
                <Select
                  value={form.level}
                  onValueChange={(v) => set("level", v)}
                >
                  <SelectTrigger id="tc-level" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COURSE_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="مدرس" htmlFor="tc-instructor">
                <Input
                  id="tc-instructor"
                  value={form.instructor}
                  onChange={(e) => set("instructor", e.target.value)}
                  placeholder="نام مدرس دوره"
                />
              </Field>
              <Field label="زمان‌بندی" htmlFor="tc-schedule">
                <Input
                  id="tc-schedule"
                  value={form.schedule}
                  onChange={(e) => set("schedule", e.target.value)}
                  placeholder="مثلاً: شنبه و سه‌شنبه، ۱۸ تا ۲۰"
                  maxLength={120}
                />
              </Field>

              {/* اعداد */}
              <div className="grid grid-cols-2 gap-4 sm:col-span-2 sm:grid-cols-3">
                <Field label="ساعت" htmlFor="tc-hours">
                  <Input
                    id="tc-hours"
                    inputMode="numeric"
                    dir="ltr"
                    value={form.hours}
                    onChange={(e) => set("hours", digitsOnly(e.target.value))}
                    className="text-left tabular-nums"
                  />
                </Field>
                <Field label="جلسات" htmlFor="tc-sessions">
                  <Input
                    id="tc-sessions"
                    inputMode="numeric"
                    dir="ltr"
                    value={form.sessions}
                    onChange={(e) => set("sessions", digitsOnly(e.target.value))}
                    className="text-left tabular-nums"
                  />
                </Field>
                <Field
                  label="ظرفیت دوره (نفر)"
                  htmlFor="tc-capacity"
                  hint={
                    form.type !== "online" && form.groups.length > 0
                      ? "مجموع ظرفیت گروه‌ها — به‌صورت خودکار محاسبه می‌شود"
                      : "صفر یعنی بدون محدودیت"
                  }
                >
                  {form.type !== "online" && form.groups.length > 0 ? (
                    <div className="flex h-9 items-center justify-between rounded-md border border-foreground/[0.08] bg-foreground/[0.02] px-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
                      <span className="text-sm font-black tabular-nums text-foreground">
                        {faDigits(groupsCapacitySum)}
                      </span>
                      <span className="text-[0.6rem] font-bold text-muted-foreground">
                        مجموع {faDigits(form.groups.length)} گروه
                      </span>
                    </div>
                  ) : (
                    <Input
                      id="tc-capacity"
                      inputMode="numeric"
                      dir="ltr"
                      value={form.capacity}
                      onChange={(e) => set("capacity", digitsOnly(e.target.value))}
                      className="text-left tabular-nums"
                    />
                  )}
                </Field>
              </div>

              {/* شهریه‌ی دوره — مبالغ پرداخت پیش‌ثبت‌نام */}
              <div className="space-y-3 rounded-xl border border-teal-500/25 bg-teal-500/[0.05] p-4 sm:col-span-2 dark:border-teal-400/20 dark:bg-teal-400/[0.05]">
                <div className="flex items-center gap-2">
                  <Banknote className="size-4 text-teal-600 dark:text-teal-300" />
                  <p className="text-xs font-black text-foreground">
                    شهریه‌ی پرداخت پیش‌ثبت‌نام این دوره
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="شهریه نقدی (تومان)"
                    htmlFor="tc-cashTuition"
                    hint="مبلغ پرداخت کامل دوره — صفر یعنی رایگان"
                  >
                    <Input
                      id="tc-cashTuition"
                      inputMode="numeric"
                      dir="ltr"
                      value={form.cashTuition}
                      onChange={(e) => set("cashTuition", digitsOnly(e.target.value))}
                      placeholder="10000000"
                      className="text-left tabular-nums"
                    />
                  </Field>
                  <Field
                    label="شهریه کل اقساطی (تومان)"
                    htmlFor="tc-installmentTuition"
                    hint="مبلغ کل در طرح اقساطی — صفر یعنی بدون گزینه اقساطی"
                  >
                    <Input
                      id="tc-installmentTuition"
                      inputMode="numeric"
                      dir="ltr"
                      value={form.installmentTuition}
                      onChange={(e) =>
                        set("installmentTuition", digitsOnly(e.target.value))
                      }
                      placeholder="12000000"
                      className="text-left tabular-nums"
                    />
                  </Field>
                </div>
              </div>

              {/* — گروه‌های زمان‌بندی (فقط دوره‌های حضوری/ترکیبی) — */}
              <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4 sm:col-span-2 dark:border-violet-400/20 dark:bg-violet-400/[0.04]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-violet-600 dark:text-violet-300" />
                    <p className="text-xs font-black text-foreground">
                      گروه‌های زمان‌بندی
                    </p>
                  </div>
                  <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.65rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                    {faDigits(form.groups.length)} گروه · مجموع ظرفیت{" "}
                    {faDigits(groupsCapacitySum)} نفر
                  </span>
                </div>
                {form.type === "online" ? (
                  <p className="flex items-start gap-2 text-[0.65rem] leading-5 text-muted-foreground">
                    <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-violet-600/70 dark:text-violet-300/70" />
                    گروه‌های زمان‌بندی فقط برای دوره‌های «حضوری» و «حضوری و
                    آنلاین» کاربرد دارند؛ دوره‌ی آنلاین گروه ندارد.
                  </p>
                ) : (
                  <p className="flex items-start gap-2 text-[0.65rem] leading-5 text-muted-foreground">
                    <UsersRound className="mt-0.5 size-3.5 shrink-0 text-violet-600/70 dark:text-violet-300/70" />
                    هر گروه زمان‌بندی و ظرفیت جداگانه دارد و متقاضی در فرم
                    پیش‌ثبت‌نام گروه دلخواه خود را انتخاب می‌کند.
                  </p>
                )}

                <div className="space-y-2.5">
                  {form.groups.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-foreground/20 bg-foreground/[0.02] px-3.5 py-3 text-[0.65rem] font-semibold leading-5 text-muted-foreground dark:border-white/20 dark:bg-white/[0.02]">
                      هنوز گروهی تعریف نشده است؛ با دکمه‌ی زیر اولین گروه
                      زمان‌بندی را اضافه کنید.
                    </p>
                  ) : (
                    form.groups.map((g, i) => {
                      const enrolled =
                        editing?.groups?.find((eg) => eg.id === g.id)
                          ?.enrolledCount ?? 0;
                      return (
                        <div
                          key={i}
                          className="grid gap-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-3 dark:border-white/[0.08] dark:bg-white/[0.02] sm:grid-cols-[130px_1fr_110px_auto] sm:items-center"
                        >
                          <div className="space-y-1">
                            <Label
                              htmlFor={`tc-group-title-${i}`}
                              className="text-[0.65rem] font-bold text-muted-foreground"
                            >
                              عنوان گروه
                            </Label>
                            <Input
                              id={`tc-group-title-${i}`}
                              value={g.title}
                              onChange={(e) =>
                                setGroup(i, { title: e.target.value })
                              }
                              placeholder={faGroupTitle(i + 1)}
                              maxLength={60}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label
                              htmlFor={`tc-group-schedule-${i}`}
                              className="text-[0.65rem] font-bold text-muted-foreground"
                            >
                              روزها و ساعت کلاس
                            </Label>
                            <Input
                              id={`tc-group-schedule-${i}`}
                              value={g.schedule}
                              onChange={(e) =>
                                setGroup(i, { schedule: e.target.value })
                              }
                              placeholder="مثلاً: دوشنبه و چهارشنبه، ۱۶ تا ۱۸"
                              maxLength={120}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label
                              htmlFor={`tc-group-capacity-${i}`}
                              className="text-[0.65rem] font-bold text-muted-foreground"
                            >
                              ظرفیت (نفر)
                            </Label>
                            <Input
                              id={`tc-group-capacity-${i}`}
                              inputMode="numeric"
                              dir="ltr"
                              value={g.capacity}
                              onChange={(e) =>
                                setGroup(i, {
                                  capacity: digitsOnly(e.target.value),
                                })
                              }
                              className="h-9 text-left tabular-nums"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2 sm:pt-5">
                            {enrolled > 0 ? (
                              <span className="rounded-full border-0 bg-violet-500/15 px-2 py-0.5 text-[0.6rem] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
                                {faDigits(enrolled)} ثبت‌نام
                              </span>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeGroup(i)}
                              className="size-9 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`حذف ${g.title || `گروه ${faDigits(i + 1)}`}`}
                              title="حذف گروه"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={addGroup}
                  disabled={form.type === "online" || form.groups.length >= 20}
                  className="w-full rounded-xl border-dashed"
                >
                  <Plus className="size-4" />
                  افزودن گروه زمان‌بندی
                </Button>
              </div>

              {/* — طرح اقساطی دوره: سررسید هر قسط — */}
              {toInt(form.installmentTuition) > 0 ? (
                <div className="space-y-4 rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4 sm:col-span-2 dark:border-violet-400/20 dark:bg-violet-400/[0.04]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-violet-600 dark:text-violet-300" />
                      <p className="text-xs font-black text-foreground">
                        طرح اقساطی این دوره — سررسید هر قسط
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={addInstallment}
                        disabled={form.installments.length >= 36}
                        aria-label="افزودن قسط"
                        title="افزودن قسط"
                        className="size-9 rounded-lg"
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={removeInstallment}
                        disabled={form.installments.length <= 1}
                        aria-label="حذف آخرین قسط"
                        title="حذف آخرین قسط"
                        className="size-9 rounded-lg"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* ردیف هر قسط: شماره + سررسید + سهم مبلغ */}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {form.installments.map((dueDate, i) => {
                      const shares = installmentShares(
                        toInt(form.installmentTuition),
                        form.installments.length
                      );
                      const amount = shares[i] ?? 0;
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-3 dark:border-white/[0.08] dark:bg-white/[0.02]"
                        >
                          <span
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-xs font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300"
                            aria-hidden
                          >
                            {faDigits(i + 1)}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <Label
                              htmlFor={`tc-inst-${i}`}
                              className="text-[0.6rem] font-bold text-muted-foreground"
                            >
                              سررسید قسط {faDigits(i + 1)}
                            </Label>
                            <JalaliDateField
                              id={`tc-inst-${i}`}
                              value={dueDate}
                              onChange={(v) => setInstallmentDate(i, v)}
                              placeholder="انتخاب سررسید..."
                              className="h-10 rounded-lg"
                              ariaLabel={`سررسید قسط ${faDigits(i + 1)} — تقویم شمسی`}
                            />
                            <p className="text-[0.6rem] font-bold leading-4 text-muted-foreground">
                              سهم:{" "}
                              <span className="tabular-nums text-foreground">
                                {faAmount(amount)} تومان
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="flex items-start gap-2 text-[0.65rem] leading-5 text-muted-foreground">
                    <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-violet-600/70 dark:text-violet-300/70" />
                    سهم مبلغ هر قسط خودکار از مبلغ کل اقساطی تقسیم می‌شود؛ این
                    تاریخ‌ها برای ثبت‌نام‌های جدید این دوره اعمال می‌شود.
                  </p>
                </div>
              ) : null}

              {/* آیکون و تم */}
              <Field label="آیکون دوره" htmlFor="tc-icon">
                <div className="flex items-center gap-3">
                  <Select value={form.icon} onValueChange={(v) => set("icon", v)}>
                    <SelectTrigger id="tc-icon" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {COURSE_ICON_OPTIONS.map((option) => {
                        const OptionIcon = getCourseIcon(option.value);
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <OptionIcon className="size-4" />
                            {option.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md ${formTheme.tile}`}
                    aria-hidden
                  >
                    <FormIcon className="size-5 text-white" strokeWidth={1.9} />
                  </span>
                </div>
              </Field>
              <Field label="تم رنگی" htmlFor="tc-theme">
                <div className="flex items-center gap-3">
                  <Select value={form.theme} onValueChange={(v) => set("theme", v)}>
                    <SelectTrigger id="tc-theme" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_THEME_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span
                            className={`size-3.5 rounded-full bg-gradient-to-br ${option.tile}`}
                            aria-hidden
                          />
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span
                    className={`size-10 shrink-0 rounded-xl bg-gradient-to-br shadow-md ${formTheme.tile}`}
                    aria-hidden
                  />
                </div>
              </Field>

              <div className="sm:col-span-2">
                <Field label="برچسب ویژه" htmlFor="tc-tag">
                  <Input
                    id="tc-tag"
                    value={form.tag}
                    onChange={(e) => set("tag", e.target.value)}
                    placeholder="مثلاً: پرمخاطب — خالی = بدون برچسب"
                    maxLength={40}
                  />
                </Field>
              </div>

              {/* وضعیت انتشار */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-3.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
                  <div className="min-w-0">
                    <Label
                      htmlFor="tc-published"
                      className="text-xs font-black text-foreground"
                    >
                      وضعیت انتشار
                    </Label>
                    <p className="mt-1 text-[0.65rem] leading-5 text-muted-foreground">
                      دوره‌ی منتشرشده در فرم پیش‌ثبت‌نام سایت نمایش داده می‌شود؛
                      پیش‌نویس فقط برای شما دیده می‌شود.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[0.65rem] font-black text-muted-foreground">
                      {form.published ? "منتشرشده" : "پیش‌نویس"}
                    </span>
                    <Switch
                      id="tc-published"
                      checked={form.published}
                      onCheckedChange={(v) => set("published", v)}
                      aria-label="وضعیت انتشار دوره"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-2 flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-10 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-6 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01]"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {editing ? "ذخیره‌ی تغییرات" : "ایجاد دوره"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="h-10 rounded-xl px-4 text-xs font-bold"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ————— دیالوگ کاربران دوره (فقط مشاهده — بدون ویرایش) ————— */}
      <Dialog
        open={!!enrolleesCourse}
        onOpenChange={(open) => !open && setEnrolleesCourse(null)}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl"
        >
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              کاربران دوره «{enrolleesCourse?.title}»
            </DialogTitle>
            <DialogDescription>
              {enrolleesCourse
                ? `${faDigits(enrolleesCourse.enrolledCount ?? 0)} ثبت‌نام در این دوره — این لیست فقط برای مشاهده است و اطلاعات کاربران قابل ویرایش نیست.`
                : "کاربران دوره"}
            </DialogDescription>
          </DialogHeader>

          {enrolleesLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/15 py-10 text-sm font-bold text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              در حال دریافت کاربران...
            </div>
          ) : !enrollees || enrollees.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/15 py-10 text-center">
              <UsersRound className="size-6 text-muted-foreground" />
              <p className="text-sm font-bold text-foreground">
                هنوز کسی در این دوره ثبت‌نام نکرده است
              </p>
              <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                با انتشار دوره، کاربران از فرم «ثبت‌نام در دوره‌ها»‌ی سایت در آن
                ثبت‌نام می‌کنند و اینجا دیده می‌شوند.
              </p>
            </div>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto pe-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20">
              {enrollees.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-foreground/[0.02] p-3 dark:bg-white/[0.02]"
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 text-sm font-black text-teal-950"
                    aria-hidden
                  >
                    {e.firstName.charAt(0) || "؟"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {e.firstName} {e.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span dir="ltr" className="tabular-nums">
                        {faDigits(e.phone)}
                      </span>
                      {e.user?.nationalId ? (
                        <>
                          <span className="mx-1.5" aria-hidden>
                            ·
                          </span>
                          <span dir="ltr" className="tabular-nums">
                            {faDigits(e.user.nationalId)}
                          </span>
                        </>
                      ) : null}
                      <span className="mx-1.5" aria-hidden>
                        ·
                      </span>
                      ثبت‌نام: {faDate(e.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "select-none whitespace-nowrap border px-2 py-0 text-[0.6rem] font-black",
                        isEnrollmentStatus(e.status)
                          ? ENROLLMENT_STATUSES[e.status].badge
                          : "border-foreground/15 bg-foreground/5 text-muted-foreground"
                      )}
                    >
                      {isEnrollmentStatus(e.status)
                        ? ENROLLMENT_STATUSES[e.status].label
                        : e.status}
                    </Badge>
                    {e.groupTitle ? (
                      <span className="select-none whitespace-nowrap rounded-full border border-border bg-foreground/[0.03] px-2 py-0 text-[0.6rem] font-black text-muted-foreground dark:bg-white/[0.03]">
                        {e.groupTitle}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter className="mt-2 flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEnrolleesCourse(null)}
              className="h-10 rounded-xl px-4 text-xs font-bold"
            >
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ————————————————— کارت دوره‌ی استاد ————————————————— */

function TeacherCourseCard({
  course,
  onEdit,
  onDelete,
  onUsers,
}: {
  course: TeacherCourseRow;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  /** باز کردن دیالوگ کاربران دوره (فقط مشاهده) */
  onUsers: () => void;
}) {
  const theme = getCourseTheme(course.theme);
  const Icon = getCourseIcon(course.icon);
  const typeMeta = isCourseType(course.type) ? COURSE_TYPES[course.type] : null;
  const enrolled = course.enrolledCount ?? 0;
  const groupsCount = course.groups?.length ?? 0;

  return (
    <article className={CARD}>
      {/* عنوان + آیکون تم + وضعیت انتشار */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-foreground/[0.07] pb-3 dark:border-white/[0.07]">
        <div className="flex min-w-0 items-start gap-3">
          {course.imageUrl ? (
            <span
              className={`relative size-11 shrink-0 overflow-hidden rounded-xl border shadow-md ${theme.border}`}
              aria-hidden
            >
              <Image
                src={course.imageUrl}
                alt=""
                fill
                sizes="44px"
                className="object-cover"
              />
            </span>
          ) : (
            <span
              className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md ${theme.tile}`}
              aria-hidden
            >
              <Icon className="size-5 text-white" strokeWidth={1.9} />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-base font-black leading-7 text-foreground sm:text-lg">
              {course.title}
            </h3>
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
              {course.description || "بدون توضیحات"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex select-none items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.6rem] font-black",
              course.published
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
            )}
          >
            {course.published ? "منتشرشده" : "پیش‌نویس"}
          </span>
          {typeMeta ? (
            <span
              className={cn(
                "inline-flex select-none items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.6rem] font-black",
                typeMeta.badge
              )}
            >
              {typeMeta.label}
            </span>
          ) : null}
        </div>
      </div>

      {/* چیپ‌های دسته/سطح/گروه + ثبت‌نام */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {course.category ? (
          <span className="select-none rounded-full border border-border bg-foreground/[0.03] px-2.5 py-0.5 text-[0.6rem] font-black text-muted-foreground dark:bg-white/[0.03]">
            {course.category}
          </span>
        ) : null}
        <span className="select-none rounded-full border border-violet-500/30 bg-violet-500/[0.07] px-2.5 py-0.5 text-[0.6rem] font-black text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/[0.08] dark:text-violet-300">
          {course.level}
        </span>
        {course.tag ? (
          <span className="select-none rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[0.6rem] font-black text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
            {course.tag}
          </span>
        ) : null}
        <span className="flex select-none items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[0.6rem] font-black text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300">
          <UsersRound className="size-3" />
          {faDigits(enrolled)} ثبت‌نام
        </span>
        {groupsCount > 0 ? (
          <span className="select-none rounded-full border border-border bg-foreground/[0.03] px-2.5 py-0.5 text-[0.6rem] font-black text-muted-foreground dark:bg-white/[0.03]">
            {faDigits(groupsCount)} گروه
          </span>
        ) : null}
      </div>

      {/* فراداده — ساعت/جلسات + شهریه‌ها */}
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <InfoRow label="ساعت و جلسات">
          <span className="flex items-center gap-1.5 tabular-nums">
            <Clock className="size-3.5 text-muted-foreground" />
            {faDigits(course.hours)} ساعت · {faDigits(course.sessions)} جلسه
          </span>
        </InfoRow>
        {course.schedule ? (
          <InfoRow label="زمان‌بندی">{course.schedule}</InfoRow>
        ) : null}
        <InfoRow label="شهریه نقدی">
          <span className="tabular-nums">
            {faAmount(course.cashTuition)} تومان
          </span>
        </InfoRow>
        {course.installmentTuition > 0 ? (
          <InfoRow label="شهریه اقساطی">
            <span className="tabular-nums">
              {faAmount(course.installmentTuition)} تومان
            </span>
          </InfoRow>
        ) : null}
        <InfoRow label="ظرفیت">
          {course.capacity > 0 ? (
            <span className="tabular-nums">
              {faDigits(course.capacity)} نفر
            </span>
          ) : (
            "بدون محدودیت"
          )}
        </InfoRow>
        {course.instructor ? (
          <InfoRow label="مدرس">{course.instructor}</InfoRow>
        ) : null}
      </dl>

      {/* عملیات — همیشه در دسترس لمسی */}
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onUsers}
          aria-label={`کاربران دوره ${course.title}`}
          className="h-11 rounded-xl px-5 text-xs font-bold"
        >
          <Eye className="size-4" />
          کاربران
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEdit}
          aria-label={`ویرایش دوره ${course.title}`}
          className="h-11 rounded-xl px-5 text-xs font-bold"
        >
          <Pencil className="size-4" />
          ویرایش
        </Button>
        <ConfirmDelete
          title={`حذف دوره «${course.title}»`}
          description="این دوره همراه با گروه‌ها و طرح اقساط آن برای همیشه حذف می‌شود. مطمئن هستید؟"
          onConfirm={onDelete}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 rounded-xl border-destructive/30 px-5 text-xs font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`حذف دوره ${course.title}`}
          >
            <Trash2 className="size-4" />
            حذف
          </Button>
        </ConfirmDelete>
      </div>
    </article>
  );
}

/* ————————————————— اجزای فرم ————————————————— */

/** ردیف فراداده — برچسب کم‌رنگ + مقدار پررنگ (هم‌سبک داشبورد) */
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] px-3.5 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.02]">
      <dt className="shrink-0 select-none text-[0.7rem] font-bold text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-left text-sm font-bold text-foreground">
        {children}
      </dd>
    </div>
  );
}

/** برچسب فیلد فرم + راهنمای اختیاری */
function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p className="text-[0.7rem] leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** ورودی آدرس تصویر دوره با پیش‌نمایش زنده و کاشی جایگزین در خطا */
function CourseImageInput({
  value,
  onChange,
  themeTile,
}: {
  value: string;
  onChange: (v: string) => void;
  themeTile: string;
}) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const trimmed = value.trim();
  const failed = failedSrc !== null && failedSrc === trimmed;

  return (
    <div className="flex items-start gap-3">
      {trimmed ? (
        failed ? (
          <div
            className="flex size-[90px] shrink-0 items-center justify-center rounded-2xl border border-dashed border-border bg-foreground/[0.02]"
            title="تصویر در دسترس نیست"
          >
            <ImageIcon className="size-5 text-muted-foreground" />
          </div>
        ) : (
          <div className="relative size-[90px] w-40 shrink-0 overflow-hidden rounded-2xl border border-border bg-foreground/[0.03]">
            <Image
              src={trimmed}
              alt="پیش‌نمایش تصویر دوره"
              fill
              sizes="160px"
              className="object-cover"
              onError={() => setFailedSrc(trimmed)}
            />
          </div>
        )
      ) : (
        <div
          className={`flex size-[90px] w-40 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md ${themeTile}`}
          title="بدون تصویر — آیکون دوره نمایش داده می‌شود"
          aria-hidden
        >
          <ImageIcon className="size-6 text-white" strokeWidth={1.9} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Input
          id="tc-imageUrl"
          dir="ltr"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setFailedSrc(null);
          }}
          placeholder="https://example.com/course.jpg"
          className="text-left"
          autoComplete="off"
        />
        <p className="mt-1.5 text-[0.65rem] leading-5 text-muted-foreground">
          آدرس تصویر شاخص دوره — خالی بماند، کاشی آیکون و تم رنگی نمایش داده
          می‌شود.
        </p>
      </div>
    </div>
  );
}

/* ————————————————— حالت‌های بارگذاری/دسترسی ————————————————— */

/** اسکلت لیست دوره‌ها — هم‌اندازه کارت نهایی */
function CourseListSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6" aria-hidden>
      {[0, 1, 2].map((k) => (
        <div key={k} className={cn(CARD, "animate-pulse space-y-3")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-11 animate-pulse rounded-xl bg-foreground/10 dark:bg-white/10" />
              <div className="h-5 w-48 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-foreground/10 dark:bg-white/10" />
          </div>
          <div className="h-3 w-full animate-pulse rounded bg-foreground/[0.07] dark:bg-white/[0.07]" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-foreground/[0.07] dark:bg-white/[0.07]" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="h-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
            <div className="h-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** کارت اعلان «دسترسی استاد ندارید» — 401/403 */
function DeniedNotice() {
  return (
    <div
      className={cn(
        CARD,
        "flex flex-col items-center gap-3 px-6 py-10 text-center"
      )}
      role="alert"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 dark:bg-amber-400/10">
        <ShieldAlert className="size-6 text-amber-600 dark:text-amber-300" />
      </span>
      <p className="text-sm font-black text-foreground">دسترسی استاد ندارید</p>
      <p className="max-w-sm text-xs leading-6 text-muted-foreground">
        این بخش فقط برای حساب‌های استاد فعال است؛ برای فعال‌سازی دسترسی استاد
        با پشتیبانی تماس بگیرید.
      </p>
    </div>
  );
}
