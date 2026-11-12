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
  Inbox,
  Loader2,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  Search,
  Trash2,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { InstallmentsDialog } from "@/components/admin/shared/installments-dialog";
import { UserPaymentsDialog } from "@/components/admin/shared/user-payments-dialog";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import {
  InstallmentsOverviewSection,
  useInstallmentsOverview,
} from "@/components/admin/shared/installments-overview";
import { StatusBadge } from "@/components/admin/shared/status-badge";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import { btnGradient, tileGradient } from "@/components/admin/shared/styles";
import type {
  EnrollmentWithInstallments,
  User,
  UserWithStats,
} from "@/components/admin/types";
import { isEnrollmentStatus } from "@/lib/course-theme";
import { faDate, faDigits } from "@/lib/fa";

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
  user: UserWithStats | null;
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
            اطلاعات حساب، وضعیت و ثبت‌نام‌های دوره‌های این کاربر.
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

  /* — دیالوگ‌ها — */
  const [detailUser, setDetailUser] = useState<UserWithStats | null>(null);
  const [paymentsUser, setPaymentsUser] = useState<UserWithStats | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [installmentsTarget, setInstallmentsTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

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

  /** تغییر فیلتر وضعیت → بازگشت به صفحه‌ی اول */
  function changeStatusFilter(next: StatusFilter) {
    setStatus(next);
    setPage(1);
  }

  /** مسدودسازی / رفع مسدودی سریع */
  async function toggleBlock(user: UserWithStats) {
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
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setBusyId(null);
    }
  }

  /** حذف کاربر — ثبت‌نام‌ها باقی می‌مانند */
  async function handleDelete(user: UserWithStats) {
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      toast.success(`کاربر «${displayName(user)}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
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
        description="کاربران ثبت‌نام‌شده‌ی سایت، وضعیت حساب و اقساط آنها"
      >
        <Badge
          variant="outline"
          className="rounded-full border-foreground/15 bg-foreground/[0.04] px-3.5 py-1.5 text-xs font-black tabular-nums text-muted-foreground"
        >
          {faDigits(total)} کاربر
        </Badge>
      </ModuleHeader>

      {/* — بخش جداگانه: وضعیت اقساط همه‌ی کاربران (پرداخت‌های اخیر + باقیمانده) — */}
      <InstallmentsOverviewSection
        data={overview.data}
        loading={overview.loading}
        refreshing={overview.refreshing}
        onRefresh={() => overview.reload(true)}
        onChanged={() => overview.reload(true)}
      />

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
        />
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
                              <p className="truncate text-sm font-bold text-foreground">
                                {displayName(u)}
                              </p>
                              <a
                                href={`tel:${u.phone}`}
                                dir="ltr"
                                className="flex w-fit items-center justify-start gap-1 text-xs font-semibold text-teal-600 transition-colors hover:underline dark:text-teal-300 dark:hover:text-teal-200"
                                title="تماس با کاربر"
                              >
                                <Phone className="size-3" />
                                {faDigits(u.phone)}
                              </a>
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
                        <p className="truncate text-sm font-black text-foreground">
                          {displayName(u)}
                        </p>
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

      {/* — دیالوگ پرداختی‌ها و اقساط کاربر — */}
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

      {/* — دیالوگ ویرایش کاربر — */}
      <EditUserDialog
        user={editUser}
        open={!!editUser}
        onOpenChange={(o) => {
          if (!o) setEditUser(null);
        }}
        onSaved={load}
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
