"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  School,
  ShieldAlert,
  Trash2,
  UserMinus,
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

/* ————————————————— انواع (قرارداد API /api/teacher/classes) ————————————————— */

/** ردیف کلاس استاد — ClassRoom + شمارنده‌ی اعضا */
export interface TeacherClassRow {
  id: string;
  title: string;
  description: string;
  inviteSlug: string;
  createdAt: string;
  updatedAt: string;
  _count: { members: number };
}

/** عضو کلاس — ClassMembership + کاربر */
export interface TeacherClassMember {
  id: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    nationalId: string | null;
  };
}

/* ————————————————— ثابت‌ها و ابزارهای محلی ————————————————— */

/** کارت شیشه‌ای هماهنگ با بقیه‌ی پنل (کپی محلی از استایل داشبورد) */
const CARD =
  "rounded-2xl border border-foreground/[0.08] bg-card/85 p-4 shadow-xl shadow-black/[0.04] backdrop-blur-xl sm:p-6 dark:border-white/[0.08] dark:bg-[#08110e]/70 dark:shadow-black/20";

/** الفبای تولید خودکار شناسه‌ی لینک — همگام با سرور */
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** تولید شناسه‌ی تصادفی در سمت کلاینت */
function clientGenerateSlug(): string {
  let slug = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
}

/** آدرس کامل لینک دعوت — origin لحظه‌ای مرورگر استاد */
function inviteUrl(slug: string): string {
  return `${window.location.origin}/join/${slug}`;
}

/** کپی آدرس در کلیپ‌بورد + توست */
async function copyInviteLink(slug: string): Promise<void> {
  const url = inviteUrl(slug);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("لینک دعوت کلاس کپی شد", {
      description: url,
    });
  } catch {
    toast.error("کپی انجام نشد — آدرس را دستی انتخاب و کپی کنید.", {
      description: url,
    });
  }
}

/* ————————————————— دکمه کپی لینک دعوت (با آیکون تیک موفقیت) ————————————————— */

function CopyLinkButton({
  slug,
  className,
  ariaLabel = "کپی لینک دعوت کلاس",
}: {
  slug: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    await copyInviteLink(slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => void handleCopy()}
      aria-label={ariaLabel}
      title="کپی لینک دعوت"
      className={cn("size-11 rounded-xl", className)}
    >
      {copied ? (
        <Check className="size-4 text-emerald-600 dark:text-emerald-300" />
      ) : (
        <Copy className="size-4" />
      )}
    </Button>
  );
}

/** ساختار فرم ایجاد/ویرایش کلاس */
interface ClassForm {
  title: string;
  description: string;
}

/* ————————————————— بخش «کلاس‌های من» ————————————————— */

/**
 * TeacherClassesSection — بخش «کلاس‌های من» در پنل استاد:
 * کلاس‌های استاد با لینک دعوت یکتا (/join/{slug}) — ایجاد، ویرایش، تغییر/بازتولید
 * شناسه‌ی لینک، مدیریت اعضا و حذف؛ داده‌ها از /api/teacher/classes.
 */
export function TeacherClassesSection() {
  const [classes, setClasses] = React.useState<TeacherClassRow[] | null>(null);
  const [denied, setDenied] = React.useState(false);

  // — دیالوگ ایجاد/ویرایش —
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TeacherClassRow | null>(null);
  const [form, setForm] = React.useState<ClassForm | null>(null);
  const [saving, setSaving] = React.useState(false);

  // — دیالوگ لینک دعوت (مشاهده/کپی/تغییر شناسه) —
  const [linkDialogClass, setLinkDialogClass] =
    React.useState<TeacherClassRow | null>(null);
  const [slugInput, setSlugInput] = React.useState("");
  const [slugSaving, setSlugSaving] = React.useState(false);

  // — دیالوگ اعضا —
  const [membersClass, setMembersClass] =
    React.useState<TeacherClassRow | null>(null);
  const [members, setMembers] = React.useState<TeacherClassMember[] | null>(
    null
  );
  const [membersLoading, setMembersLoading] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/teacher/classes", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setDenied(true);
        setClasses([]);
        toast.error(json.error ?? "دسترسی استاد ندارید.");
        return;
      }
      if (!res.ok) throw new Error();
      const json = (await res.json()) as TeacherClassRow[];
      setClasses(Array.isArray(json) ? json : []);
      setDenied(false);
    } catch {
      setClasses([]);
      toast.error("دریافت کلاس‌ها ناموفق بود؛ دوباره تلاش کنید.");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /* ————————————— ایجاد / ویرایش ————————————— */

  function openCreate() {
    setEditing(null);
    setForm({ title: "", description: "" });
    setDialogOpen(true);
  }

  function openEdit(c: TeacherClassRow) {
    setEditing(c);
    setForm({ title: c.title, description: c.description });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form || saving) return;
    const title = form.title.trim();
    if (title.length < 2 || title.length > 80) {
      toast.error("عنوان کلاس باید ۲ تا ۸۰ نویسه باشد.");
      return;
    }
    const description = form.description.trim().slice(0, 400);

    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/teacher/classes/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, description }),
          })
        : await fetch("/api/teacher/classes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, description }),
          });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        inviteSlug?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "خطا در ذخیره‌ی کلاس.");
      if (editing) {
        toast.success("کلاس ویرایش شد");
      } else {
        toast.success("کلاس ایجاد شد", {
          description: `لینک دعوت: ${inviteUrl(json.inviteSlug ?? "")}`,
        });
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در ذخیره‌ی کلاس.");
    } finally {
      setSaving(false);
    }
  }

  /* ————————————— تغییر لینک دعوت ————————————— */

  function openLinkDialog(c: TeacherClassRow) {
    setLinkDialogClass(c);
    setSlugInput(c.inviteSlug);
  }

  async function handleSaveSlug() {
    if (!linkDialogClass || slugSaving) return;
    const slug = slugInput.trim().toLowerCase();
    if (!slug) {
      toast.error("شناسه‌ی لینک دعوت را وارد کنید.");
      return;
    }
    if (slug === linkDialogClass.inviteSlug) {
      // بدون تغییر — فقط بستن دیالوگ
      setLinkDialogClass(null);
      return;
    }

    setSlugSaving(true);
    try {
      const res = await fetch(
        `/api/teacher/classes/${linkDialogClass.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteSlug: slug }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        inviteSlug?: string;
      };
      if (!res.ok) {
        // 409 = شناسه‌ی لینک تکراری — پیام اختصاصی همانند مدیر
        throw new Error(
          res.status === 409
            ? "این شناسه‌ی لینک قبلاً استفاده شده است."
            : (json.error ?? "خطا در تغییر لینک دعوت.")
        );
      }
      toast.success("لینک دعوت کلاس تغییر کرد", {
        description: inviteUrl(json.inviteSlug ?? slug),
      });
      setLinkDialogClass(null);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در تغییر لینک دعوت."
      );
    } finally {
      setSlugSaving(false);
    }
  }

  /* ————————————— اعضا ————————————— */

  async function openMembers(c: TeacherClassRow) {
    setMembersClass(c);
    setMembers(null);
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/teacher/classes/${c.id}/members`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        members?: TeacherClassMember[];
      };
      if (!res.ok) {
        throw new Error(json.error ?? "خطا در دریافت اعضای کلاس.");
      }
      setMembers(json.members ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در دریافت اعضای کلاس."
      );
      setMembersClass(null);
    } finally {
      setMembersLoading(false);
    }
  }

  async function handleRemoveMember(m: TeacherClassMember) {
    if (!membersClass) return;
    try {
      const res = await fetch(
        `/api/teacher/classes/${membersClass.id}/members/${m.id}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "خطا در حذف عضو کلاس.");
      toast.success(
        `«${m.user.firstName} ${m.user.lastName}» از کلاس حذف شد`
      );
      // به‌روزرسانی درجا + شمارنده‌ی کارت
      setMembers((prev) => prev?.filter((x) => x.id !== m.id) ?? prev);
      setClasses(
        (prev) =>
          prev?.map((c) =>
            c.id === membersClass.id
              ? { ...c, _count: { members: Math.max(0, c._count.members - 1) } }
              : c
          ) ?? prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در حذف عضو کلاس.");
      throw err; // دیالوگ تأیید باز بماند
    }
  }

  /* ————————————— حذف کلاس ————————————— */

  async function handleDelete(c: TeacherClassRow) {
    try {
      const res = await fetch(`/api/teacher/classes/${c.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "خطا در حذف کلاس.");
      toast.success(`کلاس «${c.title}» حذف شد`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در حذف کلاس.");
      throw err; // دیالوگ تأیید باز بماند
    }
  }

  /* ————————————— رندر ————————————— */

  return (
    <section aria-label="کلاس‌های من (استاد)" className="space-y-4">
      {/* سربرگ + دکمه‌ی ایجاد */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 sm:mb-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
            <School className="size-5 text-violet-600 dark:text-violet-300" />
            کلاس‌های من
          </h2>
          <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            {classes ? `${faDigits(classes.length)} کلاس` : "…"}
          </span>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          className="h-11 rounded-xl bg-gradient-to-l from-violet-400 to-purple-600 px-5 text-xs font-black text-white shadow-lg shadow-violet-500/25 transition-all hover:scale-[1.02]"
        >
          <Plus className="size-4" />
          ایجاد کلاس
        </Button>
      </div>

      {denied ? (
        <DeniedNotice />
      ) : classes === null ? (
        <ClassListSkeleton />
      ) : classes.length === 0 ? (
        <div
          className={cn(
            CARD,
            "flex flex-col items-center gap-4 px-6 py-12 text-center"
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
            <School className="size-7 text-muted-foreground" />
          </span>
          <div>
            <p className="text-base font-black text-foreground">
              هنوز کلاسی نساخته‌اید
            </p>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              کلاس بسازید و لینک دعوت یکتای آن را با کاربران به اشتراک
              بگذارید — عضویت فقط از طریق همان لینک انجام می‌شود.
            </p>
          </div>
          <Button
            type="button"
            onClick={openCreate}
            className="h-11 rounded-xl bg-gradient-to-l from-violet-400 to-purple-600 px-5 text-xs font-black text-white shadow-lg shadow-violet-500/25 transition-all hover:scale-[1.02]"
          >
            <Plus className="size-4" />
            ایجاد اولین کلاس
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {classes.map((c) => (
            <article
              key={c.id}
              className={cn(CARD, "flex flex-col gap-4 p-4 sm:p-5")}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 shadow-md shadow-violet-500/20"
                  aria-hidden
                >
                  <School className="size-5 text-white" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-foreground">
                    {c.title}
                  </p>
                  <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {c.description || "بدون توضیحات"}
                  </p>
                </div>
                <span className="flex shrink-0 select-none items-center gap-1.5 rounded-full border border-border bg-foreground/[0.03] px-2.5 py-1 text-[0.65rem] font-bold text-muted-foreground dark:bg-white/[0.03]">
                  <Users className="size-3" />
                  {faDigits(c._count.members)} عضو
                </span>
              </div>

              {/* لینک دعوت — نمایش + کپی */}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.02] p-2 dark:bg-white/[0.02]">
                <Link2
                  className="size-4 shrink-0 text-violet-600 dark:text-violet-300"
                  aria-hidden
                />
                <a
                  href={`/join/${c.inviteSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="min-w-0 flex-1 truncate text-left text-xs font-bold text-violet-700 underline-offset-4 hover:underline dark:text-violet-300"
                  title={inviteUrl(c.inviteSlug)}
                >
                  /join/{c.inviteSlug}
                </a>
                <CopyLinkButton slug={c.inviteSlug} />
              </div>

              <div className="flex items-center justify-between border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
                <span className="text-[0.65rem] font-semibold text-muted-foreground">
                  ایجاد: {faDate(c.createdAt)}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void openMembers(c)}
                    aria-label={`اعضای کلاس ${c.title}`}
                    title="اعضای کلاس"
                    className="relative size-11 rounded-xl"
                  >
                    <Users className="size-4" />
                    {c._count.members > 0 ? (
                      <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[0.55rem] font-black tabular-nums text-white">
                        {faDigits(c._count.members)}
                      </span>
                    ) : null}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => openLinkDialog(c)}
                    aria-label={`لینک دعوت کلاس ${c.title}`}
                    title="لینک دعوت — مشاهده، کپی و تغییر"
                    className="size-11 rounded-xl"
                  >
                    <Link2 className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(c)}
                    aria-label={`ویرایش کلاس ${c.title}`}
                    title="ویرایش"
                    className="size-11 rounded-xl"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmDelete
                    title={`حذف کلاس «${c.title}»`}
                    description="اعضای کلاس حذف می‌شوند؛ آزمون‌های کلاسی باز می‌گردند. مطمئن هستید؟"
                    onConfirm={() => handleDelete(c)}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`حذف کلاس ${c.title}`}
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

      {/* ————— دیالوگ ایجاد/ویرایش کلاس ————— */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          dir="rtl"
          className="max-h-[85vh] overflow-y-auto rounded-2xl"
        >
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editing ? `ویرایش کلاس «${editing.title}»` : "کلاس جدید"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "عنوان و توضیحات کلاس را ویرایش کنید."
                : "لینک دعوت یکتا به‌صورت خودکار ساخته می‌شود و بعد از ایجاد قابل مشاهده، کپی و تغییر است."}
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="tcl-title">عنوان کلاس</Label>
                <Input
                  id="tcl-title"
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, title: e.target.value } : prev
                    )
                  }
                  placeholder="مثلاً: کلاس ریاضی پایه نهم"
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tcl-desc">توضیحات (اختیاری)</Label>
                <Textarea
                  id="tcl-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, description: e.target.value } : prev
                    )
                  }
                  placeholder="توضیح کوتاه درباره‌ی این کلاس..."
                  className="min-h-24"
                  maxLength={400}
                />
                <p className="text-[0.7rem] leading-5 text-muted-foreground">
                  حداکثر ۴۰۰ نویسه — برای کاربران در صفحه‌ی دعوت نمایش داده
                  می‌شود.
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-2 flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-10 rounded-xl bg-gradient-to-l from-violet-400 to-purple-600 px-6 text-xs font-black text-white shadow-lg shadow-violet-500/25 transition-all hover:scale-[1.01]"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {editing ? "ذخیره‌ی تغییرات" : "ایجاد کلاس"}
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

      {/* ————— دیالوگ لینک دعوت: مشاهده + کپی + تغییر ————— */}
      <Dialog
        open={!!linkDialogClass}
        onOpenChange={(open) => !open && setLinkDialogClass(null)}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[85vh] overflow-y-auto rounded-2xl"
        >
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              لینک دعوت «{linkDialogClass?.title}»
            </DialogTitle>
            <DialogDescription>
              این لینک را با کاربران به اشتراک بگذارید — عضویت فقط از طریق آن
              انجام می‌شود. با تغییر لینک، لینک قبلی بلافاصله بی‌اعتبار می‌شود.
            </DialogDescription>
          </DialogHeader>

          {linkDialogClass ? (
            <div className="grid gap-4">
              {/* آدرس کامل فعلی + کپی */}
              <div className="space-y-2">
                <Label>آدرس کامل دعوت</Label>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.02] p-2 dark:bg-white/[0.02]">
                  <code
                    dir="ltr"
                    className="min-w-0 flex-1 truncate text-left text-xs font-bold text-violet-700 dark:text-violet-300"
                    title={inviteUrl(linkDialogClass.inviteSlug)}
                  >
                    {inviteUrl(linkDialogClass.inviteSlug)}
                  </code>
                  <CopyLinkButton slug={linkDialogClass.inviteSlug} />
                </div>
                <p className="text-[0.7rem] leading-5 text-muted-foreground">
                  کاربر با کلیک روی این لینک به صفحه‌ی ثبت‌نام کلاس می‌رسد و پس
                  از تایید شماره موبایل، عضو کلاس می‌شود.
                </p>
              </div>

              {/* تغییر شناسه‌ی لینک */}
              <div className="space-y-2 rounded-xl border border-border bg-foreground/[0.02] p-3 dark:bg-white/[0.02]">
                <Label htmlFor="tcl-slug" className="text-sm">
                  تغییر شناسه‌ی لینک
                </Label>
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <span
                      dir="ltr"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground"
                    >
                      /join/
                    </span>
                    <Input
                      id="tcl-slug"
                      dir="ltr"
                      value={slugInput}
                      onChange={(e) =>
                        setSlugInput(
                          e.target.value.replace(/\s+/g, "-").toLowerCase()
                        )
                      }
                      className="pl-16 text-left"
                      maxLength={40}
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSlugInput(clientGenerateSlug())}
                    aria-label="تولید خودکار شناسه‌ی جدید"
                    title="تولید خودکار شناسه‌ی تصادفی"
                    className="size-11 shrink-0 rounded-xl"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
                <p className="text-[0.7rem] leading-5 text-muted-foreground">
                  ۳ تا ۴۰ نویسه: حروف کوچک انگلیسی، رقم و خط تیره — یکتا در کل
                  سایت.
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-2 flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              onClick={() => void handleSaveSlug()}
              disabled={slugSaving}
              className="h-10 rounded-xl bg-gradient-to-l from-violet-400 to-purple-600 px-6 text-xs font-black text-white shadow-lg shadow-violet-500/25 transition-all hover:scale-[1.01]"
            >
              {slugSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              ذخیره لینک
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLinkDialogClass(null)}
              disabled={slugSaving}
              className="h-10 rounded-xl px-4 text-xs font-bold"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ————— دیالوگ اعضای کلاس ————— */}
      <Dialog
        open={!!membersClass}
        onOpenChange={(open) => !open && setMembersClass(null)}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl"
        >
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              اعضای کلاس «{membersClass?.title}»
            </DialogTitle>
            <DialogDescription>
              {membersClass
                ? `${faDigits(membersClass._count.members)} نفر از طریق لینک دعوت عضو این کلاس شده‌اند.`
                : "اعضای کلاس"}
            </DialogDescription>
          </DialogHeader>

          {membersLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/15 py-10 text-sm font-bold text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              در حال دریافت اعضا...
            </div>
          ) : !members || members.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/15 py-10 text-center">
              <Users className="size-6 text-muted-foreground" />
              <p className="text-sm font-bold text-foreground">
                هنوز عضوی ندارد
              </p>
              <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                لینک دعوت را برای کاربران ارسال کنید تا با تکمیل فرم ثبت‌نام
                عضو شوند.
              </p>
            </div>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto pe-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-foreground/[0.02] p-3 dark:bg-white/[0.02]"
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-purple-600 text-sm font-black text-white"
                    aria-hidden
                  >
                    {m.user.firstName.charAt(0) || "؟"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {m.user.firstName} {m.user.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span dir="ltr" className="tabular-nums">
                        {faDigits(m.user.phone)}
                      </span>
                      {m.user.nationalId ? (
                        <>
                          <span className="mx-1.5" aria-hidden>
                            ·
                          </span>
                          <span dir="ltr" className="tabular-nums">
                            {faDigits(m.user.nationalId)}
                          </span>
                        </>
                      ) : null}
                      <span className="mx-1.5" aria-hidden>
                        ·
                      </span>
                      عضویت: {faDate(m.createdAt)}
                    </p>
                  </div>
                  <ConfirmDelete
                    title={`حذف «${m.user.firstName} ${m.user.lastName}» از کلاس`}
                    description="این کاربر از اعضای کلاس حذف می‌شود و با کلیک دوباره روی لینک دعوت می‌تواند عضو شود. مطمئن هستید؟"
                    confirmLabel="بله، حذف شود"
                    onConfirm={() => handleRemoveMember(m)}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`حذف ${m.user.firstName} ${m.user.lastName} از کلاس`}
                      title="حذف از کلاس"
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </ConfirmDelete>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter className="mt-2 flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMembersClass(null)}
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

/* ————————————————— حالت‌های بارگذاری/دسترسی ————————————————— */

/** اسکلت شبکه‌ی کلاس‌ها */
function ClassListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((k) => (
        <div key={k} className={cn(CARD, "animate-pulse p-4 sm:p-5")}>
          <div className="flex items-start gap-3">
            <div className="size-11 animate-pulse rounded-xl bg-foreground/10 dark:bg-white/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-36 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
              <div className="h-3 w-28 animate-pulse rounded bg-foreground/[0.07] dark:bg-white/[0.07]" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-foreground/10 dark:bg-white/10" />
          </div>
          <div className="mt-4 h-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
          <div className="mt-4 flex justify-between border-t border-foreground/[0.07] pt-3">
            <div className="h-3 w-24 animate-pulse rounded bg-foreground/[0.07] dark:bg-white/[0.07]" />
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((b) => (
                <div
                  key={b}
                  className="size-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]"
                />
              ))}
            </div>
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
