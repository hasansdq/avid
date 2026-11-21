"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Eye,
  FileQuestion,
  FileText,
  Film,
  GraduationCap,
  Image as ImageIcon,
  Search,
  SearchX,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  SampleQuestion,
  SampleQuestionCategory,
  SiteSettings,
  UploadedFile,
} from "@prisma/client";
import { cn } from "@/lib/utils";
import { faDigits } from "@/lib/fa";
import {
  SAMPLE_QUESTION_KIND_INFO,
  getSampleQuestionIcon,
  getSampleQuestionTheme,
  sampleQuestionKindOfExt,
} from "@/lib/sample-questions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/admin/shared/logo-mark";
import { EditableText } from "@/components/site/editable-texts";
import { Reveal } from "@/components/reveal";

/**
 * SamplesPage — صفحه‌ی مستقل «نمونه سوالات» (/samples).
 *
 * ساختار:
 *  • گرید کارت‌های مربعی دسته‌ها — هر دسته پس‌زمینه‌ی گرادیانیِ مرتبط با
 *    موضوعش (SAMPLE_CATEGORY_THEMES) دارد؛ کلیک → نمای تفصیلی دسته.
 *  • نمای تفصیلی (?cat=<id>): سربرگ دسته + کارت نمونه سوال‌ها
 *    (تصویر: پیش‌نمایش + لایت‌باکس / PDF: مشاهده در تب جدید / ویدئو: پخش
 *    درجای خود) + دانلود + شمارنده‌ی بازدید (POST /api/sample-questions/view).
 *  • جستجو در همه‌ی نمونه سوال‌ها با نمایش دسته‌ی هر نتیجه.
 *  • در نبود دسته/رکورد: فایل‌های گالری «نمونه سوالات» (مسیر جایگزین مدیر)
 *    و در نبود آن هم، حالت خالی با CTA به /register.
 *
 * تیتر/توضیح با کلیدهای samples.title / samples.description (همان
 * کلیدهای بخش صفحه‌ی اول) قابل ویرایش است — ویرایش مدیر روی هر دو اعمال می‌شود.
 */

/** دسته + آیتم‌های منتشرشده‌ی خودش (شکل کوئری صفحه‌ی اول) */
type CategoryWithItems = SampleQuestionCategory & {
  items: SampleQuestion[];
};

/** حجم فایل به فارسی — بایت/کیلوبایت/مگابایت */
function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${faDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${faDigits(Math.round(bytes / 1024))} کیلوبایت`;
  return `${faDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

/** ثبت بازدید — fire-and-forget (شکستش اهمیتی ندارد) */
function countView(id: string): void {
  void fetch("/api/sample-questions/view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }).catch(() => undefined);
}

/** جستجوی فارسی — حروف کوچک + حذف فاصله‌های اضافی */
function matchesQuery(item: SampleQuestion, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return false;
  return (
    item.title.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q)
  );
}

/** آیکون هر نوع فایل */
const KIND_ICONS: Record<string, LucideIcon> = {
  image: ImageIcon,
  pdf: FileText,
  video: Film,
  other: FileQuestion,
};

/* ————————————————— کارت مربعی دسته‌بندی ————————————————— */

function CategoryCard({
  cat,
  onOpen,
}: {
  cat: CategoryWithItems;
  onOpen: (id: string) => void;
}) {
  const Icon = getSampleQuestionIcon(cat.icon);
  const theme = getSampleQuestionTheme(cat.icon);

  return (
    <button
      type="button"
      onClick={() => onOpen(cat.id)}
      aria-label={`دیدن نمونه سوالات دسته ${cat.title}`}
      className={cn(
        "group relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br shadow-lg shadow-black/[0.10] ring-1 ring-white/15 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl hover:ring-2",
        theme.gradient,
        theme.ring,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {/* الگوی تزئینی — حباب‌های شعاعی کم‌رنگ */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        <span className="absolute -top-7 -left-7 size-20 rounded-full bg-white/[0.16] blur-xl" />
        <span className="absolute -bottom-8 -right-5 size-24 rounded-full bg-black/[0.14] blur-2xl" />
        <span className="absolute inset-x-5 bottom-4 h-px bg-white/25" />
        <span className="absolute right-4 top-4 size-1.5 rounded-full bg-white/40" />
        <span className="absolute right-7 top-7 size-1 rounded-full bg-white/30" />
      </span>

      <span className="relative flex h-full flex-col items-center justify-center gap-1.5 p-2 text-center sm:gap-2 sm:p-3">
        <Icon
          className="size-9 text-white drop-shadow-md sm:size-10 md:size-12"
          strokeWidth={2.1}
        />
        <span className="line-clamp-2 text-xs font-black leading-5 text-white drop-shadow-sm sm:text-sm md:text-base">
          {cat.title}
        </span>
        <span className="text-[0.6rem] font-bold text-white/80 sm:text-[0.65rem]">
          {faDigits(cat.items.length)} نمونه سوال
        </span>
      </span>
    </button>
  );
}

/* ————————————————— کارت یک نمونه سوال ————————————————— */

function ItemCard({
  item,
  categoryTitle,
  onOpenImage,
}: {
  item: SampleQuestion;
  categoryTitle?: string;
  onOpenImage: (item: SampleQuestion) => void;
}) {
  const kind = sampleQuestionKindOfExt(item.ext);
  const info = SAMPLE_QUESTION_KIND_INFO[kind];
  const KindIcon = KIND_ICONS[kind] ?? FileQuestion;
  const hasFile = Boolean(item.fileUrl.trim());

  return (
    <article className="glass group flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/[0.06] dark:hover:shadow-black/25">
      {/* پیش‌نمایش متناسب با فرمت */}
      <div className="relative">
        {kind === "image" && hasFile ? (
          <button
            type="button"
            onClick={() => {
              countView(item.id);
              onOpenImage(item);
            }}
            aria-label={`بزرگ‌نمایی ${item.title}`}
            className="relative block aspect-[4/3] w-full overflow-hidden bg-foreground/[0.04]"
          >
            <Image
              src={item.fileUrl}
              alt={item.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ) : kind === "video" && hasFile ? (
          <video
            controls
            preload="metadata"
            src={item.fileUrl}
            onPlay={() => countView(item.id)}
            aria-label={`پخش ${item.title}`}
            className="aspect-video w-full bg-black/[0.06] dark:bg-black/40"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!hasFile) return;
              countView(item.id);
              window.open(item.fileUrl, "_blank", "noopener,noreferrer");
            }}
            disabled={!hasFile}
            aria-label={hasFile ? `مشاهده ${item.title}` : item.title}
            className="relative flex aspect-[4/3] w-full items-center justify-center border-b border-foreground/[0.07] bg-gradient-to-br from-foreground/[0.05] to-foreground/[0.02] dark:border-white/[0.07] dark:from-white/[0.05] dark:to-white/[0.02]"
          >
            <KindIcon
              className="size-12 text-foreground/25 dark:text-white/25"
              strokeWidth={1.8}
            />
            <span className="absolute bottom-3 right-3 select-none rounded-full border border-foreground/15 bg-background/80 px-2.5 py-1 text-[0.6rem] font-black text-foreground/70 backdrop-blur-sm dark:border-white/15 dark:bg-black/40 dark:text-white/70">
              {info.label}
            </span>
          </button>
        )}
      </div>

      {/* بدنه‌ی کارت */}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="line-clamp-1 text-sm font-black text-foreground">
            {item.title}
          </h3>
          <span
            className={cn(
              "select-none rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
              info.badge
            )}
          >
            {info.label}
          </span>
          {categoryTitle ? (
            <span className="select-none rounded-full border border-teal-600/20 bg-teal-500/[0.07] px-2 py-0.5 text-[0.6rem] font-bold text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/[0.08] dark:text-teal-300">
              {categoryTitle}
            </span>
          ) : null}
        </div>

        {item.description ? (
          <p className="line-clamp-2 text-xs leading-6 text-muted-foreground">
            {item.description}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-foreground/[0.07] pt-3 text-[0.65rem] font-semibold text-muted-foreground dark:border-white/[0.07]">
          {item.size > 0 ? (
            <span className="flex items-center gap-1">
              <ArrowDownToLine className="size-3" />
              {formatFileSize(item.size)}
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            <Eye className="size-3" />
            {faDigits(item.views)} بازدید
          </span>

          <span className="ms-auto flex items-center gap-1.5">
            {kind !== "video" && kind !== "image" && hasFile ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-7 rounded-lg border-teal-500/30 bg-teal-500/[0.08] px-2.5 text-[0.6rem] font-black text-teal-700 hover:bg-teal-500/[0.15] dark:border-teal-400/30 dark:bg-teal-400/[0.1] dark:text-teal-300"
              >
                <a
                  href={item.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`مشاهده ${item.title}`}
                >
                  <Eye className="size-3" />
                  مشاهده
                </a>
              </Button>
            ) : null}
            {hasFile ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-7 rounded-lg border-foreground/15 bg-foreground/[0.04] px-2.5 text-[0.6rem] font-black text-foreground hover:bg-foreground/[0.08] dark:border-white/15 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
              >
                <a href={item.fileUrl} download aria-label={`دانلود ${item.title}`}>
                  <ArrowDownToLine className="size-3" />
                  دانلود
                </a>
              </Button>
            ) : null}
          </span>
        </div>
      </div>
    </article>
  );
}

/* ————————————————— فایل گالری (مسیر جایگزین بدون دسته) ————————————————— */

function GalleryFileCard({ file }: { file: UploadedFile }) {
  const kind = sampleQuestionKindOfExt(file.ext);
  const info = SAMPLE_QUESTION_KIND_INFO[kind];
  const KindIcon = KIND_ICONS[kind] ?? FileQuestion;
  const title = file.originalName || file.name;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.02] p-3.5 transition-colors hover:border-teal-500/25 hover:bg-teal-500/[0.04] dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-teal-400/20 dark:hover:bg-teal-400/[0.04]">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl border",
          info.badge
        )}
        aria-hidden
      >
        <KindIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="truncate text-sm font-black text-foreground">{title}</p>
          <span
            className={cn(
              "select-none rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
              info.badge
            )}
          >
            {info.label}
          </span>
          {file.size > 0 ? (
            <span className="select-none text-[0.6rem] font-semibold text-muted-foreground">
              {formatFileSize(file.size)}
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 rounded-lg border-teal-500/30 bg-teal-500/[0.08] px-3 text-[0.65rem] font-black text-teal-700 transition-all hover:bg-teal-500/[0.15] dark:border-teal-400/30 dark:bg-teal-400/[0.1] dark:text-teal-300"
          >
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`مشاهده ${title}`}
            >
              <Eye className="size-3.5" />
              مشاهده
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 rounded-lg border-foreground/15 bg-foreground/[0.04] px-3 text-[0.65rem] font-black text-foreground transition-colors hover:bg-foreground/[0.08] dark:border-white/15 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
          >
            <a href={file.url} download aria-label={`دانلود ${title}`}>
              <ArrowDownToLine className="size-3.5" />
              دانلود
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ————————————————— صفحه‌ی اصلی ————————————————— */

export function SamplesPage({
  settings,
  fontFamily,
  categories,
  files,
}: {
  settings: SiteSettings;
  fontFamily?: string;
  categories: CategoryWithItems[];
  files: UploadedFile[];
}) {
  const [activeCatId, setActiveCatId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [lightbox, setLightbox] = React.useState<SampleQuestion | null>(null);

  // خواندن ?cat= در اولین mount (deep-link) — بعد از هیدریشن تا مغایرت پیش نیاید
  React.useEffect(() => {
    const cat = new URLSearchParams(window.location.search).get("cat");
    if (cat && categories.some((c) => c.id === cat)) {
      setActiveCatId(cat);
    }
  }, [categories]);

  // انتخاب/بستن دسته + همگام‌سازی آدرس با replaceState برای اشتراک‌گذاری لینک
  function selectCategory(id: string | null): void {
    setActiveCatId(id);
    const url = id ? `/samples?cat=${encodeURIComponent(id)}` : "/samples";
    window.history.replaceState(null, "", url);
  }

  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;
  const activeCat =
    categories.find((c) => c.id === activeCatId) ?? null;

  // جستجو در همه‌ی آیتم‌ها (عنوان/توضیح) — با عنوان دسته برای چیپ نتیجه
  const searchMatches: { item: SampleQuestion; categoryTitle: string }[] =
    searching
      ? categories.flatMap((cat) =>
          cat.items
            .filter((item) => matchesQuery(item, trimmedQuery))
            .map((item) => ({ item, categoryTitle: cat.title }))
        )
      : [];

  const hasRecords = categories.length > 0;
  const useFilesFallback = !hasRecords && files.length > 0;
  const isEmpty = !hasRecords && files.length === 0;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background">
      {/* پس‌زمینه‌ی تزئینی نرم — لهجه‌ی کهربایی/نارنجیِ بخش نمونه سوالات */}
      <div className="pointer-events-none absolute inset-0 -z-[1]">
        <div className="absolute -top-32 right-1/4 size-[26rem] rounded-full bg-orange-500/[0.08] blur-[130px] dark:bg-orange-400/[0.06]" />
        <div className="absolute bottom-0 left-1/4 size-[24rem] rounded-full bg-teal-500/[0.07] blur-[130px] dark:bg-teal-400/[0.05]" />
      </div>

      {/* هدر مینیمال */}
      <header className="px-4 pt-5">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] px-4 backdrop-blur-md md:px-6 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <Link href="/" className="flex items-center gap-3" aria-label="بازگشت به صفحه اصلی">
            <LogoMark className="size-11" iconClassName="size-5" />
            <span className="leading-tight">
              <span className="block text-lg font-black tracking-tight text-foreground">
                نمونه سوالات
              </span>
              <span className="block text-[0.65rem] font-medium text-muted-foreground">
                آکادمی {settings.siteName || "آوید"}
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              asChild
              variant="outline"
              className="hidden h-10 rounded-xl border-foreground/[0.12] bg-foreground/[0.04] px-4 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 sm:inline-flex dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
            >
              <Link href="/">
                <ArrowRight className="size-4" />
                بازگشت به سایت
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:pt-10 max-md:pb-36">
        {/* ————— سربرگ بخش (همان کلیدهای ویرایش مدادی صفحه‌ی اول) ————— */}
        <div className="mx-auto mb-8 max-w-2xl text-center md:mb-10">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
            <FileQuestion className="size-3.5" />
            نمونه سوالات
          </span>
          <h1
            className="mt-5 text-3xl font-black leading-[1.25] text-foreground md:text-[2.6rem] md:leading-[1.2]"
            style={fontFamily ? { fontFamily } : undefined}
          >
            <EditableText k="samples.title">
              <>
                نمونه سوالات را{" "}
                <span className="text-gradient">بررسی کنید</span>
              </>
            </EditableText>
          </h1>
          <p className="mt-4 text-sm leading-8 text-muted-foreground md:text-base md:leading-8">
            <EditableText k="samples.description">
              نمونه سوالات دوره‌ها به‌صورت رایگان در اختیار شماست؛ فایل‌ها را
              مشاهده یا دانلود کنید تا سطح آزمون‌ها را از قبل بشناسید.
            </EditableText>
          </p>
        </div>

        {hasRecords ? (
          <>
            {/* ————— جستجوی نمونه سوال ————— */}
            <div className="mx-auto mb-10 max-w-xl">
              <div className="glass relative flex items-center gap-2 rounded-2xl px-4 py-1.5 transition-shadow focus-within:shadow-lg focus-within:shadow-orange-500/10">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="جستجوی نمونه سوال…"
                  aria-label="جستجوی نمونه سوال"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="پاک کردن جستجو"
                    title="پاک کردن جستجو"
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            {/* ————— نتایج جستجو ————— */}
            {searching ? (
              <section aria-label="نتایج جستجوی نمونه سوال">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Search className="size-5 text-orange-600 dark:text-orange-300" />
                    <h2 className="text-base font-black text-foreground">
                      نتایج جستجو
                    </h2>
                  </div>
                  <span className="rounded-full bg-orange-500/10 px-3 py-1 text-[0.65rem] font-bold text-orange-700 dark:bg-orange-400/10 dark:text-orange-300">
                    {faDigits(searchMatches.length)} نمونه سوال
                  </span>
                </div>

                {searchMatches.length === 0 ? (
                  <div className="glass mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl px-6 py-16 text-center">
                    <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
                      <SearchX className="size-8 text-white" />
                    </span>
                    <p className="text-sm font-black text-foreground">
                      نتیجه‌ای برای «{trimmedQuery}» یافت نشد
                    </p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      عبارت دیگری را امتحان کنید یا دسته‌ها را مرور کنید.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setQuery("")}
                      className="rounded-xl border-foreground/[0.12] bg-foreground/[0.04] text-sm font-bold text-foreground transition-colors hover:border-orange-500/40 hover:text-orange-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-orange-400/40 dark:hover:text-orange-200"
                    >
                      <X className="size-4" />
                      پاک کردن جستجو
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {searchMatches.map(({ item, categoryTitle }) => (
                      <Reveal key={item.id}>
                        <ItemCard
                          item={item}
                          categoryTitle={categoryTitle}
                          onOpenImage={setLightbox}
                        />
                      </Reveal>
                    ))}
                  </div>
                )}
              </section>
            ) : activeCat ? (
              /* ————— نمای تفصیلی یک دسته ————— */
              <section aria-label={`نمونه سوالات ${activeCat.title}`}>
                <Reveal className="mb-8">
                  <div className="glass flex flex-col items-start gap-4 rounded-3xl p-5 sm:flex-row sm:items-center sm:p-6">
                    <span
                      className={cn(
                        "flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg",
                        getSampleQuestionTheme(activeCat.icon).gradient
                      )}
                      aria-hidden
                    >
                      {React.createElement(getSampleQuestionIcon(activeCat.icon), {
                        className: "size-7 text-white",
                        strokeWidth: 2.2,
                      })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-black text-foreground sm:text-2xl">
                        {activeCat.title}
                      </h2>
                      {activeCat.description ? (
                        <p className="mt-1.5 text-xs leading-6 text-muted-foreground sm:text-sm">
                          {activeCat.description}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[0.65rem] font-bold text-muted-foreground">
                        {faDigits(activeCat.items.length)} نمونه سوال در این دسته
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => selectCategory(null)}
                      className="h-10 shrink-0 rounded-xl border-foreground/[0.12] bg-foreground/[0.04] px-4 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
                    >
                      <ArrowRight className="size-4" />
                      همه دسته‌ها
                    </Button>
                  </div>
                </Reveal>

                {activeCat.items.length === 0 ? (
                  <div className="glass mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl px-6 py-16 text-center">
                    <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
                      <FileQuestion className="size-8 text-white" />
                    </span>
                    <p className="text-sm font-black text-foreground">
                      به‌زودی نمونه سوال این دسته اضافه می‌شود.
                    </p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      در همین حین دسته‌های دیگر را بررسی کنید.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => selectCategory(null)}
                      className="rounded-xl border-foreground/[0.12] bg-foreground/[0.04] text-sm font-bold text-foreground transition-colors hover:border-orange-500/40 hover:text-orange-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-orange-400/40 dark:hover:text-orange-200"
                    >
                      <ArrowRight className="size-4" />
                      بازگشت به دسته‌ها
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {activeCat.items.map((item) => (
                      <Reveal key={item.id}>
                        <ItemCard item={item} onOpenImage={setLightbox} />
                      </Reveal>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              /* ————— گرید کارت‌های دسته‌بندی ————— */
              <section aria-label="دسته‌بندی‌های نمونه سوالات">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {categories.map((cat, ci) => (
                    <Reveal key={cat.id} delay={Math.min(ci * 0.04, 0.4)}>
                      <CategoryCard
                        cat={cat}
                        onOpen={(id) => selectCategory(id)}
                      />
                    </Reveal>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}

        {/* ————— مسیر جایگزین: فایل‌های گالری «نمونه سوالات» ————— */}
        {useFilesFallback ? (
          <Reveal>
            <div className="glass mx-auto max-w-3xl space-y-3 rounded-3xl p-6 shadow-xl shadow-black/[0.04] dark:shadow-black/20">
              <div className="flex items-center gap-3 border-b border-foreground/[0.07] pb-4 dark:border-white/[0.07]">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 shadow-lg shadow-orange-500/25">
                  <FileQuestion className="size-6 text-white" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-black text-foreground">
                    نمونه سوالات بارگذاری‌شده
                  </h2>
                  <p className="text-[0.65rem] font-semibold text-muted-foreground">
                    {faDigits(files.length)} فایل
                  </p>
                </div>
              </div>
              <ul className="space-y-2.5">
                {files.map((f) => (
                  <li key={f.id}>
                    <GalleryFileCard file={f} />
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ) : null}

        {/* ————— حالت خالی کامل ————— */}
        {isEmpty ? (
          <Reveal>
            <div className="glass mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl px-6 py-16 text-center">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 shadow-lg shadow-orange-500/25">
                <FileQuestion className="size-8 text-white" />
              </span>
              <p className="text-sm font-black text-foreground">
                به‌زودی نمونه سوالات اضافه می‌شود.
              </p>
              <p className="text-xs leading-6 text-muted-foreground">
                در همین حین می‌توانید دوره‌های آکادمی را بررسی کنید و مسیر
                یادگیری خود را انتخاب نمایید.
              </p>
              <Button
                asChild
                className="h-11 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01]"
              >
                <Link href="/register">
                  <GraduationCap className="size-4" />
                  مشاهده‌ی دوره‌ها
                </Link>
              </Button>
            </div>
          </Reveal>
        ) : null}
      </main>

      {/* ————— لایت‌باکس تصویر نمونه سوال ————— */}
      <Dialog
        open={Boolean(lightbox)}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[90vh] gap-0 overflow-y-auto rounded-3xl border-border bg-popover p-0 sm:max-w-4xl dark:border-white/10"
        >
          {lightbox ? (
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-3 bg-black/[0.03] px-4 py-3 dark:bg-white/[0.03]">
                <DialogTitle className="min-w-0 truncate text-right text-sm font-black text-foreground">
                  {lightbox.title}
                </DialogTitle>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 rounded-lg border-foreground/15 bg-foreground/[0.04] px-3 text-[0.65rem] font-black text-foreground hover:bg-foreground/[0.08] dark:border-white/15 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                >
                  <a
                    href={lightbox.fileUrl}
                    download
                    aria-label={`دانلود ${lightbox.title}`}
                  >
                    <ArrowDownToLine className="size-3.5" />
                    دانلود
                  </a>
                </Button>
              </div>
              <div className="flex items-center justify-center bg-foreground/[0.03] p-3 dark:bg-black/30">
                <img
                  src={lightbox.fileUrl}
                  alt={lightbox.title}
                  className="max-h-[72vh] w-auto max-w-full rounded-xl"
                />
              </div>
              {lightbox.description ? (
                <DialogDescription className="px-4 py-3 text-right text-xs leading-6 text-muted-foreground">
                  {lightbox.description}
                </DialogDescription>
              ) : (
                <DialogDescription className="sr-only">
                  نمایش تصویر نمونه سوال {lightbox.title}
                </DialogDescription>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* فوتر مینیمال — با فاصله‌ی امن تا منوی موبایلیِ پایین صفحه */}
      <footer className="mt-auto border-t border-foreground/[0.06] py-6 text-center md:mb-0 dark:border-white/[0.06] max-md:mb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]">
        <p className="text-xs font-bold text-muted-foreground">
          آکادمی {settings.siteName || "آوید"} — دسترسی آزاد به آموزش
        </p>
      </footer>
    </div>
  );
}
