"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, GraduationCap, Loader2, Pencil, Plus, Search, Trash2, Banknote, CalendarClock, Armchair, CalendarDays, UsersRound, Columns3 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { CourseAttendancePage } from "@/components/admin/shared/course-attendance";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ImageUrlField, OptionalImage } from "@/components/admin/shared/image-url-field";
import { JalaliDateField } from "@/components/admin/shared/jalali-date-field";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { PublishSwitch } from "@/components/admin/shared/publish-switch";
import { PublishStatusSelect } from "@/components/admin/shared/publish-status-select";
import {
  SortableCard,
  SortableRows,
  SortableTableRow,
} from "@/components/admin/shared/sortable-rows";
import { btnGradient } from "@/components/admin/shared/styles";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import type {
  Course,
  CourseWithUsage,
} from "@/components/admin/types";
import {
  COURSE_ICON_OPTIONS,
  COURSE_LEVELS,
  COURSE_THEME_OPTIONS,
  COURSE_TYPES,
  getCourseIcon,
  getCourseTheme,
  isCourseType,
  type CourseType,
} from "@/lib/course-theme";
import { faDigits } from "@/lib/fa";

/** پیش‌نویس گروه زمانی در فرم دوره (همه‌چیز رشته؛ هنگام ذخیره تبدیل می‌شود) */
interface GroupDraft {
  /** شناسه‌ی گروه موجود — فقط هنگام ویرایش (برای حفظ ثبت‌نام‌ها) */
  id?: string | null;
  title: string;
  schedule: string;
  capacity: string;
}

/** فرم دوره — همه‌ی ورودی‌ها رشته هستند و هنگام ذخیره تبدیل می‌شوند */
interface CourseForm {
  title: string;
  description: string;
  category: string;
  type: CourseType;
  level: string;
  instructor: string;
  hours: string;
  sessions: string;
  price: string;
  cashTuition: string;
  installmentTuition: string;
  capacity: string;
  sortOrder: string;
  schedule: string;
  icon: string;
  /** تصویر شاخص دوره (آپلود یا آدرس) — خالی یعنی آیکون */
  imageUrl: string;
  theme: string;
  tag: string;
  published: boolean;
  /** گروه‌های زمان‌بندی — برای دوره‌های حضوری و ترکیبی (حضوری و آنلاین) */
  groups: GroupDraft[];
  /** تاریخ سررسید هر قسط (YYYY-MM-DD) — فقط وقتی شهریه‌ی اقساطی مثبت است */
  installments: string[];
}

type TypeFilter = "all" | CourseType;

/* — نمایش/مخفی‌کردن ستون‌های جدول (با ماندگاری در localStorage) — */

type ColKey =
  | "type"
  | "level"
  | "price"
  | "sessions"
  | "capacity"
  | "sortOrder"
  | "published";

interface ColumnDef {
  key: ColKey;
  label: string;
  /** ستون‌های پیش‌فرضِ مخفی: جلسات و ظرفیت */
  defaultVisible: boolean;
}

const COURSE_COLUMNS: ColumnDef[] = [
  { key: "type", label: "نوع", defaultVisible: true },
  { key: "level", label: "سطح", defaultVisible: true },
  { key: "price", label: "قیمت", defaultVisible: true },
  { key: "sessions", label: "جلسات", defaultVisible: false },
  { key: "capacity", label: "ظرفیت", defaultVisible: false },
  { key: "sortOrder", label: "ترتیب", defaultVisible: true },
  { key: "published", label: "وضعیت", defaultVisible: true },
];

const COLS_STORAGE_KEY = "avid_admin_course_cols";

const defaultVisibleCols = (): Record<ColKey, boolean> =>
  Object.fromEntries(
    COURSE_COLUMNS.map((c) => [c.key, c.defaultVisible])
  ) as Record<ColKey, boolean>;

function toInt(v: string): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
const faAmount = (n: number) => faDigits(n.toLocaleString("en-US"));

/** پیش‌فرض ظرفیت بر اساس نوع دوره (نفر) */
const DEFAULT_CAPACITY: Record<CourseType, string> = {
  inperson: "10",
  online: "20",
  hybrid: "20",
};

/** عنوان گروه بعدی بر اساس شمارش موجود */
const faGroupTitle = (n: number) => `گروه ${faDigits(n)}`;

/** — پیش‌فرض تعداد اقساط دوره (طبق طرح سایت: سه‌قسطی) — */
const DEFAULT_INSTALLMENT_COUNT = 3;

/** تبدیل تاریخ به قالب ورودی date (YYYY-MM-DD) */
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
function buildInstallmentDates(
  count: number,
  existing: string[]
): string[] {
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
function installmentShares(
  total: number,
  count: number
): number[] {
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

/** ماژول دوره‌ها — مدیریت دوره‌های آنلاین، حضوری و ترکیبی */
export function CoursesModule() {
  const [courses, setCourses] = useState<CourseWithUsage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");

  // — نمایش/مخفی‌کردن ستون‌ها (جلسات و ظرفیت به‌طور پیش‌فرض مخفی) —
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(
    defaultVisibleCols
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Record<ColKey, boolean>>;
      setVisibleCols((prev) => ({ ...prev, ...saved }));
    } catch {
      // مقدار ذخیره‌شده خراب است — همان پیش‌فرض‌ها اعمال می‌شود
    }
  }, []);

  function toggleCol(key: ColKey) {
    setVisibleCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ذخیره‌سازی محلی در دسترس نیست — فقط همین نشست اعمال می‌شود
      }
      return next;
    });
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CourseWithUsage | null>(null);
  const [form, setForm] = useState<CourseForm | null>(null);
  const [saving, setSaving] = useState(false);

  // — دوره‌ی انتخاب‌شده برای صفحه‌ی حضور و غیاب —
  const [attendanceCourse, setAttendanceCourse] = useState<CourseWithUsage | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setCourses(await apiFetch<CourseWithUsage[]>("/api/admin/courses"));
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!courses) return [];
    const q = search.trim();
    return courses.filter((c) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (q && !c.title.includes(q) && !c.instructor.includes(q)) return false;
      return true;
    });
  }, [courses, typeFilter, search]);

  // — صفحه‌ی حضور و غیاب — با کلیک روی هر دوره باز می‌شود و با «بازگشت» به لیست برمی‌گردد
  if (attendanceCourse) {
    return (
      <CourseAttendancePage
        course={attendanceCourse}
        onBack={() => setAttendanceCourse(null)}
      />
    );
  }

  function openCreate() {
    setEditing(null);
    const nextOrder = courses ? courses.length + 1 : 1;
    setForm({
      title: "",
      description: "",
      category: "",
      type: "online",
      level: COURSE_LEVELS[0],
      instructor: "",
      hours: "0",
      sessions: "0",
      price: "0",
      cashTuition: "10000000",
      installmentTuition: "12000000",
      capacity: DEFAULT_CAPACITY.online,
      sortOrder: String(nextOrder),
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

  function openEdit(course: CourseWithUsage) {
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
      price: String(course.price),
      cashTuition: String(course.cashTuition),
      installmentTuition: String(course.installmentTuition),
      capacity: String(course.capacity),
      sortOrder: String(course.sortOrder),
      schedule: course.schedule,
      icon: course.icon,
      imageUrl: course.imageUrl ?? "",
      theme: course.theme,
      tag: course.tag ?? "",
      published: course.published,
      groups: (course.groups ?? []).map((g) => ({
        id: g.id,
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

  const set = <K extends keyof CourseForm>(key: K, value: CourseForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  /* — گروه‌های زمان‌بندی (دوره‌ی حضوری) — */

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
          {
            title: faGroupTitle(n),
            schedule: "",
            capacity: "10",
          },
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

  /* — طرح اقساط دوره (وقتی شهریه‌ی اقساطی مثبت است) — */

  /** تغییر تعداد اقساط — مقادیر موجود حفظ و ردیف‌های جدید پیش‌فرض می‌شوند */
  function setInstallmentCount(nextCount: number) {
    const count = Math.min(36, Math.max(1, nextCount || 1));
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        installments: buildInstallmentDates(count, prev.installments),
      };
    });
  }

  /** تغییر تاریخ سررسید یک قسط */
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

  /** افزودن یک قسط دیگر (حداکثر ۳۶) */
  function addInstallment() {
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
  }

  /** حذف آخرین قسط (حداقل ۱) */
  function removeInstallment() {
    setForm((prev) => {
      if (!prev || prev.installments.length <= 1) return prev;
      return {
        ...prev,
        installments: prev.installments.slice(0, -1),
      };
    });
  }

  /** مجموع ظرفیت گروه‌های تعریف‌شده (نفر) */
  const groupsCapacitySum = (form?.groups ?? []).reduce(
    (sum, g) => sum + toInt(g.capacity),
    0
  );

  /**
   * تغییر نوع دوره در حالت «ایجاد» — اگر ظرفیت هنوز دست‌کاری نشده باشد
   * (۰ یا یکی از پیش‌فرض‌ها)، به پیش‌فرض نوع جدید می‌رود: حضوری ۱۰ / آنلاین ۲۰.
   * برای حضوری و ترکیبی، اگر گروهی تعریف نشده یک گروه پیش‌فرض ساخته می‌شود.
   */
  function changeType(nextType: CourseType) {
    if (!form) return;
    // آنلاین گروه ندارد؛ حضوری و ترکیبی گروه‌دار می‌شوند (گروه پیش‌فرض در نبود گروه)
    const nextGroups =
      nextType === "online"
        ? []
        : form.groups.length === 0
          ? [{ title: faGroupTitle(1), schedule: "", capacity: DEFAULT_CAPACITY.inperson }]
          : form.groups;
    setForm({
      ...form,
      type: nextType,
      groups: nextGroups,
    });
    if (!editing) {
      const untouched = ["0", ...Object.values(DEFAULT_CAPACITY)].includes(
        form.capacity
      );
      if (untouched) set("capacity", DEFAULT_CAPACITY[nextType]);
    }
  }

  /** تغییر انتشار دوره — بهینه‌با روال آپدیت + بازگشت در صورت خطا */
  async function togglePublish(course: Course, next: boolean) {
    setCourses(
      (prev) =>
        prev?.map((c) => (c.id === course.id ? { ...c, published: next } : c)) ??
        prev
    );
    try {
      await apiFetch<Course>(`/api/admin/courses/${course.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...course, published: next }),
      });
      toast.success(
        next
          ? "دوره فعال شد و در فرم پیش‌ثبت‌نام نمایش داده می‌شود"
          : "دوره غیرفعال شد و از فرم پیش‌ثبت‌نام حذف می‌شود"
      );
    } catch (error) {
      setCourses(
        (prev) =>
          prev?.map(
            (c) => (c.id === course.id ? { ...c, published: course.published } : c)
          ) ?? prev
      );
      toastApiError(error);
    }
  }

  async function handleDelete(course: Course) {
    try {
      await apiFetch(`/api/admin/courses/${course.id}`, { method: "DELETE" });
      toast.success(`دوره «${course.title}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error; // دیالوگ تأیید باز بماند
    }
  }

  /* ————— جابه‌جایی با کشیدن و رها کردن ————— */

  // فقط وقتی هیچ فیلتر/جستجویی فعال نیست، ترتیب قابل تغییر است
  const canReorder = typeFilter === "all" && search.trim() === "";

  /** ذخیره‌ی ترتیب جدید دوره‌ها — به‌روی کور محلی، در خطا بازگشت */
  async function handleReorder(orderedIds: string[]): Promise<void> {
    const prev = courses;
    if (!prev) return;
    const byId = new Map(prev.map((c) => [c.id, c]));
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((c): c is CourseWithUsage => c !== undefined);
    setCourses(next);
    try {
      await apiFetch("/api/admin/courses/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: orderedIds }),
      });
      toast.success("ترتیب دوره‌ها ذخیره شد.");
    } catch (error) {
      toastApiError(error);
      setCourses(prev);
    }
  }

  async function handleSave() {
    if (!form || saving) return;
    const title = form.title.trim();
    const description = form.description.trim();
    if (title.length < 2 || title.length > 120) {
      toast.error("عنوان دوره باید بین ۲ تا ۱۲۰ نویسه باشد.");
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

    const numbers = {
      hours: toInt(form.hours),
      sessions: toInt(form.sessions),
      // «کارآموزان» از فرم حذف شده — عدد نمایشی فعلی حفظ می‌شود (ایجاد = ۰)
      students: editing ? editing.students : 0,
      price: toInt(form.price),
      cashTuition: toInt(form.cashTuition),
      installmentTuition: toInt(form.installmentTuition),
      capacity:
        form.type !== "online" && groups.length > 0
          ? groups.reduce((sum, g) => sum + g.capacity, 0)
          : toInt(form.capacity),
      sortOrder: toInt(form.sortOrder),
    };
    if (Object.values(numbers).some((n) => n < 0)) {
      toast.error("مقادیر عددی نمی‌توانند منفی باشند.");
      return;
    }
    // صفر = بدون گزینه اقساطی؛ مقدار مثبت نمی‌تواند کمتر از نقدی باشد
    if (
      numbers.installmentTuition > 0 &&
      numbers.installmentTuition < numbers.cashTuition
    ) {
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
          toast.error(
            `تاریخ سررسید قسط ${faDigits(i + 1)} را مشخص کنید.`
          );
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
      if (editing) {
        await apiFetch<Course>(`/api/admin/courses/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("دوره با موفقیت ویرایش شد");
      } else {
        await apiFetch<Course>("/api/admin/courses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("دوره جدید ایجاد شد");
      }
      setDialogOpen(false);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  const FormIcon = form ? getCourseIcon(form.icon) : null;
  const formTheme = form ? getCourseTheme(form.theme) : null;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="دوره‌ها"
        description="مدیریت دوره‌های آنلاین، حضوری و ترکیبی آکادمی — ایجاد، ویرایش، انتشار و حذف."
      >
        <Button
          onClick={openCreate}
          className={`rounded-xl ${btnGradient}`}
        >
          <Plus className="size-4" />
          افزودن دوره
        </Button>
      </ModuleHeader>

      {/* فیلترها */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as TypeFilter)}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="فیلتر نوع دوره">
            <SelectValue placeholder="نوع دوره" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه دوره‌ها</SelectItem>
            <SelectItem value="online">آنلاین</SelectItem>
            <SelectItem value="inperson">حضوری</SelectItem>
            <SelectItem value="hybrid">حضوری و آنلاین</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی عنوان یا مدرس..."
            className="ps-10"
            aria-label="جستجوی دوره"
          />
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <p className="text-xs text-muted-foreground">
            {faDigits(filtered.length)} دوره
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs font-bold"
                aria-label="نمایش و مخفی‌کردن ستون‌های جدول"
              >
                <Columns3 className="size-4" />
                ستون‌ها
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {COURSE_COLUMNS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={visibleCols[col.key]}
                  onCheckedChange={() => toggleCol(col.key)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs"
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* جدول (دسکتاپ) + کارت (موبایل) */}
      {loading && !courses ? (
        <>
          <div className="hidden md:block">
            <TableSkeleton rows={5} cols={8} />
          </div>
          <div className="space-y-3 md:hidden" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass h-28 animate-pulse rounded-2xl" />
            ))}
          </div>
        </>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="دوره‌ای یافت نشد"
          description={
            courses && courses.length > 0
              ? "فیلترها را تغییر دهید یا عبارت دیگری جستجو کنید."
              : "هنوز دوره‌ای ثبت نشده است؛ اولین دوره آموزشی را ایجاد کنید."
          }
        >
          {(!courses || courses.length === 0) && (
            <Button onClick={openCreate} size="sm" className={`rounded-xl ${btnGradient}`}>
              <Plus className="size-4" />
              افزودن اولین دوره
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          {/* — جدول دسکتاپ — */}
          <SortableRows
            ids={filtered.map((c) => c.id)}
            onReorder={(ids) => void handleReorder(ids)}
            disabled={!canReorder}
          >
          <div className="glass hidden overflow-hidden rounded-2xl md:block">
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canReorder ? (
                      <TableHead className="w-10">
                        <span className="sr-only">تغییر ترتیب</span>
                      </TableHead>
                    ) : null}
                    <TableHead>دوره</TableHead>
                    {visibleCols.type ? <TableHead>نوع</TableHead> : null}
                    {visibleCols.level ? <TableHead>سطح</TableHead> : null}
                    {visibleCols.price ? <TableHead>قیمت</TableHead> : null}
                    {visibleCols.sessions ? <TableHead>جلسات</TableHead> : null}
                    {visibleCols.capacity ? <TableHead>ظرفیت</TableHead> : null}
                    {visibleCols.sortOrder ? <TableHead>ترتیب</TableHead> : null}
                    {visibleCols.published ? <TableHead>وضعیت</TableHead> : null}
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((course) => {
                    const type =
                      COURSE_TYPES[isCourseType(course.type) ? course.type : "online"];
                    const TypeIcon = type.icon;
                    const theme = getCourseTheme(course.theme);
                    const Icon = getCourseIcon(course.icon);
                    return (
                      <SortableTableRow key={course.id} id={course.id} enabled={canReorder}>
                        <TableCell className="max-w-56 p-1">
                          {/* عنوان دوره — کلیک: صفحه‌ی حضور و غیاب */}
                          <button
                            type="button"
                            onClick={() => setAttendanceCourse(course)}
                            title="حضور و غیاب دوره"
                            aria-label={`حضور و غیاب دوره ${course.title}`}
                            className="group flex w-full items-center gap-3 rounded-xl p-1 text-start outline-none transition-colors hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {course.imageUrl?.trim() ? (
                              <OptionalImage
                                src={course.imageUrl}
                                alt={`تصویر دوره ${course.title}`}
                                fallback={
                                  <span
                                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md ${theme.tile}`}
                                  >
                                    <Icon className="size-5 text-white" strokeWidth={1.9} />
                                  </span>
                                }
                                sizes="40px"
                                className="size-10 shrink-0 rounded-xl border border-border shadow-md"
                              />
                            ) : (
                              <span
                                className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md ${theme.tile}`}
                              >
                                <Icon className="size-5 text-white" strokeWidth={1.9} />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-300">
                                {course.title}
                              </p>
                              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                {course.category}
                                <ClipboardCheck
                                  className="size-3 shrink-0 text-teal-500/70 opacity-0 transition-opacity group-hover:opacity-100 dark:text-teal-300/70"
                                  aria-hidden
                                />
                              </p>
                            </div>
                          </button>
                        </TableCell>
                        {visibleCols.type ? (
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.65rem] font-bold ${type.badge}`}
                            >
                              <TypeIcon className="size-3" />
                              {type.label}
                            </Badge>
                          </TableCell>
                        ) : null}
                        {visibleCols.level ? (
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {course.level}
                          </TableCell>
                        ) : null}
                        {visibleCols.price ? (
                          <TableCell>
                            <div className="space-y-0.5">
                              {course.price === 0 ? (
                                <Badge className="rounded-full border-0 bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-black text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                                  رایگان
                                </Badge>
                              ) : (
                                <span className="whitespace-nowrap text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                  {faAmount(course.price)}{" "}
                                  <span className="text-[0.6rem] font-medium text-muted-foreground">
                                    تومان
                                  </span>
                                </span>
                              )}
                              {/* شهریه‌ی اختصاصی پیش‌ثبت‌نام */}
                              <p
                                className="whitespace-nowrap text-[0.6rem] font-semibold text-muted-foreground"
                                title="شهریه نقدی و کل اقساطی همین دوره"
                              >
                                {course.cashTuition > 0 ||
                                course.installmentTuition > 0 ? (
                                  <>
                                    شهریه: نقدی {faAmount(course.cashTuition)}
                                    {course.installmentTuition > 0
                                      ? ` · اقساطی ${faAmount(
                                          course.installmentTuition
                                        )} (${
                                          (course.installmentTemplate?.length ?? 0) > 0
                                            ? `${faDigits(
                                                course.installmentTemplate!.length
                                              )} قسط`
                                            : "پیش‌فرض"
                                        })`
                                      : ""}
                                  </>
                                ) : (
                                  "بدون شهریه"
                                )}
                              </p>
                            </div>
                          </TableCell>
                        ) : null}
                        {visibleCols.sessions ? (
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {faDigits(course.sessions)} جلسه ·{" "}
                            {faDigits(course.hours)} ساعت
                          </TableCell>
                        ) : null}
                        {visibleCols.capacity ? (
                          <TableCell>
                            {(course.type !== "online" &&
                              (course.groups?.length ?? 0) > 0) ||
                            course.capacity > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="whitespace-nowrap text-xs font-bold tabular-nums text-foreground"
                                  title={
                                    course.groups?.length
                                      ? course.groups
                                          .map(
                                            (g) =>
                                              `${g.title}${g.schedule ? ` (${g.schedule})` : ""}: ${faDigits(g.enrolledCount ?? 0)}/${faDigits(g.capacity)}`
                                          )
                                          .join(" · ")
                                      : undefined
                                  }
                                >
                                  <span
                                    className={
                                      (course.enrolledCount ?? 0) >= course.capacity &&
                                      course.capacity > 0
                                        ? "text-red-600 dark:text-red-400"
                                        : undefined
                                    }
                                  >
                                    {faDigits(course.enrolledCount ?? 0)}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {" / "}
                                    {faDigits(course.capacity)}
                                  </span>
                                </span>
                                {course.groups?.length ? (
                                  <Badge className="rounded-full border-0 bg-violet-500/15 px-2 py-0.5 text-[0.6rem] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" title="گروه‌های زمان‌بندی این دوره">
                                    {faDigits(course.groups.length)} گروه
                                  </Badge>
                                ) : null}
                                {course.capacity > 0 &&
                                (course.enrolledCount ?? 0) >= course.capacity ? (
                                  <Badge className="rounded-full border-0 bg-red-500/15 px-2 py-0.5 text-[0.6rem] font-black text-red-700 dark:bg-red-400/15 dark:text-red-300">
                                    <Armchair className="size-3" />
                                    تکمیل
                                  </Badge>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                بدون محدودیت
                              </span>
                            )}
                          </TableCell>
                        ) : null}
                        {visibleCols.sortOrder ? (
                          <TableCell className="text-xs text-muted-foreground">
                            {faDigits(course.sortOrder)}
                          </TableCell>
                        ) : null}
                        {visibleCols.published ? (
                          <TableCell>
                            <PublishSwitch
                              published={course.published}
                              onToggle={(next) => togglePublish(course, next)}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className="text-left">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setAttendanceCourse(course)}
                              aria-label={`حضور و غیاب دوره ${course.title}`}
                              title="حضور و غیاب"
                              className="text-teal-600 hover:bg-teal-500/10 hover:text-teal-700 dark:text-teal-300 dark:hover:bg-teal-400/10 dark:hover:text-teal-200"
                            >
                              <ClipboardCheck className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(course)}
                              aria-label={`ویرایش دوره ${course.title}`}
                              title="ویرایش"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <ConfirmDelete
                              title="حذف دوره"
                              description="این دوره برای همیشه حذف می‌شود. مطمئن هستید؟"
                              onConfirm={() => handleDelete(course)}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`حذف دوره ${course.title}`}
                                title="حذف"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </ConfirmDelete>
                          </div>
                        </TableCell>
                      </SortableTableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          </SortableRows>

          {/* — کارت‌های موبایل (قابل ویرایش و حذف) — */}
          <SortableRows
            ids={filtered.map((c) => c.id)}
            onReorder={(ids) => void handleReorder(ids)}
            disabled={!canReorder}
          >
            <ul className="space-y-3 md:hidden">
            {filtered.map((course) => {
              const type =
                COURSE_TYPES[isCourseType(course.type) ? course.type : "online"];
              const TypeIcon = type.icon;
              const theme = getCourseTheme(course.theme);
              const Icon = getCourseIcon(course.icon);
              const iconTile = (
                <span
                  className={`flex size-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md ${theme.tile}`}
                >
                  <Icon className="size-7 text-white" strokeWidth={1.9} />
                </span>
              );
              return (
                <SortableCard
                  key={course.id}
                  id={course.id}
                  enabled={canReorder}
                  className="glass rounded-2xl p-4"
                >
                  <div className="flex items-start gap-3">
                    {course.imageUrl?.trim() ? (
                      <OptionalImage
                        src={course.imageUrl}
                        alt={`تصویر دوره ${course.title}`}
                        fallback={iconTile}
                        sizes="64px"
                        className="size-16 shrink-0 rounded-xl border border-border shadow-md"
                      />
                    ) : (
                      iconTile
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        {/* عنوان دوره — کلیک: صفحه‌ی حضور و غیاب */}
                        <button
                          type="button"
                          onClick={() => setAttendanceCourse(course)}
                          title="حضور و غیاب دوره"
                          aria-label={`حضور و غیاب دوره ${course.title}`}
                          className="group min-w-0 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <p className="truncate text-sm font-black text-foreground transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-300">
                            {course.title}
                          </p>
                          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            {course.category}
                            <ClipboardCheck
                              className="size-3 shrink-0 text-teal-500/70 opacity-0 transition-opacity group-hover:opacity-100 dark:text-teal-300/70"
                              aria-hidden
                            />
                          </p>
                        </button>
                        {visibleCols.published ? (
                          <PublishSwitch
                            published={course.published}
                            onToggle={(next) => togglePublish(course, next)}
                          />
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`gap-1 rounded-full px-2.5 py-1 text-[0.6rem] font-bold ${type.badge}`}
                        >
                          <TypeIcon className="size-3" />
                          {type.label}
                        </Badge>
                        {visibleCols.level ? (
                          <Badge
                            variant="outline"
                            className="rounded-full border-foreground/15 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-bold text-muted-foreground"
                          >
                            {course.level}
                          </Badge>
                        ) : null}
                        {visibleCols.price ? (
                          course.price === 0 ? (
                            <Badge className="rounded-full border-0 bg-emerald-500/15 px-2.5 py-1 text-[0.6rem] font-black text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                              رایگان
                            </Badge>
                          ) : (
                            <span className="whitespace-nowrap text-xs font-bold text-emerald-700 dark:text-emerald-300">
                              {faAmount(course.price)}
                              <span className="text-[0.6rem] font-medium text-muted-foreground">
                                {" "}
                                تومان
                              </span>
                            </span>
                          )
                        ) : null}
                        {visibleCols.sessions ? (
                          <span className="rounded-full bg-foreground/[0.05] px-2 py-1 text-[0.6rem] font-semibold text-muted-foreground">
                            {faDigits(course.sessions)} جلسه · {faDigits(course.hours)} ساعت
                          </span>
                        ) : null}
                        {visibleCols.capacity ? (
                          (course.type !== "online" &&
                            (course.groups?.length ?? 0) > 0) ||
                          course.capacity > 0 ? (
                            <span
                              className={`rounded-full px-2 py-1 text-[0.6rem] font-bold tabular-nums ${
                                course.capacity > 0 &&
                                (course.enrolledCount ?? 0) >= course.capacity
                                  ? "bg-red-500/15 text-red-700 dark:bg-red-400/15 dark:text-red-300"
                                  : "bg-foreground/[0.05] text-muted-foreground"
                              }`}
                              title={
                                course.groups?.length
                                  ? course.groups
                                      .map(
                                        (g) =>
                                          `${g.title}${g.schedule ? ` (${g.schedule})` : ""}: ${faDigits(g.enrolledCount ?? 0)}/${faDigits(g.capacity)}`
                                      )
                                      .join(" · ")
                                  : undefined
                              }
                            >
                              {faDigits(course.enrolledCount ?? 0)} / {faDigits(course.capacity)}
                              {course.groups?.length
                                ? ` · ${faDigits(course.groups.length)} گروه`
                                : ""}
                            </span>
                          ) : (
                            <span className="rounded-full bg-foreground/[0.05] px-2 py-1 text-[0.6rem] font-semibold text-muted-foreground">
                              بدون محدودیت
                            </span>
                          )
                        ) : null}
                        {visibleCols.sortOrder ? (
                          <span className="rounded-full bg-foreground/[0.05] px-2 py-1 text-[0.6rem] font-semibold text-muted-foreground">
                            ترتیب {faDigits(course.sortOrder)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* عملیات — همیشه در دسترس لمسی */}
                  <div className="mt-3 flex items-center justify-end gap-2 border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAttendanceCourse(course)}
                      aria-label={`حضور و غیاب دوره ${course.title}`}
                      className="h-11 rounded-xl border-teal-500/30 px-4 text-xs font-bold text-teal-700 hover:bg-teal-500/10 hover:text-teal-800 dark:border-teal-400/25 dark:text-teal-300 dark:hover:bg-teal-400/10 dark:hover:text-teal-200"
                    >
                      <ClipboardCheck className="size-4" />
                      حضور و غیاب
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(course)}
                      aria-label={`ویرایش دوره ${course.title}`}
                      className="h-11 rounded-xl px-5 text-xs font-bold"
                    >
                      <Pencil className="size-4" />
                      ویرایش
                    </Button>
                    <ConfirmDelete
                      title="حذف دوره"
                      description="این دوره برای همیشه حذف می‌شود. مطمئن هستید؟"
                      onConfirm={() => handleDelete(course)}
                    >
                      <Button
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
                </SortableCard>
              );
            })}
            </ul>
          </SortableRows>
        </>
      )}

      {/* دیالوگ ایجاد/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editing ? "ویرایش دوره" : "ایجاد دوره جدید"}
            </DialogTitle>
            <DialogDescription>
              اطلاعات دوره را کامل کنید؛ فیلدهای عنوان، توضیحات و نوع الزامی هستند.
            </DialogDescription>
          </DialogHeader>

          {form && FormIcon && formTheme ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="عنوان دوره" htmlFor="course-title">
                  <Input
                    id="course-title"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="مثلاً: دوره جامع هوش مصنوعی"
                    maxLength={120}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="توضیحات" htmlFor="course-description">
                  <Textarea
                    id="course-description"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="توضیح کوتاهی درباره محتوا و نتایج دوره..."
                    className="min-h-20"
                    maxLength={600}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <ImageUrlField
                  id="course-imageUrl"
                  label="تصویر دوره (اختیاری)"
                  value={form.imageUrl}
                  onChange={(v) => set("imageUrl", v)}
                  section="courses"
                  hint="در کارت دوره (سایت و پنل) به‌جای آیکون نمایش داده می‌شود — می‌توانید مستقیم از سیستم بارگذاری کنید یا آدرس تصویر را وارد کنید."
                  previewClassName="h-[90px] w-40"
                  previewAlt="پیش‌نمایش تصویر دوره"
                />
              </div>
              <Field label="دسته‌بندی" htmlFor="course-category">
                <Input
                  id="course-category"
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  placeholder="مثلاً: هوش مصنوعی"
                />
              </Field>
              <Field label="نوع دوره" htmlFor="course-type">
                <Select
                  value={form.type}
                  onValueChange={(v) => changeType(v as CourseType)}
                >
                  <SelectTrigger id="course-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">آنلاین</SelectItem>
                    <SelectItem value="inperson">حضوری</SelectItem>
                    <SelectItem value="hybrid">حضوری و آنلاین</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="سطح دوره" htmlFor="course-level">
                <Select
                  value={form.level}
                  onValueChange={(v) => set("level", v)}
                >
                  <SelectTrigger id="course-level" className="w-full">
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
              <Field label="مدرس" htmlFor="course-instructor">
                <Input
                  id="course-instructor"
                  value={form.instructor}
                  onChange={(e) => set("instructor", e.target.value)}
                  placeholder="نام مدرس دوره"
                />
              </Field>

              {form.type !== "online" ? (
                <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4 sm:col-span-2 dark:border-violet-400/20 dark:bg-violet-400/[0.04]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-violet-600 dark:text-violet-300" />
                      <p className="text-xs font-black text-foreground">
                        {form.type === "hybrid"
                          ? "گروه‌های زمان‌بندی بخش حضوری دوره"
                          : "گروه‌های زمان‌بندی دوره"}
                      </p>
                    </div>
                    <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.65rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                      {faDigits(form.groups.length)} گروه · مجموع ظرفیت{" "}
                      {faDigits(groupsCapacitySum)} نفر
                    </span>
                  </div>
                  <p className="flex items-start gap-2 text-[0.65rem] leading-5 text-muted-foreground">
                    <UsersRound className="mt-0.5 size-3.5 shrink-0 text-violet-600/70 dark:text-violet-300/70" />
                    هر گروه زمان‌بندی و ظرفیت جداگانه دارد (مثلاً گروه ۱: دوشنبه
                    و چهارشنبه؛ گروه ۲: یکشنبه و سه‌شنبه). متقاضی در فرم
                    پیش‌ثبت‌نام گروه دلخواه خود را انتخاب می‌کند و با تکمیل
                    ظرفیت همان گروه، ثبت‌نام و پرداخت مسدود می‌شود.
                  </p>

                  <div className="space-y-2.5">
                    {form.groups.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-foreground/20 bg-foreground/[0.02] px-3.5 py-3 text-[0.65rem] font-semibold leading-5 text-muted-foreground dark:border-white/20 dark:bg-white/[0.02]">
                        هنوز گروهی تعریف نشده است؛ با دکمه‌ی زیر اولین گروه
                        زمان‌بندی را اضافه کنید (بدون گروه، ظرفیت کلی دوره
                        مبنا خواهد بود).
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
                                htmlFor={`group-title-${i}`}
                                className="text-[0.65rem] font-bold text-muted-foreground"
                              >
                                عنوان گروه
                              </Label>
                              <Input
                                id={`group-title-${i}`}
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
                                htmlFor={`group-schedule-${i}`}
                                className="text-[0.65rem] font-bold text-muted-foreground"
                              >
                                روزها و ساعت کلاس
                              </Label>
                              <Input
                                id={`group-schedule-${i}`}
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
                                htmlFor={`group-capacity-${i}`}
                                className="text-[0.65rem] font-bold text-muted-foreground"
                              >
                                ظرفیت (نفر)
                              </Label>
                              <Input
                                id={`group-capacity-${i}`}
                                type="number"
                                min={0}
                                value={g.capacity}
                                onChange={(e) =>
                                  setGroup(i, { capacity: e.target.value })
                                }
                                className="h-9"
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2 sm:pt-5">
                              {enrolled > 0 ? (
                                <Badge className="rounded-full border-0 bg-violet-500/15 px-2 py-0.5 text-[0.6rem] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" title="پیش‌ثبت‌نام فعال این گروه — حذف گروه مسدود است">
                                  {faDigits(enrolled)} ثبت‌نام
                                </Badge>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeGroup(i)}
                                className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
                    disabled={form.groups.length >= 20}
                    className="w-full rounded-xl border-dashed"
                  >
                    <Plus className="size-4" />
                    افزودن گروه زمان‌بندی
                  </Button>
                </div>
              ) : null}

              {/* اعداد */}
              <div className="grid grid-cols-2 gap-4 sm:col-span-2 sm:grid-cols-3">
                <Field label="ساعت" htmlFor="course-hours">
                  <Input
                    id="course-hours"
                    type="number"
                    min={0}
                    value={form.hours}
                    onChange={(e) => set("hours", e.target.value)}
                  />
                </Field>
                <Field label="جلسات" htmlFor="course-sessions">
                  <Input
                    id="course-sessions"
                    type="number"
                    min={0}
                    value={form.sessions}
                    onChange={(e) => set("sessions", e.target.value)}
                  />
                </Field>
                <Field label="قیمت (تومان)" htmlFor="course-price">
                  <Input
                    id="course-price"
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    placeholder="۰ = رایگان"
                  />
                </Field>
                <Field
                  label="ظرفیت دوره (نفر)"
                  htmlFor="course-capacity"
                  hint={
                    form.type !== "online" && form.groups.length > 0
                      ? "مجموع ظرفیت گروه‌ها — به‌صورت خودکار محاسبه می‌شود"
                      : "پیش‌فرض: حضوری ۱۰ · آنلاین ۲۰ · حضوری و آنلاین ۲۰ — صفر یعنی بدون محدودیت"
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
                      id="course-capacity"
                      type="number"
                      min={0}
                      value={form.capacity}
                      onChange={(e) => set("capacity", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="ترتیب نمایش" htmlFor="course-sortOrder">
                  <Input
                    id="course-sortOrder"
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => set("sortOrder", e.target.value)}
                  />
                </Field>
              </div>

              {/* شهریه‌ی اختصاصی دوره — مبالغ پرداخت پیش‌ثبت‌نام */}
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
                    htmlFor="course-cashTuition"
                    hint="مبلغ پرداخت کامل دوره — صفر یعنی رایگان"
                  >
                    <Input
                      id="course-cashTuition"
                      type="number"
                      min={0}
                      value={form.cashTuition}
                      onChange={(e) => set("cashTuition", e.target.value)}
                      placeholder="10000000"
                    />
                  </Field>
                  <Field
                    label="شهریه کل اقساطی (تومان)"
                    htmlFor="course-installmentTuition"
                    hint="مبلغ کل در طرح اقساطی — صفر یعنی بدون گزینه اقساطی"
                  >
                    <Input
                      id="course-installmentTuition"
                      type="number"
                      min={0}
                      value={form.installmentTuition}
                      onChange={(e) => set("installmentTuition", e.target.value)}
                      placeholder="12000000"
                    />
                  </Field>
                </div>
                <p className="flex items-start gap-2 text-[0.65rem] leading-5 text-muted-foreground">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-teal-600/70 dark:text-teal-300/70" />
                  این مبالغ فقط برای همین دوره در فرم پیش‌ثبت‌نام سایت نمایش داده
                  می‌شود؛ با فعال‌سازی مبلغ اقساطی (مقدار مثبت)، طرح اقساط و
                  سررسیدها در بخش پایین تعریف می‌شود.
                </p>
              </div>

              {/* — طرح اقساطی دوره: تعداد و تاریخ سررسید هر قسط — */}
              {form.installmentTuition.trim() !== "" &&
              toInt(form.installmentTuition) > 0 ? (
                <div className="space-y-4 rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4 sm:col-span-2 dark:border-violet-400/20 dark:bg-violet-400/[0.04]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-violet-600 dark:text-violet-300" />
                      <p className="text-xs font-black text-foreground">
                        طرح اقساطی این دوره — سررسید هر قسط
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="course-inst-count"
                        className="text-[0.65rem] font-black text-muted-foreground"
                      >
                        تعداد اقساط
                      </Label>
                      <Input
                        id="course-inst-count"
                        type="number"
                        min={1}
                        max={36}
                        value={form.installments.length}
                        onChange={(e) =>
                          setInstallmentCount(Number(e.target.value))
                        }
                        dir="ltr"
                        className="h-9 w-20 rounded-lg bg-foreground/[0.03] text-center text-sm font-black dark:bg-white/[0.04]"
                      />
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
                              htmlFor={`course-inst-${i}`}
                              className="text-[0.6rem] font-bold text-muted-foreground"
                            >
                              سررسید قسط {faDigits(i + 1)}
                              {i === 0 ? " (پرداخت در فرم)" : ""}
                            </Label>
                            <JalaliDateField
                              id={`course-inst-${i}`}
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
                    پیش‌فرض ۳ قسط است و می‌توانید تعداد را برای همین دوره تغییر
                    دهید؛ سهم مبلغ هر قسط خودکار از مبلغ کل اقساطی تقسیم می‌شود
                    (قسط اول در فرم پرداخت می‌شود). این تاریخ‌ها برای ثبت‌نام‌های
                    جدید این دوره اعمال می‌شود و طرح ثبت‌نام‌های قبلی دست‌نخورده
                    می‌ماند.
                  </p>
                </div>
              ) : null}

              {/* آیکون و تم */}
              <Field label="آیکون دوره" htmlFor="course-icon">
                <div className="flex items-center gap-3">
                  <Select
                    value={form.icon}
                    onValueChange={(v) => set("icon", v)}
                  >
                    <SelectTrigger id="course-icon" className="w-full">
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
              <Field label="تم رنگی" htmlFor="course-theme">
                <div className="flex items-center gap-3">
                  <Select
                    value={form.theme}
                    onValueChange={(v) => set("theme", v)}
                  >
                    <SelectTrigger id="course-theme" className="w-full">
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
                <Field
                  label="برچسب ویژه"
                  htmlFor="course-tag"
                >
                  <Input
                    id="course-tag"
                    value={form.tag}
                    onChange={(e) => set("tag", e.target.value)}
                    placeholder="مثلاً: پرمخاطب — خالی = بدون برچسب"
                    maxLength={40}
                  />
                </Field>
              </div>

              {/* وضعیت انتشار: منتشر شده (در سایت) یا پیش‌نویس (فقط پنل مدیر) */}
              <Field label="وضعیت انتشار" htmlFor="course-published-published">
                <PublishStatusSelect
                  id="course-published"
                  value={form.published}
                  onChange={(v) => set("published", v)}
                />
              </Field>
            </div>
          ) : null}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={handleSave}
              disabled={saving}
              className={`rounded-xl ${btnGradient}`}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {editing ? "ذخیره تغییرات" : "ایجاد دوره"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="rounded-xl"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
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
