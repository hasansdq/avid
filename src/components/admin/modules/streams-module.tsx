"use client";

import * as React from "react";
import {
  Check,
  Download,
  ExternalLink,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  School,
  Search,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { btnGradient } from "@/components/admin/shared/styles";
import type {
  AdminStreamRow,
} from "@/components/stream/types";
import type { ClassRoomWithCount } from "@/components/admin/types";
import { faDate, faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/** دوره‌ی ساده برای انتخابگر دعوت */
interface CourseOption {
  id: string;
  title: string;
}

interface StreamForm {
  title: string;
  description: string;
  courseIds: Set<string>;
  classIds: Set<string>;
}

/** وضعیت جلسه → نشان */
const STATUS_BADGES: Record<string, string> = {
  live: "border-red-500/30 bg-red-500/10 text-red-600 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  scheduled:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  ended: "border-border bg-foreground/[0.04] text-muted-foreground dark:bg-white/[0.04]",
};

const STATUS_LABELS: Record<string, string> = {
  live: "زنده",
  scheduled: "در انتظار شروع",
  ended: "پایان‌یافته",
};

/**
 * ماژول «مدیریت استریم» — ایجاد کلاس آنلاین و دعوت کاربران دوره/کلاس.
 *
 * مدیر یک یا چند دوره/کلاس را انتخاب می‌کند؛ کاربران همان دوره/کلاس در پنل
 * خودشان باکس «دعوت به کلاس» می‌بینند و با کلیک وارد کلاس می‌شوند. حضور
 * کاربران از گزارش اکسل قابل دریافت است. کنترل زنده (شروع/پایان/اخراج/اجازه)
 * داخل خود کلاس (/stream/{id}) انجام می‌شود.
 */
export function StreamsModule() {
  const [streams, setStreams] = React.useState<AdminStreamRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  // — انتخابگر دعوت —
  const [courses, setCourses] = React.useState<CourseOption[] | null>(null);
  const [classes, setClasses] = React.useState<ClassRoomWithCount[] | null>(
    null
  );
  const [courseFilter, setCourseFilter] = React.useState("");

  // — دیالوگ ایجاد/ویرایش —
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminStreamRow | null>(null);
  const [form, setForm] = React.useState<StreamForm | null>(null);
  const [saving, setSaving] = React.useState(false);

  // — شرکت‌کنندگان —
  const [participantsStream, setParticipantsStream] =
    React.useState<AdminStreamRow | null>(null);
  const [participants, setParticipants] = React.useState<
    Array<{
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      nationalId: string | null;
      joinedAt: string;
      leftAt: string | null;
      kicked: boolean;
      minutes: number;
    }>
  >([]);
  const [participantsLoading, setParticipantsLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setStreams(await apiFetch<AdminStreamRow[]>("/api/admin/streams"));
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** دوره‌ها و کلاس‌ها را یک‌بار برای دیالوگ دعوت می‌گیرد */
  async function ensureOptions() {
    try {
      const [courseList, classList] = await Promise.all([
        apiFetch<CourseOption[]>("/api/admin/courses"),
        apiFetch<ClassRoomWithCount[]>("/api/admin/classes"),
      ]);
      setCourses(
        courseList.map((c) => ({ id: c.id, title: c.title }))
      );
      setClasses(classList);
    } catch (error) {
      toastApiError(error);
    }
  }

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

  function openEdit(s: AdminStreamRow) {
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

  async function handleSave() {
    if (!form || saving) return;
    const title = form.title.trim();
    if (title.length < 2 || title.length > 120) {
      toast.error("عنوان کلاس باید بین ۲ تا ۱۲۰ نویسه باشد.");
      return;
    }
    if (form.courseIds.size + form.classIds.size === 0) {
      toast.error("حداقل یک دوره یا کلاس برای دعوت انتخاب کنید.");
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
      if (editing) {
        await apiFetch(`/api/admin/streams/${editing.id}`, {
          method: "PATCH",
          body,
        });
        toast.success("کلاس آنلاین ویرایش شد");
      } else {
        await apiFetch<AdminStreamRow>("/api/admin/streams", {
          method: "POST",
          body,
        });
        toast.success("کلاس آنلاین ایجاد شد", {
          description:
            "باکس «دعوت به کلاس» برای کاربران دوره/کلاس‌های انتخاب‌شده نمایان می‌شود.",
        });
      }
      setDialogOpen(false);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: AdminStreamRow) {
    try {
      await apiFetch(`/api/admin/streams/${s.id}`, { method: "DELETE" });
      toast.success(`کلاس «${s.title}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  async function openParticipants(s: AdminStreamRow) {
    setParticipantsStream(s);
    setParticipantsLoading(true);
    setParticipants([]);
    try {
      const data = await apiFetch<{
        participants: Array<{
          id: string;
          joinedAt: string;
          leftAt: string | null;
          kicked: boolean;
          user: {
            id: string;
            firstName: string;
            lastName: string;
            phone: string;
            nationalId: string | null;
          };
        }>;
      }>(`/api/admin/streams/${s.id}`);
      const now = Date.now();
      setParticipants(
        data.participants.map((p) => {
          const end = p.leftAt ? new Date(p.leftAt).getTime() : now;
          return {
            id: p.id,
            firstName: p.user.firstName,
            lastName: p.user.lastName,
            phone: p.user.phone,
            nationalId: p.user.nationalId,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            kicked: p.kicked,
            minutes: Math.max(
              0,
              Math.round((end - new Date(p.joinedAt).getTime()) / 60000)
            ),
          };
        })
      );
    } catch (error) {
      toastApiError(error);
      setParticipantsStream(null);
    } finally {
      setParticipantsLoading(false);
    }
  }

  function toggleTarget(
    kind: "courseIds" | "classIds",
    id: string
  ) {
    setForm((prev) => {
      if (!prev) return prev;
      const set = new Set(prev[kind]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, [kind]: set };
    });
  }

  const filteredCourses = React.useMemo(() => {
    if (!courses) return [];
    const q = courseFilter.trim();
    if (!q) return courses;
    return courses.filter((c) => c.title.includes(q));
  }, [courses, courseFilter]);

  /* ————————————— رندر ————————————— */

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="مدیریت استریم"
        description="برگزاری کلاس ویدئویی زنده برای دوره‌ها و کلاس‌ها — دعوت کاربران، گزارش اکسل حضور و کنترل کامل کلاس (اخراج، اجازه‌ی تصویر/صدا، اشتراک صفحه)."
      >
        <Button
          variant="outline"
          onClick={() => void load()}
          aria-label="به‌روزرسانی لیست"
          className="rounded-xl"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </Button>
        <Button onClick={openCreate} className={`rounded-xl ${btnGradient}`}>
          <Plus className="size-4" />
          کلاس آنلاین جدید
        </Button>
      </ModuleHeader>

      {loading && !streams ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass h-56 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : !streams || streams.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="هنوز کلاس آنلاینی ساخته نشده است"
          description="یک کلاس بسازید و کاربران یک یا چند دوره/کلاس را دعوت کنید — باکس «دعوت به کلاس» در پنل آن کاربران ظاهر می‌شود و با شروع کلاس وارد استریم می‌شوند."
        >
          <Button
            onClick={openCreate}
            size="sm"
            className={`rounded-xl ${btnGradient}`}
          >
            <Plus className="size-4" />
            ساخت اولین کلاس آنلاین
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {streams.map((s) => (
            <article
              key={s.id}
              className="glass flex flex-col gap-4 rounded-2xl p-4 transition-colors hover:border-foreground/20 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl",
                    s.status === "live"
                      ? "bg-gradient-to-br from-red-400 to-rose-600 shadow-md shadow-red-500/20"
                      : "bg-gradient-to-br from-teal-400 to-emerald-600 shadow-md shadow-teal-500/20"
                  )}
                  aria-hidden
                >
                  <Radio
                    className={cn(
                      "size-5",
                      s.status === "live" ? "animate-pulse text-white" : "text-teal-950"
                    )}
                    strokeWidth={2.2}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-foreground">
                    {s.title}
                  </p>
                  <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {s.description || "بدون توضیحات"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "select-none rounded-full border px-2.5 py-0.5 text-[0.65rem] font-black",
                        STATUS_BADGES[s.status] ?? STATUS_BADGES.ended
                      )}
                    >
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <span className="flex items-center gap-1 rounded-full border border-border bg-foreground/[0.03] px-2.5 py-0.5 text-[0.65rem] font-bold text-muted-foreground dark:bg-white/[0.03]">
                      <Users className="size-3" />
                      {faDigits(s._count.participants)} شرکت‌کننده
                    </span>
                  </div>
                </div>
              </div>

              {/* دعوت‌ها — چیپ دوره/کلاس */}
              {s.invitations.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {s.invitations.slice(0, 4).map((inv) => (
                    <span
                      key={inv.id}
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
                      {inv.courseId ? inv.courseTitle : inv.classTitle}
                    </span>
                  ))}
                  {s.invitations.length > 4 ? (
                    <span className="rounded-full border border-border bg-foreground/[0.03] px-2.5 py-0.5 text-[0.6rem] font-black text-muted-foreground dark:bg-white/[0.03]">
                      +{faDigits(s.invitations.length - 4)}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/[0.07] pt-3">
                <span className="text-[0.65rem] font-semibold text-muted-foreground">
                  ایجاد: {faDate(s.createdAt)}
                  {s.startedAt ? ` — شروع: ${faDate(s.startedAt)}` : ""}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    asChild
                    size="sm"
                    className={`h-8 rounded-lg px-3 text-[0.65rem] font-black ${
                      s.status === "live" ? btnGradient : ""
                    }`}
                    variant={s.status === "live" ? "default" : "outline"}
                  >
                    <a
                      href={`/stream/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.status === "live" ? (
                        <>
                          <Radio className="size-3.5" />
                          ورود به کلاس زنده
                        </>
                      ) : s.status === "scheduled" ? (
                        <>
                          <ExternalLink className="size-3.5" />
                          ورود به کلاس
                        </>
                      ) : (
                        <>
                          <ExternalLink className="size-3.5" />
                          مشاهده‌ی کلاس
                        </>
                      )}
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void openParticipants(s)}
                    aria-label={`شرکت‌کنندگان ${s.title}`}
                    title="شرکت‌کنندگان و حضور"
                    className="relative"
                  >
                    <Users className="size-4" />
                    {s._count.participants > 0 ? (
                      <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-500 px-1 text-[0.55rem] font-black tabular-nums text-white">
                        {faDigits(s._count.participants)}
                      </span>
                    ) : null}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      window.open(
                        `/api/admin/streams/${s.id}/export`,
                        "_blank",
                        "noopener"
                      )
                    }
                    disabled={s._count.participants === 0}
                    aria-label={`خروجی اکسل شرکت‌کنندگان ${s.title}`}
                    title="خروجی اکسل شرکت‌کنندگان"
                  >
                    <Download className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(s)}
                    aria-label={`ویرایش ${s.title}`}
                    title="ویرایش"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmDelete
                    title={`حذف کلاس «${s.title}»`}
                    description="این کلاس آنلاین با دعوت‌ها و سابقه‌ی حضور شرکت‌کنندگان برای همیشه حذف می‌شود. مطمئن هستید؟"
                    onConfirm={() => handleDelete(s)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`حذف ${s.title}`}
                      title="حذف"
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

      {/* ————— دیالوگ ایجاد/ویرایش ————— */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editing ? `ویرایش کلاس «${editing.title}»` : "کلاس آنلاین جدید"}
            </DialogTitle>
            <DialogDescription className="leading-6">
              کاربران دوره‌ها و کلاس‌های انتخاب‌شده به کلاس دعوت می‌شوند — باکس
              «دعوت به کلاس» در پنل کاربر همان افراد نمایان می‌شود.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stream-title" className="text-xs font-bold">
                  عنوان کلاس
                </Label>
                <Input
                  id="stream-title"
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
                <Label htmlFor="stream-desc" className="text-xs font-bold">
                  توضیحات (اختیاری)
                </Label>
                <Textarea
                  id="stream-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) =>
                      p ? { ...p, description: e.target.value } : p
                    )
                  }
                  maxLength={600}
                  placeholder="موضوع جلسه، لینک‌های مرتبط و..."
                  className="min-h-20 rounded-xl text-sm"
                />
              </div>

              {/* — انتخابگر دعوت: دوره‌ها + کلاس‌ها — */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-bold">
                  دعوت کاربران
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[0.6rem] font-black text-muted-foreground dark:bg-white/[0.06]">
                    {faDigits(form.courseIds.size)} دوره{" + "}
                    {faDigits(form.classIds.size)} کلاس
                  </span>
                </Label>

                {!courses || !classes ? (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-border">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : courses.length === 0 && classes.length === 0 ? (
                  <p className="rounded-xl border border-border p-4 text-center text-xs font-bold text-muted-foreground">
                    هنوز دوره یا کلاسی تعریف نشده است — ابتدا از ماژول‌های «دوره‌ها»
                    و «کلاس‌ها» مواردی بسازید.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* دوره‌ها */}
                    {courses.length > 0 ? (
                      <div className="rounded-xl border border-border">
                        <div className="flex items-center gap-2 border-b border-border p-2">
                          <GraduationCap className="size-4 text-teal-600 dark:text-teal-300" />
                          <span className="text-[0.7rem] font-black">دوره‌ها</span>
                          {courses.length > 6 ? (
                            <div className="relative ms-auto min-w-0 flex-1">
                              <Search className="absolute start-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                              <input
                                value={courseFilter}
                                onChange={(e) => setCourseFilter(e.target.value)}
                                placeholder="جست‌وجوی دوره..."
                                className="h-8 w-full rounded-lg border border-border bg-background ps-7 pe-2 text-[0.65rem] font-medium outline-none focus:border-teal-500/40"
                              />
                            </div>
                          ) : null}
                        </div>
                        <ScrollArea className="h-44" dir="rtl">
                          <div className="flex flex-col gap-1 p-2">
                            {filteredCourses.map((c) => {
                              const checked = form.courseIds.has(c.id);
                              return (
                                <label
                                  key={c.id}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold transition-colors",
                                    checked
                                      ? "border-teal-500/40 bg-teal-500/[0.07] text-teal-700 dark:border-teal-400/40 dark:bg-teal-400/[0.08] dark:text-teal-300"
                                      : "border-border hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleTarget("courseIds", c.id)}
                                    className="size-4 accent-teal-600"
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {c.title}
                                  </span>
                                  {checked ? (
                                    <Check className="size-3.5 shrink-0" />
                                  ) : null}
                                </label>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : null}

                    {/* کلاس‌ها */}
                    {classes.length > 0 ? (
                      <div className="rounded-xl border border-border">
                        <div className="flex items-center gap-2 border-b border-border p-2">
                          <School className="size-4 text-violet-600 dark:text-violet-300" />
                          <span className="text-[0.7rem] font-black">کلاس‌ها</span>
                        </div>
                        <ScrollArea className="h-44" dir="rtl">
                          <div className="flex flex-col gap-1 p-2">
                            {classes.map((c) => {
                              const checked = form.classIds.has(c.id);
                              return (
                                <label
                                  key={c.id}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold transition-colors",
                                    checked
                                      ? "border-violet-500/40 bg-violet-500/[0.07] text-violet-700 dark:border-violet-400/40 dark:bg-violet-400/[0.08] dark:text-violet-300"
                                      : "border-border hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleTarget("classIds", c.id)}
                                    className="size-4 accent-violet-600"
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {c.title}
                                  </span>
                                  <span className="shrink-0 text-[0.6rem] font-bold text-muted-foreground">
                                    {faDigits(c._count.members)} عضو
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-2 gap-2 sm:justify-start">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="h-10 rounded-xl px-4 text-xs font-bold"
            >
              انصراف
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className={`h-10 rounded-xl px-6 text-xs font-black ${btnGradient}`}
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

      {/* ————— دیالوگ شرکت‌کنندگان ————— */}
      <Dialog
        open={!!participantsStream}
        onOpenChange={(open) => {
          if (!open) setParticipantsStream(null);
        }}
      >
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              شرکت‌کنندگان «{participantsStream?.title}»
            </DialogTitle>
            <DialogDescription>
              حضور و غیاب کلاس آنلاین — خروجی اکسل کامل از دکمه‌ی دانلود.
            </DialogDescription>
          </DialogHeader>

          {participantsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : participants.length === 0 ? (
            <p className="rounded-xl border border-border p-6 text-center text-xs font-bold text-muted-foreground">
              هنوز کسی وارد این کلاس نشده است.
            </p>
          ) : (
            <div className="space-y-1.5">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-2.5 text-xs",
                    p.kicked
                      ? "border-red-500/30 bg-red-500/[0.05]"
                      : "border-border bg-foreground/[0.02] dark:bg-white/[0.02]"
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] font-black dark:bg-white/[0.06]">
                    {(p.firstName || "؟").charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black">
                      {p.firstName} {p.lastName}
                      {p.kicked ? (
                        <span className="ms-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[0.55rem] font-black text-red-600 dark:text-red-300">
                          اخراج‌شده
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[0.65rem] font-semibold text-muted-foreground">
                      <span dir="ltr" className="tabular-nums">
                        {faDigits(p.phone)}
                      </span>
                      {" — "}
                      ورود: {faDate(p.joinedAt)}
                      {p.leftAt ? ` — خروج: ${faDate(p.leftAt)}` : " — در کلاس"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-border bg-foreground/[0.03] px-2 py-1 text-[0.65rem] font-black tabular-nums text-muted-foreground dark:bg-white/[0.03]">
                    {faDigits(p.minutes)} دقیقه
                  </span>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="mt-2 gap-2 sm:justify-start">
            <Button
              onClick={() =>
                participantsStream &&
                window.open(
                  `/api/admin/streams/${participantsStream.id}/export`,
                  "_blank",
                  "noopener"
                )
              }
              disabled={participantsLoading || participants.length === 0}
              className={`h-10 rounded-xl px-4 text-xs font-black ${btnGradient}`}
            >
              <Download className="size-4" />
              خروجی اکسل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
