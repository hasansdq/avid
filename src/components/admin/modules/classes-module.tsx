"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Check,
  Loader2,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  School,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
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
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { btnGradient } from "@/components/admin/shared/styles";
import type { ClassMemberRow, ClassRoomWithCount } from "@/components/admin/types";
import { faDate, faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/** کاربرِ خلاصه برای نتایج جست‌وجوی «افزودن عضو» (GET /api/admin/users) */
interface UserLite {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  nationalId?: string | null;
  status: string;
}

/** خلاصه‌ی پاسخ افزودن گروهی (POST /api/admin/classes/[id]/members) */
interface AddBulkResult {
  added: number;
  existing: number;
  notFound: string[];
}

/** تبدیل ارقام فارسی/عربی به انگلیسی */
function faToEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/**
 * تجزیه‌ی ورودیِ افزودن گروهی — هر خط/کاما/فاصله یک شماره؛
 * ارقام فارسی پذیرفته می‌شود؛ خروجی: معتبرها + نامعتبرها.
 */
function parseBulkPhones(raw: string): { valid: string[]; invalid: string[] } {
  const tokens = faToEnDigits(raw)
    .split(/[\s,،؛;\n\r\t]+/)
    .map((t) => t.replace(/[\s-]/g, ""))
    .filter(Boolean);
  const valid = [...new Set(tokens.filter((t) => /^09\d{9}$/.test(t)))];
  const invalid = tokens.filter((t) => !/^09\d{9}$/.test(t));
  return { valid, invalid };
}

/** ساختار فرم ایجاد/ویرایش کلاس */
interface ClassForm {
  title: string;
  description: string;
}

/** الفبای تولید خودکار شناسه‌ی لینک — همگام با src/lib/classes.ts (سمت سرور) */
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** تولید شناسه‌ی تصادفی در سمت کلاینت (پیش‌نمایش «تولید خودکار») */
function clientGenerateSlug(): string {
  let slug = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
}

/** آدرس کامل لینک دعوت — origin لحظه‌ای مرورگر مدیر */
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

/* ————————————— دکمه کپی لینک دعوت (با آیکون تیک موفقیت) ————————————— */

function CopyLinkButton({
  slug,
  className,
  label,
  onCopied,
}: {
  slug: string;
  className?: string;
  label?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyInviteLink(slug);
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={label ? "sm" : "icon"}
      onClick={() => void handleCopy()}
      aria-label="کپی لینک دعوت کلاس"
      title="کپی لینک دعوت"
      className={cn("rounded-xl", className)}
    >
      {copied ? (
        <Check className="size-4 text-emerald-600 dark:text-emerald-300" />
      ) : (
        <Copy className="size-4" />
      )}
      {label ? (
        <span className="text-xs font-bold">{label}</span>
      ) : null}
    </Button>
  );
}

/**
 * ماژول کلاس‌ها — تعریف کلاس برای کاربران سایت.
 *
 * هر کلاس لینک دعوت یکتای خود را دارد (قابل مشاهده، کپی و تغییر)؛ کاربران
 * فقط با کلیک روی لینک و تکمیل فرم ثبت‌نام صفحه‌ی دعوت عضو می‌شوند و هر
 * کاربر می‌تواند عضو چندین کلاس باشد. لیست کلاس‌های کاربر در پنل او نمایش
 * داده نمی‌شود — این ماژول نمای مدیریتی عضویت‌ها است.
 */
export function ClassesModule() {
  const [classes, setClasses] = useState<ClassRoomWithCount[] | null>(null);
  const [loading, setLoading] = useState(true);

  // — دیالوگ ایجاد/ویرایش —
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassRoomWithCount | null>(null);
  const [form, setForm] = useState<ClassForm | null>(null);
  const [saving, setSaving] = useState(false);

  // — دیالوگ لینک دعوت —
  const [linkDialogClass, setLinkDialogClass] = useState<ClassRoomWithCount | null>(null);
  const [slugInput, setSlugInput] = useState("");
  const [slugSaving, setSlugSaving] = useState(false);

  // — دیالوگ اعضا —
  const [membersClass, setMembersClass] = useState<ClassRoomWithCount | null>(null);
  const [members, setMembers] = useState<ClassMemberRow[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  // — افزودن عضو (تکی/گروهی) — فقط نقش مدیر (API مدیر؛ استاد دسترسی ندارد) —
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserLite[] | null>(null);
  const [userSearching, setUserSearching] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  /** جلوگیری از پاسخِ دیرهنگامِ جست‌وجوی قبلی ( AbortController per query) */
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setClasses(await apiFetch<ClassRoomWithCount[]>("/api/admin/classes"));
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ————————————— ایجاد / ویرایش ————————————— */

  function openCreate() {
    setEditing(null);
    setForm({ title: "", description: "" });
    setDialogOpen(true);
  }

  function openEdit(c: ClassRoomWithCount) {
    setEditing(c);
    setForm({ title: c.title, description: c.description });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form || saving) return;
    const title = form.title.trim();
    if (title.length < 2 || title.length > 80) {
      toast.error("عنوان کلاس باید بین ۲ تا ۸۰ نویسه باشد.");
      return;
    }
    const description = form.description.trim().slice(0, 400);

    setSaving(true);
    try {
      if (editing) {
        await apiFetch<ClassRoomWithCount>(`/api/admin/classes/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title, description }),
        });
        toast.success("کلاس با موفقیت ویرایش شد");
      } else {
        const created = await apiFetch<ClassRoomWithCount>("/api/admin/classes", {
          method: "POST",
          body: JSON.stringify({ title, description }),
        });
        toast.success("کلاس جدید ایجاد شد", {
          description: `لینک دعوت: ${inviteUrl(created.inviteSlug)}`,
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

  /* ————————————— تغییر لینک دعوت ————————————— */

  function openLinkDialog(c: ClassRoomWithCount) {
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
      const updated = await apiFetch<ClassRoomWithCount>(
        `/api/admin/classes/${linkDialogClass.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ inviteSlug: slug }),
        }
      );
      toast.success("لینک دعوت کلاس تغییر کرد", {
        description: inviteUrl(updated.inviteSlug),
      });
      setLinkDialogClass(null);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSlugSaving(false);
    }
  }

  /* ————————————— اعضا ————————————— */

  async function openMembers(c: ClassRoomWithCount) {
    setMembersClass(c);
    setMembers(null);
    setMembersLoading(true);
    // ریست حالتِ افزودن عضو در هر باز شدن
    setAddMode("single");
    setUserQuery("");
    setUserResults(null);
    setBulkInput("");
    try {
      const data = await apiFetch<{ classTitle: string; members: ClassMemberRow[] }>(
        `/api/admin/classes/${c.id}/members`
      );
      setMembers(data.members);
    } catch (error) {
      toastApiError(error);
      setMembersClass(null);
    } finally {
      setMembersLoading(false);
    }
  }

  /** نوسازی بی‌درنگ لیست اعضا و شمارنده‌ها پس از افزودن (بدون اسپینر) */
  async function refreshMembers() {
    if (!membersClass) return;
    try {
      const data = await apiFetch<{ classTitle: string; members: ClassMemberRow[] }>(
        `/api/admin/classes/${membersClass.id}/members`
      );
      setMembers(data.members);
      const count = data.members.length;
      setMembersClass({ ...membersClass, _count: { members: count } });
      setClasses(
        (prev) =>
          prev?.map((c) =>
            c.id === membersClass.id ? { ...c, _count: { members: count } } : c
          ) ?? prev
      );
    } catch (error) {
      toastApiError(error);
    }
  }

  /** جست‌وجوی کاربران برای افزودن تکی — با ۳۵۰ms debounce */
  useEffect(() => {
    if (!membersClass || addMode !== "single") return;
    const q = userQuery.trim();
    if (q.length < 2) {
      setUserResults(null);
      setUserSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setUserSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<{ users: UserLite[] }>(
          `/api/admin/users?q=${encodeURIComponent(q)}`
        );
        if (seq !== searchSeq.current) return; // جست‌وجوی قدیمی — رد
        setUserResults(data.users);
      } catch {
        if (seq === searchSeq.current) setUserResults(null);
      } finally {
        if (seq === searchSeq.current) setUserSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [userQuery, membersClass, addMode]);

  /** افزودن تکی — انتخاب از نتایج جست‌وجو */
  async function handleAddSingle(u: UserLite) {
    if (!membersClass || addingUserId) return;
    setAddingUserId(u.id);
    try {
      await apiFetch(`/api/admin/classes/${membersClass.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: u.id }),
      });
      toast.success(`${u.firstName} ${u.lastName} به کلاس اضافه شد`);
      setUserResults((prev) => prev?.filter((r) => r.id !== u.id) ?? prev);
      await refreshMembers();
    } catch (error) {
      toastApiError(error);
    } finally {
      setAddingUserId(null);
    }
  }

  /** افزودن گروهی — لیست شماره موبایل از textarea */
  async function handleAddBulk() {
    if (!membersClass || bulkSaving) return;
    const { valid } = parseBulkPhones(bulkInput);
    if (valid.length === 0) {
      toast.error("حداقل یک شماره موبایل معتبر (۱۱ رقمی با ۰۹…) وارد کنید.");
      return;
    }
    setBulkSaving(true);
    try {
      const res = await apiFetch<AddBulkResult>(
        `/api/admin/classes/${membersClass.id}/members`,
        { method: "POST", body: JSON.stringify({ phones: valid }) }
      );
      const parts = [`${faDigits(res.added)} نفر به کلاس اضافه شد`];
      if (res.existing > 0) parts.push(`${faDigits(res.existing)} نفر از قبل عضو بود`);
      toast.success(parts.join("، "));
      if (res.notFound.length > 0) {
        toast.warning(`شماره بدون کاربر ثبت‌شده: ${res.notFound.join("، ")}`, {
          description: "ابتدا کاربر را از ماژول «کاربران و ثبت‌نام» بسازید.",
        });
      }
      if (res.added > 0) setBulkInput("");
      await refreshMembers();
    } catch (error) {
      toastApiError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleRemoveMember(m: ClassMemberRow) {
    if (!membersClass) return;
    try {
      await apiFetch(
        `/api/admin/classes/${membersClass.id}/members/${m.id}`,
        { method: "DELETE" }
      );
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
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /* ————————————— حذف کلاس ————————————— */

  async function handleDelete(c: ClassRoomWithCount) {
    try {
      await apiFetch(`/api/admin/classes/${c.id}`, { method: "DELETE" });
      toast.success(`کلاس «${c.title}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /* ————————————— رندر ————————————— */

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="کلاس‌ها"
        description="تعریف کلاس‌ها با لینک دعوت یکتا — کاربران با کلیک روی لینک و تکمیل فرم ثبت‌نام عضو می‌شوند؛ مدیر می‌تواند از دیالوگ «اعضا» کاربران را تکی (جست‌وجو) یا گروهی (لیست شماره) مستقیم اضافه کند. تعداد کلاس‌های هر کاربر محدودیتی ندارد."
      >
        <Button onClick={openCreate} className={`rounded-xl ${btnGradient}`}>
          <Plus className="size-4" />
          کلاس جدید
        </Button>
      </ModuleHeader>

      {loading && !classes ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass h-52 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : !classes || classes.length === 0 ? (
        <EmptyState
          icon={School}
          title="هنوز کلاسی تعریف نشده است"
          description="کلاس بسازید و لینک دعوت یکتای آن را با کاربران به اشتراک بگذارید — یا از دیالوگ «اعضا» به‌صورت مستقیم (تکی/گروهی) عضو اضافه کنید."
        >
          <Button onClick={openCreate} size="sm" className={`rounded-xl ${btnGradient}`}>
            <Plus className="size-4" />
            ساخت اولین کلاس
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => (
            <article
              key={c.id}
              className="glass flex flex-col gap-4 rounded-2xl p-4 transition-colors hover:border-foreground/20 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-md shadow-teal-500/20"
                  aria-hidden
                >
                  <School className="size-5 text-teal-950" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-foreground">
                    {c.title}
                  </p>
                  <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {c.description || "بدون توضیحات"}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-foreground/[0.03] px-2.5 py-1 text-[0.65rem] font-bold text-muted-foreground dark:bg-white/[0.03]">
                  <Users className="size-3" />
                  {faDigits(c._count.members)} عضو
                </span>
              </div>

              {/* لینک دعوت — نمایش + کپی */}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.02] p-2 dark:bg-white/[0.02]">
                <Link2 className="size-4 shrink-0 text-teal-600 dark:text-teal-300" aria-hidden />
                <a
                  href={`/join/${c.inviteSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="min-w-0 flex-1 truncate text-left text-xs font-bold text-teal-700 underline-offset-4 hover:underline dark:text-teal-300"
                  title={inviteUrl(c.inviteSlug)}
                >
                  /join/{c.inviteSlug}
                </a>
                <CopyLinkButton slug={c.inviteSlug} />
              </div>

              <div className="flex items-center justify-between border-t border-foreground/[0.07] pt-3">
                <span className="text-[0.65rem] font-semibold text-muted-foreground">
                  ایجاد: {faDate(c.createdAt)}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void openMembers(c)}
                    aria-label={`اعضای کلاس ${c.title}`}
                    title="اعضای کلاس"
                    className="relative"
                  >
                    <Users className="size-4" />
                    {c._count.members > 0 ? (
                      <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-500 px-1 text-[0.55rem] font-black tabular-nums text-white">
                        {faDigits(c._count.members)}
                      </span>
                    ) : null}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openLinkDialog(c)}
                    aria-label={`لینک دعوت ${c.title}`}
                    title="لینک دعوت — مشاهده، کپی و تغییر"
                  >
                    <Link2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(c)}
                    aria-label={`ویرایش کلاس ${c.title}`}
                    title="ویرایش"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmDelete
                    title={`حذف کلاس «${c.title}»`}
                    description="این کلاس و عضویت‌های ثبت‌شده‌ی آن برای همیشه حذف می‌شود. مطمئن هستید؟"
                    onConfirm={() => handleDelete(c)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
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
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl">
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
                <Label htmlFor="c-title">عنوان کلاس</Label>
                <Input
                  id="c-title"
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                  }
                  placeholder="مثلاً: کلاس ریاضی پایه نهم"
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-desc">توضیحات (اختیاری)</Label>
                <Textarea
                  id="c-desc"
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
                  حداکثر ۴۰۰ نویسه — برای کاربران در صفحه‌ی دعوت نمایش داده می‌شود.
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className={`rounded-xl ${btnGradient}`}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "ذخیره تغییرات" : "ایجاد کلاس"}
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

      {/* ————— دیالوگ لینک دعوت: مشاهده + کپی + تغییر ————— */}
      <Dialog
        open={!!linkDialogClass}
        onOpenChange={(open) => !open && setLinkDialogClass(null)}
      >
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl">
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
                    className="min-w-0 flex-1 truncate text-left text-xs font-bold text-teal-700 dark:text-teal-300"
                    title={inviteUrl(linkDialogClass.inviteSlug)}
                  >
                    {inviteUrl(linkDialogClass.inviteSlug)}
                  </code>
                  <CopyLinkButton slug={linkDialogClass.inviteSlug} />
                </div>
                <p className="text-[0.7rem] leading-5 text-muted-foreground">
                  کاربر با کلیک روی این لینک به صفحه‌ی ثبت‌نام کلاس می‌رسد و پس از
                  تایید شماره موبایل، عضو کلاس می‌شود.
                </p>
              </div>

              {/* تغییر شناسه‌ی لینک */}
              <div className="space-y-2 rounded-xl border border-border bg-foreground/[0.02] p-3 dark:bg-white/[0.02]">
                <Label htmlFor="c-slug" className="text-sm">
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
                      id="c-slug"
                      dir="ltr"
                      value={slugInput}
                      onChange={(e) =>
                        setSlugInput(e.target.value.replace(/\s+/g, "-").toLowerCase())
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
                    className="shrink-0 rounded-xl"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
                <p className="text-[0.7rem] leading-5 text-muted-foreground">
                  ۳ تا ۴۰ نویسه: حروف کوچک انگلیسی، رقم و خط تیره — یکتا در کل سایت.
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={() => void handleSaveSlug()}
              disabled={slugSaving}
              className={`rounded-xl ${btnGradient}`}
            >
              {slugSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              ذخیره لینک
            </Button>
            <Button
              variant="outline"
              onClick={() => setLinkDialogClass(null)}
              disabled={slugSaving}
              className="rounded-xl"
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
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              اعضای کلاس «{membersClass?.title}»
            </DialogTitle>
            <DialogDescription>
              {membersClass
                ? `${faDigits(membersClass._count.members)} نفر عضو این کلاس هستند (از طریق لینک دعوت یا افزودن مستقیم توسط مدیر).`
                : "اعضای کلاس"}
            </DialogDescription>
          </DialogHeader>

          {/* ————— افزودن عضو (تکی/گروهی) — فقط نقش مدیر ————— */}
          <div className="rounded-xl border border-border bg-foreground/[0.02] p-3 dark:bg-white/[0.02]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <UserPlus className="size-4 text-teal-600 dark:text-teal-300" />
                افزودن کاربر به کلاس
              </p>
              <div
                role="tablist"
                aria-label="روش افزودن عضو"
                className="flex items-center rounded-lg border border-border bg-background p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMode === "single"}
                  onClick={() => setAddMode("single")}
                  className={cn(
                    "rounded-md px-3 py-1 text-[0.7rem] font-black transition-colors",
                    addMode === "single"
                      ? "bg-gradient-to-l from-teal-400 to-emerald-600 text-teal-950 shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  تکی (جست‌وجو)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMode === "bulk"}
                  onClick={() => setAddMode("bulk")}
                  className={cn(
                    "rounded-md px-3 py-1 text-[0.7rem] font-black transition-colors",
                    addMode === "bulk"
                      ? "bg-gradient-to-l from-teal-400 to-emerald-600 text-teal-950 shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  گروهی (شماره‌ها)
                </button>
              </div>
            </div>

            {addMode === "single" ? (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="نام یا شماره موبایل کاربر را جست‌وجو کنید..."
                    className="h-10 rounded-xl ps-9 text-sm"
                    autoComplete="off"
                    aria-label="جست‌وجوی کاربر برای افزودن به کلاس"
                  />
                </div>

                {userSearching ? (
                  <p className="flex items-center gap-1.5 px-1 text-[0.7rem] font-bold text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    در حال جست‌وجو...
                  </p>
                ) : userResults ? (
                  (() => {
                    // اعضای فعلی از نتایج حذف می‌شوند (بدون افزودن تکراری)
                    const memberIds = new Set(
                      (members ?? []).map((m) => m.user.id)
                    );
                    const candidates = userResults.filter(
                      (u) => !memberIds.has(u.id)
                    );
                    if (candidates.length === 0) {
                      return (
                        <p className="px-1 text-[0.7rem] font-bold text-muted-foreground">
                          کاربر دیگری یافت نشد — نتایج فعلی یا عضو کلاس هستند یا
                          وجود ندارند.
                        </p>
                      );
                    }
                    return (
                      <ul className="max-h-44 space-y-1.5 overflow-y-auto pe-1">
                        {candidates.map((u) => (
                          <li
                            key={u.id}
                            className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-xs font-black dark:bg-white/[0.06]">
                              {u.firstName.charAt(0)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-foreground">
                                {u.firstName} {u.lastName}
                                {u.status === "blocked" ? (
                                  <span className="ms-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[0.55rem] font-black text-red-600 dark:text-red-300">
                                    مسدود
                                  </span>
                                ) : null}
                              </p>
                              <p className="truncate text-[0.65rem] text-muted-foreground">
                                <span dir="ltr">{faDigits(u.phone)}</span>
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => void handleAddSingle(u)}
                              disabled={addingUserId !== null}
                              className="h-8 rounded-lg bg-gradient-to-l from-teal-400 to-emerald-600 px-3 text-[0.65rem] font-black text-teal-950 hover:opacity-90"
                            >
                              {addingUserId === u.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <UserPlus className="size-3.5" />
                              )}
                              افزودن
                            </Button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()
                ) : (
                  <p className="px-1 text-[0.7rem] leading-5 text-muted-foreground">
                    حداقل ۲ نویسه بنویسید — جست‌وجو در نام، نام خانوادگی، شماره
                    موبایل و کد ملی کاربران.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder={"شماره موبایل کاربران — هر شماره در یک خط:\n09123456789\n09151112233"}
                  className="min-h-24 rounded-xl text-sm leading-6"
                  dir="ltr"
                  aria-label="لیست شماره موبایل برای افزودن گروهی"
                />
                {(() => {
                  const { valid, invalid } = parseBulkPhones(bulkInput);
                  if (!bulkInput.trim()) return null;
                  return (
                    <p className="text-[0.7rem] leading-5 font-bold">
                      <span className="text-emerald-600 dark:text-emerald-300">
                        {faDigits(valid.length)} شماره معتبر
                      </span>
                      {invalid.length > 0 ? (
                        <>
                          {" — "}
                          <span className="text-red-600 dark:text-red-300">
                            {faDigits(invalid.length)} نامعتبر
                          </span>
                        </>
                      ) : null}
                      {valid.length > 0 ? (
                        <>
                          {" — "}
                          <span className="text-muted-foreground">
                            فقط کاربرانِ ثبت‌شده با این شماره‌ها اضافه می‌شوند.
                          </span>
                        </>
                      ) : null}
                    </p>
                  );
                })()}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleAddBulk()}
                    disabled={bulkSaving || parseBulkPhones(bulkInput).valid.length === 0}
                    className="h-9 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-600 px-4 text-xs font-black text-teal-950 hover:opacity-90"
                  >
                    {bulkSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <UserPlus className="size-4" />
                    )}
                    افزودن گروهی
                  </Button>
                  <p className="text-[0.65rem] leading-4 text-muted-foreground">
                    ارقام فارسی هم پذیرفته می‌شود؛ حداکثر ۱۰۰ شماره در هر درخواست.
                  </p>
                </div>
              </div>
            )}
          </div>

          {membersLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/15 py-10 text-sm font-bold text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              در حال دریافت اعضا...
            </div>
          ) : !members || members.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/15 py-10 text-center">
              <Users className="size-6 text-muted-foreground" />
              <p className="text-sm font-bold text-foreground">هنوز عضوی ندارد</p>
              <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                لینک دعوت را برای کاربران ارسال کنید تا با تکمیل فرم ثبت‌نام عضو شوند.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <ul className="max-h-96 space-y-2 overflow-y-auto pe-1">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-foreground/[0.02] p-3 dark:bg-white/[0.02]"
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 text-sm font-black text-teal-950"
                      aria-hidden
                    >
                      {m.user.firstName.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">
                        {m.user.firstName} {m.user.lastName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span dir="ltr">{faDigits(m.user.phone)}</span>
                        <span className="mx-1.5" aria-hidden>·</span>
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
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`حذف ${m.user.firstName} ${m.user.lastName} از کلاس`}
                        title="حذف از کلاس"
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    </ConfirmDelete>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              variant="outline"
              onClick={() => setMembersClass(null)}
              className="rounded-xl"
            >
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
