"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  MessagesSquare,
  Pencil,
  Plus,
  Star,
  Trash2,
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
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { PublishSwitch } from "@/components/admin/shared/publish-switch";
import { btnGradient } from "@/components/admin/shared/styles";
import type { Testimonial } from "@/components/admin/types";
import { COURSE_THEME_OPTIONS, getCourseTheme } from "@/lib/course-theme";
import { faDigits } from "@/lib/fa";

/** فرم نظر کاربر */
interface TestimonialForm {
  name: string;
  role: string;
  course: string;
  text: string;
  rating: string;
  theme: string;
  sortOrder: string;
  published: boolean;
}

function toInt(v: string): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** ردیف ستاره‌های امتیاز */
function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`امتیاز ${faDigits(rating)} از ۵`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < rating
              ? "size-4 fill-amber-400 text-amber-400"
              : "size-4 text-foreground/15"
          }
          aria-hidden
        />
      ))}
    </span>
  );
}

/** ماژول نظرات کاربران — نمایش کارتی (متن‌محور) */
export function TestimonialsModule() {
  const [testimonials, setTestimonials] = useState<Testimonial[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [form, setForm] = useState<TestimonialForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setTestimonials(
        await apiFetch<Testimonial[]>("/api/admin/testimonials")
      );
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    const nextOrder = testimonials ? testimonials.length + 1 : 1;
    setForm({
      name: "",
      role: "",
      course: "",
      text: "",
      rating: "5",
      theme: "teal",
      sortOrder: String(nextOrder),
      published: true,
    });
    setDialogOpen(true);
  }

  function openEdit(t: Testimonial) {
    setEditing(t);
    setForm({
      name: t.name,
      role: t.role,
      course: t.course,
      text: t.text,
      rating: String(t.rating),
      theme: t.theme,
      sortOrder: String(t.sortOrder),
      published: t.published,
    });
    setDialogOpen(true);
  }

  const set = <K extends keyof TestimonialForm>(key: K, value: TestimonialForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  async function togglePublish(t: Testimonial, next: boolean) {
    setTestimonials(
      (prev) =>
        prev?.map((x) => (x.id === t.id ? { ...x, published: next } : x)) ??
        prev
    );
    try {
      await apiFetch<Testimonial>(`/api/admin/testimonials/${t.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...t, published: next }),
      });
      toast.success(next ? "نظر منتشر شد" : "نظر از نمایش خارج شد");
    } catch (error) {
      setTestimonials(
        (prev) =>
          prev?.map(
            (x) => (x.id === t.id ? { ...x, published: t.published } : x)
          ) ?? prev
      );
      toastApiError(error);
    }
  }

  async function handleDelete(t: Testimonial) {
    try {
      await apiFetch(`/api/admin/testimonials/${t.id}`, { method: "DELETE" });
      toast.success(`نظر «${t.name}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  async function handleSave() {
    if (!form || saving) return;
    const name = form.name.trim();
    const text = form.text.trim();
    if (name.length < 2 || name.length > 80) {
      toast.error("نام کاربر باید بین ۲ تا ۸۰ نویسه باشد.");
      return;
    }
    if (text.length < 10 || text.length > 600) {
      toast.error("متن نظر باید بین ۱۰ تا ۶۰۰ نویسه باشد.");
      return;
    }
    const rating = Math.min(5, Math.max(1, toInt(form.rating) || 5));
    const sortOrder = toInt(form.sortOrder);
    if (sortOrder < 0) {
      toast.error("مقادیر عددی نمی‌توانند منفی باشند.");
      return;
    }

    const payload = {
      name,
      role: form.role.trim(),
      course: form.course.trim(),
      text,
      rating,
      theme: form.theme,
      sortOrder,
      published: form.published,
    };

    setSaving(true);
    try {
      if (editing) {
        await apiFetch<Testimonial>(`/api/admin/testimonials/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("نظر با موفقیت ویرایش شد");
      } else {
        await apiFetch<Testimonial>("/api/admin/testimonials", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("نظر جدید ایجاد شد");
      }
      setDialogOpen(false);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="نظرات کاربران"
        description="مدیریت نظرات و تجربه‌های کاربران — نمایش، ویرایش و انتشار در صفحه اصلی."
      >
        <Button onClick={openCreate} className={`rounded-xl ${btnGradient}`}>
          <Plus className="size-4" />
          افزودن نظر
        </Button>
      </ModuleHeader>

      {loading && !testimonials ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass h-48 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : !testimonials || testimonials.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="هنوز نظری ثبت نشده است"
          description="نظرات کاربران به اعتماد مخاطبان کمک می‌کند؛ اولین نظر را اضافه کنید."
        >
          <Button onClick={openCreate} size="sm" className={`rounded-xl ${btnGradient}`}>
            <Plus className="size-4" />
            افزودن اولین نظر
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {testimonials.map((t) => {
            const theme = getCourseTheme(t.theme);
            return (
              <article
                key={t.id}
                className="glass flex flex-col gap-4 rounded-2xl p-4 transition-colors hover:border-foreground/20 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-base font-black text-white shadow-md ${theme.tile}`}
                    aria-hidden
                  >
                    {t.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {t.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[t.role, t.course].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <PublishSwitch
                    published={t.published}
                    onToggle={(next) => togglePublish(t, next)}
                  />
                </div>

                <p className="line-clamp-3 flex-1 text-sm leading-7 text-foreground/80">
                  {t.text}
                </p>

                <div className="flex items-center justify-between border-t border-foreground/[0.07] pt-3">
                  <div className="flex items-center gap-3">
                    <RatingStars rating={t.rating} />
                    <span
                      className={`size-3 rounded-full bg-gradient-to-br ${theme.tile}`}
                      title={`تم ${theme.label}`}
                      aria-label={`تم رنگی ${theme.label}`}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(t)}
                      aria-label={`ویرایش نظر ${t.name}`}
                      title="ویرایش"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <ConfirmDelete
                      title="حذف نظر"
                      description="این نظر برای همیشه حذف می‌شود. مطمئن هستید؟"
                      onConfirm={() => handleDelete(t)}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`حذف نظر ${t.name}`}
                        title="حذف"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </ConfirmDelete>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* دیالوگ ایجاد/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editing ? "ویرایش نظر" : "افزودن نظر جدید"}
            </DialogTitle>
            <DialogDescription>
              نام و متن نظر الزامی هستند؛ امتیاز از ۱ تا ۵ ستاره انتخاب می‌شود.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="نام کاربر" htmlFor="t-name">
                  <Input
                    id="t-name"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="مثلاً: سارا محمدی"
                    maxLength={80}
                  />
                </Field>
                <Field label="نقش/شغل" htmlFor="t-role">
                  <Input
                    id="t-role"
                    value={form.role}
                    onChange={(e) => set("role", e.target.value)}
                    placeholder="مثلاً: طراح رابط کاربری"
                    maxLength={80}
                  />
                </Field>
              </div>
              <Field label="دوره مرتبط" htmlFor="t-course">
                <Input
                  id="t-course"
                  value={form.course}
                  onChange={(e) => set("course", e.target.value)}
                  placeholder="مثلاً: دوره جامع هوش مصنوعی"
                  maxLength={120}
                />
              </Field>
              <Field label="متن نظر" htmlFor="t-text">
                <Textarea
                  id="t-text"
                  value={form.text}
                  onChange={(e) => set("text", e.target.value)}
                  placeholder="تجربه کاربر از دوره و نتایج آن..."
                  className="min-h-24"
                  maxLength={600}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="امتیاز" htmlFor="t-rating">
                  <Select
                    value={form.rating}
                    onValueChange={(v) => set("rating", v)}
                  >
                    <SelectTrigger id="t-rating" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { value: "1", label: "۱ ستاره" },
                        { value: "2", label: "۲ ستاره" },
                        { value: "3", label: "۳ ستاره" },
                        { value: "4", label: "۴ ستاره" },
                        { value: "5", label: "۵ ستاره" },
                      ].map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="تم رنگی آواتار" htmlFor="t-theme">
                  <Select value={form.theme} onValueChange={(v) => set("theme", v)}>
                    <SelectTrigger id="t-theme" className="w-full">
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
                </Field>
              </div>
              <Field label="ترتیب نمایش" htmlFor="t-sortOrder">
                <Input
                  id="t-sortOrder"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => set("sortOrder", e.target.value)}
                />
              </Field>
              <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.02] p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="t-published" className="text-sm font-bold">
                    نمایش در سایت
                  </Label>
                  <p className="text-[0.65rem] text-muted-foreground">
                    نظرهای غیرفعال فقط در پنل دیده می‌شوند.
                  </p>
                </div>
                <Switch
                  id="t-published"
                  checked={form.published}
                  onCheckedChange={(v) => set("published", v)}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={handleSave}
              disabled={saving}
              className={`rounded-xl ${btnGradient}`}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "ذخیره تغییرات" : "ایجاد نظر"}
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
