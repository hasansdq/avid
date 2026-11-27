"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Check,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import { faDate, faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/* ————————————————— انواع داده ————————————————— */

/** یک گواهینامه‌ی صادرشده (پاسخ GET /api/admin/certificates) */
interface CertRow {
  id: string;
  code: string;
  courseTitle: string;
  grade: number | null;
  note: string;
  /** فایل آپلودشده (PDF یا تصویر) — خالی یعنی بدون فایل */
  fileUrl: string;
  issuedAt: string;
  user: { firstName: string; lastName: string; phone: string };
}

/** کاربر کوتاه‌شده برای انتخابگر */
interface UserLite {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
}

/** گزینه‌ی دوره‌ی شرکت‌شده‌ی کاربر برای صدور گواهینامه */
interface CourseOption {
  courseId: string;
  title: string;
  /** معدل ثبت‌شده‌ی کاربر در این دوره (برای پیش‌پر کردن فیلد معدل) */
  grade: number | null;
  /** برای این کاربر در این دوره قبلاً گواهینامه صادر شده است */
  alreadyIssued: boolean;
}

/* ————————————————— ابزارهای کمکی ————————————————— */

/** نوع فایل گواهینامه از روی آدرس — pdf | image | none */
function fileKindOf(url: string | null | undefined): "pdf" | "image" | "none" {
  const clean = (url ?? "").trim().split("?")[0];
  if (!clean) return "none";
  return /\.pdf$/i.test(clean) ? "pdf" : "image";
}

/** نام کامل کاربر */
function fullName(u: { firstName: string; lastName: string } | null): string {
  if (!u) return "—";
  return `${u.firstName} ${u.lastName}`.trim() || "—";
}

/* ————————————————— ماژول صدور گواهینامه ————————————————— */

/**
 * CertificatesModule — مدیریت گواهینامه‌های پایان دوره:
 *  · صدور گواهینامه‌ی جدید: انتخاب کاربر و دوره‌ای که در آن شرکت کرده،
 *    آپلود فایل گواهینامه (PDF یا تصویر) و ثبت معدل/توضیح اختیاری.
 *  · ویرایش فایل، معدل و توضیح؛ حذف گواهینامه (فایل هم پاک می‌شود).
 *  · کاربر گواهینامه‌ها را در پنل خود می‌بیند و دانلود می‌کند.
 */
export function CertificatesModule() {
  const [certs, setCerts] = useState<CertRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CertRow | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch<{ certificates: CertRow[] }>(
        "/api/admin/certificates"
      );
      setCerts(Array.isArray(res.certificates) ? res.certificates : []);
    } catch (error) {
      toastApiError(error);
      setCerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="صدور گواهینامه"
        description="صدور گواهینامه‌ی دوره برای کاربران — آپلود فایل گواهینامه (PDF یا تصویر) و تخصیص آن به کاربر و دوره‌ای که در آن شرکت کرده است؛ گواهینامه در پنل کاربر قابل مشاهده و دانلود است."
      >
        <Button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 px-5 font-black text-amber-950 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02]"
        >
          <Award className="size-4" />
          صدور گواهینامه جدید
        </Button>
      </ModuleHeader>

      {/* ————— فهرست گواهینامه‌ها ————— */}
      {loading && !certs ? (
        <TableSkeleton rows={5} cols={6} />
      ) : !certs || certs.length === 0 ? (
        <EmptyState
          icon={Award}
          title="هنوز گواهینامه‌ای صادر نشده"
          description="با «صدور گواهینامه جدید»، فایل گواهینامه (PDF یا تصویر) را آپلود کنید و به کاربر و دوره‌ای که در آن شرکت کرده تخصیص دهید."
        />
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {[
                    { label: "کاربر", className: "text-start" },
                    { label: "دوره", className: "text-start" },
                    { label: "فایل", className: "text-center" },
                    { label: "معدل", className: "text-center" },
                    { label: "کد رهگیری", className: "text-center" },
                    { label: "تاریخ صدور", className: "text-center" },
                    { label: "عملیات", className: "text-center" },
                  ].map((h) => (
                    <th
                      key={h.label}
                      scope="col"
                      className={cn(
                        "sticky top-0 z-10 border-b border-border bg-background px-3 py-2.5 text-xs font-black text-muted-foreground",
                        h.className
                      )}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => {
                  const kind = fileKindOf(c.fileUrl);
                  return (
                    <tr key={c.id} className="group/row">
                      <td className="border-b border-border/60 px-3 py-2.5 align-middle transition-colors group-hover/row:bg-muted/40">
                        <p className="text-sm font-bold text-foreground">
                          {fullName(c.user)}
                        </p>
                        <p
                          dir="ltr"
                          className="text-[0.65rem] tabular-nums text-muted-foreground"
                        >
                          {faDigits(c.user.phone)}
                        </p>
                      </td>
                      <td className="border-b border-border/60 px-3 py-2.5 align-middle transition-colors group-hover/row:bg-muted/40">
                        <p
                          className="max-w-56 truncate text-sm font-bold text-foreground"
                          title={c.courseTitle}
                        >
                          {c.courseTitle || "—"}
                        </p>
                        {c.note ? (
                          <p
                            className="max-w-56 truncate text-[0.65rem] text-muted-foreground"
                            title={c.note}
                          >
                            {c.note}
                          </p>
                        ) : null}
                      </td>
                      <td className="border-b border-border/60 px-3 py-2.5 text-center align-middle transition-colors group-hover/row:bg-muted/40">
                        {kind === "none" ? (
                          <span className="text-[0.65rem] text-muted-foreground">
                            بدون فایل
                          </span>
                        ) : (
                          <a
                            href={c.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex"
                            title="مشاهده فایل گواهینامه"
                          >
                            <Badge
                              className={cn(
                                "gap-1 rounded-full border-0 px-2.5 py-1 text-[0.65rem] font-black",
                                kind === "pdf"
                                  ? "bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300"
                                  : "bg-teal-500/15 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300"
                              )}
                            >
                              {kind === "pdf" ? (
                                <FileText className="size-3" />
                              ) : (
                                <ImageIcon className="size-3" />
                              )}
                              {kind === "pdf" ? "PDF" : "تصویر"}
                            </Badge>
                          </a>
                        )}
                      </td>
                      <td className="border-b border-border/60 px-3 py-2.5 text-center align-middle transition-colors group-hover/row:bg-muted/40">
                        {c.grade !== null && c.grade !== undefined ? (
                          <span
                            className={cn(
                              "text-sm font-black tabular-nums",
                              c.grade >= 85
                                ? "text-emerald-600 dark:text-emerald-300"
                                : c.grade >= 50
                                  ? "text-teal-600 dark:text-teal-300"
                                  : "text-amber-600 dark:text-amber-300"
                            )}
                          >
                            {faDigits(c.grade)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="border-b border-border/60 px-3 py-2.5 text-center align-middle transition-colors group-hover/row:bg-muted/40">
                        <span
                          dir="ltr"
                          className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-black tracking-wide text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
                        >
                          {c.code}
                        </span>
                      </td>
                      <td className="border-b border-border/60 px-3 py-2.5 text-center align-middle transition-colors group-hover/row:bg-muted/40">
                        <span className="text-xs font-bold text-muted-foreground">
                          {faDate(c.issuedAt)}
                        </span>
                      </td>
                      <td className="border-b border-border/60 px-3 py-2.5 text-center align-middle transition-colors group-hover/row:bg-muted/40">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditing(c)}
                            aria-label={`ویرایش گواهینامه ${c.code}`}
                            title="ویرایش فایل، معدل و توضیح"
                            className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <ConfirmDelete
                            title="حذف گواهینامه"
                            description={`گواهینامه‌ی «${c.courseTitle}» برای ${fullName(c.user)} حذف شود؟ فایل آپلودشده هم پاک می‌شود و کاربر دیگر آن را در پنل خود نمی‌بیند.`}
                            onConfirm={async () => {
                              await apiFetch(
                                `/api/admin/certificates/${c.id}`,
                                { method: "DELETE" }
                              );
                              toast.success("گواهینامه حذف شد.");
                              await load();
                            }}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`حذف گواهینامه ${c.code}`}
                              title="حذف گواهینامه"
                              className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </ConfirmDelete>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ————— دیالوگ صدور ————— */}
      <IssueDialog
        open={creating}
        existing={certs ?? []}
        onClose={() => setCreating(false)}
        onSaved={load}
      />

      {/* ————— دیالوگ ویرایش ————— */}
      <EditDialog
        cert={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

/* ————————————————— انتخابگر کاربر ————————————————— */

/**
 * UserPicker — انتخاب کاربر با جست‌وجو (نام یا شماره).
 * فهرست از /api/admin/users?q=... می‌آید (۲۰ نتیجه‌ی جست‌وجوی جاری).
 */
function UserPicker({
  value,
  onChange,
}: {
  value: UserLite | null;
  onChange: (user: UserLite | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserLite[] | null>(null);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await apiFetch<{ users: UserLite[] }>(
            `/api/admin/users?q=${encodeURIComponent(q)}`
          );
          setUsers(res.users ?? []);
        } catch {
          setUsers([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [q, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id="cert-user-picker"
          aria-label="انتخاب کاربر گواهینامه"
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-start text-sm font-bold shadow-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
            !value && "text-muted-foreground"
          )}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">
                {fullName(value)}
              </span>
              <span dir="ltr" className="shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
                {faDigits(value.phone)}
              </span>
              {value.status === "blocked" ? (
                <Badge className="shrink-0 rounded-full border-0 bg-destructive/15 px-2 py-0.5 text-[0.6rem] font-black text-destructive">
                  مسدود
                </Badge>
              ) : null}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Search className="size-4" />
              انتخاب کاربر گواهینامه…
            </span>
          )}
          {value ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="پاک کردن انتخاب کاربر"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange(null);
                }
              }}
              className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="size-3.5" />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="start" className="w-[--radix-popover-trigger-width] max-w-full rounded-xl p-2">
        <div className="relative">
          <Search className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            dir="rtl"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جست‌وجوی نام یا شماره موبایل…"
            className="h-9 rounded-lg pe-8 text-xs"
            autoFocus
          />
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto">
          {searching && !users ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : users && users.length > 0 ? (
            users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onChange(u);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-start transition-colors hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black text-foreground">
                    {fullName(u)}
                  </span>
                  <span
                    dir="ltr"
                    className="block text-[0.65rem] tabular-nums text-muted-foreground"
                  >
                    {faDigits(u.phone)}
                  </span>
                </span>
                {value?.id === u.id ? (
                  <Check className="size-4 shrink-0 text-teal-600 dark:text-teal-300" />
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              کاربری یافت نشد.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ————————————————— فیلد آپلود فایل گواهینامه ————————————————— */

/**
 * CertificateFileField — آپلود فایل گواهینامه (PDF یا تصویر ≤۱۰MB).
 * فایل به /api/admin/upload (kind=certificate) می‌رود و آدرس نسبی
 * برگشتی نگه داشته می‌شود؛ تصویر پیش‌نمایش زنده دارد.
 */
function CertificateFileField({
  value,
  onChange,
  label = "فایل گواهینامه (PDF یا تصویر)",
  required = true,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  required?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const kind = fileKindOf(value);

  async function handleUpload(file: File | undefined) {
    if (!file || uploading) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم فایل گواهینامه حداکثر ۱۰ مگابایت می‌تواند باشد.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "certificate");
      body.append("section", "certificates");
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "خطا در بارگذاری فایل.");
      }
      onChange(data.url);
      setFileName(file.name);
      setPreviewFailed(false);
      toast.success("فایل گواهینامه بارگذاری شد");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "خطا در بارگذاری فایل."
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="cert-file">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>

      {/* نمایش فایل انتخاب‌شده */}
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-foreground/[0.02] p-3">
          {kind === "image" && !previewFailed ? (
            <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
              {/* لینک امضاشده (?sig=) — <img> مستقیم؛ بهینه‌ساز next/image کوئری را رد می‌کند */}
              <img
                src={value}
                alt="پیش‌نمایش گواهینامه"
                className="absolute inset-0 h-full w-full object-contain"
                onError={() => setPreviewFailed(true)}
              />
            </div>
          ) : (
            <span
              className={cn(
                "flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br text-white",
                kind === "pdf"
                  ? "from-rose-500 to-red-600 shadow-lg shadow-rose-500/25"
                  : "from-teal-500 to-emerald-600 shadow-lg shadow-teal-500/25"
              )}
            >
              {kind === "pdf" ? (
                <FileText className="size-6" />
              ) : (
                <ImageIcon className="size-6" />
              )}
              <span className="text-[0.55rem] font-black">
                {kind === "pdf" ? "PDF" : "تصویر"}
              </span>
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-xs font-black text-foreground">
              {fileName || "فایل گواهینامه بارگذاری‌شده"}
            </p>
            <p dir="ltr" className="truncate text-[0.65rem] text-muted-foreground">
              {value}
            </p>
            <div className="flex items-center gap-1.5 pt-0.5">
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-[0.65rem] font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="size-3" />
                مشاهده
              </a>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="h-7 rounded-lg px-2 text-[0.65rem] font-bold text-muted-foreground hover:text-foreground"
              >
                <Upload className="size-3" />
                جایگزینی
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => {
                  onChange("");
                  setFileName("");
                }}
                className="h-7 rounded-lg px-2 text-[0.65rem] font-bold text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
                حذف
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-foreground/[0.02] px-4 py-8 transition-colors hover:border-amber-500/50 hover:bg-amber-500/[0.03] disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="size-6 animate-spin text-amber-600 dark:text-amber-300" />
              <span className="text-xs font-bold text-muted-foreground">
                در حال بارگذاری…
              </span>
            </>
          ) : (
            <>
              <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
                <Upload className="size-5 text-amber-950" />
              </span>
              <span className="text-xs font-black text-foreground">
                بارگذاری فایل گواهینامه
              </span>
              <span className="text-[0.65rem] text-muted-foreground">
                PDF یا تصویر (PNG، JPG، WebP) — حداکثر ۱۰ مگابایت
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={fileInputRef}
        id="cert-file"
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="انتخاب فایل گواهینامه"
        onChange={(e) => {
          const file = e.target.files?.[0];
          void handleUpload(file);
        }}
      />
      {uploading && value ? (
        <p className="flex items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          در حال بارگذاری فایل جدید…
        </p>
      ) : null}
    </div>
  );
}

/* ————————————————— دیالوگ صدور گواهینامه ————————————————— */

/**
 * IssueDialog — صدور گواهینامه‌ی جدید:
 *  ۱. انتخاب کاربر (جست‌وجویی)
 *  ۲. انتخاب دوره از بین دوره‌هایی که کاربر در آن‌ها ثبت‌نام کرده
 *  ۳. آپلود فایل گواهینامه (PDF یا تصویر) — الزامی
 *  ۴. معدل (۰ تا ۱۰۰، اختیاری؛ با معدل ثبت‌شده‌ی دوره (مقیاس ۲۰) × ۵ پیش‌پر می‌شود) و توضیح
 */
function IssueDialog({
  open,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** گواهینامه‌های موجود — برای علامت‌گذاری دوره‌های صادرشده */
  existing: CertRow[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [user, setUser] = useState<UserLite | null>(null);
  const [courseId, setCourseId] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [grade, setGrade] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /** دوره‌های شرکت‌شده‌ی کاربر انتخاب‌شده */
  const [courses, setCourses] = useState<CourseOption[] | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);

  /** با هر باز شدن دیالوگ، فرم نو می‌شود */
  useEffect(() => {
    if (!open) return;
    setUser(null);
    setCourseId("");
    setFileUrl("");
    setGrade("");
    setNote("");
    setCourses(null);
  }, [open]);

  /** پس از انتخاب کاربر، دوره‌های او (تطبیق با دوره‌های واقعی سایت) بارگذاری می‌شود */
  useEffect(() => {
    if (!open || !user) {
      setCourses(null);
      return;
    }
    let cancelled = false;
    setLoadingCourses(true);
    void (async () => {
      try {
        const [userRes, coursesRes] = await Promise.all([
          apiFetch<{
            enrollments: {
              course: string;
              status: string;
              grade: number | null;
            }[];
          }>(`/api/admin/users/${user.id}`),
          apiFetch<{ id: string; title: string }[]>("/api/admin/courses"),
        ]);
        if (cancelled) return;

        const courseByTitle = new Map(
          coursesRes.map((c) => [c.title, c.id])
        );
        // گواهینامه‌های صادرشده‌ی همین کاربر (تطبیق با شماره موبایل یکتا)
        const existingSet = new Set(
          existing
            .filter((c) => c.user.phone === user.phone)
            .map((c) => c.courseTitle)
        );

        // دوره‌های یکتای شرکت‌شده که هنوز در سایت موجودند
        const seen = new Set<string>();
        const options: CourseOption[] = [];
        for (const e of userRes.enrollments) {
          if (e.status === "archived") continue;
          const cid = courseByTitle.get(e.course);
          if (!cid || seen.has(e.course)) continue;
          seen.add(e.course);
          options.push({
            courseId: cid,
            title: e.course,
            grade: e.grade,
            alreadyIssued: existingSet.has(e.course),
          });
        }
        setCourses(options);
      } catch (error) {
        if (!cancelled) {
          toastApiError(error);
          setCourses([]);
        }
      } finally {
        if (!cancelled) setLoadingCourses(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, existing]);

  const selectedCourse = useMemo(
    () => courses?.find((c) => c.courseId === courseId) ?? null,
    [courses, courseId]
  );

  /**
   * با انتخاب دوره، فیلد معدل با نمره‌ی ثبت‌شده‌ی کاربر در همان دوره
   * پیش‌پر می‌شود — نمره‌ی دوره روی مقیاس ۲۰ است و به مقیاس ۱۰۰ گواهینامه
   * × ۵ تبدیل می‌شود (مثلاً ۱۷٫۵ از ۲۰ ← ۸۷٫۵ از ۱۰۰).
   */
  function pickCourse(value: string) {
    setCourseId(value);
    const option = courses?.find((c) => c.courseId === value);
    setGrade(
      option && option.grade !== null && option.grade !== undefined
        ? String(Math.round(option.grade * 5 * 100) / 100)
        : ""
    );
  }

  async function submit() {
    if (!user || !courseId || !fileUrl || submitting) return;
    setSubmitting(true);
    try {
      const cert = await apiFetch<{ code: string }>(
        "/api/admin/certificates",
        {
          method: "POST",
          body: JSON.stringify({
            userId: user.id,
            courseId,
            fileUrl,
            grade: grade.trim() === "" ? null : grade.trim(),
            note: note.trim(),
          }),
        }
      );
      toast.success(
        `گواهینامه صادر شد؛ کد رهگیری: ${cert.code} — در پنل کاربر قابل مشاهده و دانلود است.`
      );
      await onSaved();
      onClose();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = Boolean(user && courseId && fileUrl) && !submitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-h-[85vh] overflow-y-auto rounded-2xl gap-5 sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
              <Award className="size-4.5 text-amber-950" />
            </span>
            صدور گواهینامه‌ی جدید
          </DialogTitle>
          <DialogDescription className="text-xs leading-6">
            فایل گواهینامه (PDF یا تصویر) را بارگذاری کنید و به کاربر و
            دوره‌ای که در آن شرکت کرده تخصیص دهید.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* — ۱. کاربر — */}
          <div className="space-y-2">
            <Label htmlFor="cert-user-picker">
              کاربر گواهینامه<span className="text-destructive"> *</span>
            </Label>
            <UserPicker value={user} onChange={(u) => { setUser(u); setCourseId(""); }} />
          </div>

          {/* — ۲. دوره — */}
          <div className="space-y-2">
            <Label htmlFor="cert-course">
              دوره<span className="text-destructive"> *</span>
            </Label>
            {!user ? (
              <p className="flex h-11 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                ابتدا کاربر را انتخاب کنید…
              </p>
            ) : loadingCourses ? (
              <div className="flex h-11 items-center justify-center rounded-xl border border-border bg-foreground/[0.02]">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : courses && courses.length > 0 ? (
              <Select value={courseId} onValueChange={pickCourse}>
                <SelectTrigger id="cert-course" className="h-11 w-full rounded-xl">
                  <SelectValue placeholder="دوره‌ای که این کاربر در آن شرکت کرده…" />
                </SelectTrigger>
                <SelectContent dir="rtl" className="max-h-64">
                  {courses.map((c) => (
                    <SelectItem
                      key={c.courseId}
                      value={c.courseId}
                      disabled={c.alreadyIssued}
                      className="py-2"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="max-w-56 truncate">{c.title}</span>
                        {c.alreadyIssued ? (
                          <Badge className="shrink-0 rounded-full border-0 bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-black text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                            صادر شده
                          </Badge>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="flex h-11 items-center justify-center rounded-xl border border-dashed border-border text-xs leading-5 text-muted-foreground">
                این کاربر در هیچ دوره‌ای ثبت‌نام نکرده است.
              </p>
            )}
            {selectedCourse ? (
              <p className="text-[0.65rem] leading-5 text-muted-foreground">
                {selectedCourse.grade !== null &&
                selectedCourse.grade !== undefined
                  ? `معدل ثبت‌شده‌ی کاربر در این دوره: ${faDigits(selectedCourse.grade)} از ${faDigits(20)} — معادل ${faDigits(Math.round(selectedCourse.grade * 5 * 100) / 100)} از ${faDigits(100)} که در فیلد معدل پیش‌پر شده است.`
                  : "برای این کاربر در این دوره هنوز معدلی ثبت نشده است."}
              </p>
            ) : null}
          </div>

          {/* — ۳. فایل گواهینامه — */}
          <CertificateFileField value={fileUrl} onChange={setFileUrl} />

          {/* — ۴. معدل و توضیح — */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cert-grade">معدل (اختیاری، از ۱۰۰)</Label>
              <Input
                id="cert-grade"
                type="number"
                inputMode="decimal"
                dir="ltr"
                min={0}
                max={100}
                step={0.25}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="—"
                className="h-11 rounded-xl text-center tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cert-note">توضیح (اختیاری)</Label>
              <Input
                id="cert-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثلاً: با احترام ویژه"
                className="h-11 rounded-xl"
                maxLength={300}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl font-bold"
          >
            انصراف
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 px-6 font-black text-amber-950 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.01]"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}
            صدور گواهینامه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ————————————————— دیالوگ ویرایش ————————————————— */

/**
 * EditDialog — ویرایش گواهینامه‌ی صادرشده:
 * کاربر و دوره ثابت است؛ فایل، معدل و توضیح قابل تغییرند.
 */
function EditDialog({
  cert,
  onClose,
  onSaved,
}: {
  cert: CertRow | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [fileUrl, setFileUrl] = useState("");
  const [grade, setGrade] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /** فایل اصلی هنگام باز شدن — برای تشخیص جایگزینی فایل */
  const [originalFile, setOriginalFile] = useState("");

  useEffect(() => {
    if (!cert) return;
    setFileUrl(cert.fileUrl);
    setOriginalFile(cert.fileUrl);
    setGrade(
      cert.grade !== null && cert.grade !== undefined
        ? String(cert.grade)
        : ""
    );
    setNote(cert.note ?? "");
  }, [cert]);

  async function submit() {
    if (!cert || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/admin/certificates/${cert.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          grade: grade.trim() === "" ? null : grade.trim(),
          note: note.trim(),
          ...(fileUrl !== originalFile ? { fileUrl } : {}),
        }),
      });
      toast.success("گواهینامه به‌روزرسانی شد.");
      await onSaved();
      onClose();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={cert !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-h-[85vh] overflow-y-auto rounded-2xl gap-5 sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex size-9 items-center justify-center rounded-xl bg-foreground/[0.06]">
              <Pencil className="size-4.5 text-muted-foreground" />
            </span>
            ویرایش گواهینامه
          </DialogTitle>
          <DialogDescription className="text-xs leading-6">
            کاربر و دوره ثابت است؛ فایل گواهینامه، معدل و توضیح قابل تغییرند.
          </DialogDescription>
        </DialogHeader>

        {cert ? (
          <>
            {/* — مشخصات ثابت — */}
            <div className="space-y-2 rounded-2xl border border-border bg-foreground/[0.02] p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-muted-foreground">کاربر:</span>
                <span className="font-black text-foreground">
                  {fullName(cert.user)}
                  <span
                    dir="ltr"
                    className="ms-2 text-[0.65rem] font-bold tabular-nums text-muted-foreground"
                  >
                    {faDigits(cert.user.phone)}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-muted-foreground">دوره:</span>
                <span className="font-black text-foreground">
                  {cert.courseTitle}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-muted-foreground">
                  کد رهگیری:
                </span>
                <span
                  dir="ltr"
                  className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[0.65rem] font-black tracking-wide text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
                >
                  {cert.code}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-muted-foreground">
                  تاریخ صدور:
                </span>
                <span className="font-black text-foreground">
                  {faDate(cert.issuedAt)}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {/* — فایل — */}
              <CertificateFileField
                value={fileUrl}
                onChange={setFileUrl}
                label="فایل گواهینامه (PDF یا تصویر)"
              />

              {/* — معدل و توضیح — */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-cert-grade">معدل (از ۱۰۰)</Label>
                  <Input
                    id="edit-cert-grade"
                    type="number"
                    inputMode="decimal"
                    dir="ltr"
                    min={0}
                    max={100}
                    step={0.25}
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    placeholder="—"
                    className="h-11 rounded-xl text-center tabular-nums"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-cert-note">توضیح</Label>
                  <Input
                    id="edit-cert-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="مثلاً: با احترام ویژه"
                    className="h-11 rounded-xl"
                    maxLength={300}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={onClose}
                className="rounded-xl font-bold"
              >
                انصراف
              </Button>
              <Button
                type="button"
                disabled={!fileUrl || submitting}
                onClick={() => void submit()}
                className="rounded-xl px-6 font-bold"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                ذخیره تغییرات
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
