"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Globe,
  Loader2,
  Palette,
  PanelBottom,
  Pencil,
  Phone,
  Save,
  Share2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { FontPicker } from "@/components/admin/shared/font-picker";
import { ImageUrlField, OptionalImage } from "@/components/admin/shared/image-url-field";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { btnGradient } from "@/components/admin/shared/styles";
import { LogoMark } from "@/components/admin/shared/logo-mark";
import type { SiteSettings } from "@/components/admin/types";
import { TrustSeal } from "@/components/site/trust-seal";
import {
  buildZarinpalCode,
  normalizeZarinpalBadgeUrl,
  zarinpalCodeFromInput,
  zarinpalDisplayValue,
} from "@/lib/trust-seals";
import { faDigits } from "@/lib/fa";

/** همه‌ی فیلدهای فرم به‌صورت رشته نگه داشته می‌شوند و هنگام ذخیره تبدیل می‌شوند */
interface SettingsDraft {
  siteName: string;
  tagline: string;
  slogan: string;
  heroDescription: string;
  sloganFont: string;
  logoUrl: string;
  /** favicon اختصاصی (آیکون تب مرورگر) — خالی یعنی همان لوگو */
  faviconUrl: string;
  studentsCount: string;
  completedCoursesCount: string;
  rating: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  supportHours: string;
  instagramUrl: string;
  telegramUrl: string;
  youtubeUrl: string;
  linkedinUrl: string;
  footerDescription: string;
  /** کد رسمی نماد اعتماد الکترونیکی (اینماد) — عیناً از پنل enamad.ir */
  enamadCode: string;
  /** دامنه‌ی سایت یا کد خام نماد زرین‌پال — در ذخیره به کد رسمی تبدیل می‌شود */
  zarinpal: string;
  /** فعال/غیرفعال‌سازی ویرایشگر ظاهری مدادی (تنها فیلد بولی فرم) */
  pencilEditorEnabled: boolean;
}

function toDraft(s: SiteSettings): SettingsDraft {
  return {
    siteName: s.siteName,
    tagline: s.tagline,
    slogan: s.slogan,
    heroDescription: s.heroDescription,
    sloganFont: s.sloganFont ?? "vazirmatn",
    logoUrl: s.logoUrl,
    faviconUrl: s.faviconUrl ?? "",
    studentsCount: String(s.studentsCount),
    completedCoursesCount: String(s.completedCoursesCount),
    rating: String(s.rating),
    contactPhone: s.contactPhone,
    contactEmail: s.contactEmail,
    address: s.address,
    supportHours: s.supportHours,
    instagramUrl: s.instagramUrl,
    telegramUrl: s.telegramUrl,
    youtubeUrl: s.youtubeUrl,
    linkedinUrl: s.linkedinUrl,
    footerDescription: s.footerDescription,
    enamadCode: s.enamadCode ?? "",
    zarinpal: zarinpalDisplayValue(s.zarinpalCode),
    pencilEditorEnabled: s.pencilEditorEnabled,
  };
}

function sameDraft(a: SettingsDraft, b: SettingsDraft): boolean {
  return (Object.keys(a) as (keyof SettingsDraft)[]).every((key) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "boolean" || typeof bv === "boolean") {
      return av === bv;
    }
    return av.trim() === bv.trim();
  });
}

/** بخش‌های فرم تنظیمات */
function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass space-y-5 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/20">
          <Icon className="size-5 text-white" strokeWidth={1.9} />
        </span>
        <h2 className="text-sm font-black text-foreground sm:text-base">
          {title}
        </h2>
      </div>
      {children}
    </section>
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

/** ماژول تنظیمات سایت — هویت، آمار، تماس، شبکه‌های اجتماعی و فوتر */
export function SettingsModule() {
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<SettingsDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const settings = await apiFetch<SiteSettings>("/api/admin/settings");
      const next = toDraft(settings);
      setDraft(next);
      setSavedDraft(next);
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const dirty =
    draft !== null && savedDraft !== null && !sameDraft(draft, savedDraft);

  async function handleSave() {
    if (!draft || saving) return;
    if (draft.siteName.trim().length < 2) {
      toast.error("نام سایت باید حداقل ۲ نویسه باشد.");
      return;
    }

    // — اعتبارسنجی نمادهای اعتماد (آینه‌ی همان قواعد سمت سرور) —
    const enamadCode = draft.enamadCode.trim();
    if (enamadCode && !/enamad\.ir/i.test(enamadCode)) {
      toast.error(
        "کد اینماد معتبر نیست — باید کد رسمی از پنل enamad.ir باشد (به trustseal.enamad.ir اشاره می‌کند)."
      );
      return;
    }
    const zarinpalCode = zarinpalCodeFromInput(draft.zarinpal);
    if (zarinpalCode === null) {
      toast.error(
        "نماد زرین‌پال معتبر نیست — دامنه‌ی سایت (مثل example.ir) یا کد رسمی زرین‌پال را وارد کنید."
      );
      return;
    }

    setSaving(true);
    try {
      const studentsCount = Math.max(
        0,
        Math.round(Number(draft.studentsCount) || 0)
      );
      const completedCoursesCount = Math.max(
        0,
        Math.round(Number(draft.completedCoursesCount) || 0)
      );
      const rating = Math.min(5, Math.max(0, Number(draft.rating) || 0));

      const updated = await apiFetch<SiteSettings>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          siteName: draft.siteName,
          tagline: draft.tagline,
          slogan: draft.slogan,
          heroDescription: draft.heroDescription,
          sloganFont: draft.sloganFont,
          logoUrl: draft.logoUrl,
          faviconUrl: draft.faviconUrl,
          studentsCount,
          completedCoursesCount,
          rating,
          contactPhone: draft.contactPhone,
          contactEmail: draft.contactEmail,
          address: draft.address,
          supportHours: draft.supportHours,
          instagramUrl: draft.instagramUrl,
          telegramUrl: draft.telegramUrl,
          youtubeUrl: draft.youtubeUrl,
          linkedinUrl: draft.linkedinUrl,
          footerDescription: draft.footerDescription,
          pencilEditorEnabled: draft.pencilEditorEnabled,
          enamadCode,
          zarinpalCode,
        }),
      });
      const next = toDraft(updated);
      setDraft(next);
      setSavedDraft(next);
      toast.success("تنظیمات با موفقیت ذخیره شد");
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !draft) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-52 animate-pulse rounded-xl bg-foreground/[0.04]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass h-44 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!draft) {
    return (
      <EmptyState
        icon={Palette}
        title="دریافت تنظیمات ناموفق بود"
        description="برای تلاش مجدد دوباره امتحان کنید."
      >
        <Button variant="outline" size="sm" onClick={load}>
          تلاش مجدد
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <ModuleHeader
        title="تنظیمات سایت"
        description="هویت، آمار، اطلاعات تماس و پیکربندی عمومی سایت را از اینجا مدیریت کنید."
      />

      {/* ۱ — هویت سایت */}
      <SettingsSection icon={Palette} title="هویت سایت">
        {/* پیش‌نمایش زنده هدر */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-foreground/[0.02] p-4">
          {draft.logoUrl.trim() ? (
            <OptionalImage
              src={draft.logoUrl}
              alt="پیش‌نمایش لوگو"
              sizes="56px"
              className="size-14 shrink-0"
              imageClassName="object-contain"
              fallback={<LogoMark className="size-14" iconClassName="size-7" />}
            />
          ) : (
            <LogoMark className="size-14" iconClassName="size-7" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground">
              {draft.siteName || "نام سایت"}
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-300">
              {draft.tagline || "شعار کوتاه سایت"}
            </p>
            <p className="truncate text-[0.65rem] text-muted-foreground">
              {draft.slogan || "اسلوگان سایت"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام سایت" htmlFor="set-siteName">
            <Input
              id="set-siteName"
              value={draft.siteName}
              onChange={(e) => set("siteName", e.target.value)}
              placeholder="آوید"
            />
          </Field>
          <Field label="شعار کوتاه (زیر لوگو)" htmlFor="set-tagline">
            <Input
              id="set-tagline"
              value={draft.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              placeholder="آکادمی مهارت‌های آینده"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="اسلوگان اصلی" htmlFor="set-slogan">
              <Input
                id="set-slogan"
                value={draft.slogan}
                onChange={(e) => set("slogan", e.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              label="فونت اسلوگان صفحه‌ی اصلی"
              htmlFor="set-sloganFont"
              hint="فونتی که تیتر بزرگ بالای صفحه‌ی اصلی سایت با آن نمایش داده می‌شود — از بین فونت‌های نصب‌شده‌ی سایت."
            >
              <FontPicker
                value={draft.sloganFont}
                onChange={(v) => set("sloganFont", v)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="متن معرفی هیرو" htmlFor="set-heroDescription">
              <Textarea
                id="set-heroDescription"
                value={draft.heroDescription}
                onChange={(e) => set("heroDescription", e.target.value)}
                className="min-h-24"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <ImageUrlField
              id="set-logoUrl"
              label="آدرس لوگو"
              value={draft.logoUrl}
              onChange={(v) => set("logoUrl", v)}
              section="settings"
              previewAlt="پیش‌نمایش لوگو"
              hint="می‌توانید مسیر داخلی مثل /images/logo.png یا آدرس کامل تصویر را وارد کنید."
            />
          </div>
        </div>

        {/* — favicon (آیکون تب مرورگر) — آپلود اختصاصی با پیش‌نمایش تب — */}
        <div className="space-y-3 rounded-xl border border-border bg-foreground/[0.02] p-4">
          <ImageUrlField
            id="set-faviconUrl"
            label="favicon (آیکون تب مرورگر)"
            value={draft.faviconUrl}
            onChange={(v) => set("faviconUrl", v)}
            section="settings"
            previewAlt="پیش‌نمایش favicon"
            previewClassName="h-16 w-16"
            hint={`تصویر مربعی کوچک (پیشنهاد: PNG ۵۱۲×۵۱۲ یا SVG) که در تب‌های مرورگر نمایش داده می‌شود. اگر خالی بماند، ${
              draft.logoUrl.trim() ? "همان لوگوی سایت" : "آیکون پیش‌فرض"
            } استفاده می‌شود.`}
          />
          {/* پیش‌نمایش زنده — شبیه‌سازی نوار تب مرورگر */}
          <div className="rounded-xl border border-border bg-foreground/[0.03] p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
              <Globe className="size-3.5" />
              پیش‌نمایش تب مرورگر (بعد از ذخیره و رفرش سایت)
            </p>
            <div
              dir="rtl"
              className="flex items-center gap-2 rounded-t-lg border border-border bg-foreground/[0.05] px-3 py-2"
            >
              {draft.faviconUrl.trim() ? (
                <OptionalImage
                  src={draft.faviconUrl}
                  alt="favicon"
                  sizes="16px"
                  fallback={
                    <span className="size-4 shrink-0 rounded-sm bg-muted-foreground/30" />
                  }
                  className="size-4 shrink-0"
                />
              ) : (
                <span className="size-4 shrink-0 rounded-sm bg-muted-foreground/30" />
              )}
              <span className="truncate text-xs font-semibold text-foreground/80">
                {draft.siteName || "نام سایت"} | {draft.tagline || "شعار سایت"}
              </span>
              <span className="mr-auto text-muted-foreground/50">×</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* ۲ — ویرایشگر ظاهری مدادی متن‌ها */}
      <SettingsSection icon={Pencil} title="ویرایشگر ظاهری مدادی متن‌ها">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-foreground/[0.02] p-4">
          <div className="min-w-0">
            <Label htmlFor="set-pencilEditor" className="cursor-pointer">
              فعال‌سازی ویرایشگر مدادی
            </Label>
            <p className="mt-1 text-[0.7rem] leading-5 text-muted-foreground">
              وقتی فعال باشد، مدیر هنگام مشاهده‌ی سایت (دکمه‌ی «مشاهده سایت» در
              هدر پنل) کنار متن‌های کلیدی صفحه‌ی اول آیکون مداد می‌بیند؛ با
              کلیک روی آن می‌تواند متن، رنگ، فونت (از فونت‌های نصب‌شده)، اندازه
              و نمایش/مخفی‌بودن هر متن را تغییر دهد.
            </p>
          </div>
          <Switch
            id="set-pencilEditor"
            checked={draft.pencilEditorEnabled}
            onCheckedChange={(v) => set("pencilEditorEnabled", v)}
            aria-label="فعال‌سازی ویرایشگر مدادی متن‌ها"
          />
        </div>
        <p className="text-[0.7rem] leading-5 text-muted-foreground">
          آیکون مداد فقط برای نقش مدیر نمایش داده می‌شود؛ کاربران عادی آن را
          نمی‌بینند. متن و فونت اسلوگان و معرفی هیرو با بخش «هویت سایت» بالا
          کاملاً همگام است — ویرایش از هر دو سمت نتیجه‌ی یکسانی دارد.
        </p>
      </SettingsSection>

      {/* ۳ — آمار و اعداد */}
      <SettingsSection icon={BarChart3} title="آمار و اعداد">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="تعداد دانشجو" htmlFor="set-studentsCount">
            <Input
              id="set-studentsCount"
              type="number"
              min={0}
              value={draft.studentsCount}
              onChange={(e) => set("studentsCount", e.target.value)}
            />
          </Field>
          <Field label="دوره‌های تکمیل‌شده" htmlFor="set-completedCoursesCount">
            <Input
              id="set-completedCoursesCount"
              type="number"
              min={0}
              value={draft.completedCoursesCount}
              onChange={(e) => set("completedCoursesCount", e.target.value)}
            />
          </Field>
          <Field
            label={`امتیاز (۰ تا ۵) — فعلی: ${faDigits(draft.rating || "0")}`}
            htmlFor="set-rating"
          >
            <Input
              id="set-rating"
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={draft.rating}
              onChange={(e) => set("rating", e.target.value)}
            />
          </Field>
        </div>
      </SettingsSection>

      {/* ۴ — اطلاعات تماس */}
      <SettingsSection icon={Phone} title="اطلاعات تماس">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="تلفن" htmlFor="set-contactPhone">
            <Input
              id="set-contactPhone"
              dir="ltr"
              className="text-left"
              value={draft.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              placeholder="021-9100-4400"
            />
          </Field>
          <Field label="ایمیل" htmlFor="set-contactEmail">
            <Input
              id="set-contactEmail"
              dir="ltr"
              className="text-left"
              type="email"
              value={draft.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="info@example.com"
            />
          </Field>
          <Field label="ساعات پشتیبانی" htmlFor="set-supportHours">
            <Input
              id="set-supportHours"
              value={draft.supportHours}
              onChange={(e) => set("supportHours", e.target.value)}
              placeholder="شنبه تا جمعه، ۹ صبح تا ۱۸"
            />
          </Field>
          <Field label="آدرس" htmlFor="set-address">
            <Input
              id="set-address"
              value={draft.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="تهران، خیابان ولیعصر..."
            />
          </Field>
        </div>
      </SettingsSection>

      {/* ۵ — شبکه‌های اجتماعی */}
      <SettingsSection icon={Share2} title="شبکه‌های اجتماعی">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اینستاگرام" htmlFor="set-instagramUrl">
            <Input
              id="set-instagramUrl"
              dir="ltr"
              className="text-left"
              value={draft.instagramUrl}
              onChange={(e) => set("instagramUrl", e.target.value)}
              placeholder="https://instagram.com/..."
            />
          </Field>
          <Field label="تلگرام" htmlFor="set-telegramUrl">
            <Input
              id="set-telegramUrl"
              dir="ltr"
              className="text-left"
              value={draft.telegramUrl}
              onChange={(e) => set("telegramUrl", e.target.value)}
              placeholder="https://t.me/..."
            />
          </Field>
          <Field label="یوتیوب" htmlFor="set-youtubeUrl">
            <Input
              id="set-youtubeUrl"
              dir="ltr"
              className="text-left"
              value={draft.youtubeUrl}
              onChange={(e) => set("youtubeUrl", e.target.value)}
              placeholder="https://youtube.com/@..."
            />
          </Field>
          <Field label="لینکدین" htmlFor="set-linkedinUrl">
            <Input
              id="set-linkedinUrl"
              dir="ltr"
              className="text-left"
              value={draft.linkedinUrl}
              onChange={(e) => set("linkedinUrl", e.target.value)}
              placeholder="https://linkedin.com/company/..."
            />
          </Field>
        </div>
      </SettingsSection>

      {/* ۶ — فوتر */}
      <SettingsSection icon={PanelBottom} title="فوتر">
        <Field label="متن فوتر" htmlFor="set-footerDescription">
          <Textarea
            id="set-footerDescription"
            value={draft.footerDescription}
            onChange={(e) => set("footerDescription", e.target.value)}
            className="min-h-24"
          />
        </Field>
      </SettingsSection>

      {/* ۷ — نمادهای اعتماد (اینماد و زرین‌پال) */}
      <SettingsSection icon={ShieldCheck} title="نمادهای اعتماد (اینماد و زرین‌پال)">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Field
              label="کد نماد اعتماد الکترونیکی (اینماد)"
              htmlFor="set-enamadCode"
              hint="کد رسمی را عیناً و بدون هیچ تغییری از پنل enamad.ir (دریافت کد نماد) کپی کنید — سمت چپ فوتر سایت رندر می‌شود."
            >
              <Textarea
                id="set-enamadCode"
                dir="ltr"
                value={draft.enamadCode}
                onChange={(e) => set("enamadCode", e.target.value)}
                placeholder='<a referrerpolicy="origin" target="_blank" href="https://trustseal.enamad.ir/?id=...&code=..."><img referrerpolicy="origin" src="https://trustseal.enamad.ir/logo.aspx?id=...&code=..." alt="" style="cursor:pointer"></a>'
                className="min-h-28 text-left font-mono text-[0.7rem] leading-5"
              />
            </Field>
          </div>
          <div className="space-y-2">
            <Field
              label="نماد زرین‌پال (لوگو تایید درگاه پرداخت)"
              htmlFor="set-zarinpal"
              hint="دامنه‌ی سایت خود را وارد کنید (مثلاً example.ir) — کد رسمی طبق مستندات زرین‌پال ساخته و سمت راست اینماد در فوتر رندر می‌شود؛ یا کد رسمی خام را بچسبانید. خالی = حذف لوگو."
            >
              <Input
                id="set-zarinpal"
                dir="ltr"
                className="text-left"
                value={draft.zarinpal}
                onChange={(e) => set("zarinpal", e.target.value)}
                placeholder="example.ir"
              />
            </Field>
          </div>
        </div>

        {/* پیش‌نمایش زنده نمادها — همان رندر فوتر سایت */}
        <div className="flex flex-wrap items-center justify-center gap-8 rounded-xl border border-dashed border-border bg-foreground/[0.02] px-4 py-6">
          {draft.enamadCode.trim() ? (
            <TrustSeal
              html={draft.enamadCode.trim()}
              tone="teal"
              provider="اینماد"
              fallbackLabel="نماد اعتماد الکترونیکی"
              showNote
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-xl border border-dashed border-border text-[0.62rem] font-bold text-muted-foreground">
              بدون اینماد
            </span>
          )}
          {(() => {
            const raw = draft.zarinpal.trim();
            if (!raw) {
              return (
                <span className="flex size-16 items-center justify-center rounded-xl border border-dashed border-border text-[0.62rem] font-bold text-muted-foreground">
                  بدون زرین‌پال
                </span>
              );
            }
            const code = /<[a-z!/]/i.test(raw)
              ? normalizeZarinpalBadgeUrl(raw)
              : buildZarinpalCode(raw);
            return code ? (
              <TrustSeal
                html={code}
                tone="amber"
                provider="زرین‌پال"
                fallbackLabel="دروازه پرداخت معتبر"
                showNote
              />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-xl border border-dashed border-red-500/40 bg-red-500/[0.05] text-[0.62rem] font-bold text-red-600 dark:text-red-300">
                نامعتبر
              </span>
            );
          })()}
        </div>
        <p className="text-[0.7rem] leading-5 text-muted-foreground">
          در محیط پیش‌نمایش، اگر تصویر لوگو از سرورهای اینماد/زرین‌پال دریافت
          نشود، نشان جایگزین نمایش داده می‌شود — کد عیناً ذخیره می‌شود و روی
          سایت اصلی با اینترنت عادی لوگوی رسمی دیده می‌شود. همین نمادها از
          ماژول «ویرایش هدر و فوتر» هم قابل ویرایش‌اند و هر دو سمت همگام‌اند.
        </p>
      </SettingsSection>

      {/* نوار ذخیره چسبان */}
      <div className="glass sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted-foreground">
          {dirty
            ? "تغییرات ذخیره‌نشده دارید."
            : "تغییرات بلافاصله پس از رفرش صفحه اصلی اعمال می‌شود."}
        </p>
        <Button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={`h-10 w-full rounded-xl sm:w-auto ${btnGradient}`}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
        </Button>
      </div>
    </div>
  );
}
