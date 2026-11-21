"use client";

import * as React from "react";
import {
  Check,
  Copy,
  GraduationCap,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Radio,
  School,
  Search,
  ShieldAlert,
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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { faDate, faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/* ————————————————— انواع (قرارداد API /api/teacher/streams) ————————————————— */

/** دعوت استریم — دوره یا کلاس هدف */
interface TeacherStreamInvitation {
  courseId: string | null;
  courseTitle: string | null;
  classId: string | null;
  classTitle: string | null;
}

/** ردیف استریم استاد */
export interface TeacherStreamRow {
  id: string;
  title: string;
  description: string;
  status: "scheduled" | "live" | "ended";
  inviteSlug: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  invitations: TeacherStreamInvitation[];
  participantsCount: number;
}

/** گزینه‌ی انتخاب دعوت — دوره یا کلاس خودِ استاد */
interface TargetOption {
  id: string;
  title: string;
}

/* ————————————————— ثابت‌ها و ابزارهای محلی ————————————————— */

/** کارت شیشه‌ای هماهنگ با بقیه‌ی پنل (کپی محلی از استایل داشبورد) */
const CARD =
  "rounded-2xl border border-foreground/[0.08] bg-card/85 p-4 shadow-xl shadow-black/[0.04] backdrop-blur-xl sm:p-6 dark:border-white/[0.08] dark:bg-[#08110e]/70 dark:shadow-black/20";

/** نشان وضعیت جلسه — زنده با نقطه‌ی تپنده زمردی */
const STREAM_STATUS: Record<
  string,
  { label: string; badge: string; pulse: boolean }
> = {
  scheduled: {
    label: "برنامه‌ریزی‌شده",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
    pulse: false,
  },
  live: {
    label: "زنده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    pulse: true,
  },
  ended: {
    label: "پایان‌یافته",
    badge: "border-border bg-foreground/[0.04] text-muted-foreground dark:bg-white/[0.04]",
    pulse: false,
  },
};

/** استایل اسکرول‌بار سفارشی لیست‌های بلند */
const THIN_SCROLLBAR =
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20";

/** آدرس کامل لینک دعوت یکتای جلسه — origin لحظه‌ای مرورگر استاد */
function streamInviteUrl(slug: string): string {
  return `${window.location.origin}/stream/${slug}`;
}

/** کپی لینک دعوت جلسه در کلیپ‌بورد + توست */
async function copyStreamInviteLink(slug: string): Promise<void> {
  const url = streamInviteUrl(slug);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("لینک دعوت کلاس آنلاین کپی شد", {
      description: url,
    });
  } catch {
    toast.error("کپی انجام نشد — آدرس را دستی انتخاب و کپی کنید.", {
      description: url,
    });
  }
}

/** دکمه کپی لینک دعوت جلسه (با آیکون تیک موفقیت) */
function CopyStreamLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    await copyStreamInviteLink(slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => void handleCopy()}
      aria-label="کپی لینک دعوت کلاس آنلاین"
      title="کپی لینک دعوت"
      className="size-11 rounded-xl"
    >
      {copied ? (
        <Check className="size-4 text-emerald-600 dark:text-emerald-300" />
      ) : (
        <Copy className="size-4" />
      )}
    </Button>
  );
}

/** ساختار فرم ایجاد/ویرایش استریم */
interface StreamForm {
  title: string;
  description: string;
  courseIds: Set<string>;
  classIds: Set<string>;
}

/* ————————————————— بخش «استریم‌های من» ————————————————— */

/**
 * TeacherStreamsSection — بخش «استریم‌های من» در پنل استاد:
 * کلاس‌های آنلاین با لینک دعوت یکتا (/stream/{slug})، شروع/پایان پخش و
 * دعوت کاربران دوره/کلاس‌های خودِ استاد؛ هر ۳۰ ثانیه تازه می‌شود تا
 * وضعیت زنده لحظه‌ای دیده شود.
 */
export function TeacherStreamsSection() {
  const [streams, setStreams] = React.useState<TeacherStreamRow[] | null>(null);
  const [denied, setDenied] = React.useState(false);

  // — انتخابگر دعوت (دوره/کلاس خودِ استاد) —
  const [courses, setCourses] = React.useState<TargetOption[] | null>(null);
  const [classes, setClasses] = React.useState<TargetOption[] | null>(null);
  const [courseFilter, setCourseFilter] = React.useState("");
  const [classFilter, setClassFilter] = React.useState("");

  // — دیالوگ ایجاد/ویرایش —
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TeacherStreamRow | null>(null);
  const [form, setForm] = React.useState<StreamForm | null>(null);
  const [saving, setSaving] = React.useState(false);

  // — تغییر وضعیت (شروع/پایان پخش) —
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async (silent = false): Promise<void> => {
    try {
      const res = await fetch("/api/teacher/streams", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setDenied(true);
        setStreams([]);
        if (!silent) toast.error(json.error ?? "دسترسی استاد ندارید.");
        return;
      }
      if (!res.ok) throw new Error();
      const json = (await res.json()) as TeacherStreamRow[];
      setStreams(Array.isArray(json) ? json : []);
      setDenied(false);
    } catch {
      setStreams([]);
      if (!silent) {
        toast.error("دریافت کلاس‌های آنلاین ناموفق بود؛ دوباره تلاش کنید.");
      }
    }
  }, []);

  React.useEffect(() => {
    void load();
    // پیمایش دوره‌ای ۳۰ ثانیه‌ای — شروع/پایان زنده را لحظه‌ای نشان می‌دهد
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  /** دوره‌ها و کلاس‌های خودِ استاد را برای انتخابگر دعوت می‌گیرد */
  async function ensureOptions() {
    if (courses !== null && classes !== null) return;
    try {
      const [courseRes, classRes] = await Promise.all([
        fetch("/api/teacher/courses", { cache: "no-store" }),
        fetch("/api/teacher/classes", { cache: "no-store" }),
      ]);
      if (!courseRes.ok || !classRes.ok) throw new Error();
      const courseList = (await courseRes.json()) as Array<{
        id: string;
        title: string;
      }>;
      const classList = (await classRes.json()) as Array<{
        id: string;
        title: string;
      }>;
      setCourses(courseList.map((c) => ({ id: c.id, title: c.title })));
      setClasses(classList.map((c) => ({ id: c.id, title: c.title })));
    } catch {
      setCourses([]);
      setClasses([]);
      toast.error("دریافت دوره/کلاس‌ها برای دعوت ناموفق بود.");
    }
  }

  /* ————————————— ایجاد / ویرایش ————————————— */

  function openCreate() {
    void ensureOptions();
    setEditing(null);
    setForm({
      title: "",
      description: "",
      courseIds: new Set(),
      classIds: new Set(),
    });
    setDialogOpen(true);
  }

  function openEdit(s: TeacherStreamRow) {
    void ensureOptions();
    setEditing(s);
    setForm({
      title: s.title,
      description: s.description,
      courseIds: new Set(
        s.invitations.map((i) => i.courseId).filter((x): x is string => !!x)
      ),
      classIds: new Set(
        s.invitations.map((i) => i.classId).filter((x): x is string => !!x)
      ),
    });
    setDialogOpen(true);
  }

  function toggleTarget(kind: "courseIds" | "classIds", id: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const set = new Set(prev[kind]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, [kind]: set };
    });
  }

  async function handleSave() {
    if (!form || saving) return;
    const title = form.title.trim();
    if (title.length < 2 || title.length > 120) {
      toast.error("عنوان کلاس آنلاین باید بین ۲ تا ۱۲۰ نویسه باشد.");
      return;
    }
    const description = form.description.trim().slice(0, 600);

    setSaving(true);
    try {
      const body = JSON.stringify({
        title,
        description,
        courseIds: Array.from(form.courseIds),
        classIds: Array.from(form.classIds),
      });
      const res = editing
        ? await fetch(`/api/teacher/streams/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await fetch("/api/teacher/streams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        inviteSlug?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "خطا در ذخیره‌ی کلاس آنلاین.");
      if (editing) {
        toast.success("کلاس آنلاین ویرایش شد");
      } else {
        toast.success("کلاس آنلاین ایجاد شد", {
          description:
            json.inviteSlug
              ? `لینک دعوت یکتا: ${streamInviteUrl(json.inviteSlug)}`
              : "لینک دعوت یکتا در کارت جلسه قابل مشاهده است.",
        });
      }
      setDialogOpen(false);
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در ذخیره‌ی کلاس آنلاین."
      );
    } finally {
      setSaving(false);
    }
  }

  /* ————————————— شروع / پایان پخش ————————————— */

  async function changeStatus(
    s: TeacherStreamRow,
    status: "live" | "ended"
  ) {
    if (busyId) return;
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/teacher/streams/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "خطا در تغییر وضعیت جلسه.");
      }
      toast.success(
        status === "live" ? "پخش زنده شروع شد" : "جلسه پایان یافت"
      );
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در تغییر وضعیت جلسه."
      );
    } finally {
      setBusyId(null);
    }
  }

  /* ————————————— حذف ————————————— */

  async function handleDelete(s: TeacherStreamRow) {
    try {
      const res = await fetch(`/api/teacher/streams/${s.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "خطا در حذف کلاس آنلاین.");
      toast.success(`کلاس آنلاین «${s.title}» حذف شد`);
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در حذف کلاس آنلاین."
      );
      throw err; // دیالوگ تأیید باز بماند
    }
  }

  const filteredCourses = React.useMemo(() => {
    if (!courses) return [];
    const q = courseFilter.trim();
    if (!q) return courses;
    return courses.filter((c) => c.title.includes(q));
  }, [courses, courseFilter]);

  const filteredClasses = React.useMemo(() => {
    if (!classes) return [];
    const q = classFilter.trim();
    if (!q) return classes;
    return classes.filter((c) => c.title.includes(q));
  }, [classes, classFilter]);

  /* ————————————— رندر ————————————— */

  return (
    <section aria-label="استریم‌های من (استاد)" className="space-y-4">
      {/* سربرگ + دکمه‌ی ایجاد */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 sm:mb-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
            <Radio className="size-5 text-rose-600 dark:text-rose-300" />
            استریم‌های من
          </h2>
          <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            {streams ? `${faDigits(streams.length)} جلسه` : "…"}
          </span>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          className="h-11 rounded-xl bg-gradient-to-l from-rose-400 to-red-500 px-5 text-xs font-black text-white shadow-lg shadow-rose-500/25 transition-all hover:scale-[1.02]"
        >
          <Plus className="size-4" />
          ایجاد کلاس آنلاین
        </Button>
      </div>

      {denied ? (
        <DeniedNotice />
      ) : streams === null ? (
        <StreamListSkeleton />
      ) : streams.length === 0 ? (
        <div
          className={cn(
            CARD,
            "flex flex-col items-center gap-4 px-6 py-12 text-center"
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
            <Radio className="size-7 text-muted-foreground" />
          </span>
          <div>
            <p className="text-base font-black text-foreground">
              هنوز کلاس آنلاینی برگزار نکرده‌اید
            </p>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              یک جلسه‌ی زنده بسازید و کاربران دوره/کلاس‌های خود را دعوت کنید —
              یا فقط با لینک یکتای جلسه وارد شوند.
            </p>
          </div>
          <Button
            type="button"
            onClick={openCreate}
            className="h-11 rounded-xl bg-gradient-to-l from-rose-400 to-red-500 px-5 text-xs font-black text-white shadow-lg shadow-rose-500/25 transition-all hover:scale-[1.02]"
          >
            <Plus className="size-4" />
            ایجاد اولین جلسه
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {streams.map((s) => (
            <TeacherStreamCard
              key={s.id}
              stream={s}
              busy={busyId === s.id}
              onStatus={(status) => void changeStatus(s, status)}
              onEdit={() => openEdit(s)}
              onDelete={() => handleDelete(s)}
            />
          ))}
        </div>
      )}

      {/* ————— دیالوگ ایجاد/ویرایش ————— */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          dir="rtl"
          className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl"
        >
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editing ? `ویرایش کلاس آنلاین «${editing.title}»` : "کلاس آنلاین جدید"}
            </DialogTitle>
            <DialogDescription className="leading-6">
              کاربران دوره‌ها و کلاس‌های انتخاب‌شده به کلاس دعوت می‌شوند —
              انتخاب هیچ‌کدام هم مجاز است؛ در آن صورت ورود فقط با لینک یکتای
              جلسه انجام می‌شود.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tst-title" className="text-xs font-bold">
                  عنوان کلاس
                </Label>
                <Input
                  id="tst-title"
                  value={form.title}
                  onChange={(e) =>
                    setForm((p) => (p ? { ...p, title: e.target.value } : p))
                  }
                  maxLength={120}
                  placeholder="مثلاً: جلسه‌ی رفع اشکال فصل ۳ — دوره‌ی هوش مصنوعی"
                  className="h-11 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tst-desc" className="text-xs font-bold">
                  توضیحات (اختیاری)
                </Label>
                <Textarea
                  id="tst-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => (p ? { ...p, description: e.target.value } : p))
                  }
                  maxLength={600}
                  placeholder="موضوع جلسه، لینک‌های مرتبط و..."
                  className="min-h-20 rounded-xl text-sm"
                />
              </div>

              {/* — انتخابگر دعوت: دوره‌ها + کلاس‌ها (چیپ‌های قابل‌تغییر) — */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-bold">
                  دعوت کاربران
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[0.6rem] font-black text-muted-foreground dark:bg-white/[0.06]">
                    {faDigits(form.courseIds.size)} دوره{" + "}
                    {faDigits(form.classIds.size)} کلاس
                  </span>
                </Label>

                {form.courseIds.size + form.classIds.size === 0 ? (
                  <p className="rounded-xl border border-dashed border-rose-500/30 bg-rose-500/[0.04] px-3.5 py-2.5 text-[0.65rem] font-bold leading-5 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/[0.05] dark:text-rose-300">
                    بدون دعوت دوره/کلاس — ورود فقط با لینک یکتای جلسه.
                  </p>
                ) : null}

                {!courses || !classes ? (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-border">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : courses.length === 0 && classes.length === 0 ? (
                  <p className="rounded-xl border border-border p-4 text-center text-xs font-bold text-muted-foreground">
                    هنوز دوره یا کلاسی نساخته‌اید — ابتدا از بخش‌های «دوره‌های
                    من» و «کلاس‌های من» مواردی بسازید یا جلسه را فقط با لینک
                    یکتا برگزار کنید.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* دوره‌ها */}
                    {courses.length > 0 ? (
                      <div className="rounded-xl border border-border">
                        <div className="flex items-center gap-2 border-b border-border p-2">
                          <GraduationCap className="size-4 text-teal-600 dark:text-teal-300" />
                          <span className="text-[0.7rem] font-black">دوره‌ها</span>
                          <div className="relative ms-auto min-w-0 flex-1">
                            <Search className="pointer-events-none absolute start-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                            <input
                              value={courseFilter}
                              onChange={(e) => setCourseFilter(e.target.value)}
                              placeholder="جست‌وجوی دوره..."
                              className="h-8 w-full rounded-lg border border-border bg-background ps-7 pe-2 text-[0.65rem] font-medium outline-none focus:border-teal-500/40"
                            />
                          </div>
                        </div>
                        <div
                          className={cn(
                            "max-h-44 overflow-y-auto p-2",
                            THIN_SCROLLBAR
                          )}
                        >
                          <div className="flex flex-col gap-1">
                            {filteredCourses.map((c) => {
                              const checked = form.courseIds.has(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => toggleTarget("courseIds", c.id)}
                                  aria-pressed={checked}
                                  className={cn(
                                    "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-start text-xs font-bold transition-colors",
                                    checked
                                      ? "border-teal-500/40 bg-teal-500/[0.07] text-teal-700 dark:border-teal-400/40 dark:bg-teal-400/[0.08] dark:text-teal-300"
                                      : "border-border hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]"
                                  )}
                                >
                                  <span className="min-w-0 flex-1 truncate">
                                    {c.title}
                                  </span>
                                  {checked ? (
                                    <Check className="size-3.5 shrink-0" />
                                  ) : null}
                                </button>
                              );
                            })}
                            {filteredCourses.length === 0 ? (
                              <p className="px-2 py-3 text-center text-[0.65rem] font-bold text-muted-foreground">
                                دوره‌ای با این عنوان پیدا نشد.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* کلاس‌ها */}
                    {classes.length > 0 ? (
                      <div className="rounded-xl border border-border">
                        <div className="flex items-center gap-2 border-b border-border p-2">
                          <School className="size-4 text-violet-600 dark:text-violet-300" />
                          <span className="text-[0.7rem] font-black">کلاس‌ها</span>
                          <div className="relative ms-auto min-w-0 flex-1">
                            <Search className="pointer-events-none absolute start-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                            <input
                              value={classFilter}
                              onChange={(e) => setClassFilter(e.target.value)}
                              placeholder="جست‌وجوی کلاس..."
                              className="h-8 w-full rounded-lg border border-border bg-background ps-7 pe-2 text-[0.65rem] font-medium outline-none focus:border-violet-500/40"
                            />
                          </div>
                        </div>
                        <div
                          className={cn(
                            "max-h-44 overflow-y-auto p-2",
                            THIN_SCROLLBAR
                          )}
                        >
                          <div className="flex flex-col gap-1">
                            {filteredClasses.map((c) => {
                              const checked = form.classIds.has(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => toggleTarget("classIds", c.id)}
                                  aria-pressed={checked}
                                  className={cn(
                                    "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-start text-xs font-bold transition-colors",
                                    checked
                                      ? "border-violet-500/40 bg-violet-500/[0.07] text-violet-700 dark:border-violet-400/40 dark:bg-violet-400/[0.08] dark:text-violet-300"
                                      : "border-border hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]"
                                  )}
                                >
                                  <span className="min-w-0 flex-1 truncate">
                                    {c.title}
                                  </span>
                                  {checked ? (
                                    <Check className="size-3.5 shrink-0" />
                                  ) : null}
                                </button>
                              );
                            })}
                            {filteredClasses.length === 0 ? (
                              <p className="px-2 py-3 text-center text-[0.65rem] font-bold text-muted-foreground">
                                کلاسی با این عنوان پیدا نشد.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-2 flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="h-10 rounded-xl px-4 text-xs font-bold"
            >
              انصراف
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-10 rounded-xl bg-gradient-to-l from-rose-400 to-red-500 px-6 text-xs font-black text-white shadow-lg shadow-rose-500/25 transition-all hover:scale-[1.01]"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {editing ? "ذخیره‌ی تغییرات" : "ایجاد کلاس"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ————————————————— کارت استریم استاد ————————————————— */

function TeacherStreamCard({
  stream: s,
  busy,
  onStatus,
  onEdit,
  onDelete,
}: {
  stream: TeacherStreamRow;
  busy: boolean;
  onStatus: (status: "live" | "ended") => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const status = STREAM_STATUS[s.status] ?? STREAM_STATUS.ended;

  return (
    <article className={cn(CARD, "flex flex-col gap-4 p-4 sm:p-5")}>
      {/* عنوان + آیکون + وضعیت */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            s.status === "live"
              ? "bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md shadow-emerald-500/20"
              : "bg-gradient-to-br from-rose-400 to-red-600 shadow-md shadow-rose-500/20"
          )}
          aria-hidden
        >
          <Radio
            className={cn(
              "size-5",
              s.status === "live" ? "animate-pulse text-white" : "text-white"
            )}
            strokeWidth={2.2}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-foreground">{s.title}</p>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {s.description || "بدون توضیحات"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.65rem] font-black",
                status.badge
              )}
            >
              {status.pulse ? (
                <span className="relative flex size-1.5" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
              ) : null}
              {status.label}
            </span>
            <span className="flex select-none items-center gap-1 rounded-full border border-border bg-foreground/[0.03] px-2.5 py-0.5 text-[0.65rem] font-bold text-muted-foreground dark:bg-white/[0.03]">
              <Users className="size-3" />
              {faDigits(s.participantsCount)} شرکت‌کننده
            </span>
          </div>
        </div>
      </div>

      {/* دعوت‌ها — چیپ دوره/کلاس یا «فقط با لینک دعوت» */}
      {s.invitations.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {s.invitations.slice(0, 4).map((inv, i) => (
            <span
              key={`${inv.courseId ?? inv.classId ?? i}`}
              className={cn(
                "inline-flex select-none items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.6rem] font-black",
                inv.courseId
                  ? "border-teal-500/30 bg-teal-500/[0.07] text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/[0.08] dark:text-teal-300"
                  : "border-violet-500/30 bg-violet-500/[0.07] text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/[0.08] dark:text-violet-300"
              )}
            >
              {inv.courseId ? (
                <GraduationCap className="size-3" />
              ) : (
                <School className="size-3" />
              )}
              {inv.courseId
                ? `دوره‌ی ${inv.courseTitle ?? "—"}`
                : `کلاس ${inv.classTitle ?? "—"}`}
            </span>
          ))}
          {s.invitations.length > 4 ? (
            <span className="rounded-full border border-border bg-foreground/[0.03] px-2.5 py-0.5 text-[0.6rem] font-black text-muted-foreground dark:bg-white/[0.03]">
              +{faDigits(s.invitations.length - 4)}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="flex select-none items-center gap-1.5 rounded-xl border border-dashed border-foreground/20 bg-foreground/[0.02] px-3 py-2 text-[0.65rem] font-bold text-muted-foreground dark:border-white/20 dark:bg-white/[0.02]">
          <Link2 className="size-3.5 shrink-0" />
          فقط با لینک دعوت
        </p>
      )}

      {/* لینک دعوت یکتای جلسه — نمایش + کپی */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.02] p-2 dark:bg-white/[0.02]">
        <Link2
          className="size-4 shrink-0 text-rose-600 dark:text-rose-300"
          aria-hidden
        />
        <a
          href={`/stream/${s.inviteSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          className="min-w-0 flex-1 truncate text-left text-xs font-bold text-rose-700 underline-offset-4 hover:underline dark:text-rose-300"
          title={streamInviteUrl(s.inviteSlug)}
        >
          /stream/{s.inviteSlug}
        </a>
        <CopyStreamLinkButton slug={s.inviteSlug} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
        <span className="text-[0.65rem] font-semibold text-muted-foreground">
          ایجاد: {faDate(s.createdAt)}
          {s.startedAt ? ` — شروع: ${faDate(s.startedAt)}` : ""}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {/* ورود به کلاس — ناوبری کامل صفحه در تب جدید */}
          <Button
            asChild
            size="sm"
            variant={s.status === "live" ? "default" : "outline"}
            className="h-9 rounded-lg px-3 text-[0.65rem] font-black"
          >
            <a
              href={`/stream/${s.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Radio className="size-3.5" />
              {s.status === "live" ? "ورود به کلاس زنده" : "ورود به کلاس"}
            </a>
          </Button>
          {s.status === "live" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onStatus("ended")}
              disabled={busy}
              aria-label={`پایان جلسه ${s.title}`}
              title="پایان جلسه‌ی زنده"
              className="h-9 rounded-lg border-amber-500/30 px-3 text-[0.65rem] font-black text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:border-amber-400/25 dark:text-amber-300 dark:hover:bg-amber-400/10"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              پایان جلسه
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onStatus("live")}
              disabled={busy || s.status === "ended"}
              aria-label={`شروع پخش ${s.title}`}
              title="شروع پخش زنده"
              className="h-9 rounded-lg border-emerald-500/30 px-3 text-[0.65rem] font-black text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 disabled:opacity-50 dark:border-emerald-400/25 dark:text-emerald-300 dark:hover:bg-emerald-400/10"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              شروع پخش
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label={`ویرایش ${s.title}`}
            title="ویرایش"
            className="size-9 rounded-xl"
          >
            <Pencil className="size-4" />
          </Button>
          <ConfirmDelete
            title={`حذف کلاس آنلاین «${s.title}»`}
            description="دعوت‌ها و حضور شرکت‌کنندگان حذف می‌شود. مطمئن هستید؟"
            onConfirm={onDelete}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`حذف ${s.title}`}
              title="حذف"
            >
              <Trash2 className="size-4" />
            </Button>
          </ConfirmDelete>
        </div>
      </div>
    </article>
  );
}

/* ————————————————— حالت‌های بارگذاری/دسترسی ————————————————— */

/** اسکلت شبکه‌ی استریم‌ها */
function StreamListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((k) => (
        <div key={k} className={cn(CARD, "animate-pulse p-4 sm:p-5")}>
          <div className="flex items-start gap-3">
            <div className="size-11 animate-pulse rounded-xl bg-foreground/10 dark:bg-white/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-36 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
              <div className="h-3 w-28 animate-pulse rounded bg-foreground/[0.07] dark:bg-white/[0.07]" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-foreground/[0.07] dark:bg-white/[0.07]" />
            </div>
          </div>
          <div className="mt-4 h-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
          <div className="mt-4 flex justify-between border-t border-foreground/[0.07] pt-3">
            <div className="h-3 w-28 animate-pulse rounded bg-foreground/[0.07] dark:bg-white/[0.07]" />
            <div className="h-9 w-24 animate-pulse rounded-lg bg-foreground/[0.07] dark:bg-white/[0.07]" />
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
