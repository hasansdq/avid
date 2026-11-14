"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  CalendarClock,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileAudio,
  FileText,
  FileVolume2,
  FileArchive,
  Film,
  HardDrive,
  ImageIcon,
  Images,
  Info,
  PackageOpen,
  RefreshCw,
  SearchX,
  Trash2,
  Type,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { btnGradient } from "@/components/admin/shared/styles";
import {
  CATEGORY_LABELS,
  GALLERY_SECTIONS,
  sectionLabel,
  type FileCategory,
  type GalleryFile,
} from "@/lib/gallery-shared";
import { faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/**
 * ماژول «گالری» — آرشیو همه‌ی فایل‌های آپلودی سایت:
 *  • دسته‌بندی بر اساس فرمت (تصاویر، ویدئوها، صوت، فونت‌ها، اسناد، …)
 *  • مرتب‌سازی بر اساس تاریخ بارگذاری و حجم فایل (و نام)
 *  • جزئیات هر فایل: بارگذاری‌کننده و بخش استفاده (دوره‌ها، آزمون‌ها،
 *    گواهینامه‌ها، فونت‌ها، تنظیمات، چت و…)
 * فایل‌های قدیمی (پیش از افزودن گالری) هنگام باز شدن به‌صورت خودکار
 * همگام می‌شوند و بخششان از محل استفاده در دیتابیس استنباط می‌شود.
 */

/* ————————————————— کمکی‌ها ————————————————— */

/** فرمت فارسی حجم فایل (بایت/کیلوبایت/مگابایت/گیگابایت) */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "۰ بایت";
  if (bytes < 1024) return `${faDigits(bytes)} بایت`;
  if (bytes < 1024 ** 2) return `${faDigits((bytes / 1024).toFixed(1))} کیلوبایت`;
  if (bytes < 1024 ** 3) return `${faDigits((bytes / 1024 ** 2).toFixed(1))} مگابایت`;
  return `${faDigits((bytes / 1024 ** 3).toFixed(2))} گیگابایت`;
}

/** تاریخ + ساعت شمسی یک‌خطی */
function faDateTime(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${date} — ${time}`;
}

/** آیکون دسته‌ی فرمت هر فایل */
function CategoryIcon({ category }: { category: FileCategory }) {
  const cls = "size-6";
  switch (category) {
    case "image":
      return <ImageIcon className={cls} />;
    case "video":
      return <Film className={cls} />;
    case "audio":
      return <FileAudio className={cls} />;
    case "font":
      return <Type className={cls} />;
    case "document":
      return <FileText className={cls} />;
    case "archive":
      return <FileArchive className={cls} />;
    default:
      return <FileVolume2 className={cls} />;
  }
}

type SortKey = "newest" | "oldest" | "largest" | "smallest" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "جدیدترین" },
  { key: "oldest", label: "قدیمی‌ترین" },
  { key: "largest", label: "حجیم‌ترین" },
  { key: "smallest", label: "سبک‌ترین" },
  { key: "name", label: "نام فایل (الفبا)" },
];

/** دسته‌های نمایش‌داده‌شده در تب‌ها — فقط دسته‌های پرکاربرد + سایر */
const CATEGORY_TABS: FileCategory[] = [
  "image",
  "video",
  "audio",
  "font",
  "document",
  "archive",
  "other",
];

interface GalleryStats {
  total: number;
  totalSize: number;
  categories: Record<string, { count: number; size: number }>;
}

interface GalleryResponse {
  files: GalleryFile[];
  stats: GalleryStats;
  sync: { imported: number; removed: number; resolved: number } | null;
}

/* ————————————————— ماژول ————————————————— */

export function GalleryModule() {
  const [data, setData] = useState<GalleryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // — فیلتر دسته‌ی فرمت + بخش سایت + مرتب‌سازی —
  const [category, setCategory] = useState<FileCategory | "all">("all");
  const [section, setSection] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  // — فایل انتخابی برای دیالوگ جزئیات —
  const [detail, setDetail] = useState<GalleryFile | null>(null);
  const [copied, setCopied] = useState(false);

  // — انتخاب چک‌باکسی برای حذف تکی/دسته‌جمعی —
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiFetch<GalleryResponse>("/api/admin/gallery");
      setData(res);
      // همگام‌سازی فایل‌های جدید فقط در بارگذاری خاموش (refresh) اطلاع می‌دهد
      if (silent && res.sync && res.sync.imported > 0) {
        toast.success(`${faDigits(res.sync.imported)} فایل جدید به گالری اضافه شد`, {
          description: "فایل‌های بارگذاری‌شده خارج از پنل همگام‌سازی شدند.",
        });
      }
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** فهرست نهایی: فیلتر دسته + فیلتر بخش + مرتب‌سازی */
  const files = useMemo(() => {
    if (!data) return [];
    let list = data.files;
    if (category !== "all") list = list.filter((f) => f.category === category);
    if (section !== "all") list = list.filter((f) => f.section === section);
    const sorted = [...list];
    switch (sort) {
      case "newest":
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "oldest":
        sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case "largest":
        sorted.sort((a, b) => b.size - a.size);
        break;
      case "smallest":
        sorted.sort((a, b) => a.size - b.size);
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "fa"));
        break;
    }
    return sorted;
  }, [data, category, section, sort]);

  /** بخش‌های موجود واقعاً در داده — برای dropdown فیلتر بخش */
  const sectionsInUse = useMemo(() => {
    if (!data) return [];
    const keys = new Set(data.files.map((f) => f.section));
    return GALLERY_SECTIONS.filter((s) => keys.has(s.key));
  }, [data]);

  const stats = data?.stats;

  const copyLink = async (file: GalleryFile) => {
    try {
      await navigator.clipboard.writeText(file.url);
      setCopied(true);
      toast.success("لینک فایل کپی شد", { description: file.url });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("کپی لینک ممکن نشد؛ مرورگر شما اجازه‌ی دسترسی به کلیپ‌بورد ندارد.");
    }
  };

  /* ————————— حذف تکی/دسته‌جمعی ————————— */

  const toggleSelectFile = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected =
    files.length > 0 && files.every((f) => selected.has(f.id));

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = files.every((f) => next.has(f.id));
      for (const f of files) {
        if (all) next.delete(f.id);
        else next.add(f.id);
      }
      return next;
    });
  }, [files]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  /** حذف فایل‌ها از گالری و دیسک — DELETE /api/admin/gallery {ids} */
  const deleteFiles = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0 || deleting) return;
      setDeleting(true);
      try {
        const res = await apiFetch<{ deleted: number }>(
          "/api/admin/gallery",
          {
            method: "DELETE",
            body: JSON.stringify({ ids }),
          }
        );
        toast.success(
          `${faDigits(res?.deleted ?? ids.length)} فایل از گالری حذف شد`,
          {
            description:
              "فایل‌ها به‌همراه رکوردشان از دیسک سرور حذف شدند.",
          }
        );
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
        setDetail(null);
        setCopied(false);
        await load(true);
      } catch (error) {
        toastApiError(error);
        throw error;
      } finally {
        setDeleting(false);
      }
    },
    [deleting, load]
  );

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="گالری فایل‌ها"
        description="آرشیو همه‌ی فایل‌های بارگذاری‌شده سایت — دسته‌بندی بر اساس فرمت، با جزئیات بارگذاری‌کننده و بخش استفاده در هر فایل."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          className="rounded-xl text-xs font-bold"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          همگام‌سازی مجدد
        </Button>
      </ModuleHeader>

      {/* — خلاصه‌ی آماری: مجموع + دسته‌های فرمت — */}
      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={cn(
              "glass flex flex-col items-start gap-1 rounded-2xl p-4 text-right transition-all hover:shadow-md",
              category === "all" && "ring-2 ring-teal-500/50"
            )}
            aria-pressed={category === "all"}
          >
            <span className="flex items-center gap-2 text-[0.65rem] font-bold text-muted-foreground">
              <HardDrive className="size-3.5" />
              همه‌ی فایل‌ها
            </span>
            <span className="text-lg font-black tabular-nums text-foreground">
              {faDigits(stats.total)}
            </span>
            <span className="text-[0.6rem] font-bold text-muted-foreground">
              {formatBytes(stats.totalSize)}
            </span>
          </button>

          {CATEGORY_TABS.map((cat) => {
            const cs = stats.categories[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(category === cat ? "all" : cat)}
                disabled={!cs}
                className={cn(
                  "glass flex flex-col items-start gap-1 rounded-2xl p-4 text-right transition-all hover:shadow-md",
                  category === cat && "ring-2 ring-teal-500/50",
                  !cs && "cursor-not-allowed opacity-45"
                )}
                aria-pressed={category === cat}
              >
                <span className="flex items-center gap-2 text-[0.65rem] font-bold text-muted-foreground">
                  <CategoryIcon category={cat} />
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="text-lg font-black tabular-nums text-foreground">
                  {faDigits(cs?.count ?? 0)}
                </span>
                <span className="text-[0.6rem] font-bold text-muted-foreground">
                  {formatBytes(cs?.size ?? 0)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* — نوار کنترل: تب دسته + فیلتر بخش + مرتب‌سازی — */}
      <div className="glass flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="دسته‌ی فرمت فایل">
          <CategoryTab
            active={category === "all"}
            count={stats?.total ?? 0}
            onClick={() => setCategory("all")}
          >
            همه
          </CategoryTab>
          {CATEGORY_TABS.map((cat) => (
            <CategoryTab
              key={cat}
              active={category === cat}
              count={stats?.categories[cat]?.count ?? 0}
              onClick={() => setCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </CategoryTab>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger className="h-9 w-40 rounded-xl text-xs font-bold" aria-label="فیلتر بخش">
              <SelectValue placeholder="همه‌ی بخش‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه‌ی بخش‌ها</SelectItem>
              {sectionsInUse.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-40 rounded-xl text-xs font-bold" aria-label="مرتب‌سازی">
              <ArrowDownUp className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* — نوار انتخاب و حذف دسته‌جمعی (چک‌باکس) — */}
      {!loading && data !== null && data.files.length > 0 ? (
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-bold text-foreground">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              aria-label="انتخاب همه‌ی فایل‌های نمایش‌داده‌شده"
              className="size-4 cursor-pointer accent-teal-600 dark:accent-teal-400"
            />
            انتخاب همه‌ی نمایش‌داده‌شده‌ها
          </label>

          <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            {faDigits(selected.size)} فایل انتخاب‌شده
          </span>

          {selected.size > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
              className="h-8 rounded-xl text-xs font-bold"
            >
              لغو انتخاب
            </Button>
          ) : null}

          <div className="ms-auto flex items-center gap-2">
            <ConfirmDelete
              title="حذف فایل‌های انتخاب‌شده"
              description={`${faDigits(selected.size)} فایل انتخاب‌شده به‌همراه خودِ فایل‌ها از دیسک سرور برای همیشه حذف می‌شوند؛ اگر فایلی در بخشی از سایت در حال استفاده باشد، آن بخش بدون فایل می‌ماند. مطمئن هستید؟`}
              confirmLabel="بله، حذف شوند"
              onConfirm={() => deleteFiles(Array.from(selected))}
            >
              <Button
                size="sm"
                variant="destructive"
                disabled={selected.size === 0 || deleting}
                className="h-8 rounded-xl text-xs font-black"
              >
                <Trash2 className="size-3.5" />
                حذف انتخاب‌شده‌ها
              </Button>
            </ConfirmDelete>
          </div>
        </div>
      ) : null}

      {/* — شبکه‌ی فایل‌ها — */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="glass h-64 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : !data || data.files.length === 0 ? (
        <EmptyState
          icon={Images}
          title="هنوز فایلی بارگذاری نشده است"
          description="فایل‌هایی که در بخش‌های مختلف پنل (دوره‌ها، آزمون‌ها، گواهینامه‌ها و…) بارگذاری می‌شوند، این‌جا آرشیو می‌شوند."
        >
          <Button variant="outline" size="sm" onClick={() => void load()}>
            تلاش مجدد
          </Button>
        </EmptyState>
      ) : files.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="فایلی با این فیلترها یافت نشد"
          description="دسته‌ی فرمت یا بخش انتخابی را تغییر دهید؛ یا همه‌ی فایل‌ها را ببینید."
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCategory("all");
              setSection("all");
            }}
          >
            نمایش همه‌ی فایل‌ها
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onOpen={() => setDetail(file)}
              selected={selected.has(file.id)}
              onToggleSelect={() => toggleSelectFile(file.id)}
            />
          ))}
        </div>
      )}

      {/* — دیالوگ جزئیات فایل — */}
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          {detail ? (
            <>
              <DialogHeader className="text-right sm:text-right">
                <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
                  <CategoryIcon category={detail.category} />
                  <span className="truncate">{detail.originalName || detail.name}</span>
                </DialogTitle>
                <DialogDescription className="text-right">
                  جزئیات بارگذاری و مشخصات فایل — بارگذاری‌کننده و بخش استفاده.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* پیش‌نمایش بزرگ: تصویر / ویدئو / صوت */}
                <FilePreviewLarge file={detail} />

                {/* مشخصات فایل */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <MetaRow icon={<Info className="size-3.5" />} label="نام اصلی">
                    <span dir="ltr" className="truncate">
                      {detail.originalName || detail.name}
                    </span>
                  </MetaRow>
                  <MetaRow icon={<Info className="size-3.5" />} label="نام روی دیسک">
                    <span dir="ltr" className="truncate">
                      {detail.name}
                    </span>
                  </MetaRow>
                  <MetaRow icon={<CategoryIcon category={detail.category} />} label="دسته‌ی فرمت">
                    {CATEGORY_LABELS[detail.category]}
                    <span dir="ltr" className="text-[0.6rem] font-bold text-muted-foreground">
                      .{detail.ext || "—"}
                    </span>
                  </MetaRow>
                  <MetaRow icon={<HardDrive className="size-3.5" />} label="حجم فایل">
                    {formatBytes(detail.size)}
                  </MetaRow>
                  <MetaRow icon={<CalendarClock className="size-3.5" />} label="تاریخ بارگذاری">
                    {faDateTime(detail.createdAt)}
                  </MetaRow>
                </div>

                {/* کاربر و بخش — پاسخ اصلی «توسط چه کسی و کجا بارگذاری شده» */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-foreground/[0.02] px-3.5 py-2.5 dark:bg-white/[0.02]">
                    <span className="flex shrink-0 select-none items-center gap-1.5 text-[0.7rem] font-bold text-muted-foreground">
                      <UserRound className="size-3.5" />
                      بارگذاری‌کننده
                    </span>
                    <span className="truncate text-sm font-black text-foreground">
                      {detail.uploader ? (
                        `مدیر «${detail.uploader}»`
                      ) : (
                        "نامشخص (فایل قدیمی)"
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-foreground/[0.02] px-3.5 py-2.5 dark:bg-white/[0.02]">
                    <span className="flex shrink-0 select-none items-center gap-1.5 text-[0.7rem] font-bold text-muted-foreground">
                      <PackageOpen className="size-3.5" />
                      بخش بارگذاری
                    </span>
                    <span
                      className={cn(
                        "inline-flex select-none items-center rounded-full border px-2.5 py-1 text-[0.65rem] font-black",
                        GALLERY_SECTIONS.find((s) => s.key === detail.section)?.badge ??
                          "border-foreground/15 bg-foreground/[0.05] text-muted-foreground"
                      )}
                    >
                      {sectionLabel(detail.section)}
                    </span>
                  </div>
                </div>

                {/* لینک فایل */}
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-foreground/[0.02] px-3.5 py-2.5 dark:bg-white/[0.02]">
                  <span className="sr-only">لینک فایل</span>
                  <code dir="ltr" className="min-w-0 flex-1 truncate text-left text-[0.65rem] font-bold text-muted-foreground">
                    {detail.url}
                  </code>
                </div>

                {/* اقدام‌ها */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void copyLink(detail)}
                    className={`rounded-xl ${btnGradient}`}
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "کپی شد" : "کپی لینک"}
                  </Button>
                  <Button asChild size="sm" variant="outline" className="rounded-xl text-xs font-bold">
                    <a href={detail.url} download>
                      <Download className="size-3.5" />
                      دانلود
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="rounded-xl text-xs font-bold">
                    <a href={detail.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-3.5" />
                      باز کردن در تب جدید
                    </a>
                  </Button>
                  <ConfirmDelete
                    title="حذف فایل"
                    description={`فایل «${detail.originalName || detail.name}» به‌همراه خودِ فایل از دیسک سرور برای همیشه حذف می‌شود؛ اگر این فایل در بخشی از سایت در حال استفاده باشد، آن بخش بدون فایل می‌ماند. مطمئن هستید؟`}
                    confirmLabel="بله، حذف شود"
                    onConfirm={() => deleteFiles([detail.id])}
                  >
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleting}
                      className="rounded-xl text-xs font-black"
                    >
                      <Trash2 className="size-3.5" />
                      حذف فایل
                    </Button>
                  </ConfirmDelete>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ————————————————— اجزای کمکی ————————————————— */

/** تب دسته‌ی فرمت با شمارنده */
function CategoryTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.65rem] font-black transition-all",
        active
          ? "border-teal-500/50 bg-teal-500/15 text-teal-700 shadow-sm dark:border-teal-400/50 dark:bg-teal-400/15 dark:text-teal-300"
          : "border-foreground/10 bg-foreground/[0.03] text-muted-foreground hover:border-foreground/25 hover:text-foreground dark:border-white/10 dark:bg-white/[0.03]"
      )}
    >
      {children}
      <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[0.55rem] tabular-nums dark:bg-white/[0.08]">
        {faDigits(count)}
      </span>
    </button>
  );
}

/** کارت فایل در شبکه — پیش‌نمایش + نام + فراداده‌ی خلاصه + چک‌باکس انتخاب */
function FileCard({
  file,
  onOpen,
  selected,
  onToggleSelect,
}: {
  file: GalleryFile;
  onOpen: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const section = GALLERY_SECTIONS.find((s) => s.key === file.section);

  return (
    <div
      className={cn(
        "relative flex flex-col transition-all",
        selected && "rounded-2xl ring-2 ring-teal-500/60 dark:ring-teal-400/60"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="glass group flex flex-1 flex-col overflow-hidden rounded-2xl text-right transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`جزئیات فایل ${file.originalName || file.name}`}
      >
        {/* پیش‌نمایش */}
        <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-foreground/[0.03] dark:bg-white/[0.03]">
          {file.category === "image" ? (
            // ESLint: no-img-element خاموش است؛ بارگذاری تنبل + بدون بهینه‌ساز
            <img
              src={file.url}
              alt={file.originalName || file.name}
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400/20 to-emerald-600/20 text-teal-700 dark:from-teal-400/15 dark:to-emerald-500/15 dark:text-teal-300">
              <CategoryIcon category={file.category} />
            </span>
          )}
          <span
            dir="ltr"
            className="absolute bottom-2 start-2 rounded-full bg-background/85 px-2 py-0.5 text-[0.55rem] font-black uppercase text-foreground backdrop-blur-sm dark:bg-black/60 dark:text-white"
          >
            .{file.ext || "—"}
          </span>
        </span>

        {/* فراداده‌ی خلاصه */}
        <span className="flex flex-1 flex-col gap-2 p-3.5">
          <span dir="ltr" className="truncate text-left text-xs font-black text-foreground">
            {file.originalName || file.name}
          </span>

          <span className="flex items-center gap-2 text-[0.6rem] font-bold text-muted-foreground">
            <HardDrive className="size-3" />
            {formatBytes(file.size)}
            <span className="text-foreground/10 dark:text-white/10">|</span>
            <CalendarClock className="size-3" />
            {faDateTime(file.createdAt)}
          </span>

          <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            <span
              className={cn(
                "inline-flex select-none items-center gap-1 rounded-full border px-2 py-0.5 text-[0.55rem] font-black",
                section?.badge ?? "border-foreground/15 bg-foreground/[0.05] text-muted-foreground"
              )}
            >
              {sectionLabel(file.section)}
            </span>
            <span className="inline-flex select-none items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-[0.55rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
              <UserRound className="size-3" />
              {file.uploader || "نامشخص"}
            </span>
          </span>
        </span>
      </button>

      {/* چک‌باکس انتخاب برای حذف تکی/دسته‌جمعی — خواهرِ دکمه‌ی کارت تا
          HTML تو‌درتوی تعاملی نامعتبر نشود (label + input مخفی) */}
      <label
        htmlFor={`gallery-select-${file.id}`}
        title={selected ? "لغو انتخاب" : "انتخاب برای حذف"}
        className={cn(
          "absolute top-2.5 end-2.5 z-20 flex size-7 cursor-pointer items-center justify-center rounded-xl border shadow-sm backdrop-blur transition-all",
          selected
            ? "border-teal-500/70 bg-teal-500/90 text-white dark:border-teal-400/70 dark:bg-teal-400/90 dark:text-teal-950"
            : "border-foreground/25 bg-background/90 text-transparent hover:border-teal-500/60 hover:text-teal-500/40 dark:border-white/30 dark:bg-black/70"
        )}
      >
        <input
          id={`gallery-select-${file.id}`}
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`انتخاب فایل ${file.originalName || file.name}`}
          className="sr-only"
        />
        <Check className="size-4" strokeWidth={3} />
      </label>
    </div>
  );
}

/** پیش‌نمایش بزرگ دیالوگ جزئیات — پخش‌کننده‌ی ویدئو/صوت یا تصویر */
function FilePreviewLarge({ file }: { file: GalleryFile }) {
  if (file.category === "image") {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-foreground/[0.02] dark:bg-white/[0.02]">
        <img
          src={file.url}
          alt={file.originalName || file.name}
          className="mx-auto max-h-[50vh] w-full object-contain"
        />
      </div>
    );
  }
  if (file.category === "video") {
    return (
      <video
        src={file.url}
        controls
        preload="metadata"
        className="w-full rounded-2xl border border-border bg-black"
      />
    );
  }
  if (file.category === "audio") {
    return (
      <audio src={file.url} controls preload="metadata" className="w-full" />
    );
  }
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-foreground/[0.02] py-10 text-muted-foreground dark:bg-white/[0.02]">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400/20 to-emerald-600/20">
        <CategoryIcon category={file.category} />
      </span>
      <p className="text-xs font-bold">
        پیش‌نمایش این نوع فایل در مرورگر ممکن نیست — با «دانلود» مشاهده کنید.
      </p>
    </div>
  );
}

/** ردیف فراداده — آیکون + برچسب + مقدار */
function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-foreground/[0.02] px-3.5 py-2.5 dark:bg-white/[0.02]">
      <span className="flex shrink-0 select-none items-center gap-1.5 text-[0.7rem] font-bold text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="min-w-0 truncate text-sm font-bold text-foreground">{children}</span>
    </div>
  );
}
