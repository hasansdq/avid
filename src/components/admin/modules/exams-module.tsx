"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Globe,
  GraduationCap,
  KeyRound,
  Layers,
  Library,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Timer,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ImageUrlField } from "@/components/admin/shared/image-url-field";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { PublishSwitch } from "@/components/admin/shared/publish-switch";
import {
  SortableRows,
  SortableTableRow,
} from "@/components/admin/shared/sortable-rows";
import { btnGradient } from "@/components/admin/shared/styles";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import type { ExamAttempt, ExamQuestion, ExamWithStats } from "../types";
import {
  ACCESS_TYPES,
  ACCESS_TYPE_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  countBlanks,
  defaultsForType,
  gradeAttempt,
  parseJsonField,
  tableBlankKeys,
  type ExamAccessType,
  type GradingQuestion,
  type QuestionAnswer,
  type QuestionOptions,
  type QuestionType,
} from "@/lib/exam";
import { faDate, faDigits } from "@/lib/fa";

/* ————————————————— انواع داخلی ماژول ————————————————— */

/** فرم آزمون (رشته‌ای) */
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

/** پیش‌نام آزمون برای انتخاب دوره */
interface CourseOption {
  id: string;
  title: string;
}

/** پیش‌نام آزمون برای انتخاب کلاس */
interface ClassOption {
  id: string;
  title: string;
}

/** سوال در حال ویرایش (options/answer ساختاریافته — نه JSON رشته) */
interface QuestionDraft {
  key: string;
  type: QuestionType;
  text: string;
  image: string;
  video: string;
  points: string;
  options: QuestionOptions;
  answer: QuestionAnswer;
}

let draftSeq = 0;
const nextDraftKey = () => `q-${++draftSeq}`;

function toFloat(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function draftFromQuestion(q: ExamQuestion): QuestionDraft {
  return {
    key: nextDraftKey(),
    type: (QUESTION_TYPES as readonly string[]).includes(q.type)
      ? (q.type as QuestionType)
      : "multiple_choice",
    text: q.text,
    image: q.image,
    video: q.video,
    points: String(q.points),
    options: parseJsonField<QuestionOptions>(q.options, {}),
    answer: parseJsonField<QuestionAnswer>(q.answer, {}),
  };
}

function draftToPayload(d: QuestionDraft) {
  return {
    type: d.type,
    text: d.text,
    image: d.image,
    video: d.video,
    points: toFloat(d.points),
    options: d.options,
    answer: d.answer,
  };
}

/* ————————————————— نشان نوع دسترسی ————————————————— */

const ACCESS_STYLES: Record<
  ExamAccessType,
  { icon: typeof Globe; className: string }
> = {
  course: {
    icon: GraduationCap,
    className:
      "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300",
  },
  open: {
    icon: Globe,
    className:
      "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-300",
  },
  password: {
    icon: KeyRound,
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
  },
  class: {
    icon: Users,
    className:
      "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300",
  },
};

function AccessBadge({ type }: { type: string }) {
  const key = (ACCESS_TYPES as readonly string[]).includes(type)
    ? (type as ExamAccessType)
    : "open";
  const s = ACCESS_STYLES[key];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 whitespace-nowrap", s.className)}
    >
      <s.icon className="size-3" />
      {ACCESS_TYPE_LABELS[key]}
    </Badge>
  );
}

/* ————————————————— فیلد ویدئو (آدرس یا آپلود) ————————————————— */

const VIDEO_ACCEPT =
  "video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogv,.mov";
const MAX_VIDEO_BYTES = 256 * 1024 * 1024;

function VideoUrlField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File | undefined) {
    if (!file || uploading) return;
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("حجم ویدئو حداکثر ۲۵۶ مگابایت می‌تواند باشد.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      // بدون kind=video درخشت با خطای «فرمت تصویر» رد می‌شد — پیش‌تر این
      // فیلد kind نمی‌فرستاد و آپلود mp4/webm ناموفق بود.
      body.append("kind", "video");
      body.append("section", "exams");
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "خطا در بارگذاری ویدئو.");
      }
      onChange(data.url);
      toast.success("ویدئو بارگذاری شد");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "خطا در بارگذاری ویدئو."
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="آدرس ویدئو یا بارگذاری از سیستم"
          className="text-left"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="shrink-0 rounded-lg text-[0.7rem] font-bold"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          بارگذاری ویدئو
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={VIDEO_ACCEPT}
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            void handleUpload(e.target.files?.[0]);
          }}
        />
      </div>
      {hint ? (
        <p className="text-[0.7rem] leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ————————————————— ادیتور لیست رشته‌ای (گزینه/آیتم) ————————————————— */

function EditableList({
  label,
  items,
  onChange,
  addLabel,
  placeholder,
  min = 0,
  hint,
  rowExtra,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  placeholder?: string;
  min?: number;
  hint?: string;
  /** محتوای اضافی هر ردیف (مثل رادیو انتخاب گزینه‌ی صحیح) */
  rowExtra?: (index: number) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            {rowExtra ? rowExtra(i) : null}
            <Input
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
              aria-label={`${label} — مورد ${faDigits(i + 1)}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={items.length <= min}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`حذف ${label} — مورد ${faDigits(i + 1)}`}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, ""])}
        className="rounded-lg text-[0.7rem] font-bold"
      >
        <Plus className="size-3.5" />
        {addLabel}
      </Button>
      {hint ? (
        <p className="text-[0.7rem] leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ————————————————— ماژول اصلی ————————————————— */

export function ExamsModule() {
  const [exams, setExams] = useState<ExamWithStats[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseOption[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[] | null>(null);

  // تب فعال: فهرست آزمون‌ها / بانک آزمون‌ها
  const [tab, setTab] = useState<"list" | "bank">("list");

  // دیالوگ آزمون
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExamWithStats | null>(null);
  const [form, setForm] = useState<ExamForm | null>(null);
  const [saving, setSaving] = useState(false);

  // دیالوگ برگزاری دوباره (بانک آزمون‌ها)
  const [reholdExam, setReholdExam] = useState<ExamWithStats | null>(null);
  const [reholdTarget, setReholdTarget] = useState<string>("all");
  const [reholding, setReholding] = useState(false);

  // ادیتور سوالات + پاسخ‌برگه‌ها
  const [questionsExam, setQuestionsExam] = useState<ExamWithStats | null>(
    null
  );
  const [attemptsExam, setAttemptsExam] = useState<ExamWithStats | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [examList, courseList, classList] = await Promise.all([
        apiFetch<ExamWithStats[]>("/api/admin/exams"),
        apiFetch<CourseOption[]>("/api/admin/courses"),
        apiFetch<ClassOption[]>("/api/admin/classes"),
      ]);
      setExams(examList);
      setCourses(courseList.map((c) => ({ id: c.id, title: c.title })));
      setClasses(classList.map((c) => ({ id: c.id, title: c.title })));
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ————— ایجاد / ویرایش ————— */

  function openCreate() {
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
    setExamDialogOpen(true);
  }

  function openEdit(exam: ExamWithStats) {
    setEditing(exam);
    setForm({
      title: exam.title,
      description: exam.description,
      accessType: (exam.accessType as ExamAccessType) ?? "open",
      courseId: exam.courseId ?? "",
      classId: exam.classId ?? "",
      password: exam.password ?? "",
      durationMinutes: String(exam.durationMinutes ?? 0),
      allowBack: exam.allowBack ?? true,
      published: exam.published,
    });
    setExamDialogOpen(true);
  }

  const set = <K extends keyof ExamForm>(key: K, value: ExamForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function handleSaveExam() {
    if (!form) return;
    if (form.title.trim().length < 2) {
      toast.error("عنوان آزمون حداقل ۲ نویسه است.");
      return;
    }
    if (form.accessType === "course" && !form.courseId) {
      toast.error("آزمون دوره باید به یک دوره متصل باشد.");
      return;
    }
    if (form.accessType === "class" && !form.classId) {
      toast.error("آزمون کلاس باید به یک کلاس متصل باشد.");
      return;
    }
    if (form.accessType === "password" && form.password.trim().length < 3) {
      toast.error("رمز آزمون رمزدار حداقل ۳ نویسه است.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title,
        description: form.description,
        accessType: form.accessType,
        courseId: form.courseId || "",
        classId: form.classId || "",
        password: form.password,
        durationMinutes: form.durationMinutes,
        allowBack: form.allowBack,
        published: form.published,
      };
      if (editing) {
        await apiFetch(`/api/admin/exams/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("آزمون ویرایش شد.");
      } else {
        await apiFetch("/api/admin/exams", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("آزمون ایجاد شد؛ حالا سوالات آن را اضافه کنید.");
      }
      setExamDialogOpen(false);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  /** تغییر وضعیت انتشار از کلید جدول — بدنه‌ی کامل آزمون بازسازی می‌شود */
  async function handleTogglePublished(
    exam: ExamWithStats,
    next: boolean
  ): Promise<void> {
    try {
      await apiFetch(`/api/admin/exams/${exam.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: exam.title,
          description: exam.description,
          accessType: exam.accessType,
          courseId: exam.courseId ?? "",
          classId: exam.classId ?? "",
          password: exam.password ?? "",
          durationMinutes: exam.durationMinutes,
          allowBack: exam.allowBack ?? true,
          published: next,
        }),
      });
      setExams(
        (prev) =>
          prev?.map((e) => (e.id === exam.id ? { ...e, published: next } : e)) ??
          null
      );
      toast.success(next ? "آزمون منتشر شد." : "آزمون به پیش‌نویس برگشت.");
    } catch (error) {
      toastApiError(error);
    }
  }

  async function handleDelete(exam: ExamWithStats): Promise<void> {
    try {
      await apiFetch(`/api/admin/exams/${exam.id}`, { method: "DELETE" });
      setExams((prev) => prev?.filter((e) => e.id !== exam.id) ?? null);
      toast.success("آزمون حذف شد.");
    } catch (error) {
      toastApiError(error);
    }
  }

  /* ————— بانک آزمون‌ها: برگزاری دوباره ————— */

  /** باز کردن دیالوگ برگزاری دوباره — پیش‌فرض همان کلاس آزمون بانکی */
  function openRehold(exam: ExamWithStats) {
    setReholdTarget(exam.classId ?? "all");
    setReholdExam(exam);
  }

  async function handleRehold() {
    if (!reholdExam) return;
    setReholding(true);
    try {
      await apiFetch(`/api/admin/exams/${reholdExam.id}/rehold`, {
        method: "POST",
        body: JSON.stringify({
          classId: reholdTarget === "all" ? "" : reholdTarget,
        }),
      });
      toast.success(
        reholdTarget === "all"
          ? "برگزاری تازه برای همه‌ی کاربران ساخته شد."
          : "برگزاری تازه برای کلاس انتخاب‌شده ساخته شد."
      );
      setReholdExam(null);
      setTab("list");
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setReholding(false);
    }
  }

  /* ————— جابه‌جایی با کشیدن و رها کردن ————— */

  /** ذخیره‌ی ترتیب جدید آزمون‌ها — به‌روی کور محلی، در خطا بازگشت */
  async function handleReorder(orderedIds: string[]): Promise<void> {
    const prev = exams;
    if (!prev) return;
    const byId = new Map(prev.map((e) => [e.id, e]));
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((e): e is ExamWithStats => e !== undefined);
    setExams(next);
    try {
      await apiFetch("/api/admin/exams/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: orderedIds }),
      });
      toast.success("ترتیب آزمون‌ها ذخیره شد.");
    } catch (error) {
      toastApiError(error);
      setExams(prev);
    }
  }

  /* ————— رندر ————— */

  // آزمون‌های بانک (اصلی) — برگزاری‌های دوباره (isBankCopy) در بانک فهرست نمی‌شوند
  const bankItems = (exams ?? []).filter((e) => !e.isBankCopy);

  /** شمار برگزاری‌های هر آزمون بانکی = خود آزمون + دفعات برگزاری دوباره */
  const holdingsCount = (item: ExamWithStats) =>
    1 + (exams ?? []).filter((e) => e.bankOriginId === item.id).length;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="آزمون‌ها"
        description="ایجاد آزمون دوره‌ای (ویژه اعضای دوره)، کلاسی (ویژه اعضای کلاس)، آزاد و رمزدار؛ با هشت نوع سوال، تصویر و ویدئو و بانک آزمون‌ها برای برگزاری دوباره."
      >
        <Button
          type="button"
          onClick={openCreate}
          className={cn("rounded-xl", btnGradient)}
        >
          <Plus className="size-4" />
          آزمون جدید
        </Button>
      </ModuleHeader>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "list" | "bank")}
        dir="rtl"
        className="gap-4"
      >
        <TabsList className="glass h-auto w-full flex-wrap justify-start gap-1 rounded-2xl p-1.5 sm:w-auto">
          <TabsTrigger
            value="list"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <ClipboardCheck className="size-4 shrink-0 text-teal-600 dark:text-teal-300" />
            آزمون‌ها
          </TabsTrigger>
          <TabsTrigger
            value="bank"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <Library className="size-4 shrink-0 text-rose-600 dark:text-rose-300" />
            بانک آزمون‌ها
          </TabsTrigger>
        </TabsList>

        {/* — تب «آزمون‌ها»: برگزاری‌های فعال (اصلی + برگزاری دوباره) — */}
        <TabsContent value="list" className="mt-1 space-y-0">
      {loading ? (
        <TableSkeleton cols={7} />
      ) : !exams || exams.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="هنوز آزمونی ساخته نشده است"
          description="با دکمه‌ی «آزمون جدید» اولین آزمون (دوره‌ای، کلاسی، آزاد یا رمزدار) را بسازید؛ سپس سوالات آن را اضافه کنید. هر آزمون به‌صورت خودکار در بانک آزمون‌ها ذخیره می‌شود."
        >
          <Button
            type="button"
            onClick={openCreate}
            className={cn("rounded-xl", btnGradient)}
          >
            <Plus className="size-4" />
            آزمون جدید
          </Button>
        </EmptyState>
      ) : (
        <SortableRows
          ids={exams.map((e) => e.id)}
          onReorder={(ids) => void handleReorder(ids)}
        >
          <div className="glass overflow-hidden rounded-2xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">تغییر ترتیب</span>
                  </TableHead>
                  <TableHead>عنوان</TableHead>
                <TableHead>نوع دسترسی</TableHead>
                <TableHead>دوره / کلاس</TableHead>
                <TableHead>سوالات</TableHead>
                <TableHead>پاسخ‌برگه‌ها</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="text-left">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((exam) => (
                <SortableTableRow key={exam.id} id={exam.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 font-bold text-foreground">
                        {exam.title}
                        {exam.isBankCopy ? (
                          <Badge
                            variant="outline"
                            className="gap-1 whitespace-nowrap border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300"
                          >
                            <Repeat className="size-3" />
                            برگزاری دوباره
                          </Badge>
                        ) : null}
                      </span>
                      {exam.durationMinutes > 0 ? (
                        <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                          <Timer className="size-3" />
                          {faDigits(exam.durationMinutes)} دقیقه
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <AccessBadge type={exam.accessType} />
                  </TableCell>
                  <TableCell>
                    {exam.course?.title ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <LinkIcon className="size-3.5" />
                        {exam.course.title}
                      </span>
                    ) : exam.class?.title ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="size-3.5" />
                        {exam.class.title}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-bold tabular-nums text-foreground">
                      {faDigits(exam._count?.questions ?? 0)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold tabular-nums text-foreground">
                      {faDigits(exam._count?.attempts ?? 0)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <PublishSwitch
                      published={exam.published}
                      onToggle={(next) => handleTogglePublished(exam, next)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setQuestionsExam(exam)}
                        aria-label="سوالات این آزمون"
                        title="سوالات"
                        className="text-teal-600 hover:bg-teal-500/10 dark:text-teal-300"
                      >
                        <Layers className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setAttemptsExam(exam)}
                        aria-label="پاسخ‌برگه‌های این آزمون"
                        title="پاسخ‌برگه‌ها"
                        className="text-violet-600 hover:bg-violet-500/10 dark:text-violet-300"
                      >
                        <ClipboardList className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(exam)}
                        aria-label="ویرایش آزمون"
                        title="ویرایش"
                        className="text-muted-foreground hover:text-foreground"
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
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </ConfirmDelete>
                    </div>
                  </TableCell>
                </SortableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </SortableRows>
      )}
        </TabsContent>

        {/* — تب «بانک آزمون‌ها»: هر آزمون فقط یک‌بار به‌صورت خودکار ذخیره می‌شود — */}
        <TabsContent value="bank" className="mt-1 space-y-0">
          {loading ? (
            <TableSkeleton cols={6} />
          ) : bankItems.length === 0 ? (
            <EmptyState
              icon={Library}
              title="بانک آزمون‌ها خالی است"
              description="هر آزمونی که می‌سازید به‌صورت خودکار یک‌بار در بانک ذخیره می‌شود؛ با دکمه‌ی «برگزاری دوباره» می‌توانید همان آزمون را برای همان کلاس یا کلاس دیگری دوباره برگزار کنید."
            >
              <Button
                type="button"
                onClick={openCreate}
                className={cn("rounded-xl", btnGradient)}
              >
                <Plus className="size-4" />
                آزمون جدید
              </Button>
            </EmptyState>
          ) : (
            <div className="glass overflow-hidden rounded-2xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان</TableHead>
                    <TableHead>نوع دسترسی</TableHead>
                    <TableHead>دوره / کلاس</TableHead>
                    <TableHead>سوالات</TableHead>
                    <TableHead>برگزاری‌ها</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankItems.map((exam) => (
                    <TableRow key={exam.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-foreground">
                            {exam.title}
                          </span>
                          {exam.durationMinutes > 0 ? (
                            <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                              <Timer className="size-3" />
                              {faDigits(exam.durationMinutes)} دقیقه
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <AccessBadge type={exam.accessType} />
                      </TableCell>
                      <TableCell>
                        {exam.course?.title ? (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <LinkIcon className="size-3.5" />
                            {exam.course.title}
                          </span>
                        ) : exam.class?.title ? (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Users className="size-3.5" />
                            {exam.class.title}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-bold tabular-nums text-foreground">
                          {faDigits(exam._count?.questions ?? 0)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="gap-1 whitespace-nowrap border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-300"
                        >
                          <Repeat className="size-3" />
                          {faDigits(holdingsCount(exam))} برگزاری
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            onClick={() => openRehold(exam)}
                            className={cn("rounded-xl", btnGradient)}
                          >
                            <Repeat className="size-4" />
                            برگزاری دوباره
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(exam)}
                            aria-label="ویرایش آزمون بانک"
                            title="ویرایش"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <ConfirmDelete
                            title="حذف آزمون از بانک"
                            description={`آزمون «${exam.title}» همراه همه‌ی سوالات و پاسخ‌برگه‌های آن حذف می‌شود؛ برگزاری‌های تازه‌ی ساخته‌شده از آن باقی می‌مانند. مطمئن هستید؟`}
                            onConfirm={() => handleDelete(exam)}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="حذف آزمون بانک"
                              title="حذف"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </ConfirmDelete>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ————— دیالوگ ایجاد/ویرایش آزمون ————— */}
      <Dialog open={examDialogOpen} onOpenChange={setExamDialogOpen}>
        <DialogContent
          dir="rtl"
          className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg"
        >
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg">
              {editing ? "ویرایش آزمون" : "آزمون جدید"}
            </DialogTitle>
            <DialogDescription>
              نوع دسترسی، رمز (برای آزمون رمزدار) و مدت زمان این‌جا تعیین می‌شود؛
              سوالات پس از ذخیره از دکمه‌ی لایه‌آیکون اضافه می‌شوند.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="exam-title">عنوان آزمون</Label>
                <Input
                  id="exam-title"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="مثلاً: آزمون میان‌ترم طراحی وب"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exam-desc">توضیح (اختیاری)</Label>
                <Textarea
                  id="exam-desc"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="توضیح کوتاه درباره‌ی آزمون؛ برای کاربران نمایش داده می‌شود."
                  className="min-h-20"
                />
              </div>

              <div className="space-y-2">
                <Label>نوع دسترسی</Label>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {ACCESS_TYPES.map((type) => {
                    const s = ACCESS_STYLES[type];
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
                          "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                          active
                            ? "border-teal-500/50 bg-teal-500/[0.07] dark:border-teal-400/50 dark:bg-teal-400/[0.06]"
                            : "border-foreground/[0.12] bg-foreground/[0.02] hover:border-teal-500/30 dark:border-white/[0.12] dark:bg-white/[0.02]"
                        )}
                        aria-pressed={active}
                      >
                        <s.icon
                          className={cn(
                            "size-5",
                            active
                              ? "text-teal-600 dark:text-teal-300"
                              : "text-muted-foreground"
                          )}
                        />
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
                  <Label>دوره‌ی متصل</Label>
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
                    آزمون فقط به اعضای ثبت‌نام‌شده‌ی این دوره نمایش داده می‌شود.
                  </p>
                </div>
              ) : null}

              {form.accessType === "class" ? (
                <div className="space-y-2">
                  <Label>کلاس هدف</Label>
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
                    می‌شود؛ سایر کاربران آن را نمی‌بینند و نمی‌توانند باز کنند.
                  </p>
                  {(classes ?? []).length === 0 ? (
                    <p className="text-[0.7rem] font-bold leading-5 text-amber-600 dark:text-amber-300">
                      هنوز کلاسی ساخته نشده است؛ از ماژول «کلاس‌ها» اولین کلاس
                      را بسازید.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {form.accessType === "password" ? (
                <div className="space-y-2">
                  <Label htmlFor="exam-password">رمز آزمون</Label>
                  <Input
                    id="exam-password"
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
                  <Label htmlFor="exam-duration">مدت آزمون (دقیقه)</Label>
                  <Input
                    id="exam-duration"
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

              {/* سوییچ: امکان بازگشت به سوالات قبلی هنگام آزمون */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="exam-allow-back" className="text-xs">
                    بازگشت به سوالات قبلی
                  </Label>
                  <p className="text-[0.65rem] leading-4 text-muted-foreground">
                    روشن: کاربر هنگام آزمون می‌تواند به سوالات قبلی برگردد و
                    پاسخ‌ها را ویرایش کند · خاموش: فقط حرکت رو به جلو و بدون
                    دسترسی به سوالات قبل.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <Switch
                    id="exam-allow-back"
                    checked={form.allowBack}
                    onCheckedChange={(next) => set("allowBack", next)}
                    aria-label="بازگشت به سوالات قبلی"
                  />
                  <span
                    className={cn(
                      "text-[0.6rem] font-black whitespace-nowrap",
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
              onClick={handleSaveExam}
              className={cn("rounded-xl", btnGradient)}
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
              onClick={() => setExamDialogOpen(false)}
              className="rounded-xl"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ————— دیالوگ برگزاری دوباره (بانک آزمون‌ها) ————— */}
      <Dialog
        open={!!reholdExam}
        onOpenChange={(open) => {
          if (!open) setReholdExam(null);
        }}
      >
        <DialogContent dir="rtl" className="rounded-2xl sm:max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Repeat className="size-5 text-teal-600 dark:text-teal-300" />
              برگزاری دوباره
            </DialogTitle>
            <DialogDescription className="leading-6">
              از آزمون «{reholdExam?.title}» با{" "}
              {faDigits(reholdExam?._count?.questions ?? 0)} سوال، برگزاری
              تازه‌ای با همان سوالات و پاسخ‌برگه‌های خالی ساخته می‌شود؛ آزمون
              اصلی بانک دست‌نخورده می‌ماند.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>برگزاری برای</Label>
            <Select value={reholdTarget} onValueChange={setReholdTarget}>
              <SelectTrigger dir="rtl" className="w-full">
                <SelectValue placeholder="مخاطبان برگزاری..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه‌ی کاربران (آزمون آزاد)</SelectItem>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[0.7rem] leading-5 text-muted-foreground">
              همان کلاس یا کلاس دیگری را انتخاب کنید؛ آزمون تازه فقط برای
              اعضای همان کلاس نمایش داده می‌شود (انتخاب «همه‌ی کاربران» =
              آزمون آزاد).
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={reholding}
              onClick={() => void handleRehold()}
              className={cn("rounded-xl", btnGradient)}
            >
              {reholding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Repeat className="size-4" />
              )}
              برگزاری دوباره
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={reholding}
              onClick={() => setReholdExam(null)}
              className="rounded-xl"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ————— ادیتور سوالات ————— */}
      {questionsExam ? (
        <QuestionsEditor
          exam={questionsExam}
          onClose={() => setQuestionsExam(null)}
          onChanged={load}
        />
      ) : null}

      {/* ————— پاسخ‌برگه‌ها / تصحیح ————— */}
      {attemptsExam ? (
        <AttemptsViewer
          exam={attemptsExam}
          onClose={() => setAttemptsExam(null)}
        />
      ) : null}
    </div>
  );
}

/* ————————————————— ادیتور سوالات آزمون ————————————————— */

function QuestionsEditor({
  exam,
  onClose,
  onChanged,
}: {
  exam: ExamWithStats;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [drafts, setDrafts] = useState<QuestionDraft[] | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [newType, setNewType] = useState<QuestionType>("multiple_choice");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const full = await apiFetch<ExamWithStats & {
          questions: ExamQuestion[];
        }>(`/api/admin/exams/${exam.id}`);
        if (cancelled) return;
        setDrafts(full.questions.map(draftFromQuestion));
      } catch (error) {
        toastApiError(error);
        onClose();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exam.id]);

  if (drafts === null) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          dir="rtl"
          className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-3xl"
        >
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg">سوالات آزمون</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const update = (key: string, patch: Partial<QuestionDraft>) =>
    setDrafts((prev) =>
      prev ? prev.map((d) => (d.key === key ? { ...d, ...patch } : d)) : prev
    );
  const updateOptions = (key: string, patch: Record<string, unknown>) =>
    setDrafts((prev) =>
      prev
        ? prev.map((d) =>
            d.key === key
              ? {
                  ...d,
                  options: { ...d.options, ...patch } as QuestionOptions,
                }
              : d
          )
        : prev
    );
  const updateAnswer = (key: string, patch: Record<string, unknown>) =>
    setDrafts((prev) =>
      prev
        ? prev.map((d) =>
            d.key === key
              ? { ...d, answer: { ...d.answer, ...patch } as QuestionAnswer }
              : d
          )
        : prev
    );

  function addQuestion() {
    const defaults = defaultsForType(newType);
    const key = nextDraftKey();
    setDrafts((prev) => [
      ...(prev ?? []),
      {
        key,
        type: newType,
        text: "",
        image: "",
        video: "",
        points: "1",
        options: defaults.options,
        answer: defaults.answer,
      },
    ]);
    setExpandedKey(key);
  }

  function moveDraft(index: number, delta: number) {
    setDrafts((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const j = index + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  async function handleSave() {
    if (!drafts || drafts.length === 0) {
      toast.error("حداقل یک سوال برای آزمون لازم است.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/admin/exams/${exam.id}/questions`, {
        method: "PUT",
        body: JSON.stringify({ questions: drafts.map(draftToPayload) }),
      });
      toast.success("سوالات ذخیره شد.");
      await onChanged();
      onClose();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-3xl"
      >
        <DialogHeader className="text-right">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            سوالات آزمون
            <span className="text-sm font-bold text-muted-foreground">
              «{exam.title}»
            </span>
          </DialogTitle>
          <DialogDescription>
            هشت نوع سوال پشتیبانی می‌شود؛ به همه‌ی سوالات می‌توان تصویر یا ویدئو
            افزود. پاسخ‌های مجاز متنی را با «|» از هم جدا کنید.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-1">
          {/* نوار افزودن سوال */}
          <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
            <Select value={newType} onValueChange={(v) => setNewType(v as QuestionType)}>
              <SelectTrigger dir="rtl" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={addQuestion}
              className={cn("rounded-xl", btnGradient)}
            >
              <Plus className="size-4" />
              افزودن سوال
            </Button>
            <span className="ms-auto text-xs font-bold text-muted-foreground">
              {faDigits(drafts.length)} سوال
            </span>
          </div>

          {drafts.length === 0 ? (
            <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.02] px-4 py-8 text-sm text-muted-foreground dark:border-white/15 dark:bg-white/[0.02]">
              نوع سوال را انتخاب و «افزودن سوال» را بزنید.
            </p>
          ) : null}

          {drafts.map((d, i) => (
            <QuestionCard
              key={d.key}
              index={i}
              draft={d}
              expanded={expandedKey === d.key}
              onToggle={() =>
                setExpandedKey(expandedKey === d.key ? null : d.key)
              }
              onMove={(delta) => moveDraft(i, delta)}
              onRemove={() =>
                setDrafts((prev) =>
                  prev ? prev.filter((x) => x.key !== d.key) : prev
                )
              }
              update={update}
              updateOptions={updateOptions}
              updateAnswer={updateAnswer}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            disabled={saving || drafts.length === 0}
            onClick={handleSave}
            className={cn("rounded-xl", btnGradient)}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ClipboardCheck className="size-4" />
            )}
            ذخیره‌ی سوالات
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl"
          >
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ————————————————— کارت سوال (باز/بسته + ادیتور) ————————————————— */

function QuestionCard({
  index,
  draft,
  expanded,
  onToggle,
  onMove,
  onRemove,
  update,
  updateOptions,
  updateAnswer,
}: {
  index: number;
  draft: QuestionDraft;
  expanded: boolean;
  onToggle: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  update: (key: string, patch: Partial<QuestionDraft>) => void;
  updateOptions: (key: string, patch: Record<string, unknown>) => void;
  updateAnswer: (key: string, patch: Record<string, unknown>) => void;
}) {
  const key = draft.key;
  const opts = draft.options as Record<string, unknown>;
  const ans = draft.answer as Record<string, unknown>;

  return (
    <div
      className={cn(
        "rounded-2xl border transition-colors",
        expanded
          ? "border-teal-500/40 bg-teal-500/[0.03] dark:border-teal-400/40 dark:bg-teal-400/[0.03]"
          : "border-foreground/[0.1] bg-foreground/[0.02] dark:border-white/[0.1] dark:bg-white/[0.02]"
      )}
    >
      {/* سربرگ کارت */}
      <div className="flex items-center gap-2 p-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-xs font-black tabular-nums text-foreground dark:bg-white/[0.06]">
          {faDigits(index + 1)}
        </span>
        <Badge variant="outline" className="whitespace-nowrap text-[0.6rem]">
          {QUESTION_TYPE_LABELS[draft.type]}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">
          {draft.text.trim() || "بدون متن"}
        </span>
        <span className="shrink-0 text-[0.65rem] font-bold text-muted-foreground">
          {faDigits(toFloat(draft.points))} نمره
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="انتقال به بالا"
            className="size-8 text-muted-foreground"
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMove(1)}
            aria-label="انتقال به پایین"
            className="size-8 text-muted-foreground"
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggle}
            aria-label={expanded ? "بستن ویرایش سوال" : "ویرایش سوال"}
            className="size-8 text-teal-600 dark:text-teal-300"
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <Pencil className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label="حذف سوال"
            className="size-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* بدنه‌ی ویرایش */}
      {expanded ? (
        <div className="space-y-4 border-t border-foreground/[0.07] p-4 dark:border-white/[0.07]">
          {/* متن سوال */}
          <div className="space-y-2">
            <Label htmlFor={`${key}-text`}>متن سوال</Label>
            <Textarea
              id={`${key}-text`}
              value={draft.text}
              onChange={(e) => update(key, { text: e.target.value })}
              placeholder={
                draft.type === "fill_blank"
                  ? "متن را با ___ به‌عنوان جای خالی بنویسید؛ مثال: پایتخت ایران ___ است."
                  : draft.type === "table_fill"
                    ? "اختیاری — توضیح جدول (میتواند خالی بماند)"
                    : "متن سوال را بنویسید..."
              }
              className="min-h-20"
            />
          </div>

          {/* — فیلدهای اختصاصی هر نوع — */}
          {draft.type === "multiple_choice" ? (
            <EditableList
              label="گزینه‌ها (گزینه‌ی صحیح را با دکمه‌ی رادیویی تعیین کنید)"
              items={(opts.options as string[]) ?? []}
              onChange={(next) => {
                const correct = (ans.answer as number) ?? 0;
                updateOptions(key, { options: next });
                if (correct >= next.length) {
                  updateAnswer(key, { answer: Math.max(0, next.length - 1) });
                }
              }}
              addLabel="گزینه‌ی جدید"
              placeholder="متن گزینه"
              min={2}
              rowExtra={(i) => (
                <button
                  type="button"
                  onClick={() => updateAnswer(key, { answer: i })}
                  aria-label={`گزینه‌ی ${faDigits(i + 1)} صحیح است`}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    (ans.answer as number) === i
                      ? "border-teal-500 bg-gradient-to-br from-teal-400 to-emerald-500 dark:border-teal-400"
                      : "border-foreground/30 bg-card dark:border-white/30"
                  )}
                >
                  {(ans.answer as number) === i ? (
                    <CheckCircle2 className="size-3 text-teal-950" />
                  ) : null}
                </button>
              )}
            />
          ) : null}

          {draft.type === "true_false" ? (
            <div className="space-y-2">
              <Label>پاسخ صحیح</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["true", "false"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateAnswer(key, { answer: v })}
                    className={cn(
                      "rounded-xl border p-3 text-sm font-black transition-all",
                      (ans.answer as string) === v
                        ? "border-teal-500/50 bg-teal-500/[0.07] text-teal-700 dark:border-teal-400/50 dark:bg-teal-400/[0.06] dark:text-teal-300"
                        : "border-foreground/[0.12] bg-foreground/[0.02] text-foreground dark:border-white/[0.12] dark:bg-white/[0.02]"
                    )}
                    aria-pressed={(ans.answer as string) === v}
                  >
                    {v === "true" ? "درست" : "نادرست"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {draft.type === "fill_blank" ? (
            <FillBlankEditor draft={draft} updateAnswer={updateAnswer} />
          ) : null}

          {draft.type === "short_answer" ? (
            <div className="space-y-2">
              <Label htmlFor={`${key}-accepted`}>پاسخ‌های مجاز</Label>
              <Input
                id={`${key}-accepted`}
                value={((ans.accepted as string[]) ?? []).join("|")}
                onChange={(e) =>
                  updateAnswer(key, {
                    accepted: e.target.value.split("|").map((s) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="مثال: قرمز|سرخ|Red — با | جدا کنید"
              />
              <p className="text-[0.7rem] leading-5 text-muted-foreground">
                هر کدام از این پاسخ‌ها (بدون توجه به فاصله و کوچکی/بزرگی حروف)
                پذیرفته می‌شود.
              </p>
            </div>
          ) : null}

          {draft.type === "essay" ? (
            <div className="space-y-2">
              <Label htmlFor={`${key}-sample`}>پاسخ نمونه (راهنمای تصحیح)</Label>
              <Textarea
                id={`${key}-sample`}
                value={(ans.sample as string) ?? ""}
                onChange={(e) => updateAnswer(key, { sample: e.target.value })}
                placeholder="پاسخ نمونه‌ی تشریحی — فقط برای راهنمای تصحیح شما؛ کاربر آن را نمی‌بیند."
                className="min-h-24"
              />
              <p className="text-[0.7rem] leading-5 text-muted-foreground">
                پاسخ کاربر به‌صورت متن آزاد ذخیره می‌شود و نمره‌ی نهایی توسط شما
                در «پاسخ‌برگه‌ها» ثبت می‌شود.
              </p>
            </div>
          ) : null}

          {draft.type === "matching" ? (
            <MatchingEditor
              draft={draft}
              updateOptions={updateOptions}
              updateAnswer={updateAnswer}
            />
          ) : null}

          {draft.type === "ordering" ? (
            <EditableList
              label="آیتم‌ها به ترتیب صحیح"
              items={(opts.items as string[]) ?? []}
              onChange={(next) => updateOptions(key, { items: next })}
              addLabel="آیتم جدید"
              placeholder="متن آیتم"
              min={2}
              hint="آیتم‌ها را به همان ترتیبی که باید در پاسخ نهایی قرار بگیرند بنویسید؛ برای کاربر به‌هم‌ریخته نمایش داده می‌شوند."
            />
          ) : null}

          {draft.type === "table_fill" ? (
            <TableFillEditor
              draft={draft}
              updateOptions={updateOptions}
              updateAnswer={updateAnswer}
            />
          ) : null}

          {/* نمره */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${key}-points`}>نمره‌ی این سوال</Label>
              <Input
                id={`${key}-points`}
                type="number"
                min={0.5}
                step={0.5}
                value={draft.points}
                onChange={(e) => update(key, { points: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>نوع سوال</Label>
              <div className="flex h-10 items-center">
                <Badge variant="outline" className="text-[0.65rem]">
                  {QUESTION_TYPE_LABELS[draft.type]}
                </Badge>
              </div>
            </div>
          </div>

          {/* رسانه — تصویر و ویدئو برای همه‌ی انواع */}
          <ImageUrlField
            id={`${key}-image`}
            label="تصویر سوال (اختیاری)"
            value={draft.image}
            onChange={(v) => update(key, { image: v })}
            section="exams"
          />
          <VideoUrlField
            id={`${key}-video`}
            label="ویدئو سوال (اختیاری)"
            value={draft.video}
            onChange={(v) => update(key, { video: v })}
            hint="فایل ویدئو (حداکثر ۲۵۶ مگابایت) یا آدرس مستقیم (mp4/webm)."
          />
        </div>
      ) : null}
    </div>
  );
}

/* ————————————————— ادیتور جای خالی ————————————————— */

function FillBlankEditor({
  draft,
  updateAnswer,
}: {
  draft: QuestionDraft;
  updateAnswer: (key: string, patch: Record<string, unknown>) => void;
}) {
  const key = draft.key;
  const ans = draft.answer as Record<string, unknown>;
  const blanks = (ans.blanks as string[][]) ?? [];
  const count = countBlanks(draft.text);

  return (
    <div className="space-y-2">
      <Label>پاسخ‌های مجاز هر جای خالی</Label>
      {count === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[0.7rem] font-bold leading-5 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
          <XCircle className="size-4 shrink-0" />
          متن سوال هنوز جای خالی ندارد — در متن از «___» استفاده کنید (هر
          «___» یک جای خالی است).
        </p>
      ) : null}
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-[0.65rem] font-black text-muted-foreground dark:bg-white/[0.06]">
            {faDigits(i + 1)}
          </span>
          <Input
            value={(blanks[i] ?? []).join("|")}
            onChange={(e) => {
              const next = Array.from({ length: count }, (_, j) =>
                j === i
                  ? e.target.value.split("|").map((s) => s.trim()).filter(Boolean)
                  : (blanks[j] ?? [])
              );
              updateAnswer(key, { blanks: next });
            }}
            placeholder="پاسخ‌های مجاز با | جدا کنید — مثال: تهران|پایتخت"
            aria-label={`پاسخ جای خالی ${faDigits(i + 1)}`}
          />
        </div>
      ))}
      {count > 0 ? (
        <p className="text-[0.7rem] leading-5 text-muted-foreground">
          {faDigits(count)} جای خالی در متن سوال شناسایی شد؛ برای هرکدام حداقل
          یک پاسخ بنویسید.
        </p>
      ) : null}
    </div>
  );
}

/* ————————————————— ادیتور وصل‌کردنی ————————————————— */

function MatchingEditor({
  draft,
  updateOptions,
  updateAnswer,
}: {
  draft: QuestionDraft;
  updateOptions: (key: string, patch: Record<string, unknown>) => void;
  updateAnswer: (key: string, patch: Record<string, unknown>) => void;
}) {
  const key = draft.key;
  const opts = draft.options as Record<string, unknown>;
  const ans = draft.answer as Record<string, unknown>;
  const left = (opts.left as string[]) ?? [];
  const right = (opts.right as string[]) ?? [];
  const pairs = (ans.pairs as number[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EditableList
          label="آیتم‌های سمت راست (اول)"
          items={left}
          onChange={(next) => {
            updateOptions(key, { left: next });
            const np = Array.from(
              { length: next.length },
              (_, i) => pairs[i] ?? i
            );
            updateAnswer(key, { pairs: np });
          }}
          addLabel="آیتم جدید"
          placeholder="مثلاً: پایتخت فرانسه"
          min={2}
        />
        <EditableList
          label="آیتم‌های سمت چپ (دوم)"
          items={right}
          onChange={(next) => updateOptions(key, { right: next })}
          addLabel="آیتم جدید"
          placeholder="مثلاً: پاریس"
          min={2}
        />
      </div>

      <div className="space-y-2">
        <Label>اتصال صحیح (هر آیتم اول → آیتم دوم)</Label>
        <div className="space-y-2">
          {left.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded-lg border border-foreground/[0.1] bg-foreground/[0.02] px-3 py-2 text-sm font-semibold dark:border-white/[0.1] dark:bg-white/[0.02]">
                {l || `آیتم ${faDigits(i + 1)}`}
              </span>
              <Select
                value={String(pairs[i] ?? 0)}
                onValueChange={(v) => {
                  const np = Array.from(
                    { length: left.length },
                    (_, j) => (j === i ? parseInt(v, 10) : pairs[j] ?? j)
                  );
                  updateAnswer(key, { pairs: np });
                }}
              >
                <SelectTrigger dir="rtl" className="w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {right.map((r, j) => (
                    <SelectItem key={j} value={String(j)}>
                      {r || `آیتم ${faDigits(j + 1)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <p className="text-[0.7rem] leading-5 text-muted-foreground">
          کاربر هر آیتم اول را به یکی از آیتم‌های دوم وصل می‌کند؛ اتصال‌های
          بالا پاسخ صحیح هستند.
        </p>
      </div>
    </div>
  );
}

/* ————————————————— ادیتور پرکردن جدول ————————————————— */

function TableFillEditor({
  draft,
  updateOptions,
  updateAnswer,
}: {
  draft: QuestionDraft;
  updateOptions: (key: string, patch: Record<string, unknown>) => void;
  updateAnswer: (key: string, patch: Record<string, unknown>) => void;
}) {
  const key = draft.key;
  const opts = draft.options as Record<string, unknown>;
  const ans = draft.answer as Record<string, unknown>;
  const headers = (opts.headers as string[]) ?? [];
  const rows = (opts.rows as string[][]) ?? [];
  const cells = (ans.cells as Record<string, string[]>) ?? {};
  const blanks = tableBlankKeys({
    headers,
    rows: rows.map((r) => Array.from({ length: headers.length }, (_, c) => r[c] ?? "")),
  });

  function setCell(r: number, c: number, value: string) {
    const next = rows.map((row, ri) =>
      ri === r
        ? Array.from({ length: headers.length }, (_, ci) => row[ci] ?? "")
        : row
    );
    next[r][c] = value;
    updateOptions(key, { rows: next });
  }

  function setHeaders(next: string[]) {
    // تعداد ستون‌ها تغییر کرد — ردیف‌ها هم‌اندازه می‌شوند (خانه‌های جدید = خالی)
    const nextRows = rows.map((row) =>
      Array.from(
        { length: next.length },
        (_, c) => row[c] ?? ""
      )
    );
    updateOptions(key, { headers: next, rows: nextRows });
  }

  return (
    <div className="space-y-4">
      <EditableList
        label="ستون‌های جدول"
        items={headers}
        onChange={setHeaders}
        addLabel="ستون جدید"
        placeholder="نام ستون — مثلاً: شهر"
        min={1}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>جدول (خانه‌ی خالی = جای پاسخ کاربر)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateOptions(key, {
                rows: [
                  ...rows,
                  Array.from({ length: Math.max(headers.length, 1) }, () => ""),
                ],
              })
            }
            className="rounded-lg text-[0.7rem] font-bold"
          >
            <Plus className="size-3.5" />
            ردیف جدید
          </Button>
        </div>

        {headers.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-foreground/[0.1] dark:border-white/[0.1]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-foreground/[0.04] dark:bg-white/[0.04]">
                  {headers.map((h, c) => (
                    <th
                      key={c}
                      className="px-2 py-2 text-center text-xs font-black text-muted-foreground"
                    >
                      {h || `ستون ${faDigits(c + 1)}`}
                    </th>
                  ))}
                  <th className="w-10" aria-label="حذف ردیف" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, r) => (
                  <tr key={r} className="border-t border-foreground/[0.07] dark:border-white/[0.07]">
                    {headers.map((_, c) => (
                      <td key={c} className="p-1">
                        <input
                          value={row[c] ?? ""}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          placeholder={row[c] === undefined || !row[c] ? "خالی = پاسخ کاربر" : ""}
                          aria-label={`خانه ${faDigits(r + 1)},${faDigits(c + 1)}`}
                          className={cn(
                            "w-full min-w-28 rounded-lg border px-2 py-1.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/50",
                            !row[c]
                              ? "border-dashed border-teal-500/40 bg-teal-500/[0.04] dark:border-teal-400/40 dark:bg-teal-400/[0.03]"
                              : "border-transparent bg-foreground/[0.02] dark:bg-white/[0.02]"
                          )}
                        />
                      </td>
                    ))}
                    <td className="p-1 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={rows.length <= 1}
                        onClick={() =>
                          updateOptions(key, {
                            rows: rows.filter((_, i) => i !== r),
                          })
                        }
                        aria-label={`حذف ردیف ${faDigits(r + 1)}`}
                        className="size-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* پاسخ‌های مجاز خانه‌های خالی */}
      {blanks.length > 0 ? (
        <div className="space-y-2">
          <Label>پاسخ‌های مجاز خانه‌های خالی</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {blanks.map((cellKey) => {
              const [r, c] = cellKey.split(",").map((n) => parseInt(n, 10));
              return (
                <div key={cellKey} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-[0.65rem] font-bold text-muted-foreground">
                    {headers[c] || `ستون ${faDigits(c + 1)}`}
                  </span>
                  <Input
                    value={(cells[cellKey] ?? []).join("|")}
                    onChange={(e) =>
                      updateAnswer(key, {
                        cells: {
                          ...cells,
                          [cellKey]: e.target.value
                            .split("|")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                    placeholder="پاسخ‌ها با | جدا شوند"
                    aria-label={`پاسخ مجاز خانه ${faDigits(r + 1)},${faDigits(c + 1)}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ————————————————— پاسخ‌برگه‌ها / تصحیح تشریحی ————————————————— */

interface AttemptRow extends ExamAttempt {
  user: { firstName: string; lastName: string; phone: string };
}

/** پیش‌نویس نمره‌دهی یک پاسخ‌برگه — مقادیر خام فرم (رشته‌ای) */
interface GradeDraft {
  /** questionId → مقدار خام input نمره‌ی آن سوال */
  grades: Record<string, string>;
  /** مقدار خام input نمره‌ی نهایی */
  final: string;
  /** نمره‌ی نهایی دستی؟ (false = خودکار از جمع نمره‌ی سوالات) */
  manual: boolean;
}

/** گرد کردن نمره به دو رقم اعشار */
function roundGrade(n: number): number {
  return Math.round(n * 100) / 100;
}

function AttemptsViewer({
  exam,
  onClose,
}: {
  exam: ExamWithStats;
  onClose: () => void;
}) {
  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});
  const [gradingId, setGradingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [attemptList, full] = await Promise.all([
        apiFetch<AttemptRow[]>(`/api/admin/exams/${exam.id}/attempts`),
        apiFetch<ExamWithStats & { questions: ExamQuestion[] }>(
          `/api/admin/exams/${exam.id}`
        ),
      ]);
      setAttempts(attemptList);
      setQuestions(full.questions);
    } catch (error) {
      toastApiError(error);
    }
  }, [exam.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // — تصحیح خودکار محلی (نتیجه‌ی هر سوال + نمره‌ی خودکار آن) —
  function autoGradeOf(a: AttemptRow) {
    if (!questions) return null;
    const gradingQuestions: GradingQuestion[] = questions.map((q) => ({
      id: q.id,
      type: q.type as QuestionType,
      points: q.points,
      options: parseJsonField<QuestionOptions>(q.options, {}),
      answer: parseJsonField<QuestionAnswer>(q.answer, {}),
    }));
    return gradeAttempt(
      gradingQuestions,
      parseJsonField<Record<string, unknown>>(a.answers, {})
    );
  }

  /** نمره‌ی مؤثر هر سوال: ذخیره‌شده (ویرایش مدیر) > خودکار تصحیح */
  function effectiveGrades(a: AttemptRow): Record<string, number> {
    const stored = parseJsonField<Record<string, number>>(a.grades, {});
    const autoEarned = new Map(
      (autoGradeOf(a)?.perQuestion ?? []).map((g) => [g.questionId, g.earned])
    );
    const out: Record<string, number> = {};
    for (const q of questions ?? []) {
      out[q.id] = q.id in stored ? stored[q.id] : (autoEarned.get(q.id) ?? 0);
    }
    return out;
  }

  /** جمع نمره‌ی سوالات از مقادیر خام پیش‌نویس (مقدار نامعتبر = ۰) */
  function gradesSumOf(grades: Record<string, string>): number {
    return roundGrade(
      Object.values(grades).reduce((sum, raw) => {
        const v = parseFloat(raw);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0)
    );
  }

  /** پیش‌نویس تازه از داده‌ی سرور — اولین نمایش پاسخ‌برگه */
  function initDraft(a: AttemptRow): GradeDraft {
    const eff = effectiveGrades(a);
    const sum = roundGrade(Object.values(eff).reduce((s, v) => s + v, 0));
    const hasScore = a.score !== null && Number.isFinite(a.score);
    // نمره‌ی نهایی ذخیره‌شده که با جمع نمره‌ی سوالات نخواند → دستی تلقی می‌شود
    const manual =
      a.scoreManual || (hasScore && Math.abs((a.score ?? 0) - sum) > 0.005);
    return {
      grades: Object.fromEntries(
        Object.entries(eff).map(([qid, v]) => [qid, String(v)])
      ),
      final: String(hasScore ? (a.score ?? sum) : sum),
      manual,
    };
  }

  /** ویرایش نمره‌ی یک سوال — در حالت خودکار، نمره‌ی نهایی بازمحاسبه می‌شود */
  function updateQuestionGrade(a: AttemptRow, qid: string, value: string) {
    setDrafts((prev) => {
      const cur = prev[a.id] ?? initDraft(a);
      const grades = { ...cur.grades, [qid]: value };
      return {
        ...prev,
        [a.id]: {
          grades,
          final: cur.manual ? cur.final : String(gradesSumOf(grades)),
          manual: cur.manual,
        },
      };
    });
  }

  /** ثبت دستی نمره‌ی نهایی — تایپ مستقیم در فیلد نهایی */
  function updateFinal(a: AttemptRow, value: string) {
    setDrafts((prev) => {
      const cur = prev[a.id] ?? initDraft(a);
      return { ...prev, [a.id]: { ...cur, final: value, manual: true } };
    });
  }

  /** بازگردانی نمره‌ی نهایی به جمع خودکار نمره‌ی سوالات */
  function resetFinalToSum(a: AttemptRow) {
    setDrafts((prev) => {
      const cur = prev[a.id] ?? initDraft(a);
      return {
        ...prev,
        [a.id]: {
          ...cur,
          final: String(gradesSumOf(cur.grades)),
          manual: false,
        },
      };
    });
  }

  /** ذخیره‌ی نمره‌ی همه‌ی سوالات + نمره‌ی نهایی (خودکار از جمع یا دستی) */
  async function handleSaveGrades(a: AttemptRow) {
    if (!questions) return;
    const draft = drafts[a.id] ?? initDraft(a);

    const grades: Record<string, number> = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const v = parseFloat(draft.grades[q.id] ?? "");
      if (!Number.isFinite(v) || v < 0) {
        toast.error(`نمره‌ی سوال ${faDigits(i + 1)} معتبر نیست.`);
        return;
      }
      if (v > q.points + 0.001) {
        toast.error(
          `نمره‌ی سوال ${faDigits(i + 1)} نمی‌تواند بیش از ${faDigits(q.points)} باشد.`
        );
        return;
      }
      grades[q.id] = Math.min(v, q.points);
    }

    let finalScore: number | undefined;
    if (draft.manual) {
      const v = parseFloat(draft.final);
      if (!Number.isFinite(v) || v < 0) {
        toast.error("نمره‌ی نهایی معتبر نیست.");
        return;
      }
      if (v > a.totalPoints + 0.001) {
        toast.error(
          `نمره‌ی نهایی نمی‌تواند بیش از ${faDigits(a.totalPoints)} باشد.`
        );
        return;
      }
      finalScore = Math.min(v, a.totalPoints);
    }

    setGradingId(a.id);
    try {
      await apiFetch(`/api/admin/exams/${exam.id}/attempts`, {
        method: "PATCH",
        body: JSON.stringify({
          attemptId: a.id,
          grades,
          finalManual: draft.manual,
          finalScore,
        }),
      });
      toast.success("نمره‌های پاسخ‌برگه ذخیره شد.");
      // پیش‌نویس کنار می‌رود تا از داده‌ی تازه‌ی سرور دوباره ساخته شود
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[a.id];
        return next;
      });
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setGradingId(null);
    }
  }

  function describeUserAnswer(q: ExamQuestion, user: unknown): string {
    const opts = parseJsonField<Record<string, unknown>>(q.options, {});
    switch (q.type) {
      case "multiple_choice": {
        const list = (opts.options as string[]) ?? [];
        return typeof user === "number" && list[user] ? list[user] : "بی‌پاسخ";
      }
      case "true_false":
        return user === "true"
          ? "درست"
          : user === "false"
            ? "نادرست"
            : "بی‌پاسخ";
      case "fill_blank":
        return Array.isArray(user)
          ? (user as string[]).join(" / ")
          : "بی‌پاسخ";
      case "short_answer":
      case "essay":
        return typeof user === "string" && user.trim() ? user : "بی‌پاسخ";
      case "matching": {
        const left = (opts.left as string[]) ?? [];
        const right = (opts.right as string[]) ?? [];
        if (!Array.isArray(user)) return "بی‌پاسخ";
        return (user as number[])
          .map((v, i) => `${left[i] ?? "؟"} ← ${right[v] ?? "—"}`)
          .join("؛ ");
      }
      case "ordering": {
        const items = (opts.items as string[]) ?? [];
        if (!Array.isArray(user)) return "بی‌پاسخ";
        return (user as number[]).map((v) => items[v] ?? "؟").join(" ← ");
      }
      case "table_fill": {
        if (!user || typeof user !== "object") return "بی‌پاسخ";
        const headers = (opts.headers as string[]) ?? [];
        return Object.entries(user as Record<string, string>)
          .map(([k, v]) => {
            const c = parseInt(k.split(",")[1] ?? "0", 10);
            return `${headers[c] ?? k}: ${v}`;
          })
          .join("؛ ");
      }
      default:
        return "—";
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-3xl"
      >
        <DialogHeader className="text-right">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            پاسخ‌برگه‌های آزمون
            <span className="text-sm font-bold text-muted-foreground">
              «{exam.title}»
            </span>
          </DialogTitle>
          <DialogDescription>
            نمره‌ی کسب‌شده‌ی هر سوال قابل ویرایش است؛ نمره‌ی نهایی خودکار از
            جمع نمره‌ی سوالات به دست می‌آید و در صورت نیاز دستی هم قابل تغییر
            است.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-1">
          {attempts === null ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : attempts.length === 0 ? (
            <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.02] px-4 py-10 text-sm text-muted-foreground dark:border-white/15 dark:bg-white/[0.02]">
              هنوز کسی در این آزمون شرکت نکرده است.
            </p>
          ) : (
            attempts.map((a) => {
              const expanded = expandedId === a.id;
              const answers = parseJsonField<Record<string, unknown>>(
                a.answers,
                {}
              );
              const draft = expanded
                ? (drafts[a.id] ?? initDraft(a))
                : null;
              const sum = draft ? gradesSumOf(draft.grades) : 0;
              const autoPerQuestion = expanded
                ? (autoGradeOf(a)?.perQuestion ?? [])
                : [];
              const autoEarned = new Map(
                autoPerQuestion.map((g) => [g.questionId, g] as const)
              );
              return (
                <div
                  key={a.id}
                  className="rounded-2xl border border-foreground/[0.1] bg-foreground/[0.02] dark:border-white/[0.1] dark:bg-white/[0.02]"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : a.id)}
                    className="flex w-full flex-wrap items-center gap-2 p-3 text-right"
                  >
                    <span className="text-sm font-black text-foreground">
                      {a.user.firstName} {a.user.lastName}
                    </span>
                    <span dir="ltr" className="text-xs text-muted-foreground">
                      {a.user.phone}
                    </span>
                    <span className="ms-auto flex items-center gap-2">
                      {a.hasEssay && a.score === null ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 text-[0.6rem] text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
                        >
                          تشریحی — در انتظار تصحیح
                        </Badge>
                      ) : a.hasEssay ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-[0.6rem] text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300"
                        >
                          تشریحی — تصحیح‌شده
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="text-[0.6rem]">
                        <Clock className="size-3" />
                        {faDate(a.finishedAt ?? a.createdAt)}
                      </Badge>
                      {a.scoreManual ? (
                        <Badge variant="outline" className="text-[0.6rem]">
                          نمره‌ی دستی
                        </Badge>
                      ) : null}
                      <span className="text-xs font-black tabular-nums text-teal-700 dark:text-teal-300">
                        {faDigits(a.score ?? a.autoScore)} از{" "}
                        {faDigits(a.totalPoints)}
                      </span>
                      {expanded ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </span>
                  </button>

                  {expanded && questions && draft ? (
                    <div className="space-y-3 border-t border-foreground/[0.07] p-4 dark:border-white/[0.07]">
                      {questions.map((q, i) => {
                        const user = answers[q.id];
                        const isEssay = q.type === "essay";
                        const autoG = autoEarned.get(q.id);
                        const raw = draft.grades[q.id] ?? "";
                        const earned = parseFloat(raw);
                        const edited =
                          autoG && Number.isFinite(earned)
                            ? Math.abs(earned - autoG.earned) > 0.005
                            : false;
                        const overMax =
                          Number.isFinite(earned) && earned > q.points + 0.001;
                        return (
                          <div
                            key={q.id}
                            className="rounded-xl border border-foreground/[0.08] bg-background/60 p-3 dark:border-white/[0.08]"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="text-sm font-bold leading-6 text-foreground">
                                {faDigits(i + 1)}. {q.text || "—"}
                                <span className="ms-1 text-[0.62rem] font-medium text-muted-foreground">
                                  (
                                  {QUESTION_TYPE_LABELS[
                                    q.type as QuestionType
                                  ] ?? q.type}
                                  {" — "}
                                  {faDigits(q.points)} نمره)
                                </span>
                              </p>
                              {autoG ? (
                                autoG.correct === true ? (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-500/30 bg-emerald-500/10 text-[0.6rem] text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
                                  >
                                    درست
                                  </Badge>
                                ) : autoG.correct === false ? (
                                  <Badge
                                    variant="outline"
                                    className="border-red-500/30 bg-red-500/10 text-[0.6rem] text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300"
                                  >
                                    نادرست
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500/30 bg-amber-500/10 text-[0.6rem] text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
                                  >
                                    تشریحی
                                  </Badge>
                                )
                              ) : null}
                            </div>
                            <p className="mt-2 text-xs leading-6 text-muted-foreground">
                              <span className="font-bold">پاسخ کاربر: </span>
                              <bdi
                                className={cn(
                                  "font-semibold",
                                  isEssay ? "text-foreground" : undefined
                                )}
                              >
                                {describeUserAnswer(q, user)}
                              </bdi>
                            </p>
                            {isEssay ? (
                              <p className="mt-1 text-[0.7rem] leading-5 text-muted-foreground">
                                پاسخ نمونه:{" "}
                                {parseJsonField<{ sample?: string }>(q.answer, {})
                                  .sample || "—"}
                              </p>
                            ) : null}
                            {/* نمره‌ی کسب‌شده‌ی این سوال — قابل ویرایش مدیر */}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Label
                                htmlFor={`q-${a.id}-${q.id}`}
                                className="text-[0.7rem] font-bold"
                              >
                                نمره‌ی کسب‌شده:
                              </Label>
                              <Input
                                id={`q-${a.id}-${q.id}`}
                                type="number"
                                min={0}
                                max={q.points}
                                step={0.25}
                                dir="ltr"
                                className={cn(
                                  "h-8 w-20 rounded-lg",
                                  overMax &&
                                    "border-red-500/60 focus-visible:ring-red-500/40",
                                  !overMax && edited && "border-amber-500/60"
                                )}
                                value={raw}
                                onChange={(e) =>
                                  updateQuestionGrade(a, q.id, e.target.value)
                                }
                              />
                              <span className="text-[0.7rem] text-muted-foreground">
                                از {faDigits(q.points)}
                              </span>
                              {edited && autoG ? (
                                <Badge
                                  variant="outline"
                                  className="text-[0.6rem] text-amber-700 dark:text-amber-300"
                                >
                                  ویرایش مدیر — خودکار: {faDigits(autoG.earned)}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}

                      {/* نمره‌ی نهایی — خودکار از جمع نمره‌ی سوالات یا دستی */}
                      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-teal-500/25 bg-teal-500/[0.04] p-3 dark:border-teal-400/20 dark:bg-teal-400/[0.03]">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`final-${a.id}`}
                            className="text-xs font-bold"
                          >
                            نمره‌ی نهایی (از {faDigits(a.totalPoints)})
                          </Label>
                          <Input
                            id={`final-${a.id}`}
                            type="number"
                            min={0}
                            max={a.totalPoints}
                            step={0.25}
                            dir="ltr"
                            className="w-28"
                            value={draft.final}
                            onChange={(e) => updateFinal(a, e.target.value)}
                          />
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[0.6rem]",
                            draft.manual
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300"
                              : "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-300"
                          )}
                        >
                          {draft.manual
                            ? "نمره‌ی دستی"
                            : "خودکار از جمع نمره‌ها"}
                        </Badge>
                        {draft.manual ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => resetFinalToSum(a)}
                          >
                            <Calculator className="size-4" />
                            بازگردانی به جمع خودکار
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          disabled={gradingId === a.id}
                          onClick={() => handleSaveGrades(a)}
                          className={cn("rounded-xl", btnGradient)}
                        >
                          {gradingId === a.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ClipboardCheck className="size-4" />
                          )}
                          ثبت نمره‌ها
                        </Button>
                        <span className="ms-auto text-[0.65rem] text-muted-foreground">
                          جمع نمره‌ی سوالات: {faDigits(sum)} از{" "}
                          {faDigits(a.totalPoints)}
                          {a.hasEssay
                            ? ` — نمره‌ی خودکار سوالات عینی: ${faDigits(a.autoScore)}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="sm:justify-start">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl"
          >
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
