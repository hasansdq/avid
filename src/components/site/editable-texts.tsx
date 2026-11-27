"use client";

import * as React from "react";
import {
  EyeOff,
  Loader2,
  Monitor,
  Pencil,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
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
import { FontStylesheets } from "@/components/font-loader";
import {
  findSiteTextSlot,
  SITE_TEXT_DEVICE_LABELS,
  SITE_TEXT_DEVICES,
  SITE_TEXT_MAX_LEN,
  SITE_TEXT_FONT_MAX,
  SITE_TEXT_FONT_MIN,
  type SiteTextDevice,
} from "@/lib/site-texts";
import { cn } from "@/lib/utils";

/* ————————————————————————— انواع ————————————————————————— */

/** گزینه‌ی فونت نصب‌شده — مقدار stack از سمت سرور محاسبه می‌شود */
export interface SiteTextFontOption {
  key: string;
  label: string;
  stack: string;
  cssText: string;
}

/** وضعیت یک جایگاه متن (سفارشی‌سازی‌های ویرایشگر مدادی) */
export interface SiteTextRowValue {
  text: string | null;
  color: string | null;
  fontKey: string | null;
  /** اندازه فونت دسکتاپ (پیکسل)؛ null = پیش‌فرض قالب */
  fontSize: number | null;
  /** اندازه فونت تبلت (۷۶۸–۱۰۲۳)؛ null = همان دسکتاپ */
  fontSizeTablet: number | null;
  /** اندازه فونت موبایل (زیر ۷۶۸)؛ null = همان دسکتاپ */
  fontSizeMobile: number | null;
  hidden: boolean;
  /** مخفی فقط در دسکتاپ/تبلت/موبایل برای کاربران عادی (مدیر همیشه می‌بیند) */
  hiddenDesktop: boolean;
  hiddenTablet: boolean;
  hiddenMobile: boolean;
}

/** مقدار پیش‌فرض ردیف بدون هیچ سفارشی‌سازی */
export const EMPTY_SITE_TEXT_ROW: SiteTextRowValue = {
  text: null,
  color: null,
  fontKey: null,
  fontSize: null,
  fontSizeTablet: null,
  fontSizeMobile: null,
  hidden: false,
  hiddenDesktop: false,
  hiddenTablet: false,
  hiddenMobile: false,
};

interface SiteTextsContextValue {
  /** آیا بیننده‌ی فعلی سایت مدیر است */
  isAdmin: boolean;
  /** آیا ویرایشگر مدادی فعال است (مدید + ماژول روشن) — آیکون مداد نمایش داده می‌شود */
  editable: boolean;
  rows: Record<string, SiteTextRowValue>;
  /** متن پیش‌فرض/فعلی هر جایگاه — برای پیش‌پر کردن فرم ویرایش */
  defaults: Record<string, string>;
  fonts: SiteTextFontOption[];
  fontStackFor(key: string | null | undefined): string | null;
  openEditor(key: string): void;
}

const SiteTextsContext = React.createContext<SiteTextsContextValue | null>(
  null
);

/* ————————————————————————— رنگ‌های آماده ————————————————————————— */

const COLOR_PRESETS: { value: string; label: string }[] = [
  { value: "#0d9488", label: "فیروزه‌ای" },
  { value: "#059669", label: "سبز" },
  { value: "#f59e0b", label: "کهربایی" },
  { value: "#e11d48", label: "سرخابی" },
  { value: "#7c3aed", label: "بنفش" },
  { value: "#1f2937", label: "سرمه‌ای" },
];

/* ————————————————————————— افکت‌های تیترها ————————————————————————— */

/**
 * متن سفارشیِ ویرایشگر مداد را با همان افکت گرادیانِ تیترهای سکشن رندر
 * می‌کند — صرفِ تغییر متن نباید افکت ظاهری پیشین تیتر را حذف کند
 * (همان الگوی شمارنده‌های «رشد آکادمی» که افکت روی کل عدد اعمال می‌شود).
 */
export function renderGradientText(text: string): React.ReactNode {
  return <span className="text-gradient">{text}</span>;
}

/* ————————————————————————— Provider ————————————————————————— */

export function SiteTextsProvider({
  enabled,
  isAdmin,
  rows: initialRows,
  fonts,
  defaults,
  children,
}: {
  enabled: boolean;
  isAdmin: boolean;
  rows: Record<string, SiteTextRowValue>;
  fonts: SiteTextFontOption[];
  defaults: Record<string, string>;
  children: React.ReactNode;
}) {
  const [rows, setRows] =
    React.useState<Record<string, SiteTextRowValue>>(initialRows);
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const editable = Boolean(enabled && isAdmin);

  const fontStackFor = React.useCallback(
    (key: string | null | undefined) => {
      const k = (key ?? "").trim();
      if (!k) return null;
      return fonts.find((f) => f.key === k)?.stack ?? null;
    },
    [fonts]
  );

  // @font-face فونت‌های سفارشیِ به‌کاررفته در متن‌ها تزریق می‌شود
  // تا فونت انتخابی مدیر بدون رفرش صفحه واقعاً اعمال شود.
  const activeFontCss = React.useMemo(() => {
    const keys = new Set<string>();
    for (const row of Object.values(rows)) {
      if (row?.fontKey) keys.add(row.fontKey);
    }
    return fonts
      .filter((f) => keys.has(f.key) && f.cssText.trim())
      .map((f) => f.cssText);
  }, [rows, fonts]);

  const openEditor = React.useCallback((key: string) => {
    setEditingKey(key);
  }, []);

  const applyRow = React.useCallback(
    (key: string, row: SiteTextRowValue) => {
      setRows((prev) => ({ ...prev, [key]: row }));
    },
    []
  );

  const resetRow = React.useCallback(
    (key: string, resetText: string) => {
      setRows((prev) => ({
        ...prev,
        [key]: { ...EMPTY_SITE_TEXT_ROW, text: resetText },
      }));
    },
    []
  );

  const value = React.useMemo<SiteTextsContextValue>(
    () => ({
      isAdmin,
      editable,
      rows,
      defaults,
      fonts,
      fontStackFor,
      openEditor,
    }),
    [isAdmin, editable, rows, defaults, fonts, fontStackFor, openEditor]
  );

  return (
    <SiteTextsContext.Provider value={value}>
      <FontStylesheets cssTexts={activeFontCss} />
      {children}
      <SiteTextEditorDialog
        open={editingKey !== null}
        slotKey={editingKey}
        row={editingKey ? (rows[editingKey] ?? null) : null}
        defaultText={editingKey ? (defaults[editingKey] ?? "") : ""}
        fonts={fonts}
        onDismiss={() => setEditingKey(null)}
        onSaved={applyRow}
        onReset={resetRow}
      />
    </SiteTextsContext.Provider>
  );
}

/* ————————————————————————— متن قابل‌ویرایش ————————————————————————— */

/**
 * جایگاه متن قابل‌ویرایش — کنار متن (فقط برای مدیرِ وارد‌شده و با ماژولِ روشن)
 * آیکون مداد نمایش داده می‌شود؛ با کلیک روی آن پاپ‌آپ ویرایش متن/رنگ/فونت/
 * اندازه و نمایش-و‌مخفی‌بودن باز می‌شود.
 */
export function EditableText({
  k,
  children,
  className,
  renderText,
}: {
  /** کلید جایگاه متن — رجیستری src/lib/site-texts.ts */
  k: string;
  /** رندر پیش‌فرض (بدون سفارشی‌سازی) */
  children?: React.ReactNode;
  className?: string;
  /** رندر سفارشی متن جایگزین — مثل شکستن اسلوگان به دو خط */
  renderText?: (text: string) => React.ReactNode;
}) {
  const ctx = React.useContext(SiteTextsContext);
  const row = ctx?.rows[k];
  const hidden = row?.hidden ?? false;
  const isAdmin = ctx?.isAdmin ?? false;
  const editable = ctx?.editable ?? false;

  // — مخفی‌سازی به تفکیک دستگاه: دسکتاپ ≥1024 / تبلت 768–1023 / موبایل <768 —
  // برای مدیرِ در حال ویرایش (مداد روشن) متن همیشه دیده می‌شود و به‌جای
  // کلاس مخفی‌کننده، نشان/راهنمای «مخفی در …» می‌گیرد.
  const deviceHidden = row
    ? {
        desktop: row.hiddenDesktop,
        tablet: row.hiddenTablet,
        mobile: row.hiddenMobile,
      }
    : { desktop: false, tablet: false, mobile: false };
  const hiddenDeviceLabels = SITE_TEXT_DEVICES.filter(
    (d) => deviceHidden[d]
  ).map((d) => SITE_TEXT_DEVICE_LABELS[d]);
  const anyDeviceHidden = hiddenDeviceLabels.length > 0;
  const showDeviceHiddenClasses = anyDeviceHidden && !editable;

  // متن مخفی فقط برای مدیر (کم‌رنگ) رندر می‌شود؛ کاربر عادی هیچ نمی‌بیند
  if (hidden && !isAdmin) return null;

  const customText = row?.text ?? null;
  const style: React.CSSProperties & Record<string, string> = {};
  if (row?.color) style.color = row.color;
  if (row?.fontKey) {
    const stack = ctx?.fontStackFor(row.fontKey);
    if (stack) style.fontFamily = stack;
  }
  if (row?.fontSize != null) {
    style.fontSize = `${row.fontSize}px`;
    // اندازه‌ی فونت روی متغیر CSS هم منتشر می‌شود تا استایل‌های واکنش‌گرای سایت
    // (مثل کاهش ۲۰٪ اسلوگان هیرو در موبایل) بتوانند نسبت به آن محاسبه شوند —
    // inline font-size با !important در media query موبایل قابل‌تغییر است.
    style["--st-size"] = `${row.fontSize}px`;
  }
  // — اندازه‌ی فونت به تفکیک دستگاه — متغیر CSS + پرچم data تا قاعده‌ی
  // واکنش‌گرای globals.css فقط برای همین عنصر و فقط در بازه‌ی همان دستگاه
  // اعمال شود (explicit موبایل/تبلت جایگزین اندازه‌ی دسکتاپ می‌شود).
  if (row?.fontSizeTablet != null) {
    style["--st-size-tablet"] = `${row.fontSizeTablet}px`;
  }
  if (row?.fontSizeMobile != null) {
    style["--st-size-mobile"] = `${row.fontSizeMobile}px`;
  }

  const content =
    customText !== null
      ? renderText
        ? renderText(customText)
        : customText
      : children;

  const hiddenTitle = hidden
    ? "این متن برای کاربران مخفی است — با مداد قابل نمایش مجدد است"
    : anyDeviceHidden
      ? `مخفی برای کاربرانِ ${hiddenDeviceLabels.join(" و ")} — با مداد قابل تنظیم است`
      : undefined;

  if (!editable) {
    return (
      <span
        data-st-size-tablet={row?.fontSizeTablet != null ? "" : undefined}
        data-st-size-mobile={row?.fontSizeMobile != null ? "" : undefined}
        className={cn(
          "site-text-value",
          (hidden || anyDeviceHidden) && isAdmin && "opacity-60",
          showDeviceHiddenClasses && row?.hiddenDesktop && "lg:hidden",
          showDeviceHiddenClasses && row?.hiddenTablet && "md:max-lg:hidden",
          showDeviceHiddenClasses && row?.hiddenMobile && "max-md:hidden",
          className
        )}
        style={style}
        title={hiddenTitle}
      >
        {content}
      </span>
    );
  }

  const slotLabel = findSiteTextSlot(k)?.label ?? k;

  return (
    <span
      data-st-size-tablet={row?.fontSizeTablet != null ? "" : undefined}
      data-st-size-mobile={row?.fontSizeMobile != null ? "" : undefined}
      className={cn(
        "site-text-value relative inline-block",
        (hidden || anyDeviceHidden) && "opacity-60",
        className
      )}
      style={style}
      title={hiddenTitle}
    >
      {content}
      {hidden || anyDeviceHidden ? (
        <span
          aria-hidden
          className="absolute -top-2.5 start-[-4px] z-40 inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-px text-[0.55rem] font-black text-white shadow-md shadow-rose-500/30"
        >
          <EyeOff className="size-2.5" strokeWidth={2.5} />
          {hidden ? "مخفی" : `مخفی در ${hiddenDeviceLabels.join("+")}`}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => ctx?.openEditor(k)}
        aria-label={`ویرایش متن: ${slotLabel}`}
        title={`ویرایش متن: ${slotLabel}`}
        className="absolute -end-3.5 -top-3.5 z-40 inline-flex size-7 items-center justify-center rounded-full border border-teal-500/50 bg-background/95 text-teal-600 opacity-90 shadow-md shadow-teal-500/25 backdrop-blur transition-all duration-200 hover:scale-110 hover:border-teal-500 hover:bg-teal-500 hover:text-white hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 dark:text-teal-300 dark:hover:text-teal-950"
      >
        <Pencil className="size-3.5" strokeWidth={2.2} />
      </button>
    </span>
  );
}

/* ————————————————————————— پاپ‌آپ ویرایش ————————————————————————— */

function SiteTextEditorDialog({
  open,
  slotKey,
  row,
  defaultText,
  fonts,
  onDismiss,
  onSaved,
  onReset,
}: {
  open: boolean;
  slotKey: string | null;
  row: SiteTextRowValue | null;
  defaultText: string;
  fonts: SiteTextFontOption[];
  onDismiss(): void;
  onSaved(key: string, row: SiteTextRowValue): void;
  onReset(key: string, resetText: string): void;
}) {
  const slot = slotKey ? findSiteTextSlot(slotKey) : null;

  const [text, setText] = React.useState("");
  const [color, setColor] = React.useState("");
  const [fontKey, setFontKey] = React.useState("");
  const [fontSize, setFontSize] = React.useState("");
  const [fontSizeTablet, setFontSizeTablet] = React.useState("");
  const [fontSizeMobile, setFontSizeMobile] = React.useState("");
  const [hidden, setHidden] = React.useState(false);
  const [hiddenDesktop, setHiddenDesktop] = React.useState(false);
  const [hiddenTablet, setHiddenTablet] = React.useState(false);
  const [hiddenMobile, setHiddenMobile] = React.useState(false);
  const [previewDevice, setPreviewDevice] = React.useState<SiteTextDevice>("desktop");
  const [saving, setSaving] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [error, setError] = React.useState("");

  // با هر باز شدن پاپ‌آپ، فرم از وضعیت فعلی جایگاه متن پر می‌شود
  React.useEffect(() => {
    if (!open || !slotKey) return;
    setText(row?.text ?? defaultText);
    setColor(row?.color ?? "");
    setFontKey(row?.fontKey ?? "");
    setFontSize(row?.fontSize != null ? String(row.fontSize) : "");
    setFontSizeTablet(
      row?.fontSizeTablet != null ? String(row.fontSizeTablet) : ""
    );
    setFontSizeMobile(
      row?.fontSizeMobile != null ? String(row.fontSizeMobile) : ""
    );
    setHidden(row?.hidden ?? false);
    setHiddenDesktop(row?.hiddenDesktop ?? false);
    setHiddenTablet(row?.hiddenTablet ?? false);
    setHiddenMobile(row?.hiddenMobile ?? false);
    setPreviewDevice("desktop");
    setSaving(false);
    setResetting(false);
    setError("");
  }, [open, slotKey]);

  const fontStack = React.useMemo(
    () => fonts.find((f) => f.key === fontKey)?.stack ?? null,
    [fonts, fontKey]
  );

  // اندازه‌ی مؤثر دستگاه انتخاب‌شده در پیش‌نمایش — خالی = ارث از دسکتاپ
  const previewSizeForDevice = (device: SiteTextDevice): number | null => {
    const base = fontSize.trim() ? Number(fontSize) : null;
    if (device === "tablet") {
      const t = fontSizeTablet.trim() ? Number(fontSizeTablet) : null;
      return t ?? base;
    }
    if (device === "mobile") {
      const m = fontSizeMobile.trim() ? Number(fontSizeMobile) : null;
      return m ?? base;
    }
    return base;
  };

  const deviceHiddenState: Record<SiteTextDevice, boolean> = {
    desktop: hiddenDesktop,
    tablet: hiddenTablet,
    mobile: hiddenMobile,
  };

  const previewStyle: React.CSSProperties = {
    ...(color ? { color } : {}),
    ...(fontStack ? { fontFamily: fontStack } : {}),
    ...(previewSizeForDevice(previewDevice)
      ? { fontSize: `${previewSizeForDevice(previewDevice)}px` }
      : {}),
  };

  async function handleSave() {
    if (!slotKey || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/site-texts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: slotKey,
          text,
          color,
          fontKey,
          fontSize: fontSize.trim() ? Number(fontSize) : 0,
          fontSizeTablet: fontSizeTablet.trim() ? Number(fontSizeTablet) : 0,
          fontSizeMobile: fontSizeMobile.trim() ? Number(fontSizeMobile) : 0,
          hidden,
          hiddenDesktop,
          hiddenTablet,
          hiddenMobile,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        row?: {
          text: string | null;
          color: string | null;
          fontKey: string | null;
          fontSize: number | null;
          fontSizeTablet: number | null;
          fontSizeMobile: number | null;
          hidden: boolean;
          hiddenDesktop: boolean;
          hiddenTablet: boolean;
          hiddenMobile: boolean;
        };
        error?: string;
      } | null;
      if (!res.ok || !data?.row) {
        throw new Error(data?.error ?? "خطا در ذخیره‌ی متن.");
      }
      onSaved(slotKey, {
        text: data.row.text,
        color: data.row.color,
        fontKey: data.row.fontKey,
        fontSize: data.row.fontSize,
        fontSizeTablet: data.row.fontSizeTablet ?? null,
        fontSizeMobile: data.row.fontSizeMobile ?? null,
        hidden: data.row.hidden,
        hiddenDesktop: data.row.hiddenDesktop ?? false,
        hiddenTablet: data.row.hiddenTablet ?? false,
        hiddenMobile: data.row.hiddenMobile ?? false,
      });
      toast.success("متن با موفقیت ذخیره شد");
      onDismiss();
    } catch (e) {
      const message = e instanceof Error ? e.message : "خطا در ذخیره‌ی متن.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!slotKey || resetting) return;
    setResetting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/site-texts?key=${encodeURIComponent(slotKey)}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        resetText?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "خطا در بازگردانی پیش‌فرض.");
      }
      onReset(slotKey, data.resetText ?? "");
      toast.success("متن به حالت پیش‌فرض بازگردانی شد");
      onDismiss();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "خطا در بازگردانی پیش‌فرض.";
      setError(message);
      toast.error(message);
    } finally {
      setResetting(false);
    }
  }

  const hasAnyCustom =
    (row?.text ?? null) !== null ||
    (row?.color ?? null) !== null ||
    (row?.fontKey ?? null) !== null ||
    (row?.fontSize ?? null) !== null ||
    (row?.fontSizeTablet ?? null) !== null ||
    (row?.fontSizeMobile ?? null) !== null ||
    (row?.hidden ?? false) ||
    (row?.hiddenDesktop ?? false) ||
    (row?.hiddenTablet ?? false) ||
    (row?.hiddenMobile ?? false);

  const busy = saving || resetting;

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? undefined : onDismiss())}>
      <DialogContent dir="rtl" className="rounded-2xl">
        {/* پیش‌نمایش همه‌ی فونت‌ها برای گزینه‌های انتخابگر */}
        <FontStylesheets cssTexts={fonts.map((f) => f.cssText)} />

        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-md shadow-teal-500/20">
              <Pencil className="size-4 text-white" strokeWidth={2.2} />
            </span>
            ویرایشگر متن
          </DialogTitle>
          <DialogDescription className="leading-6">
            {slot ? slot.label : "متن سایت"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pe-1">
          {/* — متن — */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="st-text">متن</Label>
              <span className="text-[0.7rem] tabular-nums text-muted-foreground">
                {text.length.toLocaleString("fa-IR")}/
                {SITE_TEXT_MAX_LEN.toLocaleString("fa-IR")}
              </span>
            </div>
            <Textarea
              id="st-text"
              dir="rtl"
              value={text}
              maxLength={SITE_TEXT_MAX_LEN}
              onChange={(e) => setText(e.target.value)}
              className="min-h-24 leading-7"
            />
            <p className="text-[0.7rem] leading-5 text-muted-foreground">
              {slot?.mirrorNumberSettingsField
                ? "این جایگاه عددی است — یک عدد وارد کنید (مثلاً ۳۲۰ یا 320)؛ مقدار در تنظیمات شمارنده‌های سایت هم به‌روز می‌شود. خالی کردن = مقدار فعلی تنظیمات."
                : "خالی کردن این کادر یعنی بازگشت به متن پیش‌فرض قطعه‌ی سایت."}
            </p>
          </div>

          {/* — رنگ متن — */}
          <div className="space-y-2">
            <Label>رنگ متن</Label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setColor("")}
                aria-pressed={color === ""}
                title="رنگ پیش‌فرض قالب"
                className={cn(
                  "flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl border px-2.5 text-[0.65rem] font-bold transition-all",
                  color === ""
                    ? "border-teal-500/60 bg-teal-500/10 text-teal-700 ring-2 ring-teal-500/30 dark:text-teal-300"
                    : "border-border bg-foreground/[0.03] text-muted-foreground hover:border-foreground/25"
                )}
              >
                پیش‌فرض
              </button>
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setColor(preset.value)}
                  aria-pressed={color === preset.value}
                  aria-label={`رنگ ${preset.label}`}
                  title={`رنگ ${preset.label}`}
                  className={cn(
                    "size-9 rounded-xl border-2 transition-all hover:scale-110",
                    color === preset.value
                      ? "border-foreground/70 scale-110 shadow-md"
                      : "border-transparent shadow-sm"
                  )}
                  style={{ backgroundColor: preset.value }}
                />
              ))}
              <span className="mx-1 hidden h-6 w-px bg-foreground/10 sm:block" />
              <Input
                type="color"
                aria-label="انتخاب رنگ سفارشی"
                value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0d9488"}
                onChange={(e) => setColor(e.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-xl border p-0.5"
              />
              <Input
                dir="ltr"
                value={color}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setColor(v.startsWith("#") ? v : `#${v}`);
                }}
                placeholder="#0d9488"
                aria-label="کد هگز رنگ"
                className="h-9 w-28 text-left font-mono text-xs"
              />
            </div>
          </div>

          {/* — فونت — */}
          <div className="space-y-2">
            <Label htmlFor="st-font">فونت</Label>
            <Select
              value={fontKey || "__default"}
              onValueChange={(v) => setFontKey(v === "__default" ? "" : v)}
            >
              <SelectTrigger id="st-font" className="w-full">
                <SelectValue placeholder="پیش‌فرض قطعه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default">پیش‌فرض قطعه‌ی سایت</SelectItem>
                {fonts.map((f) => (
                  <SelectItem
                    key={f.key}
                    value={f.key}
                    style={{ fontFamily: f.stack }}
                  >
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[0.7rem] leading-5 text-muted-foreground">
              فونت‌های نصب‌شده‌ی سایت (ماژول «فونت‌ها») — در همه‌ی دستگاه‌ها اعمال می‌شود.
            </p>
          </div>

          {/* — اندازه فونت به تفکیک دستگاه — */}
          <div className="space-y-2">
            <Label>اندازه فونت به تفکیک دستگاه (پیکسل)</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Monitor className="size-3.5" />
                  <span className="text-[0.68rem] font-bold">دسکتاپ</span>
                </div>
                <Input
                  type="number"
                  min={SITE_TEXT_FONT_MIN}
                  max={SITE_TEXT_FONT_MAX}
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value)}
                  placeholder="پیش‌فرض"
                  aria-label="اندازه فونت دسکتاپ"
                  className="h-9 text-center tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Tablet className="size-3.5" />
                  <span className="text-[0.68rem] font-bold">تبلت</span>
                </div>
                <Input
                  type="number"
                  min={SITE_TEXT_FONT_MIN}
                  max={SITE_TEXT_FONT_MAX}
                  value={fontSizeTablet}
                  onChange={(e) => setFontSizeTablet(e.target.value)}
                  placeholder="= دسکتاپ"
                  aria-label="اندازه فونت تبلت"
                  className="h-9 text-center tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Smartphone className="size-3.5" />
                  <span className="text-[0.68rem] font-bold">موبایل</span>
                </div>
                <Input
                  type="number"
                  min={SITE_TEXT_FONT_MIN}
                  max={SITE_TEXT_FONT_MAX}
                  value={fontSizeMobile}
                  onChange={(e) => setFontSizeMobile(e.target.value)}
                  placeholder="= دسکتاپ"
                  aria-label="اندازه فونت موبایل"
                  className="h-9 text-center tabular-nums"
                />
              </div>
            </div>
            <p className="text-[0.7rem] leading-5 text-muted-foreground">
              بین {SITE_TEXT_FONT_MIN} تا {SITE_TEXT_FONT_MAX} پیکسل — دسکتاپ
              خالی = اندازه‌ی واکنش‌گرای قالب؛ تبلت/موبایل خالی = همان اندازه‌ی
              دسکتاپ. دامنه‌ها: موبایل زیر ۷۶۸، تبلت ۷۶۸ تا ۱۰۲۳، دسکتاپ از ۱۰۲۴ پیکسل.
            </p>
          </div>

          {/* — نمایش/مخفی — */}
          <div className="space-y-3 rounded-xl border border-border bg-foreground/[0.02] p-3.5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor="st-visible" className="cursor-pointer">
                  نمایش این متن برای کاربران
                </Label>
                <p className="mt-1 text-[0.7rem] leading-5 text-muted-foreground">
                  خاموش = مخفی در همه‌ی دستگاه‌ها (فقط شما کم‌رنگ می‌بینید).
                </p>
              </div>
              <Switch
                id="st-visible"
                checked={!hidden}
                onCheckedChange={(v) => setHidden(!v)}
                aria-label="نمایش این متن برای کاربران"
              />
            </div>

            {/* — نمایش به تفکیک دستگاه — */}
            <div
              className={cn(
                "grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-background/50 p-2.5 transition-opacity",
                hidden && "opacity-40"
              )}
            >
              {(
                [
                  { device: "desktop", icon: Monitor, off: hiddenDesktop, set: setHiddenDesktop },
                  { device: "tablet", icon: Tablet, off: hiddenTablet, set: setHiddenTablet },
                  { device: "mobile", icon: Smartphone, off: hiddenMobile, set: setHiddenMobile },
                ] as const
              ).map(({ device, icon: Icon, off, set }) => (
                <label
                  key={device}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center transition-colors",
                    !off && "bg-teal-500/[0.07]"
                  )}
                >
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Icon className="size-3.5" />
                    <span className="text-[0.68rem] font-bold">
                      {SITE_TEXT_DEVICE_LABELS[device]}
                    </span>
                  </span>
                  <Switch
                    checked={!off}
                    disabled={hidden}
                    onCheckedChange={(v) => set(!v)}
                    aria-label={`نمایش متن در ${SITE_TEXT_DEVICE_LABELS[device]}`}
                    className="scale-90"
                  />
                  <span className="text-[0.6rem] leading-4 text-muted-foreground">
                    {off ? "مخفی در این دستگاه" : "نمایش"}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[0.7rem] leading-5 text-muted-foreground">
              مخفی‌سازی مجزا در هر دستگاه — مثلاً فقط در موبایل پنهان شود؛ شما
              همیشه در همه‌ی حالت‌ها می‌بینید.
            </p>
          </div>

          {/* — پیش‌نمایش زنده (به تفکیک دستگاه) — */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>پیش‌نمایش</Label>
              <div className="flex items-center gap-1 rounded-full border border-border bg-foreground/[0.03] p-0.5">
                {SITE_TEXT_DEVICES.map((device) => {
                  const Icon =
                    device === "desktop" ? Monitor : device === "tablet" ? Tablet : Smartphone;
                  return (
                    <button
                      key={device}
                      type="button"
                      onClick={() => setPreviewDevice(device)}
                      aria-pressed={previewDevice === device}
                      title={`پیش‌نمایش ${SITE_TEXT_DEVICE_LABELS[device]}`}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-bold transition-all",
                        previewDevice === device
                          ? "bg-teal-500 text-teal-950 shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="size-3" />
                      {SITE_TEXT_DEVICE_LABELS[device]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex min-h-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-foreground/15 bg-foreground/[0.02] px-4 py-3 text-center">
              <span
                className={cn(
                  "max-w-full break-words leading-8",
                  (hidden || deviceHiddenState[previewDevice]) && "opacity-40"
                )}
                style={previewStyle}
              >
                {text.trim() ||
                  slot?.defaultText ||
                  "پیش‌نمایش متن در اینجا نمایش داده می‌شود"}
              </span>
            </div>
            {(hidden || deviceHiddenState[previewDevice]) && (
              <p className="text-center text-[0.65rem] font-bold text-rose-600 dark:text-rose-400">
                در حالت «{SITE_TEXT_DEVICE_LABELS[previewDevice]}» برای کاربران
                مخفی است
              </p>
            )}
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-row-reverse items-center justify-between gap-2 sm:justify-between">
          <Button
            onClick={handleSave}
            disabled={busy}
            className="h-10 flex-1 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 font-black text-teal-950 shadow-lg shadow-teal-500/25 hover:shadow-teal-400/40 sm:flex-none"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saving ? "در حال ذخیره..." : "ذخیره"}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={busy || (!hasAnyCustom && !row)}
            title="بازگردانی متن، رنگ، فونت، اندازه‌ها و نمایش (همه‌ی دستگاه‌ها) به پیش‌فرض"
            className="h-10 flex-1 rounded-xl border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-300 sm:flex-none"
          >
            {resetting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            بازگردانی پیش‌فرض
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
