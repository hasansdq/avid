"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Loader2,
  Package,
  Plus,
  Trash2,
  Type,
  Upload,
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
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { btnGradient } from "@/components/admin/shared/styles";
import { FontStylesheets } from "@/components/font-loader";
import { fontStack } from "@/lib/fonts";
import type { ModuleProps, InstalledFont } from "@/components/admin/types";
import { cn } from "@/lib/utils";

/**
 * ماژول «فونت‌ها» — کتابخانه‌ی فونت‌های نصب‌شده سایت:
 *  • ۵ فونت فارسی از ابتدا نصب هستند (وزیرمتن، ایران‌سنس، ایران‌یکان، شبنم، لاله‌زار)
 *  • مدیر می‌تواند فونت جدید (woff/woff2/ttf/otf) نصب یا فونت دلخواه را حذف کند
 *  • انتخاب فونت هر بخش: اسلوگان ← «تنظیمات › هویت سایت» · هدر/فوتر ← «ویرایش هدر و فوتر»
 */

const SAMPLE_TEXT = "یادگیری هر مهارتی، سرمایه‌ی شما در آینده است";

/** محل استفاده‌ی هر کلید فونت در تنظیمات */
const USAGE_LABELS: Record<string, string> = {
  sloganFont: "اسلوگان صفحه‌ی اصلی",
  headerFont: "هدر",
  footerFont: "فوتر",
};

export function FontsModule({ setActive }: ModuleProps) {
  const [fonts, setFonts] = useState<InstalledFont[] | null>(null);
  const [usage, setUsage] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [installLabel, setInstallLabel] = useState("");
  const [installFile, setInstallFile] = useState<File | null>(null);
  const [installing, setInstalling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [list, settings] = await Promise.all([
        apiFetch<InstalledFont[]>("/api/admin/fonts"),
        apiFetch<{
          sloganFont?: string;
          headerFont?: string;
          footerFont?: string;
        }>("/api/admin/settings"),
      ]);
      setFonts(list);
      setUsage({
        sloganFont: settings.sloganFont ?? "",
        headerFont: settings.headerFont ?? "",
        footerFont: settings.footerFont ?? "",
      });
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** نصب فونت جدید با آپلود فایل */
  async function handleInstall() {
    if (installing) return;
    const label = installLabel.trim();
    if (label.length < 2 || label.length > 60) {
      toast.error("نام نمایشی فونت باید بین ۲ تا ۶۰ نویسه باشد.");
      return;
    }
    if (!installFile) {
      toast.error("فایل فونت را انتخاب کنید (woff، woff2، ttf یا otf).");
      return;
    }
    if (installFile.size > 8 * 1024 * 1024) {
      toast.error("حجم فایل فونت حداکثر ۸ مگابایت می‌تواند باشد.");
      return;
    }

    setInstalling(true);
    try {
      const body = new FormData();
      body.append("file", installFile);
      body.append("label", label);
      const res = await fetch("/api/admin/fonts", {
        method: "POST",
        body,
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "خطا در نصب فونت.");
      }
      toast.success(`فونت «${label}» نصب شد`);
      setDialogOpen(false);
      setInstallLabel("");
      setInstallFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در نصب فونت.");
    } finally {
      setInstalling(false);
    }
  }

  /** حذف فونت نصب‌شده (فقط غیرپیش‌فرض) */
  async function handleDelete(font: InstalledFont) {
    try {
      await apiFetch(`/api/admin/fonts/${font.id}`, { method: "DELETE" });
      toast.success(`فونت «${font.label}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  const usagesOf = (font: InstalledFont): string[] =>
    (Object.entries(usage) as [string, string][])
      .filter(([, key]) => key === font.key)
      .map(([field]) => USAGE_LABELS[field] ?? field);

  return (
    <div className="space-y-6">
      {/* همه‌ی فونت‌ها برای پیش‌نمایش زنده بارگذاری می‌شوند */}
      {fonts ? (
        <FontStylesheets cssTexts={fonts.map((f) => f.cssText)} />
      ) : null}

      <ModuleHeader
        title="فونت‌های نصب‌شده"
        description="کتابخانه‌ی فونت‌های فارسی سایت — فونت جدید نصب کنید یا فونت‌های دلخواه را حذف کنید. انتخاب فونت هر بخش در «هویت سایت» و «ویرایش هدر و فوتر» انجام می‌شود."
      >
        <Button
          onClick={() => setDialogOpen(true)}
          className={`rounded-xl ${btnGradient}`}
        >
          <Plus className="size-4" />
          نصب فونت جدید
        </Button>
      </ModuleHeader>

      {loading && !fonts ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="glass h-44 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : !fonts || fonts.length === 0 ? (
        <EmptyState
          icon={Type}
          title="فونتی نصب نشده است"
          description="فونت‌های پیش‌فرض سایت به‌صورت خودکار نصب می‌شوند؛ برای تلاش مجدد دوباره امتحان کنید."
        >
          <Button variant="outline" size="sm" onClick={load}>
            تلاش مجدد
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {fonts.map((font) => {
            const usages = usagesOf(font);
            return (
              <section
                key={font.id}
                className="glass relative flex flex-col rounded-2xl p-5"
                aria-label={`فونت ${font.label}`}
              >
                <header className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/20">
                      <Type className="size-5 text-teal-950" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black text-foreground">
                        {font.label}
                      </h3>
                      <p
                        dir="ltr"
                        className="truncate text-right text-[0.6rem] text-muted-foreground"
                      >
                        {font.key}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {font.builtin ? (
                      <span className="select-none rounded-full border border-teal-600/25 bg-teal-500/10 px-2.5 py-1 text-[0.6rem] font-black text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300">
                        پیش‌فرض
                      </span>
                    ) : (
                      <span className="select-none rounded-full border border-violet-600/25 bg-violet-500/10 px-2.5 py-1 text-[0.6rem] font-black text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300">
                        نصب‌شده
                      </span>
                    )}
                    {!font.builtin ? (
                      <ConfirmDelete
                        title={`حذف فونت ${font.label}`}
                        description="این فونت از سایت حذف می‌شود؛ اگر در حال استفاده باشد، بخش مربوط به وزیرمتن برمی‌گردد. مطمئن هستید؟"
                        onConfirm={() => handleDelete(font)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`حذف فونت ${font.label}`}
                          title="حذف فونت"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </ConfirmDelete>
                    ) : null}
                  </div>
                </header>

                {/* پیش‌نمایش زنده با خود فونت */}
                <div className="mt-4 flex flex-1 flex-col justify-center rounded-xl border border-border bg-foreground/[0.02] p-4 dark:bg-white/[0.02]">
                  <span
                    className="block text-center text-xl font-black leading-relaxed text-foreground"
                    style={{ fontFamily: fontStack(font.family) }}
                  >
                    {font.label}
                  </span>
                  <span
                    className="mt-2 block text-center text-sm leading-7 text-muted-foreground"
                    style={{ fontFamily: fontStack(font.family) }}
                  >
                    {SAMPLE_TEXT}
                  </span>
                </div>

                <footer className="mt-3 flex min-h-8 items-center gap-1.5">
                  {usages.length > 0 ? (
                    usages.map((u) => (
                      <span
                        key={u}
                        className="inline-flex select-none items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[0.6rem] font-bold text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
                      >
                        <BadgeCheck className="size-3" />
                        {u}
                      </span>
                    ))
                  ) : (
                    <span className="text-[0.65rem] text-muted-foreground">
                      در هیچ بخشی استفاده نمی‌شود
                    </span>
                  )}
                </footer>
              </section>
            );
          })}
        </div>
      )}

      {/* راهنمای محل انتخاب فونت هر بخش */}
      <div className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-6 text-muted-foreground">
          فونت <strong className="text-foreground">اسلوگان صفحه‌ی اصلی</strong> در
          بخش «هویت سایت» و فونت‌های <strong className="text-foreground">هدر و فوتر</strong> در
          بخش «ویرایش هدر و فوتر» انتخاب می‌شوند.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs font-bold"
            onClick={() => setActive("settings")}
          >
            هویت سایت
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs font-bold"
            onClick={() => setActive("headerFooter")}
          >
            ویرایش هدر و فوتر
          </Button>
        </div>
      </div>

      {/* دیالوگ نصب فونت جدید */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="rounded-2xl sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">نصب فونت جدید</DialogTitle>
            <DialogDescription>
              فایل فونت (WOFF، WOFF2، TTF یا OTF — حداکثر ۸ مگابایت) و نام
              نمایشی آن را وارد کنید؛ فونت بلافاصله در کتابخانه نصب می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="font-label">نام نمایشی فونت</Label>
              <Input
                id="font-label"
                value={installLabel}
                onChange={(e) => setInstallLabel(e.target.value)}
                placeholder="مثلاً: ایران‌سنس دست‌نویس"
                maxLength={60}
              />
            </div>

            <div className="space-y-2">
              <Label>فایل فونت</Label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center transition-colors",
                  installFile
                    ? "border-teal-500/50 bg-teal-500/[0.06] dark:border-teal-400/50 dark:bg-teal-400/[0.06]"
                    : "border-border bg-foreground/[0.02] hover:border-foreground/25 dark:bg-white/[0.02]"
                )}
              >
                {installing ? (
                  <Loader2 className="size-7 animate-spin text-teal-600 dark:text-teal-300" />
                ) : (
                  <Upload className="size-7 text-muted-foreground" />
                )}
                <span className="text-xs font-bold text-foreground">
                  {installFile
                    ? installFile.name
                    : "انتخاب فایل فونت از سیستم"}
                </span>
                {installFile ? (
                  <span className="text-[0.65rem] text-muted-foreground">
                    {Math.max(1, Math.round(installFile.size / 1024))} کیلوبایت
                  </span>
                ) : (
                  <span className="text-[0.65rem] text-muted-foreground">
                    فرمت‌های مجاز: woff، woff2، ttf، otf
                  </span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
                className="hidden"
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  setInstallFile(e.target.files?.[0] ?? null);
                }}
              />
            </div>
          </div>

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={handleInstall}
              disabled={installing}
              className={`rounded-xl ${btnGradient}`}
            >
              {installing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Package className="size-4" />
              )}
              {installing ? "در حال نصب..." : "نصب فونت"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={installing}
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
