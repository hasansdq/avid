"use client";

import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  LogOut,
  MonitorSmartphone,
  Save,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { btnGradient } from "@/components/admin/shared/styles";
import { faDigits } from "@/lib/fa";

/** اطلاعات حساب مدیر (GET /api/admin/account) */
interface AccountInfo {
  username: string;
  activeSessions: number;
  createdAt?: string | null;
  /** شماره موبایل مدیر — مقصد کد تایید دومرحله‌ای */
  phone?: string;
  /** وضعیت تایید دومرحله‌ای پیامکی ورود */
  twoFactorEnabled?: boolean;
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

/**
 * ماژول «حساب و امنیت» مدیر —
 * تغییر رمز عبور (همراه با ابطال همه‌ی نشست‌های قبلی) و خروج از همه دستگاه‌ها.
 */
export function AccountModule() {
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // — تایید دومرحله‌ای پیامکی (PUT /api/admin/account/2fa) —
  const [twoFactorPhone, setTwoFactorPhone] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [saving2fa, setSaving2fa] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<AccountInfo>("/api/admin/account");
      setInfo(data);
      setTwoFactorPhone(data.phone ?? "");
      setTwoFactorEnabled(!!data.twoFactorEnabled);
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleChangePassword() {
    if (saving) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("هر سه فیلد رمز را پر کنید.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("رمز جدید باید حداقل ۸ نویسه باشد.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("تکرار رمز جدید با رمز جدید یکسان نیست.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/admin/account/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      // نشست جاری با کوکی نو تمدید می‌شود؛ همه‌ی نشست‌های دیگر باطل شده‌اند
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("رمز عبور تغییر کرد و همه نشست‌های قبلی باطل شدند.");
      load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function revokeAllSessions() {
    if (revoking) return;
    setRevoking(true);
    try {
      await apiFetch("/api/admin/account/sessions/revoke", {
        method: "POST",
      });
      toast.success("همه نشست‌ها باطل شدند؛ در حال انتقال به صفحه ورود...");
      // نشست جاری هم باطل شده است — بازآمدن صفحه، صفحه‌ی ورود را نشان می‌دهد
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      toastApiError(error);
      setRevoking(false);
    }
  }

  /** ذخیره‌ی تنظیمات تایید دومرحله‌ای پیامکی (شماره + فعال/غیرفعال) */
  async function handleSave2fa() {
    if (saving2fa) return;
    if (twoFactorEnabled && !/^09\d{9}$/.test(twoFactorPhone.trim())) {
      toast.error("برای فعال‌سازی، شماره موبایل معتبر وارد کنید (مثال: ۰۹۱۲۳۴۵۶۷۸۹).");
      return;
    }
    setSaving2fa(true);
    try {
      await apiFetch("/api/admin/account/2fa", {
        method: "PUT",
        body: JSON.stringify({
          phone: twoFactorPhone.trim(),
          twoFactorEnabled,
        }),
      });
      toast.success(
        twoFactorEnabled
          ? "تایید دومرحله‌ای پیامکی فعال شد؛ ورود از این پس دومرحله‌ای است."
          : "تایید دومرحله‌ای غیرفعال شد؛ ورود فقط با نام کاربری و رمز عبور انجام می‌شود."
      );
      load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving2fa(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-52 animate-pulse rounded-xl bg-foreground/[0.04]" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass h-40 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="حساب و امنیت"
        description="تغییر رمز عبور مدیر و ابطال نشست‌های ورود"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/20">
          <ShieldCheck className="size-5 text-white" strokeWidth={1.9} />
        </span>
      </ModuleHeader>

      {/* ————— اطلاعات حساب ————— */}
      <section className="glass space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05]">
              <MonitorSmartphone className="size-5 text-teal-600 dark:text-teal-300" />
            </span>
            <div>
              <p className="text-sm font-black text-foreground">
                نام کاربری مدیر
              </p>
              <p dir="ltr" className="text-sm font-bold text-muted-foreground">
                {info?.username ?? "—"}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-foreground/[0.04] px-4 py-2 text-center">
            <p className="text-[0.65rem] font-bold text-muted-foreground">
              نشست‌های فعال
            </p>
            <p className="text-lg font-black text-teal-700 dark:text-teal-300">
              {faDigits(info?.activeSessions ?? 0)}
            </p>
          </div>
        </div>
        <p className="text-xs leading-6 text-muted-foreground">
          هر ورود به پنل یک نشست ۷ روزه می‌سازد. با تغییر رمز عبور یا دکمه‌ی
          «خروج از همه دستگاه‌ها» می‌توانید همه‌ی نشست‌های قبلی را باطل کنید.
        </p>
      </section>

      {/* ————— تایید دومرحله‌ای پیامکی ————— */}
      <section className="glass space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05]">
              <Smartphone className="size-5 text-teal-600 dark:text-teal-300" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-foreground">
                  تایید دومرحله‌ای پیامکی
                </h2>
                <Badge
                  variant="outline"
                  className={
                    twoFactorEnabled
                      ? "border-teal-500/40 bg-teal-500/10 text-[0.6rem] text-teal-700 dark:text-teal-300"
                      : "border-foreground/[0.12] bg-foreground/[0.04] text-[0.6rem] text-muted-foreground"
                  }
                >
                  {twoFactorEnabled ? "فعال" : "غیرفعال (پیش‌فرض)"}
                </Badge>
              </div>
              <p className="text-xs leading-6 text-muted-foreground">
                مرحله‌ی دوم ورود به پنل: پس از نام کاربری و رمز عبور، کد ۶ رقمی
                به شماره‌ی موبایل مدیر پیامک می‌شود. پیش‌فرض غیرفعال است و
                ورود فقط با رمز انجام می‌شود.
              </p>
            </div>
          </div>

          {/* ماژول فعال/غیرفعال‌سازی */}
          <div className="flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <span className="text-xs font-bold text-muted-foreground">
              {twoFactorEnabled ? "فعال" : "غیرفعال"}
            </span>
            <Switch
              id="two-factor-switch"
              checked={twoFactorEnabled}
              onCheckedChange={(v) => setTwoFactorEnabled(v)}
              disabled={saving2fa}
              aria-label="فعال یا غیرفعال‌سازی تایید دومرحله‌ای پیامکی"
            />
          </div>
        </div>

        <form
          className="grid gap-4 sm:grid-cols-[1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave2fa();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="two-factor-phone">شماره موبایل مدیر</Label>
            <Input
              id="two-factor-phone"
              dir="ltr"
              value={twoFactorPhone}
              onChange={(e) => setTwoFactorPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
              placeholder="09123456789"
              inputMode="numeric"
              autoComplete="tel"
              disabled={saving2fa}
              className="max-w-xs"
            />
            <p className="text-[0.7rem] leading-5 text-muted-foreground">
              کد تایید به این شماره ارسال می‌شود — برای فعال‌سازی، شماره‌ی معتبر
              الزامی است. پیامک‌ها از ماژول «پنل پیامکی» ارسال می‌شوند.
            </p>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={saving2fa}
              className={`h-10 rounded-xl text-sm ${btnGradient}`}
            >
              {saving2fa ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {saving2fa ? "در حال ذخیره..." : "ذخیره تنظیمات"}
            </Button>
          </div>
        </form>
      </section>

      {/* ————— تغییر رمز عبور ————— */}
      <section className="glass space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05]">
            <KeyRound className="size-5 text-teal-600 dark:text-teal-300" />
          </span>
          <div>
            <h2 className="text-sm font-black text-foreground">
              تغییر رمز عبور
            </h2>
            <p className="text-xs text-muted-foreground">
              پس از تغییر، همه‌ی نشست‌های قبلی باطل می‌شوند و این دستگاه با
              نشست جدید ادامه می‌دهد.
            </p>
          </div>
        </div>

        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleChangePassword();
          }}
        >
          <Field label="رمز عبور فعلی" htmlFor="account-current-password">
            <Input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              required
              disabled={saving}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <div className="grid gap-4">
            <Field
              label="رمز عبور جدید"
              htmlFor="account-new-password"
              hint="حداقل ۸ نویسه؛ ترکیبی از حروف و عدد توصیه می‌شود."
            >
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                required
                disabled={saving}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
          </div>
          <Field label="تکرار رمز عبور جدید" htmlFor="account-confirm-password">
            <Input
              id="account-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              disabled={saving}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <Button
              type="submit"
              disabled={
                saving ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword !== confirmPassword
              }
              className={`h-10 rounded-xl text-sm ${btnGradient}`}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {saving ? "در حال ذخیره..." : "تغییر رمز عبور"}
            </Button>
          </div>
        </form>
      </section>

      {/* ————— خروج از همه دستگاه‌ها ————— */}
      <section className="glass space-y-4 rounded-2xl border-amber-500/30 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <LogOut className="size-5 text-amber-600 dark:text-amber-300" />
          </span>
          <div>
            <h2 className="text-sm font-black text-foreground">
              خروج از همه دستگاه‌ها
            </h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              همه‌ی نشست‌های ورود مدیر (شامل همین دستگاه) باطل می‌شوند و باید
              دوباره وارد شوید. اگر فکر می‌کنید حساب شما در جای دیگری باز
              شده، از این گزینه استفاده کنید.
            </p>
          </div>
        </div>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Button
            type="button"
            variant="outline"
            disabled={revoking}
            onClick={() => setConfirmOpen(true)}
            className="h-10 rounded-xl border-amber-500/40 bg-amber-500/[0.08] text-sm font-bold text-amber-700 transition-all hover:bg-amber-500/[0.15] dark:text-amber-300"
          >
            {revoking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            {revoking ? "در حال ابطال نشست‌ها..." : "ابطال همه نشست‌های ورود"}
          </Button>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>ابطال همه نشست‌های ورود؟</AlertDialogTitle>
              <AlertDialogDescription>
                همه‌ی دستگاه‌هایی که با حساب مدیر وارد شده‌اند خارج می‌شوند؛
                شما هم باید دوباره وارد شوید. این عمل قابل بازگشت نیست.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void revokeAllSessions();
                }}
              >
                بله، همه را باطل کن
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
