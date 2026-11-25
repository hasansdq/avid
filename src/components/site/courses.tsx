"use client";

import * as React from "react";
import Image from "next/image";
import {
  Clock,
  Users,
  User,
  Armchair,
  CalendarDays,
  ArrowLeft,
  Layers,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Course } from "@prisma/client";
import {
  COURSE_TYPES,
  getCourseIcon,
  getCourseTheme,
  isCourseType,
  type CourseType,
} from "@/lib/course-theme";
import { faDigits, scrollToSection } from "@/lib/fa";
import { useEnrollStore } from "@/lib/store";
import type { PublicAvailabilityMap } from "@/lib/availability";
import { SectionHeading, Reveal } from "@/components/reveal";
import { EditableText, renderGradientText } from "@/components/site/editable-texts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CourseFilter = "all" | CourseType;

/** آیکون داینامیک رجیستری را بدون ساخت کامپوننت در رندر نمایش می‌دهد */
function RegistryIcon({
  Comp,
  className,
  strokeWidth,
}: {
  Comp: LucideIcon;
  className?: string;
  strokeWidth?: number;
}) {
  return <Comp className={className} strokeWidth={strokeWidth} />;
}

const FILTERS: { key: CourseFilter; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "online", label: "آنلاین" },
  { key: "inperson", label: "حضوری" },
  { key: "hybrid", label: "حضوری و آنلاین" },
];

function CourseCard({
  course,
  availability,
  onEnroll,
}: {
  course: Course;
  availability?: PublicAvailabilityMap;
  onEnroll: (title: string) => void;
}) {
  const theme = getCourseTheme(course.theme);
  const typeMeta = isCourseType(course.type)
    ? COURSE_TYPES[course.type]
    : COURSE_TYPES.online;
  const TypeIcon = typeMeta.icon;

  // وضعیت ظرفیت — فقط پرچمِ «تکمیل» برای قفل‌کردن کارت؛ اعداد باقیمانده به کاربر نمایش داده نمی‌شوند
  const avail = availability?.[course.title];
  const full = avail?.full ?? false;

  // تصویر جلد دوره — طرح جدید کارت‌ها بر پایه‌ی تصویر است؛
  // در نبود/خرابی تصویر، هدر گرادیانی با آیکون به عنوان جایگزین امن رندر می‌شود
  const [imageFailed, setImageFailed] = React.useState(false);
  const showImage = Boolean(course.imageUrl?.trim()) && !imageFailed;

  return (
    <article
      className={cn(
        "group glass relative flex h-full flex-col overflow-hidden rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:border-foreground/20 hover:shadow-2xl",
        theme.glow
      )}
    >
      {/* ————— سربرگ تصویری دوره ————— */}
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden">
        {showImage ? (
          <Image
            src={course.imageUrl}
            alt={`جلد دوره ${course.title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            onError={() => setImageFailed(true)}
          />
        ) : (
          /* جایگزین دفاعی — فقط وقتی تصویری ثبت نشده یا بارگذاریش شکست خورده باشد */
          <div
            className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${theme.tile}`}
          >
            <RegistryIcon
              Comp={getCourseIcon(course.icon)}
              className="size-16 text-white/90"
              strokeWidth={1.5}
            />
          </div>
        )}

        {/* گرادیان خوانایی — بالا و پایین تصویر */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.08) 34%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.22) 100%)",
          }}
        />

        {/* نشان نوع (آنلاین/حضوری) + برچسب ویژه — روی تصویر */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/45 px-2.5 py-1 text-[0.65rem] font-black text-white shadow-lg backdrop-blur-md">
            <TypeIcon className="size-3" />
            {typeMeta.label}
          </span>
          {course.tag ? (
            <span className="rounded-full bg-gradient-to-l from-violet-400 to-fuchsia-500 px-2.5 py-1 text-[0.6rem] font-black text-violet-950 shadow-lg shadow-violet-500/40">
              {course.tag}
            </span>
          ) : null}
        </div>

        {/* تعداد جلسه — چیپ شیشه‌ای پایین تصویر */}
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/45 px-2.5 py-1 text-[0.62rem] font-bold text-white shadow-lg backdrop-blur-md">
          <Layers className="size-3" />
          {faDigits(course.sessions)} جلسه {typeMeta.label}
        </span>
      </div>

      {/* ————— بدنه‌ی کارت ————— */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-black leading-7 text-foreground transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-300">
          {course.title}
        </h3>
        <p className="mt-2 text-xs leading-6 text-muted-foreground line-clamp-3">
          {course.description}
        </p>

        {/* meta chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.65rem] font-semibold text-muted-foreground">
          <span className="flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1">
            <Clock className="size-3 shrink-0 text-teal-600 dark:text-teal-300" />
            {faDigits(course.hours)} ساعت
          </span>
          {/* کارآموزان — عدد نمایشی دوره؛ فقط وقتی مقدار ثبت شده باشد
              (از فرم مدیر حذف شده؛ دوره‌های جدید بدون این چیپ هستند) */}
          {course.students > 0 ? (
            <span className="flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1">
              <Users className="size-3 shrink-0 text-teal-600 dark:text-teal-300" />
              {faDigits(course.students)} کارآموز
            </span>
          ) : null}
          <Badge
            variant="outline"
            className="rounded-full border-teal-600/25 bg-teal-500/10 px-2.5 py-1 text-[0.65rem] font-bold text-teal-700 hover:bg-teal-500/10 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300"
          >
            {course.level}
          </Badge>
          {course.instructor ? (
            <span className="flex max-w-full items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1">
              <User className="size-3 shrink-0 text-teal-600 dark:text-teal-300" />
              <span className="truncate">{course.instructor}</span>
            </span>
          ) : null}
          {/* ظرفیت — برای همه‌ی دوره‌ها (حضوری و آنلاین)؛ فقط ظرفیت کل/تکمیل، بدون باقیمانده */}
          {course.capacity > 0 ? (
            full ? (
              <span
                className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-black text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300"
                aria-label="ظرفیت این دوره تکمیل شده است"
              >
                <XCircle className="size-3 shrink-0" />
                ظرفیت تکمیل
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1 font-black text-muted-foreground">
                <Armchair className="size-3 shrink-0 text-teal-600 dark:text-teal-300" />
                ظرفیت: {faDigits(course.capacity)} نفر
              </span>
            )
          ) : null}
        </div>

        {/* زمان‌بندی (دوره‌های حضوری و ترکیبی) */}
        {course.type !== "online" && course.schedule ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-foreground/[0.07] bg-foreground/[0.03] px-3 py-2 text-[0.65rem] font-semibold text-muted-foreground dark:border-white/[0.07] dark:bg-white/[0.03]">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0 text-amber-500 dark:text-amber-300" />
              {course.schedule}
            </span>
          </div>
        ) : null}

        {/* فاصله‌ی انعطاف‌پذیر — فوتر را در کارت‌های هم‌قد به پایین می‌چسباند */}
        <div aria-hidden className="mt-5 flex-1" />

        {/* footer row */}
        <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.07] pt-4 dark:border-white/[0.07]">
          <div className="min-w-0">
            <span className="block text-[0.65rem] font-medium text-muted-foreground">
              شهریه‌ی نقدی دوره
            </span>
            {course.cashTuition === 0 ? (
              <Badge className="mt-1 rounded-full border border-emerald-600/25 bg-emerald-500/10 px-2.5 py-1 text-[0.65rem] font-black text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/10">
                رایگان
              </Badge>
            ) : (
              <span className="mt-1 block text-sm font-black text-foreground">
                {faDigits(course.cashTuition.toLocaleString("en-US"))}{" "}
                <span className="text-[0.6rem] font-medium text-muted-foreground">
                  تومان
                </span>
              </span>
            )}
          </div>
          <Button
            onClick={() => onEnroll(course.title)}
            disabled={full}
            size="sm"
            aria-disabled={full}
            className={cn(
              "h-10 shrink-0 rounded-xl px-5 text-xs font-black transition-all",
              full
                ? "cursor-not-allowed bg-red-500/10 text-red-600 hover:bg-red-500/10 dark:bg-red-400/10 dark:text-red-300 dark:hover:bg-red-400/10"
                : "bg-gradient-to-l from-teal-400 to-emerald-500 text-teal-950 shadow-lg shadow-teal-500/25 hover:shadow-teal-400/40 hover:brightness-105 dark:from-teal-300 dark:to-emerald-400"
            )}
          >
            {full ? (
              <>
                <XCircle className="size-3.5" />
                ظرفیت تکمیل
              </>
            ) : (
              <>
                ثبت‌نام
                <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function Courses({ courses }: { courses: Course[] }) {
  const setSelectedCourse = useEnrollStore((s) => s.setSelectedCourse);
  const [filter, setFilter] = React.useState<CourseFilter>("all");

  // وضعیت ظرفیت دوره‌ها — برای قفل‌کردن دوره‌های تکمیل‌شده روی کارت‌ها
  const [availability, setAvailability] =
    React.useState<PublicAvailabilityMap | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/enroll/availability")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data)
          setAvailability(data as PublicAvailabilityMap);
      })
      .catch(() => {
        // اطلاعات نمایشی است؛ اعمال نهایی با سرور انجام می‌شود
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnroll = (title: string) => {
    setSelectedCourse(title);
    scrollToSection("register");
  };

  const counts = React.useMemo(
    () => ({
      all: courses.length,
      online: courses.filter((c) => c.type === "online").length,
      inperson: courses.filter((c) => c.type === "inperson").length,
      hybrid: courses.filter((c) => c.type === "hybrid").length,
    }),
    [courses]
  );

  const filtered =
    filter === "all" ? courses : courses.filter((c) => c.type === filter);

  return (
    <section id="courses" className="relative scroll-mt-28 pt-6 pb-12 md:py-16">
      {/* section glow */}
      <div className="pointer-events-none absolute inset-x-0 top-1/4 -z-[1] mx-auto h-72 max-w-3xl rounded-full bg-teal-500/[0.06] blur-[120px]" />

      <div className="mx-auto max-w-7xl px-4">
        <SectionHeading
          icon={Layers}
          badge="دوره‌های آموزشی"
          title={
            <EditableText k="courses.title" renderText={renderGradientText}>
              <>
                مهارت خود را با دوره‌های{" "}
                <span className="text-gradient">حرفه‌ای</span> ارتقا دهید
              </>
            </EditableText>
          }
          description={
            <EditableText k="courses.description">
              از هوش مصنوعی تا کامپیوتر کودکان؛ هر دوره با پروژه‌های واقعی و
              پشتیبانی مربی طراحی شده است.
            </EditableText>
          }
        />

        {/* filter pills */}
        {courses.length > 0 ? (
          <Reveal className="mb-10 flex flex-wrap items-center justify-center gap-2">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  "rounded-full px-5 py-2.5 text-xs font-bold transition-all duration-300",
                  filter === key
                    ? "bg-gradient-to-l from-teal-400 to-emerald-500 text-teal-950 shadow-lg shadow-teal-500/25"
                    : "glass text-muted-foreground hover:text-teal-600 dark:hover:text-teal-300"
                )}
              >
                {label} ({faDigits(counts[key])})
              </button>
            ))}
          </Reveal>
        ) : null}

        {filtered.length === 0 ? (
          <Reveal>
            <div className="glass mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl px-6 py-16 text-center">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25">
                <Sparkles className="size-8 text-teal-950" />
              </span>
              <p className="text-sm font-black text-foreground">
                به‌زودی دوره‌های جدید اضافه می‌شود.
              </p>
              <p className="text-xs leading-6 text-muted-foreground">
                برای اطلاع از شروع ثبت‌نام دوره‌های بعدی، همین حالا پیش‌ثبت‌نام کنید.
              </p>
            </div>
          </Reveal>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((course, i) => (
              <Reveal key={course.id} delay={(i % 4) * 0.08} className="h-full">
                <CourseCard
                  course={course}
                  availability={availability ?? undefined}
                  onEnroll={handleEnroll}
                />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
