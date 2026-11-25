"use client";

import * as React from "react";
import {
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  Layers,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Plus,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { faDate, faDigits } from "@/lib/fa";
import {
  ACCESS_TYPES,
  ACCESS_TYPE_LABELS,
  type ExamAccessType,
} from "@/lib/exam";
import type { ExamWithStats } from "@/components/admin/types";
import {
  AccessBadge,
  AttemptsViewer,
  QuestionsEditor,
} from "@/components/admin/modules/exams-module";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { PublishSwitch } from "@/components/admin/shared/publish-switch";
import { UploadUrlContext } from "@/components/admin/shared/upload-url-context";

/* ————————————————— انواع (قرارداد API /api/teacher/exams) ————————————————— */

/** گزینه‌ی دوره/کلاس خودِ استاد */
interface TargetOption {
  id: string;
  title: string;
}

/** فرم آزمون (رشته‌ای) — مانند ماژول مدیریت اما محدود به دارایی استاد */
interface ExamForm {
  title: string;
  description: string;
  accessType: ExamAccessType;
  courseId: string;
  classId: string;
  password: string;
  durationMinutes: string;
  allowBack: boolean;
  published: boolean;
}

/* ————————————————— ثابت‌ها و ابزارهای محلی ————————————————— */

/** کارت شیشه‌ای هماهنگ با بقیه‌ی پنل استاد */
const CARD =
  "rounded-2xl border border-foreground/[0.08] bg-card/85 p-4 shadow-xl shadow-black/[0.04] backdrop-blur-xl sm:p-6 dark:border-white/[0.08] dark:bg-[#08110e]/70 dark:shadow-black/20";

/** استایل آیکون دکمه‌ی عملیات کارت */
const ACTION_BTN =
  "size-10 rounded-xl text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]";

/* ————————————————— بخش «ساخت آزمون» ————————————————— */

/**
 * TeacherExamsSection — بخش «ساخت آزمون» در حالت استادِ پنل:
 * فهرست آزمون‌های ساخته‌شده توسط خودِ استاد (creatorId)، ایجاد/ویرایش/
 * حذف، ادیتور هشت‌نوع سوال (ادیتور مشترک مدیریت با مسیر API استاد) و
 * مشاهده/تصحیح پاسخ‌برگه‌ها.
 *
 * دسترسی‌ها محدودند: آزمون دوره فقط به دوره‌های خودِ استاد و آزمون کلاس
 * فقط به کلاس‌های خودِ استاد وصل می‌شود (سرویس هم سمت سرور می‌سنجد).
 */
export function TeacherExamsSection() {
  const [exams, setExams] = React.useState<ExamWithStats[] | null>(null);
  const [denied, setDenied] = React.useState(false);

  // — انتخابگر دوره/کلاس خودِ استاد —
  const [courses, setCourses] = React.useState<TargetOption[] | null>(null);
  const [classes, setClasses] = React.useState<TargetOption[] | null>(null);

  // — دیالوگ ایجاد/ویرایش —
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExamWithStats | null>(null);
  const [form, setForm] = React.useState<ExamForm | null>(null);
  const [saving, setSaving] = React.useState(false);

  // — ادیتور سوالات + پاسخ‌برگه‌ها —
  const [questionsExam, setQuestionsExam] = React.useState<ExamWithStats | null>(null);
  const [attemptsExam, setAttemptsExam] = React.useState<ExamWithStats | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/teacher/exams", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setDenied(true);
        setExams([]);
        toast.error(json.error ?? "دسترسی استاد ندارید.");
        return;
      }
      if (!res.ok) throw new Error();
      const json = (await res.json()) as ExamWithStats[];
      setExams(Array.isArray(json) ? json : []);
      setDenied(false);
    } catch {
      setExams([]);
      toast.error("دریافت آزمون‌ها ناموفق بود؛ دوباره تلاش کنید.");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** دوره‌ها و کلاس‌های خودِ استاد را برای انتخابگر دسترسی می‌گیرد */
  async function ensureOptions() {
    if (courses !== null && classes !== null) return;
    try {
      const [courseRes, classRes] = await Promise.all([
        fetch("/api/teacher/courses", { cache: "no-store" }),
        fetch("/api/teacher/classes", { cache: "no-store" }),
      ]);
      if (!courseRes.ok || !classRes.ok) throw new Error();
      const courseList = (await courseRes.json()) as Array<{ id: string; title: string }>;
      const classList = (await classRes.json()) as Array<{ id: string; title: string }>;
      setCourses(courseList.map((c) => ({ id: c.id, title: c.title })));
      setClasses(classList.map((c) => ({ id: c.id, title: c.title })));
    } catch {
      setCourses([]);
      setClasses([]);
      toast.error("دریافت دوره/کلاس‌ها ناموفق بود.");
    }
  }

  /* ————————————— ایجاد / ویرایش ————————————— */

  function openCreate() {
    void ensureOptions();
    setEditing(null);
    setForm({
      title: "",
      description: "",
      accessType: "open",
      courseId: "",
      classId: "",
      password: "",
      durationMinutes: "0",
      allowBack: true,
      published: true,
    });
    setDialogOpen(true);
  }

  function openEdit(exam: ExamWithStats) {
    void ensureOptions();
    setEditing(exam);
    setForm({
      title: exam.title,
      description: exam.description ?? "",
      accessType: (exam.accessType as ExamAccessType) ?? "open",
      courseId: exam.courseId ?? "",
      classId: exam.classId ?? "",
      password: exam.password ?? "",
      durationMinutes: String(exam.durationMinutes ?? 0),
      allowBack: exam.allowBack ?? true,
      published: exam.published,
    });
    setDialogOpen(true);
  }

  const set = <K extends keyof ExamForm>(key: K, value: ExamForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function handleSave() {
    if (!form || saving) return;
    const title = form.title.trim();
    if (title.length < 2) {
      toast.error("عنوان آزمون حداقل ۲ نویسه است.");
      return;
    }
    if (form.accessType === "course" && !form.courseId) {
      toast.error("آزمون دوره باید به یکی از دوره‌های خودتان متصل باشد.");
      return;
    }
    if (form.accessType === "class" && !form.classId) {
      toast.error("آزمون کلاس باید به یکی از کلاس‌های خودتان متصل باشد.");
      return;
    }
    if (form.accessType === "password" && form.password.trim().length < 3) {
      toast.error("رمز آزمون رمزدار حداقل ۳ نویسه است.");
      return;
    }
    const duration = Math.max(0, Math.floor(Number(form.durationMinutes) || 0));

    setSaving(true);
    try {
      const body = JSON.stringify({
        title,
        description: form.description.trim(),
        accessType: form.accessType,
        courseId: form.courseId || "",
        classId: form.classId || "",
        password: form.password,
        durationMinutes: duration,
        allowBack: form.allowBack,
        published: form.published,
      });
      const res = editing
        ? await fetch(`/api/teacher/exams/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await fetch("/api/teacher/exams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "خطا در ذخیره‌ی آزمون.");
      if (editing) {
        toast.success("آزمون ویرایش شد.");
      } else {
        toast.success("آزمون ایجاد شد؛ حالا سوالات آن را اضافه کنید.");
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در ذخیره‌ی آزمون.");
    } finally {
      setSaving(false);
    }
  }

  /** تغییر وضعیت انتشار — بدنه‌ی کامل آزمون بازسازی و ارسال می‌شود */
  async function handleTogglePublished(
    exam: ExamWithStats,
    next: boolean
  ): Promise<void> {
    try {
      const res = await fetch(`/api/teacher/exams/${exam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: exam.title,
          description: exam.description ?? "",
          accessType: exam.accessType,
          courseId: exam.courseId ?? "",
          classId: exam.classId ?? "",
          password: exam.password ?? "",
          durationMinutes: exam.durationMinutes ?? 0,
          allowBack: exam.allowBack ?? true,
          published: next,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "تغییر وضعیت انتشار ناموفق بود.");
      }
      setExams(
        (prev) =>
          prev?.map((e) => (e.id === exam.id ? { ...e, published: next } : e)) ??
          null
      );
      toast.success(next ? "آزمون منتشر شد." : "آزمون به پیش‌نویس برگشت.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تغییر وضعیت انتشار ناموفق بود."
      );
    }
  }

  async function handleDelete(exam: ExamWithStats): Promise<void> {
    try {
      const res = await fetch(`/api/teacher/exams/${exam.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "حذف آزمون ناموفق بود.");
      setExams((prev) => prev?.filter((e) => e.id !== exam.id) ?? null);
      toast.success("آزمون حذف شد.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حذف آزمون ناموفق بود.");
    }
  }

  /* ————————————— رندر ————————————— */

  return (
    <UploadUrlContext.Provider value="/api/teacher/upload">
      <section aria-label="ساخت آزمون" className="space-y-4">
        {/* سربرگ بخش */}
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 sm:mb-2">
          <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
            <FilePlus2 className="size-5 text-teal-600 dark:text-teal-300" />
            ساخت آزمون
          </h2>
          <div className="flex items-center gap-2">
            <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
              {exams === null ? "…" : `${faDigits(exams.length)} آزمون`}
            </span>
            <Button
              type="button"
              onClick={openCreate}
              className="h-9 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-4 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.02]"
            >
              <Plus className="size-4" />
              آزمون جدید
            </Button>
          </div>
        </div>

        {/* فهرست آزمون‌ها */}
        {exams === null ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            {[0, 1].map((k) => (
              <div key={k} className={cn(CARD, "animate-pulse space-y-3")}>
                <div className="h-5 w-48 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
                <div className="h-4 w-64 animate-pulse rounded bg-foreground/[0.07] dark:bg-white/[0.07]" />
                <div className="h-10 w-full animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
              </div>
            ))}
          </div>
        ) : denied ? (
          <div
            className={cn(CARD, "flex flex-col items-center gap-4 px-6 py-12 text-center")}
            role="alert"
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
              <ClipboardCheck className="size-7 text-muted-foreground" />
            </span>
            <div>
              <p className="text-base font-black text-foreground">
                دسترسی به بخش آزمون‌ها ندارید
              </p>
              <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                این بخش فقط برای استادهای آکادمی فعال است.
              </p>
            </div>
          </div>
        ) : exams.length === 0 ? (
          <div
            className={cn(CARD, "flex flex-col items-center gap-4 px-6 py-12 text-center")}
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
              <FilePlus2 className="size-7 text-muted-foreground" />
            </span>
            <div>
              <p className="text-base font-black text-foreground">
                هنوز آزمونی نساخته‌اید
              </p>
              <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                با دکمه‌ی «آزمون جدید» اولین آزمون (دوره‌ای، کلاسی، آزاد یا
                رمزدار) خود را بسازید؛ سپس سوالات آن را با هشت نوع سوال
                اضافه کنید.
              </p>
            </div>
            <Button
              type="button"
              onClick={openCreate}
              className="h-11 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01]"
            >
              <Plus className="size-4" />
              آزمون جدید
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:gap-5">
            {exams.map((exam) => (
              <article key={exam.id} className={CARD}>
                {/* عنوان + نشان دسترسی + وضعیت انتشار */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-foreground/[0.07] pb-3 dark:border-white/[0.07]">
                  <div className="min-w-0 space-y-1.5">
                    <h3 className="text-base font-black leading-7 text-foreground sm:text-lg">
                      {exam.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <AccessBadge type={exam.accessType} />
                      {exam.course?.title ? (
                        <span className="flex items-center gap-1 text-[0.7rem] font-bold text-muted-foreground">
                          <LinkIcon className="size-3" />
                          {exam.course.title}
                        </span>
                      ) : exam.class?.title ? (
                        <span className="flex items-center gap-1 text-[0.7rem] font-bold text-muted-foreground">
                          <Users className="size-3" />
                          {exam.class.title}
                        </span>
                      ) : null}
                      {exam.durationMinutes > 0 ? (
                        <span className="flex items-center gap-1 text-[0.7rem] font-bold text-muted-foreground">
                          <Timer className="size-3" />
                          {faDigits(exam.durationMinutes)} دقیقه
                        </span>
                      ) : null}
                      <span className="text-[0.65rem] font-medium text-muted-foreground">
                        {faDate(exam.createdAt)}
                      </span>
                    </div>
                  </div>
                  <PublishSwitch
                    published={exam.published}
                    onToggle={(next) => void handleTogglePublished(exam, next)}
                  />
                </div>

                {/* شمارنده‌ها + عملیات */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] font-bold text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Layers className="size-3.5 text-teal-600 dark:text-teal-300" />
                      {faDigits(exam._count?.questions ?? 0)} سوال
                    </span>
                    <span className="flex items-center gap-1.5">
                      <ClipboardList className="size-3.5 text-violet-600 dark:text-violet-300" />
                      {faDigits(exam._count?.attempts ?? 0)} پاسخ‌برگه
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[0.6rem] font-black",
                        exam.allowBack
                          ? "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
                      )}
                    >
                      {exam.allowBack ? "با بازگشت" : "بدون بازگشت"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQuestionsExam(exam)}
                      className="h-9 rounded-xl gap-1.5 border-teal-500/30 bg-teal-500/[0.06] px-3 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-500/[0.12] dark:border-teal-400/25 dark:bg-teal-400/[0.08] dark:text-teal-300"
                    >
                      <Layers className="size-3.5" />
                      سوالات
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAttemptsExam(exam)}
                      className="h-9 rounded-xl gap-1.5 border-violet-500/30 bg-violet-500/[0.06] px-3 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-500/[0.12] dark:border-violet-400/25 dark:bg-violet-400/[0.08] dark:text-violet-300"
                    >
                      <ClipboardList className="size-3.5" />
                      پاسخ‌برگه‌ها
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(exam)}
                      aria-label="ویرایش آزمون"
                      title="ویرایش"
                      className={ACTION_BTN}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <ConfirmDelete
                      title="حذف آزمون"
                      description={`آزمون «${exam.title}» همراه همه‌ی سوالات و پاسخ‌برگه‌های آن حذف می‌شود. مطمئن هستید؟`}
                      onConfirm={() => handleDelete(exam)}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="حذف آزمون"
                        title="حذف"
                        className={cn(ACTION_BTN, "hover:text-destructive")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </ConfirmDelete>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* ————— دیالوگ ایجاد/ویرایش آزمون ————— */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent
            dir="rtl"
            className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg"
          >
            <DialogHeader className="text-right">
              <DialogTitle className="text-lg">
                {editing ? "ویرایش آزمون" : "آزمون جدید"}
              </DialogTitle>
              <DialogDescription>
                نوع دسترسی، رمز (برای آزمون رمزدار) و مدت زمان این‌جا تعیین
                می‌شود؛ سوالات پس از ذخیره از دکمه‌ی «سوالات» اضافه می‌شوند.
              </DialogDescription>
            </DialogHeader>

            {form ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="texam-title">عنوان آزمون</Label>
                  <Input
                    id="texam-title"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="مثلاً: آزمون میان‌ترم طراحی وب"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="texam-desc">توضیح (اختیاری)</Label>
                  <Textarea
                    id="texam-desc"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="توضیح کوتاه درباره‌ی آزمون؛ برای کاربران نمایش داده می‌شود."
                    className="min-h-20"
                  />
                </div>

                <div className="space-y-2">
                  <Label>نوع دسترسی</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ACCESS_TYPES.map((type) => {
                      const active = form.accessType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            set("accessType", type);
                            if (type !== "course") set("courseId", "");
                            if (type !== "class") set("classId", "");
                            if (type !== "password") set("password", "");
                          }}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all",
                            active
                              ? "border-teal-500/50 bg-teal-500/[0.07] dark:border-teal-400/50 dark:bg-teal-400/[0.06]"
                              : "border-foreground/[0.12] bg-foreground/[0.02] hover:border-teal-500/30 dark:border-white/[0.12] dark:bg-white/[0.02]"
                          )}
                          aria-pressed={active}
                        >
                          <span className="text-xs font-black text-foreground">
                            {ACCESS_TYPE_LABELS[type]}
                          </span>
                          <span className="text-[0.6rem] leading-4 text-muted-foreground">
                            {type === "course"
                              ? "فقط اعضای همان دوره"
                              : type === "open"
                                ? "همه‌ی کاربران"
                                : type === "class"
                                  ? "فقط اعضای همان کلاس"
                                  : "با وارد کردن رمز"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {form.accessType === "course" ? (
                  <div className="space-y-2">
                    <Label>دوره‌ی متصل (دوره‌های شما)</Label>
                    <Select
                      value={form.courseId}
                      onValueChange={(v) => set("courseId", v)}
                    >
                      <SelectTrigger dir="rtl" className="w-full">
                        <SelectValue placeholder="دوره‌ای انتخاب کنید..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(courses ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[0.7rem] leading-5 text-muted-foreground">
                      آزمون فقط به اعضای ثبت‌نام‌شده‌ی این دوره نمایش داده
                      می‌شود.
                    </p>
                    {(courses ?? []).length === 0 ? (
                      <p className="text-[0.7rem] font-bold leading-5 text-amber-600 dark:text-amber-300">
                        هنوز دوره‌ای نساخته‌اید؛ از بخش «دوره‌ها(استاد)» اولین
                        دوره را بسازید.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {form.accessType === "class" ? (
                  <div className="space-y-2">
                    <Label>کلاس هدف (کلاس‌های شما)</Label>
                    <Select
                      value={form.classId}
                      onValueChange={(v) => set("classId", v)}
                    >
                      <SelectTrigger dir="rtl" className="w-full">
                        <SelectValue placeholder="کلاسی انتخاب کنید..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(classes ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[0.7rem] leading-5 text-muted-foreground">
                      آزمون فقط برای اعضای همین کلاس در پنل کاربری نمایش داده
                      می‌شود.
                    </p>
                    {(classes ?? []).length === 0 ? (
                      <p className="text-[0.7rem] font-bold leading-5 text-amber-600 dark:text-amber-300">
                        هنوز کلاسی نساخته‌اید؛ از بخش «کلاس‌های من» اولین کلاس
                        را بسازید.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {form.accessType === "password" ? (
                  <div className="space-y-2">
                    <Label htmlFor="texam-password">رمز آزمون</Label>
                    <Input
                      id="texam-password"
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      placeholder="رمزی که کاربران باید وارد کنند"
                      autoComplete="off"
                    />
                    <p className="text-[0.7rem] leading-5 text-muted-foreground">
                      همه‌ی کاربران آزمون را در لیست می‌بینند؛ شرکت‌کننده‌ها با
                      وارد کردن همین رمز وارد آزمون می‌شوند.
                    </p>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 items-end gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="texam-duration">مدت آزمون (دقیقه)</Label>
                    <Input
                      id="texam-duration"
                      type="number"
                      min={0}
                      value={form.durationMinutes}
                      onChange={(e) => set("durationMinutes", e.target.value)}
                      placeholder="۰"
                    />
                    <p className="text-[0.7rem] leading-5 text-muted-foreground">
                      صفر یعنی بدون محدودیت زمانی.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>وضعیت انتشار</Label>
                    <div className="flex h-10 items-center">
                      <PublishSwitch
                        published={form.published}
                        onToggle={(next) => set("published", next)}
                      />
                    </div>
                  </div>
                </div>

                {/* سوییچ: امکان بازگشت به سوالات قبلی */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="texam-allow-back" className="text-xs">
                      بازگشت به سوالات قبلی
                    </Label>
                    <p className="text-[0.65rem] leading-4 text-muted-foreground">
                      روشن: کاربر هنگام آزمون می‌تواند به سوالات قبلی برگردد ·
                      خاموش: فقط حرکت رو به جلو.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <Switch
                      id="texam-allow-back"
                      checked={form.allowBack}
                      onCheckedChange={(next) => set("allowBack", next)}
                      aria-label="بازگشت به سوالات قبلی"
                    />
                    <span
                      className={cn(
                        "whitespace-nowrap text-[0.6rem] font-black",
                        form.allowBack
                          ? "text-teal-600 dark:text-teal-300"
                          : "text-amber-600 dark:text-amber-300"
                      )}
                    >
                      {form.allowBack ? "با بازگشت" : "بدون بازگشت"}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-start">
              <Button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="h-11 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-6 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01]"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="size-4" />
                )}
                {editing ? "ذخیره‌ی تغییرات" : "ایجاد آزمون"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
                className="h-11 rounded-xl px-4 text-sm font-bold"
              >
                انصراف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ————— ادیتور سوالات (ادیتور مشترک مدیریت با API استاد) ————— */}
        {questionsExam ? (
          <QuestionsEditor
            exam={questionsExam}
            onClose={() => setQuestionsExam(null)}
            onChanged={load}
            apiBase="/api/teacher/exams"
          />
        ) : null}

        {/* ————— پاسخ‌برگه‌ها / تصحیح ————— */}
        {attemptsExam ? (
          <AttemptsViewer
            exam={attemptsExam}
            onClose={() => setAttemptsExam(null)}
            apiBase="/api/teacher/exams"
          />
        ) : null}
      </section>
    </UploadUrlContext.Provider>
  );
}
