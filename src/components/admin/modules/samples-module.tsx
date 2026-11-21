"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  FileQuestion,
  Film,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import Image from "next/image";
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
import type {
  SampleQuestionCategoryWithCount,
  SampleQuestionWithCategory,
} from "@/components/admin/types";
import {
  SAMPLE_QUESTION_ACCEPT,
  SAMPLE_QUESTION_ICON_OPTIONS,
  SAMPLE_QUESTION_KIND_INFO,
  getSampleQuestionIcon,
  getSampleQuestionTheme,
  sampleQuestionKindOfExt,
} from "@/lib/sample-questions";
import { faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/**
 * ماژول «نمونه سوالات» — مدیریت دسته‌بندی‌ها (کارت‌های مربعی سایت با
 * پس‌زمینه‌ی موضوعی) و بارگذاری/ویرایش نمونه سوال‌ها (تصویر / PDF / ویدئو).
 *
 *  • دسته‌ها: ایجاد/ویرایش/حذف + انتشار + جابه‌جایی بالا/پایین (تعویض
 *    sortOrder دو ردیف همسایه) — حذف دسته نمونه سوال‌هایش را «بدون دسته»
 *    می‌گذارد (SetNull).
 *  • نمونه سوال‌ها: آپلود مستقیم فایل (kind=sample-question) با اعتبارسنجی
 *    فرمت/حجم، انتشار، ویرایش (تا وقتی فایل عوض نشود همان فایل می‌ماند)،
 *    حذف و فیلتر بر اساس دسته.
 */

/* ————————————————— ابزارهای مشترک ————————————————— */

function toInt(v: string): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** حجم فایل به فارسی — بایت/کیلوبایت/مگابایت */
function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${faDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${faDigits(Math.round(bytes / 1024))} کیلوبایت`;
  return `${faDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

/** پسوند فایل از نام آن — «نمونه.pdf» → «pdf» (بدون پسوند → "") */
function extOfName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** نگاشت MIME → پسوند (وقتی نام فایل پسوند ندارد) — همسان با سرور */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "application/pdf": "pdf",
};

/** پسوند مؤثر فایل — اول از نام، سپس از نوع MIME (مثل منطق سرور) */
function effectiveExt(file: File): string {
  return extOfName(file.name) || MIME_TO_EXT[file.type] || "";
}

/** پسوند فایل از لینک — حذف کوئری/هش و گرفتن آخرین قطعه‌ی مسیر */
function extFromUrl(raw: string): string {
  const pathOnly = raw.split(/[?#]/, 1)[0] ?? "";
  return extOfName(pathOnly.split("/").pop() ?? "");
}

/** سقف حجم آپلود بر اساس فرمت — همسان با اعتبارسنجی سمت سرور */
function maxBytesForFile(file: File): number {
  const kind = sampleQuestionKindOfExt(effectiveExt(file));
  if (kind === "image") return 10 * 1024 * 1024;
  if (kind === "pdf") return 32 * 1024 * 1024;
  if (kind === "video") return 256 * 1024 * 1024;
  return 0; // فرمت پشتیبانی‌نشده
}

/* ————————————————— فرم‌ها ————————————————— */

interface CategoryForm {
  title: string;
  description: string;
  icon: string;
  sortOrder: string;
  published: boolean;
}

interface FileValue {
  url: string;
  ext: string;
  size: number;
  originalName: string;
}

interface ItemForm {
  title: string;
  description: string;
  /** «none» یعنی بدون دسته */
  categoryId: string;
  file: FileValue | null;
  sortOrder: string;
  published: boolean;
}

/* ————————————————— فیلد آپلود فایل نمونه سوال ————————————————— */

type FileMode = "upload" | "link";

/**
 * SampleFileField — انتخاب فایل نمونه سوال با دو حالت:
 *  • آپلود مستقیم: فایل به /api/admin/upload (kind=sample-question,
 *    section=sampleQuestions) می‌رود؛ پس از موفقیت چیپ فایل با نشان
 *    فرمت و حجم نمایش داده می‌شود و با «جایگزینی» فایل دیگری می‌رود.
 *  • لینک فایل: آدرس مستقیم فایل (داخلی یا خارجی) وارد می‌شود و فرمت
 *    از پسوند لینک تشخیص داده می‌شود — بدون آپلود.
 */
function SampleFileField({
  value,
  onChange,
}: {
  value: FileValue | null;
  onChange: (next: FileValue | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  // آیتم موجود با لینک غیر-آپلودی → حالت لینت؛ آیتم آپلودی/جدید → آپلود
  const [linkDraft, setLinkDraft] = useState(() => {
    const url = value?.url ?? "";
    return url && !url.startsWith("/uploads/") ? url : "";
  });
  const [mode, setMode] = useState<FileMode>(linkDraft ? "link" : "upload");

  async function handleUpload(file: File | undefined) {
    if (!file || uploading) return;
    if (file.size === 0) {
      toast.error("فایل خالی است.");
      return;
    }
    const max = maxBytesForFile(file);
    if (!max) {
      toast.error("فرمت فایل باید تصویر (PNG/JPG/WebP/GIF/AVIF/BMP)، PDF یا ویدئو (MP4/WebM/MOV…) باشد.");
      return;
    }
    if (file.size > max) {
      const maxFa = max >= 1024 * 1024
        ? `${(max / (1024 * 1024)).toLocaleString("en-US")} مگابایت`
        : `${max} بایت`;
      toast.error(`حجم این فایل حداکثر ${maxFa} می‌تواند باشد.`);
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "sample-question");
      body.append("section", "sampleQuestions");
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        ext?: string;
        size?: number;
        error?: string;
      } | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "خطا در بارگذاری فایل.");
      }
      onChange({
        url: data.url,
        ext: data.ext ?? "",
        size: data.size ?? file.size,
        originalName: file.name,
      });
      toast.success("فایل نمونه سوال بارگذاری شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در بارگذاری فایل.");
    } finally {
      setUploading(false);
    }
  }

  const kind = value ? sampleQuestionKindOfExt(value.ext) : "other";
  const info = SAMPLE_QUESTION_KIND_INFO[kind];

  /** تغییر حالت: آپلود ↔ لینک (مقدار فعلی حفظ می‌شود) */
  function switchMode(next: FileMode) {
    if (next === mode) return;
    setMode(next);
    if (next === "link") {
      setLinkDraft(value?.url ?? "");
    }
  }

  /** ورودی لینک — فرمت از پسوند لینک زنده تشخیص داده می‌شود */
  function handleLinkChange(next: string) {
    setLinkDraft(next);
    const url = next.trim();
    if (!url) {
      onChange(null);
      return;
    }
    const ext = extFromUrl(url);
    const pathOnly = url.split(/[?#]/, 1)[0] ?? "";
    const basename = pathOnly.split("/").pop() ?? "";
    onChange({
      url,
      ext,
      size: 0,
      originalName: basename || url,
    });
  }

  const linkKind = sampleQuestionKindOfExt(extFromUrl(linkDraft.trim()));
  const linkInfo = SAMPLE_QUESTION_KIND_INFO[linkKind];

  return (
    <div className="space-y-2">
      <Label>فایل نمونه سوال (تصویر / PDF / ویدئو)</Label>

      {/* — انتخاب روش: آپلود مستقیم یا لینک — */}
      <div
        className="flex w-fit items-center gap-1 rounded-xl border border-border bg-foreground/[0.03] p-1 dark:bg-white/[0.04]"
        role="tablist"
        aria-label="روش انتخاب فایل"
      >
        {(
          [
            ["upload", "آپلود مستقیم", Upload],
            ["link", "لینک فایل", Link2],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
              mode === m
                ? "bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {mode === "link" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              dir="ltr"
              className="text-left"
              placeholder="https://example.com/soalat-chem-final.pdf"
              value={linkDraft}
              onChange={(e) => handleLinkChange(e.target.value)}
              autoComplete="off"
              aria-label="لینک فایل نمونه سوال"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.65rem] text-muted-foreground">
            {linkDraft.trim() ? (
              <span
                className={cn(
                  "select-none rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
                  linkInfo.badge
                )}
              >
                {linkInfo.label}
              </span>
            ) : null}
            <span className="leading-5">
              لینک مستقیم فایل (داخلی مثل /uploads/… یا آدرس خارجی) — فرمت از
              پسوند لینک تشخیص داده می‌شود.
            </span>
          </div>
        </div>
      ) : value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-foreground/[0.02] p-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg border",
              info.badge
            )}
            aria-hidden
          >
            {kind === "image" ? (
              <Image
                src={value.url}
                alt=""
                width={40}
                height={40}
                className="size-10 rounded-lg object-cover"
              />
            ) : (
              <FileQuestion className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">
              {value.originalName}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "select-none rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
                  info.badge
                )}
              >
                {info.label}
              </span>
              {value.size > 0 ? (
                <span className="text-[0.65rem] font-semibold text-muted-foreground">
                  {formatFileSize(value.size)}
                </span>
              ) : null}
            </div>
          </div>
          <label
            className={cn(
              "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-foreground/[0.04] px-3 text-xs font-bold text-foreground transition-colors hover:bg-foreground/[0.08] dark:hover:bg-white/[0.08]",
              uploading && "pointer-events-none opacity-60"
            )}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            جایگزینی
            <input
              type="file"
              accept={SAMPLE_QUESTION_ACCEPT}
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                handleUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : (
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-foreground/[0.02] px-4 py-8 text-center transition-colors hover:border-teal-500/40 hover:bg-teal-500/[0.04] dark:hover:border-teal-400/30",
            uploading && "pointer-events-none opacity-60"
          )}
        >
          {uploading ? (
            <Loader2 className="size-7 animate-spin text-teal-600 dark:text-teal-300" />
          ) : (
            <Upload className="size-7 text-muted-foreground" />
          )}
          <span className="text-sm font-bold text-foreground">
            {uploading ? "در حال بارگذاری…" : "انتخاب یا رها کردن فایل"}
          </span>
          <span className="text-[0.65rem] leading-5 text-muted-foreground">
            تصویر ≤۱۰ مگابایت · PDF ≤۳۲ مگابایت · ویدئو ≤۲۵۶ مگابایت
          </span>
          <input
            type="file"
            accept={SAMPLE_QUESTION_ACCEPT}
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              handleUpload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

/* ————————————————— ماژول اصلی ————————————————— */

export function SamplesModule() {
  const [categories, setCategories] = useState<
    SampleQuestionCategoryWithCount[] | null
  >(null);
  const [items, setItems] = useState<SampleQuestionWithCategory[] | null>(null);
  const [loading, setLoading] = useState(true);

  // — دیالوگ دسته —
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<SampleQuestionCategoryWithCount | null>(null);
  const [catForm, setCatForm] = useState<CategoryForm | null>(null);
  const [catSaving, setCatSaving] = useState(false);

  // — دیالوگ نمونه سوال —
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SampleQuestionWithCategory | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [itemSaving, setItemSaving] = useState(false);

  // — فیلتر لیست نمونه سوال‌ها بر اساس دسته —
  const [filterCat, setFilterCat] = useState("all");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [cats, its] = await Promise.all([
        apiFetch<SampleQuestionCategoryWithCount[]>(
          "/api/admin/sample-questions/categories"
        ),
        apiFetch<SampleQuestionWithCategory[]>(
          "/api/admin/sample-questions/items"
        ),
      ]);
      setCategories(cats);
      setItems(its);
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ————————————————— دسته‌ها ————————————————— */

  function openCreateCat() {
    setEditingCat(null);
    setCatForm({
      title: "",
      description: "",
      icon: "BookOpen",
      sortOrder: String(categories ? categories.length + 1 : 1),
      published: true,
    });
    setCatDialogOpen(true);
  }

  function openEditCat(cat: SampleQuestionCategoryWithCount) {
    setEditingCat(cat);
    setCatForm({
      title: cat.title,
      description: cat.description,
      icon: cat.icon,
      sortOrder: String(cat.sortOrder),
      published: cat.published,
    });
    setCatDialogOpen(true);
  }

  const setCat = <K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) => {
    setCatForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  async function handleSaveCat() {
    if (!catForm || catSaving) return;
    const title = catForm.title.trim();
    if (title.length < 2 || title.length > 80) {
      toast.error("عنوان دسته باید بین ۲ تا ۸۰ نویسه باشد.");
      return;
    }
    const sortOrder = toInt(catForm.sortOrder);
    const payload = {
      title,
      description: catForm.description.trim(),
      icon: catForm.icon,
      sortOrder,
      published: catForm.published,
    };

    setCatSaving(true);
    try {
      if (editingCat) {
        await apiFetch<SampleQuestionCategoryWithCount>(
          `/api/admin/sample-questions/categories/${editingCat.id}`,
          { method: "PUT", body: JSON.stringify(payload) }
        );
        toast.success("دسته‌بندی با موفقیت ویرایش شد");
      } else {
        await apiFetch<SampleQuestionCategoryWithCount>(
          "/api/admin/sample-questions/categories",
          { method: "POST", body: JSON.stringify(payload) }
        );
        toast.success("دسته‌بندی جدید ایجاد شد");
      }
      setCatDialogOpen(false);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setCatSaving(false);
    }
  }

  async function toggleCatPublish(cat: SampleQuestionCategoryWithCount, next: boolean) {
    setCategories(
      (prev) =>
        prev?.map((x) => (x.id === cat.id ? { ...x, published: next } : x)) ??
        prev
    );
    try {
      await apiFetch(`/api/admin/sample-questions/categories/${cat.id}`, {
        method: "PUT",
        body: JSON.stringify({ published: next }),
      });
      toast.success(next ? "دسته منتشر شد" : "دسته به پیش‌نویس رفت");
    } catch (error) {
      setCategories(
        (prev) =>
          prev?.map((x) => (x.id === cat.id ? { ...x, published: cat.published } : x)) ??
          prev
      );
      toastApiError(error);
    }
  }

  async function handleDeleteCat(cat: SampleQuestionCategoryWithCount) {
    try {
      await apiFetch(`/api/admin/sample-questions/categories/${cat.id}`, {
        method: "DELETE",
      });
      toast.success(`دسته «${cat.title}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /** جابه‌جایی دسته با همسایه‌ی بالا/پایین — تعویض sortOrder دو ردیف */
  async function moveCategory(cat: SampleQuestionCategoryWithCount, dir: "up" | "down") {
    if (!categories) return;
    const idx = categories.findIndex((c) => c.id === cat.id);
    const neighbor =
      dir === "up" ? categories[idx - 1] : categories[idx + 1];
    if (!neighbor) return;

    const a = cat.sortOrder;
    const b = neighbor.sortOrder;
    // مقادیر برابر → دسته در جهت درخواستی جابه‌جا می‌شود
    const newCat = a === b ? (dir === "up" ? Math.max(0, a - 1) : a + 1) : b;
    const newNeighbor = a === b ? b : a;

    try {
      await apiFetch(`/api/admin/sample-questions/categories/${cat.id}`, {
        method: "PUT",
        body: JSON.stringify({ sortOrder: newCat }),
      });
      if (newNeighbor !== neighbor.sortOrder) {
        await apiFetch(`/api/admin/sample-questions/categories/${neighbor.id}`, {
          method: "PUT",
          body: JSON.stringify({ sortOrder: newNeighbor }),
        });
      }
      await load();
    } catch (error) {
      toastApiError(error);
    }
  }

  /* ————————————————— نمونه سوال‌ها ————————————————— */

  function openCreateItem() {
    setEditingItem(null);
    setItemForm({
      title: "",
      description: "",
      categoryId: "none",
      file: null,
      sortOrder: String(items ? items.length + 1 : 1),
      published: true,
    });
    setItemDialogOpen(true);
  }

  function openEditItem(item: SampleQuestionWithCategory) {
    setEditingItem(item);
    setItemForm({
      title: item.title,
      description: item.description,
      categoryId: item.category?.id ?? "none",
      file: item.fileUrl
        ? {
            url: item.fileUrl,
            ext: item.ext,
            size: item.size,
            originalName: item.title,
          }
        : null,
      sortOrder: String(item.sortOrder),
      published: item.published,
    });
    setItemDialogOpen(true);
  }

  const setItem = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) => {
    setItemForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  async function handleSaveItem() {
    if (!itemForm || itemSaving) return;
    const title = itemForm.title.trim();
    if (title.length < 2 || title.length > 120) {
      toast.error("عنوان نمونه سوال باید بین ۲ تا ۱۲۰ نویسه باشد.");
      return;
    }
    if (!itemForm.file?.url) {
      toast.error("ابتدا فایل نمونه سوال را بارگذاری کنید یا لینک آن را وارد کنید.");
      return;
    }
    const sortOrder = toInt(itemForm.sortOrder);

    setItemSaving(true);
    try {
      if (editingItem) {
        await apiFetch<SampleQuestionWithCategory>(
          `/api/admin/sample-questions/items/${editingItem.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              title,
              description: itemForm.description.trim(),
              // رشته‌ی خالی یعنی «بدون دسته» (null در سرور)
              categoryId: itemForm.categoryId === "none" ? "" : itemForm.categoryId,
              fileUrl: itemForm.file.url,
              ext: itemForm.file.ext,
              size: itemForm.file.size,
              sortOrder,
              published: itemForm.published,
            }),
          }
        );
        toast.success("نمونه سوال ویرایش شد");
      } else {
        await apiFetch<SampleQuestionWithCategory>(
          "/api/admin/sample-questions/items",
          {
            method: "POST",
            body: JSON.stringify({
              title,
              description: itemForm.description.trim(),
              categoryId: itemForm.categoryId === "none" ? null : itemForm.categoryId,
              fileUrl: itemForm.file.url,
              ext: itemForm.file.ext,
              size: itemForm.file.size,
              sortOrder,
              published: itemForm.published,
            }),
          }
        );
        toast.success("نمونه سوال جدید بارگذاری شد");
      }
      setItemDialogOpen(false);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setItemSaving(false);
    }
  }

  async function toggleItemPublish(item: SampleQuestionWithCategory, next: boolean) {
    setItems(
      (prev) =>
        prev?.map((x) => (x.id === item.id ? { ...x, published: next } : x)) ??
        prev
    );
    try {
      await apiFetch(`/api/admin/sample-questions/items/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ published: next }),
      });
      toast.success(next ? "نمونه سوال منتشر شد" : "نمونه سوال به پیش‌نویس رفت");
    } catch (error) {
      setItems(
        (prev) =>
          prev?.map(
            (x) => (x.id === item.id ? { ...x, published: item.published } : x)
          ) ?? prev
      );
      toastApiError(error);
    }
  }

  async function handleDeleteItem(item: SampleQuestionWithCategory) {
    try {
      await apiFetch(`/api/admin/sample-questions/items/${item.id}`, {
        method: "DELETE",
      });
      toast.success(`نمونه سوال «${item.title}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /* ————————————————— محاسبات و رندر ————————————————— */

  const publishedCatCount = categories?.filter((c) => c.published).length ?? 0;
  const draftCatCount = (categories?.length ?? 0) - publishedCatCount;
  const filteredItems =
    filterCat === "all"
      ? items
      : items?.filter((i) => i.categoryId === filterCat) ?? null;

  const catPreviewIcon = catForm ? getSampleQuestionIcon(catForm.icon) : FileQuestion;
  const catPreviewTheme = catForm
    ? getSampleQuestionTheme(catForm.icon)
    : getSampleQuestionTheme("FileQuestion");
  const CatPreviewIcon = catPreviewIcon;

  return (
    <div className="space-y-8">
      <ModuleHeader
        title="نمونه سوالات"
        description="مدیریت دسته‌بندی‌ها و بارگذاری نمونه سوالات (تصویر، PDF، ویدئو)"
      >
        <Button onClick={openCreateItem} className={`rounded-xl ${btnGradient}`}>
          <Upload className="size-4" />
          بارگذاری نمونه سوال
        </Button>
      </ModuleHeader>

      {/* — آمار سریع — */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-600/25 bg-teal-500/10 px-3 py-1.5 text-xs font-bold text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300">
          {faDigits(publishedCatCount)} دسته منتشرشده
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-600/25 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
          {faDigits(draftCatCount)} دسته پیش‌نویس
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-600/25 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300">
          {faDigits(items?.length ?? 0)} نمونه سوال
        </span>
      </div>

      {/* ————————————————— دسته‌بندی‌ها ————————————————— */}
      <section className="space-y-4" aria-label="دسته‌بندی نمونه سوالات">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-black text-foreground">
            <FileQuestion className="size-4 text-orange-600 dark:text-orange-300" />
            دسته‌بندی‌ها
            <span className="text-xs font-semibold text-muted-foreground">
              ({faDigits(categories?.length ?? 0)})
            </span>
          </h2>
          <Button
            onClick={openCreateCat}
            variant="outline"
            size="sm"
            className="rounded-xl border-border bg-foreground/[0.04] text-xs font-bold text-foreground hover:bg-foreground/[0.08] dark:hover:bg-white/[0.08]"
          >
            <Plus className="size-4" />
            دسته‌بندی جدید
          </Button>
        </div>

        {loading && !categories ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass h-40 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : !categories || categories.length === 0 ? (
          <EmptyState
            icon={FileQuestion}
            title="هنوز دسته‌ای ساخته نشده است"
            description="دسته‌بندی‌ها به‌شکل کارت‌های مربعی موضوعی در صفحه‌ی نمونه سوالات سایت نمایش داده می‌شوند؛ اولین دسته را بسازید."
          >
            <Button
              onClick={openCreateCat}
              size="sm"
              className={`rounded-xl ${btnGradient}`}
            >
              <Plus className="size-4" />
              ساخت اولین دسته
            </Button>
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((cat, ci) => {
              const Icon = getSampleQuestionIcon(cat.icon);
              const theme = getSampleQuestionTheme(cat.icon);
              const isFirst = ci === 0;
              const isLast = ci === categories.length - 1;
              return (
                <article
                  key={cat.id}
                  className="glass flex flex-col gap-3 rounded-2xl p-4 transition-colors hover:border-foreground/20 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md ${theme.gradient}`}
                      aria-hidden
                    >
                      <Icon className="size-6 text-white" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-foreground">
                          {cat.title}
                        </p>
                        {!cat.published ? (
                          <span className="select-none rounded-full border border-amber-600/25 bg-amber-500/10 px-2 py-0.5 text-[0.6rem] font-black text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                            پیش‌نویس
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {faDigits(cat._count?.items ?? 0)} نمونه سوال
                        {cat.publishedItems !== (cat._count?.items ?? 0)
                          ? ` · ${faDigits(cat.publishedItems)} منتشرشده`
                          : ""}
                      </p>
                    </div>
                    <PublishSwitch
                      published={cat.published}
                      onToggle={(next) => toggleCatPublish(cat, next)}
                    />
                  </div>

                  {cat.description ? (
                    <p className="line-clamp-2 text-xs leading-6 text-foreground/70">
                      {cat.description}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg"
                        disabled={isFirst}
                        onClick={() => moveCategory(cat, "up")}
                        aria-label={`جابه‌جایی «${cat.title}» به بالا`}
                        title="جابه‌جایی به بالا"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg"
                        disabled={isLast}
                        onClick={() => moveCategory(cat, "down")}
                        aria-label={`جابه‌جایی «${cat.title}» به پایین`}
                        title="جابه‌جایی به پایین"
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <span className="ms-1 text-[0.65rem] font-semibold text-muted-foreground">
                        ترتیب {faDigits(cat.sortOrder)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditCat(cat)}
                        aria-label={`ویرایش دسته ${cat.title}`}
                        title="ویرایش"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <ConfirmDelete
                        title="حذف دسته"
                        description={`نمونه سوال‌های دسته‌ی «${cat.title}» بدون دسته می‌مانند و حذف نمی‌شوند. دسته برای همیشه حذف شود؟`}
                        onConfirm={() => handleDeleteCat(cat)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`حذف دسته ${cat.title}`}
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
      </section>

      {/* ————————————————— نمونه سوال‌ها ————————————————— */}
      <section className="space-y-4" aria-label="نمونه سوال‌های بارگذاری‌شده">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-black text-foreground">
            <Upload className="size-4 text-orange-600 dark:text-orange-300" />
            نمونه سوال‌ها
            <span className="text-xs font-semibold text-muted-foreground">
              ({faDigits(items?.length ?? 0)})
            </span>
          </h2>

          {categories && categories.length > 0 ? (
            <div className="w-44">
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="h-9 w-full rounded-xl text-xs font-bold" aria-label="فیلتر دسته">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه دسته‌ها</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {loading && !items ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass h-24 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <EmptyState
            icon={Upload}
            title="هنوز نمونه سوالی بارگذاری نشده است"
            description="نمونه سوال‌ها (تصویر، PDF یا ویدئو) در صفحه‌ی «نمونه سوالات» سایت به دسته‌شان نمایش داده می‌شوند؛ اولین فایل را بارگذاری کنید."
          >
            <Button
              onClick={openCreateItem}
              size="sm"
              className={`rounded-xl ${btnGradient}`}
            >
              <Upload className="size-4" />
              بارگذاری اولین نمونه سوال
            </Button>
          </EmptyState>
        ) : !filteredItems || filteredItems.length === 0 ? (
          <div className="glass rounded-2xl px-4 py-10 text-center text-sm font-bold text-muted-foreground">
            نمونه سوالی در این دسته نیست.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => {
              const kind = sampleQuestionKindOfExt(item.ext);
              const info = SAMPLE_QUESTION_KIND_INFO[kind];
              const hasFile = Boolean(item.fileUrl.trim());
              return (
                <article
                  key={item.id}
                  className="glass group flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/[0.06] dark:hover:shadow-black/25"
                >
                  {/* — بندانگشتی گالری (کلیک → مشاهده فایل در تب جدید) — */}
                  {hasFile ? (
                    <button
                      type="button"
                      onClick={() =>
                        window.open(item.fileUrl, "_blank", "noopener,noreferrer")
                      }
                      aria-label={`مشاهده فایل ${item.title}`}
                      title="مشاهده فایل در تب جدید"
                      className="relative block aspect-[4/3] w-full overflow-hidden border-b border-border"
                    >
                      {kind === "image" ? (
                        <Image
                          src={item.fileUrl}
                          alt={item.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex h-full w-full items-center justify-center bg-gradient-to-br",
                            kind === "video"
                              ? "from-violet-500/[0.12] to-fuchsia-500/[0.06]"
                              : "from-rose-500/[0.08] to-foreground/[0.02]"
                          )}
                        >
                          {kind === "video" ? (
                            <Film
                              className="size-10 text-violet-600 dark:text-violet-300"
                              strokeWidth={1.8}
                            />
                          ) : (
                            <FileQuestion
                              className="size-10 text-rose-600 dark:text-rose-300"
                              strokeWidth={1.8}
                            />
                          )}
                        </span>
                      )}
                      <span className="absolute bottom-2 right-2 rounded-full bg-background/85 p-0.5 backdrop-blur-sm">
                        <span
                          className={cn(
                            "select-none rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
                            info.badge
                          )}
                        >
                          {info.label}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </button>
                  ) : (
                    <span className="flex aspect-[4/3] w-full items-center justify-center border-b border-border bg-foreground/[0.02] text-[0.7rem] font-bold text-muted-foreground">
                      بدون فایل
                    </span>
                  )}

                  {/* — بدنه‌ی کارت گالری — */}
                  <div className="flex flex-1 flex-col gap-2.5 p-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="line-clamp-1 text-sm font-bold text-foreground">
                        {item.title}
                      </p>
                      {item.category ? (
                        <span className="select-none rounded-full border border-teal-600/20 bg-teal-500/[0.07] px-2 py-0.5 text-[0.6rem] font-bold text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/[0.08] dark:text-teal-300">
                          {item.category.title}
                        </span>
                      ) : (
                        <span className="select-none rounded-full border border-foreground/15 bg-foreground/[0.05] px-2 py-0.5 text-[0.6rem] font-bold text-muted-foreground dark:border-white/15 dark:bg-white/[0.05]">
                          بدون دسته
                        </span>
                      )}
                      {!item.published ? (
                        <span className="select-none rounded-full border border-amber-600/25 bg-amber-500/10 px-2 py-0.5 text-[0.6rem] font-black text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                          پیش‌نویس
                        </span>
                      ) : null}
                    </div>

                    {item.description ? (
                      <p className="line-clamp-2 text-xs leading-6 text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] font-semibold text-muted-foreground">
                      {item.size > 0 ? (
                        <span>{formatFileSize(item.size)}</span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Eye className="size-3" />
                        {faDigits(item.views)} بازدید
                      </span>
                      <span>ترتیب {faDigits(item.sortOrder)}</span>
                      {hasFile ? (
                        <a
                          href={item.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal-700 underline-offset-4 hover:underline dark:text-teal-300"
                        >
                          مشاهده فایل
                        </a>
                      ) : null}
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditItem(item)}
                          aria-label={`ویرایش نمونه سوال ${item.title}`}
                          title="ویرایش"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <ConfirmDelete
                          title="حذف نمونه سوال"
                          description={`نمونه سوال «${item.title}» و فایل آن برای همیشه حذف می‌شوند. مطمئن هستید؟`}
                          onConfirm={() => handleDeleteItem(item)}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`حذف نمونه سوال ${item.title}`}
                            title="حذف"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </ConfirmDelete>
                      </div>
                      <PublishSwitch
                        published={item.published}
                        onToggle={(next) => toggleItemPublish(item, next)}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ————————————————— دیالوگ دسته‌بندی ————————————————— */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editingCat ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"}
            </DialogTitle>
            <DialogDescription>
              آیکون انتخابی، پس‌زمینه‌ی کارت دسته در سایت را تعیین می‌کند —
              آیکونی مرتبط با موضوع انتخاب کنید.
            </DialogDescription>
          </DialogHeader>

          {catForm ? (
            <div className="grid gap-4">
              <Field label="عنوان دسته" htmlFor="sq-cat-title">
                <Input
                  id="sq-cat-title"
                  value={catForm.title}
                  onChange={(e) => setCat("title", e.target.value)}
                  placeholder="مثلاً: شیمی"
                  maxLength={80}
                />
              </Field>
              <Field label="توضیح کوتاه" htmlFor="sq-cat-desc">
                <Textarea
                  id="sq-cat-desc"
                  value={catForm.description}
                  onChange={(e) => setCat("description", e.target.value)}
                  placeholder="یک خط توضیح برای نمایش در صفحه‌ی نمونه سوالات…"
                  className="min-h-20"
                  maxLength={300}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="آیکون موضوعی" htmlFor="sq-cat-icon">
                  <Select
                    value={catForm.icon}
                    onValueChange={(v) => setCat("icon", v)}
                  >
                    <SelectTrigger id="sq-cat-icon" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {SAMPLE_QUESTION_ICON_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="ترتیب نمایش" htmlFor="sq-cat-sortOrder">
                  <Input
                    id="sq-cat-sortOrder"
                    type="number"
                    value={catForm.sortOrder}
                    onChange={(e) => setCat("sortOrder", e.target.value)}
                  />
                </Field>
              </div>

              {/* پیش‌نمایش زنده کارت سایت — همان شکل /samples */}
              <div className="flex items-center gap-4 rounded-xl border border-border bg-foreground/[0.02] p-3">
                <span
                  className={`flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md ${catPreviewTheme.gradient}`}
                  aria-hidden
                >
                  <CatPreviewIcon
                    className="size-7 text-white"
                    strokeWidth={2.2}
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-bold text-muted-foreground">
                    پیش‌نمایش کارت در سایت
                  </p>
                  <p className="truncate text-sm font-black text-foreground">
                    {catForm.title.trim() || "عنوان دسته"}
                  </p>
                  <p className="text-[0.6rem] font-semibold text-muted-foreground">
                    پس‌زمینه از آیکون «{catForm.icon}» گرفته می‌شود
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.02] p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="sq-cat-published" className="text-sm font-bold">
                    نمایش در سایت
                  </Label>
                  <p className="text-[0.65rem] text-muted-foreground">
                    دسته‌های پیش‌نویس فقط در پنل دیده می‌شوند.
                  </p>
                </div>
                <Switch
                  id="sq-cat-published"
                  checked={catForm.published}
                  onCheckedChange={(v) => setCat("published", v)}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={handleSaveCat}
              disabled={catSaving}
              className={`rounded-xl ${btnGradient}`}
            >
              {catSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingCat ? "ذخیره تغییرات" : "ایجاد دسته"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setCatDialogOpen(false)}
              disabled={catSaving}
              className="rounded-xl"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ————————————————— دیالوگ نمونه سوال ————————————————— */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editingItem ? "ویرایش نمونه سوال" : "بارگذاری نمونه سوال"}
            </DialogTitle>
            <DialogDescription>
              فایل تصویر/PDF/ویدئو را آپلود مستقیم یا با لینک آن ثبت کنید و به یک دسته تخصیص دهید؛ بدون دسته هم می‌توان ادامه داد.
            </DialogDescription>
          </DialogHeader>

          {itemForm ? (
            <div className="grid gap-4">
              <Field label="عنوان" htmlFor="sq-item-title">
                <Input
                  id="sq-item-title"
                  value={itemForm.title}
                  onChange={(e) => setItem("title", e.target.value)}
                  placeholder="مثلاً: آزمون جامع شیمی — نوبت اول"
                  maxLength={120}
                />
              </Field>
              <Field label="توضیح (اختیاری)" htmlFor="sq-item-desc">
                <Textarea
                  id="sq-item-desc"
                  value={itemForm.description}
                  onChange={(e) => setItem("description", e.target.value)}
                  placeholder="توضیح کوتاه محتوای این نمونه سوال…"
                  className="min-h-20"
                  maxLength={500}
                />
              </Field>

              <SampleFileField
                value={itemForm.file}
                onChange={(file) => setItem("file", file)}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="دسته‌بندی" htmlFor="sq-item-cat">
                  <Select
                    value={itemForm.categoryId}
                    onValueChange={(v) => setItem("categoryId", v)}
                  >
                    <SelectTrigger id="sq-item-cat" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="none">بدون دسته</SelectItem>
                      {categories?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="ترتیب نمایش" htmlFor="sq-item-sortOrder">
                  <Input
                    id="sq-item-sortOrder"
                    type="number"
                    value={itemForm.sortOrder}
                    onChange={(e) => setItem("sortOrder", e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.02] p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="sq-item-published" className="text-sm font-bold">
                    نمایش در سایت
                  </Label>
                  <p className="text-[0.65rem] text-muted-foreground">
                    نمونه سوال‌های پیش‌نویس فقط در پنل دیده می‌شوند.
                  </p>
                </div>
                <Switch
                  id="sq-item-published"
                  checked={itemForm.published}
                  onCheckedChange={(v) => setItem("published", v)}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={handleSaveItem}
              disabled={itemSaving}
              className={`rounded-xl ${btnGradient}`}
            >
              {itemSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingItem ? "ذخیره تغییرات" : "ثبت نمونه سوال"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setItemDialogOpen(false)}
              disabled={itemSaving}
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

/* ————————————————— فیلد برچسب‌دار ————————————————— */

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
