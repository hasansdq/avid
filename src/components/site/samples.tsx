"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeft,
  Eye,
  FileQuestion,
  FileText,
  Film,
  GraduationCap,
  Image as ImageIcon,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";
import type {
  SampleQuestion,
  SampleQuestionCategory,
  UploadedFile,
} from "@prisma/client";
import {
  getSampleQuestionIcon,
  getSampleQuestionTheme,
} from "@/lib/sample-questions";
import { faDigits } from "@/lib/fa";
import { SectionHeading, Reveal } from "@/components/reveal";
import { EditableText } from "@/components/site/editable-texts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Samples — بخش «نمونه سوالات» صفحه‌ی اول (id="samples").
 *
 * از نسخه‌ی جدید، این بخش «پیش‌نمایش فشرده» است: کارت‌های مربعی دسته‌ها با
 * پس‌زمینه‌ی موضوعی به صفحه‌ی اختصاصی /samples لینک می‌شوند (نمای تفصیلی و
 * لیست کامل نمونه سوال‌ها آنجاست) + دکمه‌ی «مشاهده همه نمونه سوالات».
 *
 * منبع داده:
 *  ۱) دسته‌های منتشرشده‌ی SampleQuestionCategory همراه نمونه‌سؤال‌های
 *     منتشرشده‌ی خودشان (فقط برای شمارنده‌ی هر کارت) — اولویت اول؛
 *  ۲) در نبودِ هر رکوردی، فایل‌های بارگذاریشده در بخش «نمونه سوالات» گالری
 *     (UploadedFile با section=sampleQuestions) نمایش داده می‌شوند — تا مدیر
 *     با همان جریان آپلود موجود بتواند این بخش را پر کند.
 *
 * تیتر و توضیح بخش با ویرایشگر مدادی قابل شخصی‌سازی هستند
 * (کلیدهای samples.title / samples.description — همان کلیدهای صفحه‌ی /samples).
 */

/** حجم فایل به فارسی — بایت/کیلوبایت/مگابایت */
function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${faDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${faDigits(Math.round(bytes / 1024))} کیلوبایت`;
  return `${faDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

/** آیکون و رنگ‌مایه بر اساس پسوند فایل */
function fileVisual(
  ext: string
): { icon: LucideIcon; chip: string; label: string } {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "pdf")
    return {
      icon: FileText,
      chip: "border-red-500/30 bg-red-500/10 text-red-600 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
      label: "PDF",
    };
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp"].includes(e))
    return {
      icon: ImageIcon,
      chip: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
      label: "تصویر",
    };
  if (["mp4", "webm", "mov", "mkv", "m4v", "ogv"].includes(e))
    return {
      icon: Film,
      chip: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
      label: "ویدئو",
    };
  if (["doc", "docx", "txt", "csv"].includes(e))
    return {
      icon: FileText,
      chip: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300",
      label: "سند",
    };
  if (["xls", "xlsx", "ppt", "pptx"].includes(e))
    return {
      icon: FileSpreadsheet,
      chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
      label: "فایل",
    };
  return {
    icon: FileQuestion,
    chip: "border-foreground/15 bg-foreground/[0.05] text-muted-foreground dark:border-white/15 dark:bg-white/[0.05]",
    label: e ? e.toUpperCase() : "فایل",
  };
}

/** یک نمونه‌سؤال گالری — کارت با آیکون فرمت، عنوان و دکمه‌های مشاهده/دانلود */
function SampleItemCard({
  title,
  fileUrl,
  ext,
  size,
}: {
  title: string;
  fileUrl: string;
  ext: string;
  size?: number;
}) {
  const visual = fileVisual(ext);
  const VisualIcon = visual.icon;
  const hasFile = Boolean(fileUrl.trim());

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.02] p-3.5 transition-colors hover:border-teal-500/25 hover:bg-teal-500/[0.04] dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-teal-400/20 dark:hover:bg-teal-400/[0.04]">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl border",
          visual.chip
        )}
        aria-hidden
      >
        <VisualIcon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="truncate text-sm font-black text-foreground">
            {title}
          </p>
          <span className={cn("select-none rounded-full border px-2 py-0.5 text-[0.6rem] font-bold", visual.chip)}>
            {visual.label}
          </span>
          {size && size > 0 ? (
            <span className="select-none text-[0.6rem] font-semibold text-muted-foreground">
              {formatFileSize(size)}
            </span>
          ) : null}
        </div>

        {hasFile ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-8 rounded-lg border-teal-500/30 bg-teal-500/[0.08] px-3 text-[0.65rem] font-black text-teal-700 transition-all hover:bg-teal-500/[0.15] dark:border-teal-400/30 dark:bg-teal-400/[0.1] dark:text-teal-300"
            >
              <a
                href={fileUrl}
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
              <a href={fileUrl} download aria-label={`دانلود ${title}`}>
                <ArrowDownToLine className="size-3.5" />
                دانلود
              </a>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** کارت مربعی دسته — لینک به نمای تفصیلی همان دسته در /samples */
function CategorySquareCard({
  cat,
}: {
  cat: SampleQuestionCategory & { items: SampleQuestion[] };
}) {
  const Icon = getSampleQuestionIcon(cat.icon);
  const theme = getSampleQuestionTheme(cat.icon);

  return (
    <Link
      href={`/samples?cat=${encodeURIComponent(cat.id)}`}
      aria-label={`نمونه سوالات دسته ${cat.title}`}
      className={cn(
        "group relative aspect-square w-full overflow-hidden rounded-xl bg-gradient-to-br shadow-md shadow-black/[0.08] ring-1 ring-white/15 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:shadow-lg hover:ring-2",
        theme.gradient,
        theme.ring
      )}
    >
      {/* الگوی تزئینی — حباب‌های شعاعی کم‌رنگ */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        <span className="absolute -top-6 -left-6 size-16 rounded-full bg-white/[0.16] blur-lg" />
        <span className="absolute -bottom-6 -right-4 size-18 rounded-full bg-black/[0.12] blur-xl" />
      </span>

      <span className="relative flex h-full flex-col items-center justify-center gap-1 p-1.5 text-center sm:gap-1.5 sm:p-2">
        <Icon
          className="size-7 text-white drop-shadow-md sm:size-8 md:size-10"
          strokeWidth={2.1}
        />
        <span className="line-clamp-2 text-[0.65rem] font-black leading-4 text-white drop-shadow-sm sm:text-xs md:text-sm">
          {cat.title}
        </span>
        <span className="text-[0.55rem] font-bold text-white/80 sm:text-[0.6rem]">
          {faDigits(cat.items.length)} نمونه سوال
        </span>
      </span>
    </Link>
  );
}

export function Samples({
  categories,
  files,
}: {
  /** دسته‌های منتشرشده همراه آیتم‌های خودشان (برای شمارنده‌ی هر کارت) */
  categories: (SampleQuestionCategory & {
    items: SampleQuestion[];
  })[];
  /** فایل‌های گالری بخش «نمونه سوالات» — فقط وقتی هیچ رکوردی نبود */
  files: UploadedFile[];
}) {
  const hasRecords = categories.length > 0;
  const useFilesFallback = !hasRecords && files.length > 0;
  const isEmpty = !hasRecords && files.length === 0;

  return (
    <section id="samples" className="relative scroll-mt-28 py-12 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-1/4 -z-[1] mx-auto h-72 max-w-3xl rounded-full bg-orange-500/[0.06] blur-[120px]" />

      <div className="mx-auto max-w-7xl px-4">
        <SectionHeading
          icon={FileQuestion}
          badge="نمونه سوالات"
          title={
            <EditableText k="samples.title">
              <>
                نمونه سوالات را{" "}
                <span className="text-gradient">بررسی کنید</span>
              </>
            </EditableText>
          }
          description={
            <EditableText k="samples.description">
              نمونه سوالات دوره‌ها به‌صورت رایگان در اختیار شماست؛ فایل‌ها را
              مشاهده یا دانلود کنید تا سطح آزمون‌ها را از قبل بشناسید.
            </EditableText>
          }
        />

        {/* — حالت خالی کامل: نه رکورد، نه فایل — */}
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

        {/* — پیش‌نمایش فشرده: کارت‌های مربعی دسته‌ها → صفحه‌ی /samples — */}
        {hasRecords ? (
          <>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {categories.map((cat, ci) => (
                <Reveal key={cat.id} delay={Math.min(ci * 0.04, 0.4)}>
                  <CategorySquareCard cat={cat} />
                </Reveal>
              ))}
            </div>

            <Reveal className="mt-10 text-center">
              <Button
                asChild
                className="h-12 rounded-xl bg-gradient-to-l from-orange-400 to-amber-500 px-7 text-sm font-black text-orange-950 shadow-lg shadow-orange-500/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-orange-500/30"
              >
                <Link href="/samples">
                  <FileQuestion className="size-4" />
                  مشاهده همه نمونه سوالات
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
            </Reveal>
          </>
        ) : null}

        {/* — مسیر جایگزین: فایل‌های بارگذاریشده در گالری «نمونه سوالات» — */}
        {useFilesFallback ? (
          <Reveal>
            <div className="glass mx-auto max-w-3xl space-y-3 rounded-3xl p-6 shadow-xl shadow-black/[0.04] dark:shadow-black/20">
              <div className="flex items-center gap-3 border-b border-foreground/[0.07] pb-4 dark:border-white/[0.07]">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 shadow-lg shadow-orange-500/25">
                  <FileQuestion className="size-6 text-white" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-foreground">
                    نمونه سوالات بارگذاری‌شده
                  </h3>
                  <p className="text-[0.65rem] font-semibold text-muted-foreground">
                    {faDigits(files.length)} فایل
                  </p>
                </div>
              </div>
              <ul className="space-y-2.5">
                {files.map((f) => (
                  <li key={f.id}>
                    <SampleItemCard
                      title={f.originalName || f.name}
                      ext={f.ext}
                      fileUrl={f.url}
                      size={f.size}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
