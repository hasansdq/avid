"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  GraduationCap,
  Hourglass,
  IdCard,
  Inbox,
  Loader2,
  LogIn,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
  Wallet,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { InstallmentsDialog } from "@/components/admin/shared/installments-dialog";
import { UserPaymentsDialog } from "@/components/admin/shared/user-payments-dialog";
import { TeacherPaymentsDialog } from "@/components/admin/shared/teacher-payments-dialog";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import {
  InstallmentsOverviewStats,
  RecentPaidSection,
  RemainingSection,
  useInstallmentsOverview,
} from "@/components/admin/shared/installments-overview";
import { StatusBadge } from "@/components/admin/shared/status-badge";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import { btnGradient, tileGradient } from "@/components/admin/shared/styles";
import type {
  ClassMembership,
  CourseWithUsage,
  EnrollmentWithInstallments,
  TeacherWithStats,
  User,
  UserWithStats,
} from "@/components/admin/types";
import {
  AddTeacherDialog,
  RoleChip,
  TeachersTab,
} from "@/components/admin/modules/users-teachers-tab";
import type { TeachersListResponse } from "@/components/admin/modules/users-teachers-tab";
import { isEnrollmentStatus } from "@/lib/course-theme";
import { faDate, faDigits } from "@/lib/fa";
import {
  isValidNationalId,
  NATIONAL_ID_INVALID_MESSAGE,
  normalizeNationalId,
  toEnDigits,
} from "@/lib/national-id";

type StatusFilter = "all" | "active" | "blocked";

/* — نشان وضعیت حساب کاربر — */
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

/* — نشان وضعیت پرداخت ثبت‌نام — */
const PAYMENT_STATUS: Record<string, { label: string; badge: string }> = {
  paid: {
    label: "پرداخت‌شده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  pending: {
    label: "در انتظار",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
  failed: {
    label: "ناموفق",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
};

const METHOD_LABELS: Record<string, string> = {
  cash: "نقدی",
  installment: "اقساطی",
};

/** پاسخ GET /api/admin/users */
interface UsersListResponse {
  users: UserWithStats[];
  total: number;
  page: number;
  pageCount: number;
}

/** پاسخ GET /api/admin/users/[id] */
interface UserDetailResponse {
  user: User;
  enrollments: EnrollmentWithInstallments[];
  /** کلاس‌هایی که کاربر عضو آنهاست (عضویت + عنوان کلاس) */
  classes: (ClassMembership & {
    classRoom: { id: string; title: string };
  })[];
}

/** نام نمایشی کاربر (یا شماره‌ی او اگر نامی نداشت) */
function displayName(
  u: Pick<User, "firstName" | "lastName" | "phone">
): string {
  const name = `${u.firstName} ${u.lastName}`.trim();
  return name || faDigits(u.phone);
}

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/** نشان شمارنده‌ی کوچک کنار عنوان تب‌های ماژول */
function TabPill({
  count,
  tone,
}: {
  count: number | undefined;
  tone: "emerald" | "amber" | "violet";
}) {
  const tones = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  } as const;
  if (count === undefined) {
    return (
      <span
        aria-hidden
        className="size-3.5 shrink-0 animate-pulse rounded-full bg-foreground/10"
      />
    );
  }
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-black tabular-nums",
        tones[tone]
      )}
    >
      {faDigits(count)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  دیالوگ ویرایش کاربر                                                */
/* ------------------------------------------------------------------ */

/** فرم ویرایش اطلاعات کاربر: نام، شماره، وضعیت و یادداشت مدیر */
function EditUserDialog({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    nationalId: "",
    status: "active",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setDraft({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        nationalId: user.nationalId ?? "",
        status: user.status === "blocked" ? "blocked" : "active",
        note: user.note ?? "",
      });
    }
  }, [open, user]);

  async function save() {
    if (!user) return;
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
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          nationalId,
          status: draft.status,
          note: draft.note.trim(),
        }),
      });
      toast.success("اطلاعات کاربر ذخیره شد");
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
          <DialogTitle className="text-base">ویرایش کاربر</DialogTitle>
          <DialogDescription className="leading-6">
            اطلاعات حساب «{user ? displayName(user) : ""}» — شماره‌ی موبایل یکتا
            است و در صورت تکراری بودن ذخیره نمی‌شود.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-first-name" className="text-xs font-black text-foreground/90">
              نام
            </Label>
            <Input
              id="edit-first-name"
              value={draft.firstName}
              onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
              placeholder="مثلاً: سارا"
              className="h-11 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-last-name" className="text-xs font-black text-foreground/90">
              نام خانوادگی
            </Label>
            <Input
              id="edit-last-name"
              value={draft.lastName}
              onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
              placeholder="مثلاً: محمدی"
              className="h-11 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone" className="text-xs font-black text-foreground/90">
              شماره موبایل
            </Label>
            <Input
              id="edit-phone"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              inputMode="tel"
              dir="ltr"
              placeholder="09123456789"
              className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-national-id" className="text-xs font-black text-foreground/90">
              کد ملی <span className="font-semibold text-muted-foreground">(اختیاری)</span>
            </Label>
            <Input
              id="edit-national-id"
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
              className="h-11 rounded-xl bg-foreground/[0.03] text-center font-black tabular-nums dark:bg-white/[0.04]"
            />
            <p className="text-[0.6rem] font-semibold leading-5 text-muted-foreground">
              با ثبت کد ملی، گواهی‌نامه‌های کاربر با استعلام کد ملی قابل بررسی است — خالی = حذف.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status" className="text-xs font-black text-foreground/90">
              وضعیت حساب
            </Label>
            <Select
              value={draft.status}
              onValueChange={(v) => {
                if (v === "") return;
                setDraft((d) => ({ ...d, status: v }));
              }}
              dir="rtl"
            >
              <SelectTrigger
                id="edit-status"
                className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm dark:bg-white/[0.04]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="blocked">مسدود (ورود مسدود می‌شود)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-note" className="text-xs font-black text-foreground/90">
            یادداشت مدیر (اختیاری)
          </Label>
          <Textarea
            id="edit-note"
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            placeholder="یادداشت خصوصی درباره‌ی این کاربر — فقط در پنل مدیر دیده می‌شود"
            rows={3}
            className="rounded-xl bg-foreground/[0.03] text-sm leading-6 dark:bg-white/[0.04]"
          />
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            onClick={save}
            disabled={saving}
            className={`h-10 rounded-xl px-6 text-xs ${btnGradient}`}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال ذخیره...
              </>
            ) : (
              <>
                <Save className="size-4" />
                ذخیره‌ی تغییرات
              </>
            )}
          </Button>
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

/* ------------------------------------------------------------------ */
/*  دیالوگ افزودن کاربر جدید                                            */
/* ------------------------------------------------------------------ */

/** افزودن کاربر دلخواه توسط مدیر — فیلدهای الزامی: نام، نام خانوادگی، شماره */
function AddUserDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    nationalId: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft({ firstName: "", lastName: "", phone: "", nationalId: "" });
    }
  }, [open]);

  async function save() {
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

    setSaving(true);
    try {
      await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          ...(nationalId !== "" ? { nationalId } : {}),
        }),
      });
      toast.success(`کاربر «${firstName} ${lastName}» افزوده شد`);
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
          <DialogTitle className="text-base">افزودن کاربر جدید</DialogTitle>
          <DialogDescription className="leading-6">
            نام، نام خانوادگی و شماره موبایل الزامی است؛ شماره‌ی موبایل باید یکتا
            باشد و وضعیت حساب «فعال» خواهد بود.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="add-first-name" className="text-xs font-black text-foreground/90">
              نام <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-first-name"
              value={draft.firstName}
              onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
              placeholder="مثلاً: سارا"
              maxLength={40}
              className="h-11 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-last-name" className="text-xs font-black text-foreground/90">
              نام خانوادگی <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-last-name"
              value={draft.lastName}
              onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
              placeholder="مثلاً: محمدی"
              maxLength={40}
              className="h-11 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.04]"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="add-phone" className="text-xs font-black text-foreground/90">
              شماره موبایل <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-phone"
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
            <Label htmlFor="add-national-id" className="text-xs font-black text-foreground/90">
              کد ملی <span className="font-semibold text-muted-foreground">(اختیاری)</span>
            </Label>
            <div className="relative">
              <IdCard className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="add-national-id"
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
              با ثبت کد ملی، گواهی‌نامه‌های کاربر با استعلام کد ملی قابل بررسی است.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            onClick={save}
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
                افزودن کاربر
              </>
            )}
          </Button>
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

/* ------------------------------------------------------------------ */
/*  دیالوگ افزودن کاربر به دانشجویان یک دوره                            */
/* ------------------------------------------------------------------ */

/**
 * افزودن کاربر به دانشجویان یک دوره‌ی مشخص (دکمه‌ی «+» ردیف کاربر) —
 * دوره انتخاب می‌شود؛ اگر دوره‌ی حضوری/ترکیبی گروه‌های زمان‌بندی داشته
 * باشد، گروه هم انتخاب می‌شود (ظرفیت‌ها در سرور اعمال می‌شود).
 */
function EnrollUserDialog({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [courses, setCourses] = useState<CourseWithUsage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setCourseId("");
    setGroupId("");
    setCourses(null);
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await apiFetch<CourseWithUsage[]>("/api/admin/courses");
        if (!cancelled) setCourses(data);
      } catch (error) {
        toastApiError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const selectedCourse = courses?.find((c) => c.id === courseId) ?? null;
  const groups = selectedCourse?.groups ?? [];
  const needsGroup =
    !!selectedCourse &&
    selectedCourse.type !== "online" &&
    groups.length > 0;

  async function save() {
    if (!user || !selectedCourse) {
      toast.error("ابتدا دوره را انتخاب کنید.");
      return;
    }
    if (needsGroup && !groupId) {
      toast.error("گروه زمانی این دوره را انتخاب کنید.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/admin/enrollments", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          courseId: selectedCourse.id,
          groupId: needsGroup ? groupId : undefined,
        }),
      });
      toast.success(
        `«${displayName(user)}» به دانشجویان دوره «${selectedCourse.title}» افزوده شد`
      );
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
          <DialogTitle className="text-base">افزودن به دانشجویان دوره</DialogTitle>
          <DialogDescription className="leading-6">
            کاربر «{user ? displayName(user) : ""}» به دانشجویان کدام دوره افزوده شود؟
            ثبت‌نام با وضعیت «ثبت‌نام نهایی» ایجاد می‌شود و ظرفیت دوره/گروه رعایت می‌شود.
          </DialogDescription>
        </DialogHeader>

        {loading || !courses ? (
          <div className="space-y-3">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ) : courses.length === 0 ? (
          <p className="glass rounded-2xl px-5 py-6 text-center text-sm text-muted-foreground">
            هنوز دوره‌ای ثبت نشده است؛ ابتدا از ماژول «دوره‌ها» دوره ایجاد کنید.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="enroll-course" className="text-xs font-black text-foreground/90">
                دوره <span className="text-destructive">*</span>
              </Label>
              <Select
                value={courseId}
                onValueChange={(v) => {
                  setCourseId(v);
                  setGroupId("");
                }}
                dir="rtl"
              >
                <SelectTrigger
                  id="enroll-course"
                  className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm dark:bg-white/[0.04]"
                >
                  <SelectValue placeholder="دوره مورد نظر را انتخاب کنید" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                      {!c.published ? " (پیش‌نویس)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCourse ? (
                <p className="text-[0.7rem] leading-5 text-muted-foreground">
                  ثبت‌نام‌های فعال: {faDigits(selectedCourse.enrolledCount ?? 0)}
                  {selectedCourse.capacity > 0
                    ? ` از ${faDigits(selectedCourse.capacity)} نفر`
                    : " نفر (بدون سقف)"}
                  {!selectedCourse.published ? " · این دوره هنوز منتشر نشده است" : ""}
                </p>
              ) : null}
            </div>

            {needsGroup ? (
              <div className="space-y-2">
                <Label htmlFor="enroll-group" className="text-xs font-black text-foreground/90">
                  گروه زمانی <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={groupId}
                  onValueChange={(v) => setGroupId(v)}
                  dir="rtl"
                >
                  <SelectTrigger
                    id="enroll-group"
                    className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm dark:bg-white/[0.04]"
                  >
                    <SelectValue placeholder="گروه مورد نظر را انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.title} · {faDigits(g.enrolledCount ?? 0)}
                        {g.capacity > 0 ? ` / ${faDigits(g.capacity)}` : " / بدون سقف"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[0.7rem] leading-5 text-muted-foreground">
                  {selectedCourse.schedule
                    ? `زمان‌بندی دوره: ${selectedCourse.schedule}`
                    : "برای دوره‌های حضوری/ترکیبی گروه‌دار، انتخاب گروه الزامی است."}
                </p>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            onClick={save}
            disabled={saving || loading || !courses || !courseId || (needsGroup && !groupId)}
            className={`h-10 rounded-xl px-6 text-xs ${btnGradient}`}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال افزودن...
              </>
            ) : (
              <>
                <GraduationCap className="size-4" />
                افزودن به دوره
              </>
            )}
          </Button>
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

/* ------------------------------------------------------------------ */
/*  دیالوگ ورود مدیر به سایت به عنوان کاربر                             */
/* ------------------------------------------------------------------ */

/**
 * ورود مدیر به سایت با هویت کاربر — بدون تایید پیامکی و بدون رمز.
 * نشست سایت ساخته می‌شود و پنل کاربران در تب جدید باز می‌شود؛
 * نشست مدیر دست‌نخورده می‌ماند.
 */
function LoginAsUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function login() {
    if (!user) return;
    // تب را هم‌زمان با کلیک باز می‌کنیم تا مسدودکننده‌ی پاپ‌آپ جلوی آن را نگیرد
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const data = await apiFetch<{ redirect: string }>(
        `/api/admin/users/${user.id}/login`,
        { method: "POST" }
      );
      const target = data.redirect || "/panel";
      if (tab) {
        try {
          tab.document.title = "در حال ورود به سایت...";
        } catch {
          /* تیتر اختیاری است */
        }
        tab.location.href = target;
        toast.success(
          `وارد سایت شدید به عنوان «${displayName(user)}» — تب جدید باز شد`
        );
        onOpenChange(false);
      } else {
        // پاپ‌آپ بسته شد → در همین تب وارد می‌شویم
        window.location.href = target;
      }
    } catch (error) {
      tab?.close();
      toastApiError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <DialogContent dir="rtl" className="rounded-2xl">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-base">ورود به سایت به عنوان کاربر</DialogTitle>
          <DialogDescription className="leading-6">
            بدون تایید پیامکی و بدون رمز، با هویت «{user ? displayName(user) : ""}»
            وارد سایت می‌شوید؛ پنل کاربران این حساب در تب جدید باز می‌شود و نشست
            مدیر شما دست‌نخورده باقی می‌ماند. برای خروج از حساب کاربر، از پنل او
            «خروج» را بزنید.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            onClick={login}
            disabled={busy}
            className={`h-10 rounded-xl px-6 text-xs ${btnGradient}`}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال ورود...
              </>
            ) : (
              <>
                <LogIn className="size-4" />
                ورود به سایت
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-10 rounded-xl px-6 text-xs font-bold"
          >
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  دیالوگ جزئیات کاربر                                                */
/* ------------------------------------------------------------------ */

/**
 * پروفایل کاربر + فهرست ثبت‌نام‌های او با وضعیت پرداخت و دکمه‌ی
 * «مدیریت اقساط» (که دیالوگ اقساط را از سطح ماژول باز می‌کند).
 */
function UserDetailDialog({
  user,
  open,
  onOpenChange,
  onEdit,
  onManageInstallments,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (user: User) => void;
  onManageInstallments: (enrollment: EnrollmentWithInstallments) => void;
}) {
  const [detail, setDetail] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await apiFetch<UserDetailResponse>(
          `/api/admin/users/${user.id}`
        );
        if (!cancelled) setDetail(data);
      } catch (error) {
        toastApiError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const profile = detail?.user ?? user;
  const statusMeta =
    profile && (profile.status in ACCOUNT_STATUS)
      ? ACCOUNT_STATUS[profile.status]
      : ACCOUNT_STATUS.active;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-base">پرونده‌ی کاربر</DialogTitle>
          <DialogDescription className="leading-6">
            اطلاعات حساب، وضعیت، کلاس‌ها و ثبت‌نام‌های دوره‌های این کاربر.
          </DialogDescription>
        </DialogHeader>

        {loading || !profile ? (
          <div className="space-y-3">
            <div className="glass space-y-3 rounded-2xl p-5">
              <Skeleton className="h-6 w-40 rounded-md" />
              <Skeleton className="h-4 w-56 rounded-md" />
            </div>
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {/* — خلاصه‌ی پروفایل — */}
            <section className="glass space-y-4 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <span
                  className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-base font-black text-white ${tileGradient} shadow-md`}
                  aria-hidden
                >
                  {displayName(profile).charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-foreground">
                      {displayName(profile)}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                        statusMeta.badge
                      )}
                    >
                      {profile.status === "blocked" ? (
                        <Ban className="size-3" />
                      ) : (
                        <CheckCircle2 className="size-3" />
                      )}
                      {statusMeta.label}
                    </span>
                  </div>
                  <a
                    href={`tel:${profile.phone}`}
                    dir="ltr"
                    className="mt-1 flex w-fit items-center justify-start gap-1.5 text-sm font-semibold text-teal-600 transition-colors hover:underline dark:text-teal-300 dark:hover:text-teal-200"
                    title="تماس با کاربر"
                  >
                    <Phone className="size-3.5" />
                    {faDigits(profile.phone)}
                  </a>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                    عضویت: {faDate(profile.createdAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(profile)}
                  className="h-9 rounded-xl px-4 text-xs font-bold"
                >
                  <Pencil className="size-3.5" />
                  ویرایش
                </Button>
              </div>

              {profile.note ? (
                <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs font-semibold leading-6 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
                  یادداشت مدیر: {profile.note}
                </p>
              ) : null}
            </section>

            {/* — کلاس‌های کاربر (فقط مدیر می‌بیند؛ پنل کاربر نمایش نمی‌دهد) — */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
                <GraduationCap className="size-4 text-rose-600 dark:text-rose-300" />
                کلاس‌های کاربر
                <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[0.6rem] font-bold text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
                  {faDigits(detail?.classes.length ?? 0)}
                </span>
              </h3>

              {!detail || detail.classes.length === 0 ? (
                <p className="glass rounded-2xl px-5 py-6 text-center text-sm text-muted-foreground">
                  این کاربر عضو هیچ کلاسی نیست.
                </p>
              ) : (
                <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-4">
                  {detail.classes.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300"
                    >
                      <Users className="size-3.5" />
                      {m.classRoom.title}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* — ثبت‌نام‌های کاربر — */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
                <ClipboardList className="size-4 text-teal-600 dark:text-teal-300" />
                ثبت‌نام‌های کاربر
              </h3>

              {!detail || detail.enrollments.length === 0 ? (
                <p className="glass rounded-2xl px-5 py-6 text-center text-sm text-muted-foreground">
                  این کاربر هنوز ثبت‌نامی برای دوره‌ای ندارد.
                </p>
              ) : (
                <div className="space-y-3">
                  {detail.enrollments.map((e) => {
                    const status = isEnrollmentStatus(e.status) ? e.status : "new";
                    const payMeta =
                      e.paymentStatus in PAYMENT_STATUS
                        ? PAYMENT_STATUS[e.paymentStatus]
                        : null;
                    const hasInstallments =
                      e.paymentMethod === "installment" || e.installments.length > 0;
                    return (
                      <article
                        key={e.id}
                        className="glass space-y-3 rounded-2xl p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-black text-foreground">
                            {e.course}
                          </p>
                          <StatusBadge status={status} />
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          {e.paymentMethod ? (
                            <span className="flex items-center gap-1.5 font-semibold">
                              <Wallet className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                              روش پرداخت:{" "}
                              <span className="font-bold text-foreground">
                                {METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod}
                              </span>
                            </span>
                          ) : null}
                          {payMeta ? (
                            <span className="flex items-center gap-1.5">
                              وضعیت پرداخت:{" "}
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
                                  payMeta.badge
                                )}
                              >
                                {payMeta.label}
                              </span>
                            </span>
                          ) : null}
                          {e.paymentAmount ? (
                            <span className="font-semibold tabular-nums">
                              {faAmount(e.paymentAmount)} تومان
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.65rem] text-muted-foreground">
                          {e.groupTitle ? (
                            <span className="rounded-full bg-violet-500/10 px-2 py-0.5 font-bold text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
                              گروه: {e.groupTitle}
                            </span>
                          ) : null}
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="size-3" />
                            {faDate(e.createdAt)}
                          </span>
                        </div>

                        {hasInstallments ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onManageInstallments(e)}
                            className="h-9 w-full rounded-xl text-xs font-bold sm:w-auto sm:px-5"
                          >
                            <CalendarDays className="size-3.5" />
                            مدیریت اقساط ({faDigits(e.installments.length)})
                          </Button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  ماژول اصلی «مدیریت کاربران»                                        */
/* ------------------------------------------------------------------ */

/**
 * ماژول «مدیریت کاربران» —
 * فهرست کاربران ثبت‌نام‌شده‌ی سایت (جست‌وجو + فیلتر وضعیت + صفحه‌بندی)،
 * پروفایل و ثبت‌نام‌های هر کاربر، مسدودسازی/فعال‌سازی، ویرایش و حذف.
 */
export function UsersModule() {
  const [users, setUsers] = useState<UserWithStats[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [busyId, setBusyId] = useState<string | null>(null);

  /* — دیالوگ‌های کاربر/استاد مشترک — */
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [paymentsUser, setPaymentsUser] = useState<User | null>(null);
  /* — دیالوگ دوتابی «پرداختی‌ها و اقساط» استاد — تب درآمد/شبا/واریزی مخصوص اساتید — */
  const [teacherPaymentsUser, setTeacherPaymentsUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [installmentsTarget, setInstallmentsTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  /* — فهرست اساتید — تب «اساتید» + شمارنده‌ی کنار عنوان تب — */
  const [teachers, setTeachers] = useState<TeacherWithStats[] | null>(null);
  const [teachersTotal, setTeachersTotal] = useState<number | undefined>(
    undefined
  );
  const [teachersLoading, setTeachersLoading] = useState(true);

  /* — افزودن کاربر / افزودن استاد / افزودن به دوره / ورود به عنوان کاربر — */
  const [addOpen, setAddOpen] = useState(false);
  const [addTeacherOpen, setAddTeacherOpen] = useState(false);
  const [enrollTarget, setEnrollTarget] = useState<User | null>(null);
  const [loginTarget, setLoginTarget] = useState<User | null>(null);

  /* — جست‌وجو با تأخیر — */
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  /** دریافت فهرست کاربران بر اساس فیلترها */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), status });
      if (query) params.set("q", query);
      const data = await apiFetch<UsersListResponse>(
        `/api/admin/users?${params.toString()}`
      );
      setUsers(data.users);
      setTotal(data.total);
      setPageCount(data.pageCount);
      // اگر صفحه‌ی فعلی بعد از حذف/فیلتر خالی شده باشد، به آخرین صفحه برگرد
      if (data.users.length === 0 && data.page > data.pageCount) {
        setPage(data.pageCount);
      }
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, [page, status, query]);

  useEffect(() => {
    load();
  }, [load]);

  /** دریافت فهرست اساتید با آمار — برای تب «اساتید» و شمارنده‌ی آن */
  const loadTeachers = useCallback(async () => {
    try {
      setTeachersLoading(true);
      const data = await apiFetch<TeachersListResponse>("/api/admin/teachers");
      setTeachers(data.teachers);
      setTeachersTotal(data.total);
    } catch (error) {
      toastApiError(error);
    } finally {
      setTeachersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  /** تغییر فیلتر وضعیت → بازگشت به صفحه‌ی اول */
  function changeStatusFilter(next: StatusFilter) {
    setStatus(next);
    setPage(1);
  }

  /** مسدودسازی / رفع مسدودی سریع (کاربر و استاد) */
  async function toggleBlock(user: User) {
    const next = user.status === "blocked" ? "active" : "blocked";
    setBusyId(user.id);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: next }),
      });
      toast.success(
        next === "blocked"
          ? `کاربر «${displayName(user)}» مسدود شد`
          : `کاربر «${displayName(user)}» فعال شد`
      );
      // وضعیت در هر دو فهرست (کاربران و اساتید) بازتاب می‌شود
      await Promise.all([load(), loadTeachers()]);
    } catch (error) {
      toastApiError(error);
    } finally {
      setBusyId(null);
    }
  }

  /** حذف کاربر (از تب کاربران یا اساتید) — ثبت‌نام‌ها باقی می‌مانند */
  async function handleDelete(user: User) {
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      toast.success(`کاربر «${displayName(user)}» حذف شد`);
      // دارایی‌های استاد (دوره/کلاس/استریم) باقی می‌مانند ولی بدون مالک می‌شوند
      await Promise.all([load(), loadTeachers()]);
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /** سلب نقش استاد → کاربر عادی؛ دوره‌ها/کلاس‌ها/استریم‌هایش دست‌نخورده می‌مانند */
  async function demoteTeacher(teacher: TeacherWithStats) {
    setBusyId(teacher.id);
    try {
      await apiFetch(`/api/admin/users/${teacher.id}`, {
        method: "PUT",
        body: JSON.stringify({ role: "student" }),
      });
      toast.success(
        `نقش استاد از «${displayName(teacher)}» گرفته شد؛ دوره‌ها و کلاس‌هایش دست‌نخورده می‌ماند.`
      );
      await Promise.all([load(), loadTeachers()]);
    } catch (error) {
      toastApiError(error);
    } finally {
      setBusyId(null);
    }
  }

  /** باز کردن مدیریت اقساط از داخل دیالوگ‌های کاربر */
  function manageInstallments(enrollment: EnrollmentWithInstallments) {
    setDetailUser(null);
    setPaymentsUser(null);
    setInstallmentsTarget({ id: enrollment.id, title: enrollment.course });
  }

  /** دکمه‌های عملیات هر کاربر (مشترک جدول و کارت) */
  function rowActions(user: UserWithStats, compact: boolean) {
    const blocked = user.status === "blocked";
    const busy = busyId === user.id;
    return (
      <div className={cn("flex items-center gap-1.5", compact ? "" : "flex-wrap")}>
        {/* افزودن به دانشجویان یک دوره (دکمه‌ی +) */}
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => setEnrollTarget(user)}
          aria-label={`افزودن ${displayName(user)} به دانشجویان یک دوره`}
          title="افزودن به دانشجویان یک دوره"
          className={cn(
            compact ? "size-8" : "size-10 rounded-xl",
            "text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-200"
          )}
        >
          <UserPlus className="size-4" />
        </Button>
        {/* ورود مدیر به سایت با هویت این کاربر (بدون تایید پیامکی و رمز) */}
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => setLoginTarget(user)}
          disabled={blocked}
          aria-label={`ورود به سایت به عنوان ${displayName(user)}`}
          title={blocked ? "کاربر مسدود است" : "ورود به سایت به عنوان کاربر"}
          className={cn(
            compact ? "size-8" : "size-10 rounded-xl",
            "text-violet-600 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-300 dark:hover:bg-violet-400/10 dark:hover:text-violet-200"
          )}
        >
          <LogIn className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => setPaymentsUser(user)}
          aria-label={`پرداختی‌ها و اقساط ${displayName(user)}`}
          title="پرداختی‌ها و اقساط"
          className={cn(
            compact ? "size-8" : "size-10 rounded-xl",
            "text-violet-600 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-300 dark:hover:text-violet-200"
          )}
        >
          <Wallet className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => setDetailUser(user)}
          aria-label={`مشاهده‌ی پرونده‌ی ${displayName(user)}`}
          title="مشاهده"
          className={cn(
            compact ? "size-8" : "size-10 rounded-xl",
            "text-teal-600 hover:bg-teal-500/10 hover:text-teal-700 dark:text-teal-300 dark:hover:text-teal-200"
          )}
        >
          <Eye className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => setEditUser(user)}
          aria-label={`ویرایش ${displayName(user)}`}
          title="ویرایش"
          className={cn(
            compact ? "size-8" : "size-10 rounded-xl",
            "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          )}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size={compact ? "icon" : "default"}
          onClick={() => toggleBlock(user)}
          disabled={busy}
          aria-label={blocked ? "رفع مسدودی" : "مسدودسازی"}
          title={blocked ? "رفع مسدودی" : "مسدودسازی"}
          className={cn(
            compact ? "size-8" : "size-10 rounded-xl",
            blocked
              ? "text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-200"
              : "text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
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
        <ConfirmDelete
          title="حذف کاربر"
          description={`کاربر «${displayName(user)}» حذف شود؟ ثبت‌نام‌های او باقی می‌ماند ولی بدون حساب کاربری خواهند بود و نشست ورودش بسته می‌شود.`}
          onConfirm={() => handleDelete(user)}
        >
          <Button
            variant="ghost"
            size={compact ? "icon" : "default"}
            aria-label={`حذف ${displayName(user)}`}
            title="حذف"
            className={cn(
              compact ? "size-8" : "size-10 rounded-xl",
              "text-destructive hover:bg-destructive/10 hover:text-destructive"
            )}
          >
            <Trash2 className="size-4" />
          </Button>
        </ConfirmDelete>
      </div>
    );
  }

  const showSkeleton = loading && !users;
  const showEmpty = !showSkeleton && users !== null && users.length === 0;

  // نمای کلی اقساط — پرداخت‌های اخیر و کل اقساط باقیمانده
  const overview = useInstallmentsOverview();

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="مدیریت کاربران"
        description="کاربران ثبت‌نام‌شده‌ی سایت، وضعیت حساب و اقساط آنها، اساتید آکادمی"
      >
        <Badge
          variant="outline"
          className="rounded-full border-foreground/15 bg-foreground/[0.04] px-3.5 py-1.5 text-xs font-black tabular-nums text-muted-foreground"
        >
          {faDigits(total)} کاربر
        </Badge>
      </ModuleHeader>

      {/* — خلاصه‌ی وضعیت اقساط (سربرگ + کارت‌های آماری) — ثابت بالای تب‌ها — */}
      <InstallmentsOverviewStats
        data={overview.data}
        loading={overview.loading}
        refreshing={overview.refreshing}
        onRefresh={() => overview.reload(true)}
      />

      {/* — تب‌های ماژول: اقساط پرداخت‌شده‌ی اخیر / اقساط باقیمانده / لیست کاربران / اساتید — */}
      <Tabs defaultValue="recent-paid" dir="rtl" className="gap-5">
        <TabsList className="glass h-auto w-full flex-wrap justify-start gap-1 rounded-2xl p-1.5 sm:w-auto">
          <TabsTrigger
            value="recent-paid"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
            اقساط پرداخت‌شده‌ی اخیر
            <TabPill count={overview.data?.recentPaid.length} tone="emerald" />
          </TabsTrigger>
          <TabsTrigger
            value="remaining"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <Hourglass className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
            همه‌ی اقساط باقیمانده کاربران
            <TabPill count={overview.data?.remaining.length} tone="amber" />
          </TabsTrigger>
          <TabsTrigger
            value="users"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <Users className="size-4 shrink-0 text-violet-600 dark:text-violet-300" />
            لیست کاربران
            <TabPill count={total} tone="violet" />
          </TabsTrigger>
          <TabsTrigger
            value="teachers"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <GraduationCap className="size-4 shrink-0 text-teal-600 dark:text-teal-300" />
            اساتید
            <TabPill count={teachersTotal} tone="emerald" />
          </TabsTrigger>
        </TabsList>

        {/* — تب «اقساط پرداخت‌شده‌ی اخیر» — */}
        <TabsContent value="recent-paid">
          <RecentPaidSection data={overview.data} />
        </TabsContent>

        {/* — تب «همه‌ی اقساط باقیمانده کاربران» — */}
        <TabsContent value="remaining">
          <RemainingSection
            data={overview.data}
            onChanged={() => overview.reload(true)}
          />
        </TabsContent>

        {/* — تب «لیست کاربران»: فیلترها + جدول/کارت‌ها + صفحه‌بندی — */}
        <TabsContent value="users" className="space-y-5">

          {/* — فیلترها: جست‌وجو + وضعیت + به‌روزرسانی — */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجوی نام یا شماره موبایل..."
                aria-label="جستجوی کاربر"
                className="h-11 rounded-xl bg-foreground/[0.03] pr-10 text-sm dark:bg-white/[0.04]"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                if (v === "") return;
                changeStatusFilter(v as StatusFilter);
              }}
              dir="rtl"
            >
              <SelectTrigger
                aria-label="فیلتر وضعیت حساب"
                className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm sm:w-44 dark:bg-white/[0.04]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه‌ی وضعیت‌ها</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="blocked">مسدود</SelectItem>
              </SelectContent>
            </Select>
            {/* افزودن کاربر جدید (نام، نام خانوادگی و شماره الزامی) */}
            <Button
              onClick={() => setAddOpen(true)}
              aria-label="افزودن کاربر جدید"
              className={`h-11 rounded-xl px-5 text-xs font-bold ${btnGradient}`}
            >
              <UserPlus className="size-4" />
              افزودن کاربر
            </Button>
            <Button
              variant="outline"
              onClick={() => load()}
              disabled={loading}
              aria-label="به‌روزرسانی فهرست"
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
                <TableSkeleton rows={6} cols={6} />
              </div>
              <div className="space-y-3 md:hidden" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="glass h-32 animate-pulse rounded-2xl" />
                ))}
              </div>
            </>
          ) : showEmpty ? (
            <EmptyState
              icon={Inbox}
              title="کاربری یافت نشد"
              description={
                query || status !== "all"
                  ? "با این جست‌وجو یا فیلتر کاربری وجود ندارد؛ عبارت دیگری را امتحان کنید."
                  : "هنوز کاربری از فرم ثبت‌نام سایت عضو نشده است."
              }
            >
              {!query && status === "all" ? (
                <Button
                  onClick={() => setAddOpen(true)}
                  size="sm"
                  className={`rounded-xl ${btnGradient}`}
                >
                  <UserPlus className="size-4" />
                  افزودن اولین کاربر
                </Button>
              ) : null}
            </EmptyState>
          ) : users ? (
            <>
              {/* — جدول دسکتاپ — */}
              <div className="glass hidden overflow-hidden rounded-2xl md:block">
                <div className="max-h-[70vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>کاربر</TableHead>
                        <TableHead>ثبت‌نام‌ها</TableHead>
                        <TableHead>اقساط</TableHead>
                        <TableHead>وضعیت حساب</TableHead>
                        <TableHead>تاریخ عضویت</TableHead>
                        <TableHead className="text-left">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => {
                        const statusMeta =
                          u.status in ACCOUNT_STATUS
                            ? ACCOUNT_STATUS[u.status]
                            : ACCOUNT_STATUS.active;
                        const instTotal = u.installmentPaid + u.installmentPending;
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="max-w-44">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white ${tileGradient} shadow-md`}
                                  aria-hidden
                                >
                                  {displayName(u).charAt(0)}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                    <p className="truncate text-sm font-bold text-foreground">
                                      {displayName(u)}
                                    </p>
                                    <RoleChip u={u} />
                                  </div>
                                  <a
                                    href={`tel:${u.phone}`}
                                    dir="ltr"
                                    className="flex w-fit items-center justify-start gap-1 text-xs font-semibold text-teal-600 transition-colors hover:underline dark:text-teal-300 dark:hover:text-teal-200"
                                    title="تماس با کاربر"
                                  >
                                    <Phone className="size-3" />
                                    {faDigits(u.phone)}
                                  </a>
                                  {u.nationalId ? (
                                    <p
                                      dir="ltr"
                                      className="flex w-fit items-center justify-start gap-1 text-[0.6rem] font-bold tabular-nums text-muted-foreground"
                                      title="کد ملی — برای استعلام گواهی‌نامه"
                                    >
                                      <IdCard className="size-3" />
                                      {faDigits(u.nationalId)}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs font-bold tabular-nums text-foreground">
                                <ClipboardList className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                                {faDigits(u.enrollmentsCount)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {instTotal > 0 ? (
                                <div className="space-y-0.5">
                                  <p className="whitespace-nowrap text-xs font-bold tabular-nums text-foreground">
                                    {faDigits(u.installmentPaid)}
                                    <span className="text-muted-foreground">
                                      {" "}
                                      / {faDigits(instTotal)}
                                    </span>
                                  </p>
                                  {u.installmentTotalAmount > 0 ? (
                                    <p className="whitespace-nowrap text-[0.6rem] font-medium tabular-nums text-muted-foreground">
                                      {faAmount(u.installmentPaidAmount)} از{" "}
                                      {faAmount(u.installmentTotalAmount)} تومان
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                                  statusMeta.badge
                                )}
                              >
                                {u.status === "blocked" ? (
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
                                {faDate(u.createdAt)}
                              </span>
                            </TableCell>
                            <TableCell className="text-left">
                              {rowActions(u, true)}
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
                {users.map((u) => {
                  const statusMeta =
                    u.status in ACCOUNT_STATUS
                      ? ACCOUNT_STATUS[u.status]
                      : ACCOUNT_STATUS.active;
                  const instTotal = u.installmentPaid + u.installmentPending;
                  return (
                    <article key={u.id} className="glass space-y-3 rounded-2xl p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-base font-black text-white ${tileGradient} shadow-md`}
                          aria-hidden
                        >
                          {displayName(u).charAt(0)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <p className="truncate text-sm font-black text-foreground">
                                {displayName(u)}
                              </p>
                              <RoleChip u={u} />
                            </div>
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
                            href={`tel:${u.phone}`}
                            dir="ltr"
                            className="mt-0.5 flex w-fit items-center justify-start gap-1 text-xs font-semibold text-teal-600 dark:text-teal-300"
                            title="تماس با کاربر"
                          >
                            <Phone className="size-3" />
                            {faDigits(u.phone)}
                          </a>
                          {u.nationalId ? (
                            <p
                              dir="ltr"
                              className="mt-0.5 flex w-fit items-center justify-start gap-1 text-[0.65rem] font-bold tabular-nums text-muted-foreground"
                              title="کد ملی — برای استعلام گواهی‌نامه"
                            >
                              <IdCard className="size-3" />
                              {faDigits(u.nationalId)}
                            </p>
                          ) : null}
                          <p className="mt-1 flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                            <CalendarDays className="size-3" />
                            عضویت: {faDate(u.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[0.6rem] font-bold">
                        <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-foreground">
                          {faDigits(u.enrollmentsCount)} ثبت‌نام
                        </span>
                        {instTotal > 0 ? (
                          <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-muted-foreground">
                            اقساط {faDigits(u.installmentPaid)} از {faDigits(instTotal)}
                            {u.installmentTotalAmount > 0
                              ? ` · ${faAmount(u.installmentPaidAmount)} تومان`
                              : ""}
                          </span>
                        ) : (
                          <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-muted-foreground">
                            بدون اقساط
                          </span>
                        )}
                      </div>

                      <div className="border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
                        {rowActions(u, false)}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* — صفحه‌بندی — */}
              {pageCount > 1 && (
                <nav
                  aria-label="صفحه‌بندی کاربران"
                  className="flex items-center justify-between gap-3"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-10 rounded-xl px-5 text-xs font-bold"
                  >
                    <ChevronRight className="size-4" />
                    قبلی
                  </Button>
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">
                    صفحه‌ی {faDigits(page)} از {faDigits(pageCount)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount || loading}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    className="h-10 rounded-xl px-5 text-xs font-bold"
                  >
                    بعدی
                    <ChevronLeft className="size-4" />
                  </Button>
                </nav>
              )}
            </>
          ) : null}
        </TabsContent>

        {/* — تب «اساتید»: فهرست اساتید با آمار و عملیات کامل (دیالوگ‌های همان کاربران) — */}
        <TabsContent value="teachers" className="space-y-5">
          <TeachersTab
            teachers={teachers}
            loading={teachersLoading}
            busyId={busyId}
            onRefresh={() => {
              void loadTeachers();
            }}
            onAdd={() => setAddTeacherOpen(true)}
            onEdit={(u) => setEditUser(u)}
            onDetail={(u) => setDetailUser(u)}
            onEnroll={(u) => setEnrollTarget(u)}
            onLogin={(u) => setLoginTarget(u)}
            onPayments={(u) => setTeacherPaymentsUser(u)}
            onToggleBlock={(u) => {
              void toggleBlock(u);
            }}
            onDemote={(t) => {
              void demoteTeacher(t);
            }}
            onDelete={handleDelete}
          />
        </TabsContent>
      </Tabs>

      {/* — دیالوگ پرداختی‌ها و اقساط کاربر (تب کاربران) — */}
      <UserPaymentsDialog
        user={paymentsUser}
        open={!!paymentsUser}
        onOpenChange={(o) => {
          if (!o) setPaymentsUser(null);
        }}
        onManageInstallments={manageInstallments}
        onChanged={() => {
          void load();
          overview.reload(true);
        }}
      />

      {/* — دیالوگ دوتابی پرداختی‌ها و اقساط استاد (تب اساتید):
          تب ۱ پرداختی‌ها/اقساط + تب ۲ درآمد استاد و شبا و واریزها — */}
      <TeacherPaymentsDialog
        teacher={teacherPaymentsUser}
        open={!!teacherPaymentsUser}
        onOpenChange={(o) => {
          if (!o) setTeacherPaymentsUser(null);
        }}
        onManageInstallments={manageInstallments}
        onChanged={() => {
          void load();
          void loadTeachers();
          overview.reload(true);
        }}
      />

      {/* — دیالوگ جزئیات کاربر — */}
      <UserDetailDialog
        user={detailUser}
        open={!!detailUser}
        onOpenChange={(o) => {
          if (!o) setDetailUser(null);
        }}
        onEdit={(user) => {
          setDetailUser(null);
          setEditUser(user);
        }}
        onManageInstallments={manageInstallments}
      />

      {/* — دیالوگ ویرایش کاربر (و استاد) — */}
      <EditUserDialog
        user={editUser}
        open={!!editUser}
        onOpenChange={(o) => {
          if (!o) setEditUser(null);
        }}
        onSaved={() => {
          void load();
          void loadTeachers();
        }}
      />

      {/* — دیالوگ افزودن کاربر جدید — */}
      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => {
          void load();
          overview.reload(true);
        }}
      />

      {/* — دیالوگ افزودن استاد (کاربر جدید یا تبدیل کاربر موجود) — */}
      <AddTeacherDialog
        open={addTeacherOpen}
        onOpenChange={setAddTeacherOpen}
        onSaved={() => {
          void load();
          void loadTeachers();
        }}
      />

      {/* — دیالوگ افزودن کاربر به دانشجویان یک دوره — */}
      <EnrollUserDialog
        user={enrollTarget}
        open={!!enrollTarget}
        onOpenChange={(o) => {
          if (!o) setEnrollTarget(null);
        }}
        onSaved={() => {
          void load();
          overview.reload(true);
        }}
      />

      {/* — دیالوگ ورود مدیر به سایت به عنوان کاربر — */}
      <LoginAsUserDialog
        user={loginTarget}
        open={!!loginTarget}
        onOpenChange={(o) => {
          if (!o) setLoginTarget(null);
        }}
      />

      {/* — دیالوگ مدیریت اقساط (از پروفایل کاربر باز می‌شود) — */}
      {installmentsTarget ? (
        <InstallmentsDialog
          enrollmentId={installmentsTarget.id}
          enrollmentTitle={installmentsTarget.title}
          open={!!installmentsTarget}
          onOpenChange={(o) => {
            if (!o) setInstallmentsTarget(null);
          }}
          onChanged={() => {
            void load();
            overview.reload(true);
          }}
        />
      ) : null}
    </div>
  );
}
