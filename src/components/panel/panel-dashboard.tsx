"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Award,
  Banknote,
  BookOpen,
  CalendarClock,
  Check,
  ClipboardCheck,
  CreditCard,
  FilePlus2,
  GraduationCap,
  Hourglass,
  IdCard,
  Inbox,
  Loader2,
  LogOut,
  Pencil,
  Phone,
  Radio,
  RotateCw,
  School,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { faDate, faDigits } from "@/lib/fa";
import {
  isValidNationalId,
  NATIONAL_ID_INVALID_MESSAGE,
  normalizeNationalId,
  toEnDigits,
} from "@/lib/national-id";
import {
  ENROLLMENT_STATUSES,
  isEnrollmentStatus,
} from "@/lib/course-theme";
import type {
  PanelAttendance,
  PanelEnrollment,
  PanelMe,
} from "@/components/panel/types";
import { ExamsSection } from "@/components/panel/panel-exams";
import { CertificatesSection } from "@/components/panel/panel-certificates";
import { StreamInviteBox } from "@/components/panel/panel-stream-invites";
import { TeacherCoursesSection } from "@/components/panel/teacher/teacher-courses";
import { TeacherClassesSection } from "@/components/panel/teacher/teacher-classes";
import { TeacherStreamsSection } from "@/components/panel/teacher/teacher-streams";
import { TeacherFinanceSection } from "@/components/panel/teacher/teacher-finance";
import { TeacherExamsSection } from "@/components/panel/teacher/teacher-exams";

/** ظاهر مشترک کارت‌های شیشه‌ای داشبورد — هماهنگ با صفحه‌ی ثبت‌نام */
const CARD =
  "rounded-2xl border border-foreground/[0.08] bg-card/85 p-4 shadow-xl shadow-black/[0.04] backdrop-blur-xl sm:p-6 dark:border-white/[0.08] dark:bg-[#08110e]/70 dark:shadow-black/20";

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/* ————————————————— نگاشت وضعیت‌ها ————————————————— */

/** وضعیت پرداخت ثبت‌نام (پیش‌ثبت‌نام) */
const PAYMENT_STATUSES: Record<
  string,
  { label: string; badge: string }
> = {
  pending: {
    label: "در انتظار پرداخت",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
  paid: {
    label: "پرداخت‌شده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  failed: {
    label: "ناموفق",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
};

/** روش پرداخت */
const PAYMENT_METHODS: Record<string, string> = {
  cash: "نقدی",
  installment: "اقساطی",
};

/** وضعیت قسط */
const INSTALLMENT_BADGES: Record<string, { label: string; badge: string }> = {
  paid: {
    label: "پرداخت‌شده",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  overdue: {
    label: "معوق",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
  pending: {
    label: "در انتظار پرداخت",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
};

/** نشان کوچک با_border ملایم — هم‌سبک نشان‌های دوره‌ها */
function Chip({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.65rem] font-black",
        className
      )}
    >
      {children}
    </span>
  );
}

/* ————————————————— بخش‌های داشبورد ————————————————— */

type SectionKey =
  | "courses"
  | "exams"
  | "certificates"
  | "payments"
  | "teacher-courses"
  | "teacher-classes"
  | "teacher-streams"
  | "teacher-finance"
  | "teacher-exams";

/** حالت پنل — فقط برای حساب استاد معنی دارد؛ دانشجو همیشه «دانشجو» است */
type PanelMode = "teacher" | "student";

/** کلید بخش‌های پایه — نمای «ورود به عنوان دانشجو» برای همه‌ی کاربران */
const BASE_SECTION_KEYS: SectionKey[] = [
  "courses",
  "exams",
  "certificates",
  "payments",
];

/** کلید بخش‌های استاد — نمای «ورود به عنوان استاد»؛ فقط با نقش teacher */
const TEACHER_SECTION_KEYS: SectionKey[] = [
  "teacher-courses",
  "teacher-classes",
  "teacher-streams",
  "teacher-finance",
  "teacher-exams",
];

/** بخش پیش‌فرض هر حالت — هنگام جابه‌جایی حالت پنل */
const MODE_DEFAULT_SECTION: Record<PanelMode, SectionKey> = {
  teacher: "teacher-courses",
  student: "courses",
};

/** کلید ذخیره‌ی آخرین حالت پنل استاد در localStorage */
const MODE_STORAGE_KEY = "avid_panel_mode";

/** آیا کلید بخش، بخشِ استاد است؟ (با پیشوند teacher-) */
function isTeacherSection(key: SectionKey): boolean {
  return key.startsWith("teacher-");
}

/** قالب کارت آماری نئونی — استروک رنگی + درخشش؛ رنگ هر بخش متمایز است */
const SECTIONS: Record<
  SectionKey,
  {
    label: string;
    icon: React.ComponentType<{
      className?: string;
      strokeWidth?: number;
    }>;
    idle: string;
    active: string;
  }
> = {
  courses: {
    label: "دوره‌ها",
    icon: GraduationCap,
    idle: "border-teal-500/60 bg-teal-500/[0.05] text-teal-700 shadow-[0_0_16px_rgba(20,184,166,0.20)] hover:shadow-[0_0_26px_rgba(20,184,166,0.35)] dark:border-teal-400/50 dark:text-teal-300",
    active:
      "border-teal-500 bg-teal-500/[0.10] text-teal-800 shadow-[0_0_28px_rgba(20,184,166,0.45)] dark:border-teal-300 dark:text-teal-200 dark:bg-teal-400/[0.12]",
  },
  exams: {
    label: "آزمون‌ها",
    icon: ClipboardCheck,
    idle: "border-violet-500/60 bg-violet-500/[0.05] text-violet-700 shadow-[0_0_16px_rgba(139,92,246,0.20)] hover:shadow-[0_0_26px_rgba(139,92,246,0.35)] dark:border-violet-400/50 dark:text-violet-300",
    active:
      "border-violet-500 bg-violet-500/[0.10] text-violet-800 shadow-[0_0_28px_rgba(139,92,246,0.45)] dark:border-violet-300 dark:text-violet-200 dark:bg-violet-400/[0.12]",
  },
  certificates: {
    label: "گواهینامه‌ها",
    icon: Award,
    idle: "border-amber-500/60 bg-amber-500/[0.05] text-amber-700 shadow-[0_0_16px_rgba(245,158,11,0.22)] hover:shadow-[0_0_26px_rgba(245,158,11,0.38)] dark:border-amber-400/50 dark:text-amber-300",
    active:
      "border-amber-500 bg-amber-500/[0.10] text-amber-800 shadow-[0_0_28px_rgba(245,158,11,0.48)] dark:border-amber-300 dark:text-amber-200 dark:bg-amber-400/[0.12]",
  },
  payments: {
    label: "پرداخت‌ها",
    icon: Wallet,
    idle: "border-rose-500/60 bg-rose-500/[0.05] text-rose-700 shadow-[0_0_16px_rgba(244,63,94,0.20)] hover:shadow-[0_0_26px_rgba(244,63,94,0.35)] dark:border-rose-400/50 dark:text-rose-300",
    active:
      "border-rose-500 bg-rose-500/[0.10] text-rose-800 shadow-[0_0_28px_rgba(244,63,94,0.45)] dark:border-rose-300 dark:text-rose-200 dark:bg-rose-400/[0.12]",
  },
  // — بخش‌های استاد (فقط با نقش teacher) —
  "teacher-courses": {
    label: "دوره‌های من",
    icon: BookOpen,
    idle: "border-teal-500/60 bg-teal-500/[0.05] text-teal-700 shadow-[0_0_16px_rgba(20,184,166,0.20)] hover:shadow-[0_0_26px_rgba(20,184,166,0.35)] dark:border-teal-400/50 dark:text-teal-300",
    active:
      "border-teal-500 bg-teal-500/[0.10] text-teal-800 shadow-[0_0_28px_rgba(20,184,166,0.45)] dark:border-teal-300 dark:text-teal-200 dark:bg-teal-400/[0.12]",
  },
  "teacher-classes": {
    label: "کلاس‌های من",
    icon: School,
    idle: "border-violet-500/60 bg-violet-500/[0.05] text-violet-700 shadow-[0_0_16px_rgba(139,92,246,0.20)] hover:shadow-[0_0_26px_rgba(139,92,246,0.35)] dark:border-violet-400/50 dark:text-violet-300",
    active:
      "border-violet-500 bg-violet-500/[0.10] text-violet-800 shadow-[0_0_28px_rgba(139,92,246,0.45)] dark:border-violet-300 dark:text-violet-200 dark:bg-violet-400/[0.12]",
  },
  "teacher-streams": {
    label: "استریم‌های من",
    icon: Radio,
    idle: "border-rose-500/60 bg-rose-500/[0.05] text-rose-700 shadow-[0_0_16px_rgba(244,63,94,0.20)] hover:shadow-[0_0_26px_rgba(244,63,94,0.35)] dark:border-rose-400/50 dark:text-rose-300",
    active:
      "border-rose-500 bg-rose-500/[0.10] text-rose-800 shadow-[0_0_28px_rgba(244,63,94,0.45)] dark:border-rose-300 dark:text-rose-200 dark:bg-rose-400/[0.12]",
  },
  "teacher-finance": {
    label: "مالی و درآمد",
    icon: Wallet,
    idle: "border-amber-500/60 bg-amber-500/[0.05] text-amber-700 shadow-[0_0_16px_rgba(245,158,11,0.22)] hover:shadow-[0_0_26px_rgba(245,158,11,0.38)] dark:border-amber-400/50 dark:text-amber-300",
    active:
      "border-amber-500 bg-amber-500/[0.10] text-amber-800 shadow-[0_0_28px_rgba(245,158,11,0.48)] dark:border-amber-300 dark:text-amber-200 dark:bg-amber-400/[0.12]",
  },
  "teacher-exams": {
    label: "ساخت آزمون",
    icon: FilePlus2,
    idle: "border-lime-600/60 bg-lime-500/[0.06] text-lime-700 shadow-[0_0_16px_rgba(132,204,22,0.22)] hover:shadow-[0_0_26px_rgba(132,204,22,0.38)] dark:border-lime-400/50 dark:text-lime-300",
    active:
      "border-lime-600 bg-lime-500/[0.12] text-lime-800 shadow-[0_0_28px_rgba(132,204,22,0.48)] dark:border-lime-300 dark:text-lime-200 dark:bg-lime-400/[0.14]",
  },
};

/** برچسب نمایشی هر بخش — در حساب استاد، دو کارت «دوره» با پرانتز تفکیک
 *  نقش درج می‌شوند تا معنایشان با کارت‌های دو حالت گمراه‌کننده نباشد:
 *  دوره‌ها(دانشجو) = دوره‌هایی که استاد خودش در آن‌ها ثبت‌نام کرده؛
 *  دوره‌ها(استاد) = دوره‌هایی که مالک/ مدرسشان خود استاد است. */
function sectionLabel(key: SectionKey, isTeacher: boolean): string {
  if (!isTeacher) return SECTIONS[key].label;
  if (key === "courses") return "دوره‌ها(دانشجو)";
  if (key === "teacher-courses") return "دوره‌ها(استاد)";
  return SECTIONS[key].label;
}

/** کارت‌های آماری مربعی — بخش‌های پایه برای همه، بخش‌های استاد فقط با نقش استاد.
 *  هر ضلع کارت ۳۰٪ کوچکتر از سلول شبکه است (عرض ۷۰٪ + نسبت مربع)،
 *  محتوا هم به همان نسبت جمع می‌شود. */
function StatCards({
  active,
  onSelect,
  counts,
  keys,
  isTeacher,
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
  counts: Partial<Record<SectionKey, number | null>>;
  /** کلیدهای قابل نمایش — پایه + بخش‌های استاد (فقط نقش استاد) */
  keys: SectionKey[];
  /** برچسب‌های «دوره‌ها(دانشجو/استاد)» فقط در حساب استاد */
  isTeacher: boolean;
}) {
  return (
    <nav
      aria-label="بخش‌های پنل کاربر"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
    >
      {keys.map((key) => {
        const meta = SECTIONS[key];
        const label = sectionLabel(key, isTeacher);
        const count = counts[key] ?? null;
        const isActive = active === key;
        const Icon = meta.icon;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={isActive}
            aria-label={`${label} — ${
              count === null ? "در حال شمارش" : `${faDigits(count)} مورد`
            }`}
            title={`${label} — نمایش جزئیات`}
            className={cn(
              "group flex aspect-square w-[70%] select-none flex-col items-center justify-center gap-1 justify-self-center rounded-2xl border-2 p-2 text-center transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-1.5 sm:p-2.5",
              meta.idle,
              isActive && meta.active
            )}
          >
            <Icon
              className="size-5 shrink-0 transition-transform duration-200 group-hover:scale-110 sm:size-6"
              strokeWidth={1.9}
            />
            <span className="flex h-5 items-center text-2xl font-black leading-none tabular-nums sm:text-3xl">
              {count === null ? (
                <Loader2 className="size-4 animate-spin opacity-60" />
              ) : (
                faDigits(count)
              )}
            </span>
            <span className="text-[0.62rem] font-bold leading-4 sm:text-[0.7rem]">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ————————————————— سوییچ دو نما ————————————————— */

/** دو گزینه‌ی سوییچ نما */
const MODE_OPTIONS: {
  value: PanelMode;
  label: string;
  caption: string;
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
  }>;
}[] = [
  {
    value: "teacher",
    label: "استاد",
    caption: "ورود به عنوان استاد",
    icon: GraduationCap,
  },
  {
    value: "student",
    label: "دانشجو",
    caption: "ورود به عنوان دانشجو",
    icon: UserRound,
  },
];

/**
 * ModeSwitch — سوییچ دو نما در پنل استاد:
 *  • «ورود به عنوان استاد» → دوره‌ها(استاد)، کلاس‌های من، استریم‌های من،
 *    مالی و درآمد و ساخت آزمون
 *  • «ورود به عنوان دانشجو» → دوره‌ها(دانشجو)، آزمون‌ها، گواهینامه‌ها، پرداخت
 *
 * انتخاب کاربر در localStorage ذخیره می‌شود تا در مراجعات بعدی همان نما
 * باز شود (؟mode=/؟tab= آدرس بر آن اولویت دارد).
 */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: PanelMode;
  onChange: (next: PanelMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="حالت پنل استاد — استاد یا دانشجو"
      className="grid grid-cols-2 gap-2 rounded-2xl border border-foreground/[0.08] bg-card/85 p-1.5 shadow-xl shadow-black/[0.04] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#08110e]/70"
    >
      {MODE_OPTIONS.map((opt) => {
        const active = mode === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            title={opt.caption}
            aria-label={opt.caption}
            className={cn(
              "flex select-none flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-2.5 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border border-teal-500/50 bg-teal-500/[0.10] shadow-[0_0_20px_rgba(20,184,166,0.25)] dark:border-teal-400/50 dark:bg-teal-400/[0.10]"
                : "border border-transparent hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]"
            )}
          >
            <span
              className={cn(
                "flex items-center gap-1.5",
                active
                  ? "text-teal-700 dark:text-teal-300"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" strokeWidth={2} />
              <span className="text-sm font-black text-foreground">
                {opt.label}
              </span>
            </span>
            <span className="text-[0.62rem] font-bold leading-4 text-muted-foreground">
              {opt.caption}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ————————————————— داشبورد ————————————————— */

export function PanelDashboard({
  data,
  settings,
  refreshing,
  onRefresh,
  onLogout,
}: {
  data: PanelMe | null;
  settings: SiteSettings;
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  // بخش فعال داشبورد — با کارت‌های آماری بالای صفحه جابه‌جا می‌شود
  // مقدار اولیه از پارامتر آدرس (?tab=) خوانده می‌شود تا منوی موبایلیِ
  // پایین صفحه بتواند مستقیم به «دوره‌های من» (/panel?tab=courses) برود
  const [section, setSection] = React.useState<SectionKey>(() => {
    if (typeof window === "undefined") return "courses";
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "courses" ||
      tab === "exams" ||
      tab === "certificates" ||
      tab === "payments" ||
      tab === "teacher-courses" ||
      tab === "teacher-classes" ||
      tab === "teacher-streams" ||
      tab === "teacher-finance" ||
      tab === "teacher-exams"
      ? (tab as SectionKey)
      : "courses";
  });

  // ————— اسکرول لنگردار به محتوای بخش —————
  // با کلیک روی هر کارت آماری، محتوای همان بخش بلافاصله زیر کارت‌ها رندر
  // می‌شود و صفحه نیز با اسکرول نرم به ابتدای همان محتوا هدایت می‌شود
  // (رفتار لنگر: دو requestAnimationFrame تضم می‌کند رندرِ محتوای تازه
  // پیش از اسکرول کامل شده باشد).
  const sectionAnchorRef = React.useRef<HTMLDivElement | null>(null);
  const scrollToSectionContent = React.useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sectionAnchorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }, []);

  const handleSelectSection = React.useCallback(
    (key: SectionKey) => {
      setSection(key);
      scrollToSectionContent();
    },
    [scrollToSectionContent]
  );

  // ————— حالت پنل استاد (دو نما) —————
  // پنل استاد به دو بخش تقسیم می‌شود: «ورود به عنوان استاد» (پنج بخش
  // دارایی استاد) و «ورود به عنوان دانشجو» (چهار بخش دانشجو). حالت از
  // ?mode= یا ?tab= آدرس و بعد از آخرین انتخاب کاربر خوانده می‌شود؛
  // پیش‌فرضِ استاد = نمای استاد. برای دانشجو همیشه نمای دانشجو است.
  const [mode, setMode] = React.useState<PanelMode>(() => {
    if (typeof window === "undefined") return "teacher";
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    if (m === "teacher" || m === "student") return m;
    // ?tab= هم حالت را تعیین می‌کند — تب استاد → استاد؛ تب دانشجو/نامعتبر → دانشجو
    const tab = params.get("tab");
    if (tab) return tab.startsWith("teacher-") ? "teacher" : "student";
    try {
      const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === "teacher" || saved === "student") return saved;
    } catch {
      // localStorage غیرقابل‌دسترسی — پیش‌فرض اعمال می‌شود
    }
    return "teacher";
  });
  // شمارنده‌های کارت‌ها — دوره/پرداخت از داده‌ی ثبت‌نام‌ها، آزمون/گواهینامه با یک دریافت سبک
  const [examsCount, setExamsCount] = React.useState<number | null>(null);
  const [certificatesCount, setCertificatesCount] = React.useState<
    number | null
  >(null);

  // شمارنده‌های بخش‌های استاد — فقط برای حساب استاد با دریافت سبک پر می‌شود
  const [teacherCounts, setTeacherCounts] = React.useState<
    Partial<Record<SectionKey, number | null>>
  >({});
  const isTeacher = data?.user.role === "teacher";

  // حالت مؤثر — برای دانشجو همیشه «دانشجو»؛ سوییچ فقط برای استاد است
  const effectiveMode: PanelMode = isTeacher ? mode : "student";

  React.useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;

    const setCount = (key: SectionKey, n: number) => {
      if (!cancelled) setTeacherCounts((prev) => ({ ...prev, [key]: n }));
    };

    async function loadListCount(
      url: string,
      key: SectionKey
    ): Promise<void> {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as unknown;
        setCount(key, Array.isArray(json) ? json.length : 0);
      } catch {
        setCount(key, 0);
      }
    }

    // مالی: شمارش فروش (summary.salesCount)
    async function loadFinanceCount(): Promise<void> {
      try {
        const res = await fetch("/api/teacher/finance", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as {
          summary?: { salesCount?: number };
        };
        setCount("teacher-finance", json.summary?.salesCount ?? 0);
      } catch {
        setCount("teacher-finance", 0);
      }
    }

    void loadListCount("/api/teacher/courses", "teacher-courses");
    void loadListCount("/api/teacher/classes", "teacher-classes");
    void loadListCount("/api/teacher/streams", "teacher-streams");
    void loadListCount("/api/teacher/exams", "teacher-exams");
    void loadFinanceCount();

    return () => {
      cancelled = true;
    };
  }, [isTeacher]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadCount(
      url: string,
      listKey: string,
      set: (n: number) => void
    ): Promise<void> {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as Record<string, unknown>;
        const list = json[listKey];
        set(Array.isArray(list) ? list.length : 0);
      } catch {
        set(0);
      }
    }

    void loadCount("/api/panel/exams", "exams", (n) => {
      if (!cancelled) setExamsCount(n);
    });
    void loadCount("/api/panel/certificates", "certificates", (n) => {
      if (!cancelled) setCertificatesCount(n);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // خروج — دکمه تا پایان عملیات چرخان می‌ماند
  function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    void onLogout();
  }

  /* ————— حالت پنل استاد: جابه‌جایی و سازگاری ————— */

  /** جابه‌جایی بین دو نما — انتخاب کاربر ذخیره و بخش فعال به بخش
   *  پیش‌فرضِ حالت تازه می‌رود (استاد → دوره‌ها(استاد)، دانشجو → دوره‌ها) */
  function switchMode(next: PanelMode) {
    if (!isTeacher || next === mode) return;
    setMode(next);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // ذخیره‌سازی ممکن نیست — فقط همین نشست اعمال می‌شود
    }
    setSection(MODE_DEFAULT_SECTION[next]);
  }

  // یک‌بار پس از رسیدن داده — سازگاری بخش فعال با حالت/نقش:
  //  • دانشجو با تب استادی (آدرس دستی) → دوره‌ها
  //  • استاد در نمای استاد با بخش دانشجو → دوره‌ها(استاد) و بالعکس
  const harmonized = React.useRef(false);
  React.useEffect(() => {
    if (!data || harmonized.current) return;
    harmonized.current = true;
    if (!isTeacher) {
      if (isTeacherSection(section)) setSection("courses");
      return;
    }
    if (effectiveMode === "teacher" && !isTeacherSection(section)) {
      setSection(MODE_DEFAULT_SECTION.teacher);
    } else if (effectiveMode === "student" && isTeacherSection(section)) {
      setSection(MODE_DEFAULT_SECTION.student);
    }
    // اجرای یک‌باره پس از رسیدن داده — سازگاری اولیه بخش/حالت
  }, [data]);

  // — کد ملی (اختیاری): نسخه‌ی محلی برای به‌روزرسانی فوری پس از ذخیره —
  const [nidOverride, setNidOverride] = React.useState<
    string | null | undefined
  >(undefined);
  const [nidOpen, setNidOpen] = React.useState(false);
  const [nidInput, setNidInput] = React.useState("");
  const [nidError, setNidError] = React.useState<string | null>(null);
  const [nidSaving, setNidSaving] = React.useState(false);
  const nationalId =
    nidOverride !== undefined ? nidOverride : (data?.user.nationalId ?? null);

  function openNidEdit() {
    setNidInput(nationalId ?? "");
    setNidError(null);
    setNidOpen(true);
  }

  /** ذخیره‌ی کد ملی — PUT /api/panel/me (خالی = حذف) */
  async function saveNid() {
    if (nidSaving) return;
    const clean = normalizeNationalId(nidInput);
    if (clean !== "" && !isValidNationalId(clean)) {
      setNidError(NATIONAL_ID_INVALID_MESSAGE);
      return;
    }
    setNidSaving(true);
    setNidError(null);
    try {
      const res = await fetch("/api/panel/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationalId: clean }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "خطا در ذخیره‌ی کد ملی.");
      setNidOverride(clean === "" ? null : clean);
      setNidOpen(false);
      toast.success(
        clean === "" ? "کد ملی شما حذف شد." : "کد ملی شما ذخیره شد.",
        {
          description:
            "گواهی‌نامه‌های شما با استعلام همین کد ملی در صفحه‌ی استعلام قابل بررسی است.",
        }
      );
    } catch (err) {
      setNidError(
        err instanceof Error ? err.message : "خطا در ذخیره‌ی کد ملی."
      );
    } finally {
      setNidSaving(false);
    }
  }

  /* — اسکلت بارگذاری (ورود موفق؛ داده‌ها هنوز نرسیده‌اند) — */
  if (!data) return <DashboardSkeleton />;

  const { user, enrollments } = data;

  // شمارنده‌ی پرداخت‌ها — ثبت‌نام‌های دارای اطلاعات پرداخت/اقساط
  const paymentsCount = enrollments.filter(
    (e) => e.paymentMethod !== null || e.installments.length > 0
  ).length;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:gap-6",
        refreshing && "opacity-70 transition-opacity"
      )}
    >
      {/* ————— نوار بالای پنل ————— */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {settings.logoUrl && !logoFailed ? (
            <Image
              src={settings.logoUrl}
              alt={settings.siteName}
              width={44}
              height={44}
              onError={() => setLogoFailed(true)}
              className="size-11 shrink-0 rounded-2xl border border-foreground/10 bg-background object-cover shadow-lg"
            />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25">
              <GraduationCap
                className="size-6 text-teal-950"
                strokeWidth={2.2}
              />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-black tracking-tight text-foreground sm:text-lg">
              پنل کاربران {settings.siteName}
            </p>
            <p className="truncate text-[0.65rem] font-medium text-muted-foreground">
              {settings.tagline}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void onRefresh()}
            disabled={refreshing}
            aria-label="به‌روزرسانی اطلاعات پنل"
            title="به‌روزرسانی"
            className="size-9 rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            <RotateCw
              className={cn("size-4", refreshing && "animate-spin")}
            />
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-9 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            <Link href="/">
              <ArrowRight className="size-4" />
              بازگشت به سایت
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleLogout}
            disabled={loggingOut}
            className="h-9 rounded-xl px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-400/10 dark:hover:text-red-300"
          >
            {loggingOut ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            خروج
          </Button>
        </div>
      </header>

      {/* ————— کارت پروفایل ————— */}
      <section className={CARD} aria-label="اطلاعات حساب کاربری">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black text-foreground">
              {user.firstName} {user.lastName}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5 shrink-0" />
                <span dir="ltr" className="tabular-nums">
                  {faDigits(user.phone)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <IdCard className="size-3.5 shrink-0" />
                <span dir="ltr" className="tabular-nums">
                  {nationalId ? faDigits(nationalId) : "—"}
                </span>
                کد ملی:
                <button
                  type="button"
                  onClick={openNidEdit}
                  aria-label="ویرایش کد ملی"
                  title="ویرایش کد ملی"
                  className="flex size-6 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.03] text-muted-foreground transition-colors hover:border-teal-500/40 hover:text-teal-600 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-teal-400/40 dark:hover:text-teal-300"
                >
                  <Pencil className="size-3" />
                </button>
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5 shrink-0" />
                عضو از: {faDate(user.createdAt)}
              </span>
            </div>
            {!nationalId ? (
              <p className="mt-2 text-[0.65rem] font-semibold leading-5 text-muted-foreground">
                کد ملی خود را ثبت کنید تا گواهی‌نامه‌هایتان با استعلام کد ملی
                قابل بررسی باشد.
              </p>
            ) : null}
          </div>
          {/* استاد — نشان نقش کنار «شماره تاییدشده»؛ دانشجو همان تک‌چیپ قبلی را می‌بیند */}
          {user.role === "teacher" ? (
            <div className="flex flex-wrap items-center gap-2 ms-auto">
              <Chip className="border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300">
                <GraduationCap className="size-3" />
                استاد
              </Chip>
              <Chip className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
                <ShieldCheck className="size-3" />
                شماره تاییدشده
              </Chip>
            </div>
          ) : (
            <Chip className="ms-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
              <ShieldCheck className="size-3" />
              شماره تاییدشده
            </Chip>
          )}
        </div>
      </section>

      {/* ————— باکس دعوت به کلاس آنلاین — فقط با دعوت فعال نمایان می‌شود ————— */}
      <StreamInviteBox />

      {/* ————— ویرایش کد ملی (اختیاری) ————— */}
      <Dialog open={nidOpen} onOpenChange={setNidOpen}>
        <DialogContent dir="rtl" className="max-w-sm rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black text-foreground">
              <IdCard className="size-4 text-teal-600 dark:text-teal-300" />
              ویرایش کد ملی
            </DialogTitle>
            <DialogDescription className="text-xs leading-6">
              کد ملی برای استعلام گواهی‌نامه‌های شما استفاده می‌شود و کاملاً
              اختیاری است — خالی گذاشتن آن، مقدار فعلی را حذف می‌کند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={nidInput}
              onChange={(e) => {
                setNidInput(
                  toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 10)
                );
                if (nidError) setNidError(null);
              }}
              placeholder="1234567891"
              aria-invalid={!!nidError}
              className="h-12 rounded-xl border-foreground/[0.09] bg-foreground/[0.02] text-center font-black tabular-nums placeholder:text-muted-foreground/50 focus-visible:ring-teal-500/30 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40"
            />
            {nidError ? (
              <p className="text-xs font-bold leading-5 text-red-600 dark:text-red-300" role="alert">
                {nidError}
              </p>
            ) : (
              <p className="text-[0.65rem] font-semibold leading-5 text-muted-foreground">
                کد ملی ۱۰ رقمی — طبق الگوی رسمی کد ملی ایران اعتبارسنجی می‌شود.
              </p>
            )}
          </div>
          <DialogFooter className="mt-2 gap-2 sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNidOpen(false)}
              disabled={nidSaving}
              className="h-10 rounded-xl px-4 text-xs font-bold"
            >
              انصراف
            </Button>
            <Button
              type="button"
              onClick={() => void saveNid()}
              disabled={nidSaving}
              className="h-10 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-6 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01]"
            >
              {nidSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ————— سوییچ دو نما — فقط برای استاد ————— */}
      {isTeacher ? <ModeSwitch mode={mode} onChange={switchMode} /> : null}

      {/* ————— کارت‌های آماری نئونی — نمای استاد: پنج کارت؛ نمای دانشجو: چهار کارت ————— */}
      <StatCards
        active={section}
        onSelect={handleSelectSection}
        keys={
          effectiveMode === "teacher"
            ? TEACHER_SECTION_KEYS
            : BASE_SECTION_KEYS
        }
        isTeacher={isTeacher}
        counts={{
          courses: enrollments.length,
          exams: examsCount,
          certificates: certificatesCount,
          payments: paymentsCount,
          ...(isTeacher ? teacherCounts : {}),
        }}
      />

      {/* ————— محتوای بخش فعال — لنگر اسکرول نرم —————
          با کلیک روی هر کارت آماری، صفحه با اسکرول نرم به همین نقطه
          (ابتدای محتوای بخش انتخاب‌شده) هدایت می‌شود؛ scroll-mt فاصله‌ی
          امن بالای محتوا را حفظ می‌کند. */}
      <div
        ref={sectionAnchorRef}
        id="panel-section-content"
        className="flex scroll-mt-6 flex-col gap-4 sm:gap-6"
      >
      {/* دوره‌ها — لیست دوره‌های ثبت‌نام‌شده/گذرانده با حضور و غیاب و معدل */}
      {section === "courses" ? (
        <section aria-label="دوره‌های من">
          <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
            <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
              <GraduationCap className="size-5 text-teal-600 dark:text-teal-300" />
              دوره‌های من
            </h2>
            <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
              {faDigits(enrollments.length)} دوره
            </span>
          </div>

          {enrollments.length === 0 ? (
            <EmptyEnrollments />
          ) : (
            <div className="flex flex-col gap-4 sm:gap-6">
              {enrollments.map((e) => (
                <EnrollmentCard key={e.id} enrollment={e} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* آزمون‌ها — لیست آزمون‌های قابل مشاهده و نتایج */}
      {section === "exams" ? <ExamsSection /> : null}

      {/* گواهینامه‌ها — گواهینامه‌های دریافت‌شده با دانلود */}
      {section === "certificates" ? (
        <CertificatesSection
          settings={settings}
          userName={`${user.firstName} ${user.lastName}`.trim()}
        />
      ) : null}

      {/* پرداخت‌ها — لیست پرداخت‌ها و وضعیت اقساط */}
      {section === "payments" ? (
        <PaymentsSection enrollments={enrollments} />
      ) : null}

      {/* ————— بخش‌های استاد — فقط در نمای استاد فعال (سرویس خودش دسترسی را می‌سنجد) ————— */}

      {/* دوره‌های من (استاد) — ایجاد/ویرایش/حذف دوره‌های خودِ استاد */}
      {section === "teacher-courses" ? <TeacherCoursesSection /> : null}

      {/* کلاس‌های من (استاد) — کلاس‌ها با لینک دعوت یکتا و اعضا */}
      {section === "teacher-classes" ? <TeacherClassesSection /> : null}

      {/* استریم‌های من (استاد) — کلاس‌های آنلاین با لینک یکتا و شروع/پایان */}
      {section === "teacher-streams" ? <TeacherStreamsSection /> : null}

      {/* مالی و درآمد (استاد) — فروش، اقساط و درآمد (فقط خواندنی) */}
      {section === "teacher-finance" ? <TeacherFinanceSection /> : null}

      {/* ساخت آزمون (استاد) — ایجاد/ویرایش آزمون، ادیتور سوالات و تصحیح */}
      {section === "teacher-exams" ? <TeacherExamsSection /> : null}
      </div>
    </div>
  );
}

/* ————————————————— بخش پرداخت‌ها ————————————————— */

/**
 * PaymentsSection — لیست پرداخت‌های کاربر:
 * هر ثبت‌نام دارای اطلاعات پرداخت (نقدی/اقساطی) یک کارت با روش، مبلغ،
 * وضعیت، کد پیگیری و اقساط خود است. جمع‌بندی کلی بالای لیست می‌نشیند.
 */
function PaymentsSection({ enrollments }: { enrollments: PanelEnrollment[] }) {
  // فقط ثبت‌نام‌های دارای اطلاعات پرداخت
  const items = enrollments.filter(
    (e) => e.paymentMethod !== null || e.installments.length > 0
  );

  // جمع‌بندی — پرداخت‌شده و مانده (نقدی + اقساط)
  let paidTotal = 0;
  let pendingTotal = 0;
  for (const e of items) {
    if (e.paymentMethod === "cash") {
      if (e.paymentStatus === "paid") paidTotal += e.paymentAmount ?? 0;
      else pendingTotal += e.paymentAmount ?? 0;
    }
    for (const i of e.installments) {
      if (i.status === "paid") paidTotal += i.amount;
      else pendingTotal += i.amount;
    }
  }

  return (
    <section aria-label="پرداخت‌های من" className="space-y-4">
      {/* سربرگ + جمع‌بندی */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 sm:mb-2">
        <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
          <Wallet className="size-5 text-rose-600 dark:text-rose-300" />
          پرداخت‌های من
        </h2>
        <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
          {faDigits(items.length)} پرداخت
        </span>
      </div>

      {items.length === 0 ? (
        <div
          className={cn(
            CARD,
            "flex flex-col items-center gap-4 px-6 py-12 text-center"
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
            <Wallet className="size-7 text-muted-foreground" />
          </span>
          <div>
            <p className="text-base font-black text-foreground">
              هنوز پرداختی ثبت نشده است
            </p>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              با ثبت‌نام در دوره‌ها، پرداخت‌های نقدی و اقساطی شما همین‌جا نمایش
              داده می‌شود.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* جمع‌بندی کلی */}
          <div className={cn(CARD, "flex flex-wrap items-center gap-x-6 gap-y-2")}>
            <p className="text-xs font-bold text-muted-foreground">
              جمع پرداخت‌شده: {" "}
              <span className="tabular-nums font-black text-emerald-600 dark:text-emerald-300">
                {faAmount(paidTotal)} تومان
              </span>
            </p>
            <p className="text-xs font-bold text-muted-foreground">
              جمع مانده: {" "}
              <span className="tabular-nums font-black text-amber-600 dark:text-amber-300">
                {faAmount(pendingTotal)} تومان
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:gap-6">
            {items.map((e) => (
              <PaymentCard key={e.id} enrollment={e} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** کارت یک پرداخت — روش، مبلغ، وضعیت، کد پیگیری و اقساط */
function PaymentCard({ enrollment: e }: { enrollment: PanelEnrollment }) {
  const payStatus = PAYMENT_STATUSES[e.paymentStatus] ?? null;

  return (
    <article className={CARD}>
      {/* عنوان دوره + وضعیت پرداخت */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.07] pb-3 dark:border-white/[0.07]">
        <h3 className="text-base font-black leading-7 text-foreground sm:text-lg">
          {e.course}
        </h3>
        {payStatus ? <Chip className={payStatus.badge}>{payStatus.label}</Chip> : null}
      </div>

      {/* فراداده */}
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {e.paymentMethod ? (
          <MetaRow label="روش پرداخت">
            {PAYMENT_METHODS[e.paymentMethod] ?? "—"}
          </MetaRow>
        ) : null}
        {e.paymentAmount !== null && e.paymentAmount !== undefined ? (
          <MetaRow label="مبلغ">
            <span className="tabular-nums">{faAmount(e.paymentAmount)} تومان</span>
          </MetaRow>
        ) : null}
        {e.paymentStatus === "paid" && e.paymentRefId ? (
          <MetaRow label="کد پیگیری">
            <span dir="ltr" className="tabular-nums">
              {faDigits(e.paymentRefId)}
            </span>
          </MetaRow>
        ) : null}
        {e.paymentStatus === "paid" && e.paidAt ? (
          <MetaRow label="تاریخ پرداخت">{faDate(e.paidAt)}</MetaRow>
        ) : null}
        {e.discountCode ? (
          <MetaRow label="کد تخفیف">
            <span className="flex items-center gap-1.5">
              <span dir="ltr" className="font-black tracking-wide">
                {e.discountCode}
              </span>
              {e.discountAmount ? (
                <Chip className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300">
                  −{faAmount(e.discountAmount)} تومان
                </Chip>
              ) : null}
            </span>
          </MetaRow>
        ) : null}
        <MetaRow label="تاریخ ثبت">{faDate(e.createdAt)}</MetaRow>
      </dl>

      {/* ————— اقساط و پرداخت آنلاین ————— */}
      {e.paymentMethod === "installment" && e.installments.length > 0 ? (
        <InstallmentsBlock enrollment={e} />
      ) : null}
    </article>
  );
}

/* ————————————————— حالت خالی ————————————————— */

function EmptyEnrollments() {
  return (
    <div
      className={cn(
        CARD,
        "flex flex-col items-center gap-4 px-6 py-12 text-center"
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
        <Inbox className="size-7 text-muted-foreground" />
      </span>
      <div>
        <p className="text-base font-black text-foreground">
          هنوز در دوره‌ای ثبت‌نام نکرده‌اید
        </p>
        <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
          از میان دوره‌های فعال، دوره‌ی مورد نظر خود را انتخاب و در چند دقیقه
          ثبت‌نام کنید.
        </p>
      </div>
      <Button
        asChild
        className="h-11 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01]"
      >
        <Link href="/register">
          <GraduationCap className="size-4" />
          مشاهده‌ی دوره‌ها و ثبت‌نام
        </Link>
      </Button>
    </div>
  );
}

/* ————————————————— کارت ثبت‌نام ————————————————— */

/** ردیف فراداده — برچسب کم‌رنگ + مقدار پررنگ */
function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] px-3.5 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.02]">
      <dt className="shrink-0 select-none text-[0.7rem] font-bold text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-left text-sm font-bold text-foreground">
        {children}
      </dd>
    </div>
  );
}

function EnrollmentCard({ enrollment: e }: { enrollment: PanelEnrollment }) {
  const status = isEnrollmentStatus(e.status)
    ? ENROLLMENT_STATUSES[e.status]
    : null;
  const payStatus = PAYMENT_STATUSES[e.paymentStatus] ?? null;

  return (
    <article className={CARD}>
      {/* عنوان دوره + وضعیت ثبت‌نام */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.07] pb-3 dark:border-white/[0.07]">
        <h3 className="text-base font-black leading-7 text-foreground sm:text-lg">
          {e.course}
        </h3>
        {status ? <Chip className={status.badge}>{status.label}</Chip> : null}
      </div>

      {/* ————— اقساط و پرداختی‌ها — بالاتر از حضور و غیاب و برجسته — */}
      <CoursePaymentsBlock enrollment={e} />

      {/* فراداده */}
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {e.groupTitle ? (
          <MetaRow label="گروه">{e.groupTitle}</MetaRow>
        ) : null}
        {e.paymentMethod ? (
          <MetaRow label="روش پرداخت">
            {PAYMENT_METHODS[e.paymentMethod] ?? "—"}
          </MetaRow>
        ) : null}
        {payStatus ? (
          <MetaRow label="وضعیت پرداخت">
            <Chip className={payStatus.badge}>{payStatus.label}</Chip>
          </MetaRow>
        ) : null}
        {e.paymentStatus === "paid" && e.paymentRefId ? (
          <MetaRow label="کد پیگیری">
            <span dir="ltr" className="tabular-nums">
              {faDigits(e.paymentRefId)}
            </span>
          </MetaRow>
        ) : null}
        {e.discountCode ? (
          <MetaRow label="کد تخفیف">
            <span className="flex items-center gap-1.5">
              <span dir="ltr" className="font-black tracking-wide">
                {e.discountCode}
              </span>
              {e.discountAmount ? (
                <Chip className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300">
                  −{faDigits(e.discountAmount.toLocaleString("en-US"))} تومان
                </Chip>
              ) : null}
            </span>
          </MetaRow>
        ) : null}
        <MetaRow label="تاریخ ثبت‌نام">{faDate(e.createdAt)}</MetaRow>
        {e.grade !== null && e.grade !== undefined ? (
          <MetaRow label="معدل">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "font-black tabular-nums",
                  e.grade >= 17
                    ? "text-emerald-600 dark:text-emerald-300"
                    : e.grade >= 10
                      ? "text-teal-600 dark:text-teal-300"
                      : "text-amber-600 dark:text-amber-300"
                )}
              >
                {faDigits(e.grade)} از {faDigits(20)}
              </span>
              {e.grade >= 10 ? (
                <Chip className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
                  <Check className="size-3" strokeWidth={3} />
                  گذرانده
                </Chip>
              ) : (
                <Chip className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                  در حال گذراندن
                </Chip>
              )}
            </span>
          </MetaRow>
        ) : null}
      </dl>

      {/* ————— حضور و غیاب ————— */}
      {e.attendance && e.attendance.sessions.length > 0 ? (
        <AttendanceBlock attendance={e.attendance} />
      ) : null}
    </article>
  );
}

/* ————————————————— بلوک حضور و غیاب ————————————————— */

/** وضعیت جلسه برای کاربر: حاضر / غایب / در انتظار ثبت */
const ATTENDANCE_STATES: Record<
  "present" | "absent" | "pending",
  { label: string; chip: string }
> = {
  present: {
    label: "حاضر",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  absent: {
    label: "غایب",
    chip: "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
  },
  pending: {
    label: "در انتظار",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
};

function AttendanceBlock({ attendance }: { attendance: PanelAttendance }) {
  const recorded = attendance.sessions.filter((s) => s.present !== null);
  const presentCount = recorded.filter((s) => s.present === true).length;
  const absentCount = recorded.length - presentCount;
  const pendingCount = attendance.sessions.length - recorded.length;
  const pct =
    recorded.length > 0
      ? Math.round((presentCount / recorded.length) * 100)
      : 0;

  return (
    <div className="mt-4 rounded-2xl border border-teal-500/25 bg-teal-500/[0.04] p-4 dark:border-teal-400/20 dark:bg-teal-400/[0.04]">
      {/* سربرگ + خلاصه‌ی تعداد */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-black text-foreground">
          <ClipboardCheck className="size-4 text-teal-600 dark:text-teal-300" />
          حضور و غیاب
        </h4>
        <p className="select-none text-[0.7rem] font-bold text-muted-foreground">
          {faDigits(presentCount)} حاضر · {faDigits(absentCount)} غایب
          {pendingCount > 0 ? ` · ${faDigits(pendingCount)} در انتظار` : ""}
        </p>
      </div>

      {/* درصد حضور از جلسات ثبت‌شده */}
      <Progress
        value={pct}
        className="mt-3 h-1.5 bg-foreground/10 dark:bg-white/10"
        aria-label={`درصد حضور از ${faDigits(recorded.length)} جلسه‌ی ثبت‌شده: ${faDigits(pct)} درصد`}
      />
      <p className="mt-1.5 select-none text-[0.65rem] font-semibold leading-5 text-muted-foreground">
        {recorded.length > 0
          ? `درصد حضور: ${faDigits(pct)}٪ از ${faDigits(recorded.length)} جلسه‌ی ثبت‌شده`
          : "هنوز حضور و غیابی ثبت نشده است"}
        {" · "}جلسات دوره: {faDigits(attendance.courseSessions)}
      </p>

      {/* ردیف جلسات — تاریخ و وضعیت هر جلسه */}
      <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pe-1">
        {attendance.sessions.map((s) => {
          const state: "present" | "absent" | "pending" =
            s.present === null ? "pending" : s.present ? "present" : "absent";
          const meta = ATTENDANCE_STATES[state];

          return (
            <li
              key={s.index}
              className="rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] px-3.5 py-3 dark:border-white/[0.07] dark:bg-white/[0.02]"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-black text-foreground">
                    جلسه {faDigits(s.index)}
                  </span>
                  <span className="select-none text-[0.65rem] font-semibold text-muted-foreground">
                    {s.heldAt ? faDate(s.heldAt) : "بدون تاریخ"}
                  </span>
                  {s.active ? (
                    <Chip className="border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300">
                      در حال برگزاری
                    </Chip>
                  ) : null}
                </div>
                <Chip className={meta.chip}>
                  {state === "present" ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : state === "absent" ? (
                    <X className="size-3" strokeWidth={3} />
                  ) : (
                    <Hourglass className="size-3" />
                  )}
                  {meta.label}
                </Chip>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ————————————————— بلوک اقساط (با پرداخت آنلاین) ————————————————— */

/**
 * InstallmentsBlock — لیست اقساط یک ثبت‌نام اقساطی با قابلیت پرداخت:
 *  • روبروی هر قسطِ پرداخت‌نشده دکمه‌ی «پرداخت» — کاربر می‌تواند قبل از
 *    سررسید، قسط را بپردازد (چرخه‌ی مستقل /api/payment/installment/*)
 *  • دکمه‌ی «پرداخت کل اقساط» — جمع همه‌ی اقساطِ پرداخت‌نشده در یک تلاش
 * پس از بازگشت از درگاه (موفق یا ناموفق) کاربر به /panel برمی‌گردد و
 * وضعیت اقساط تازه‌سازی می‌شود (پاپ‌آپ نتیجه‌ی پرداخت).
 */
function InstallmentsBlock({
  enrollment,
}: {
  enrollment: PanelEnrollment;
}) {
  const installments = enrollment.installments;
  const now = Date.now();
  const count = installments.length;
  const paidItems = installments.filter((i) => i.status === "paid");
  const paidCount = paidItems.length;
  const totalAmount = installments.reduce((s, i) => s + i.amount, 0);
  const paidAmount = paidItems.reduce((s, i) => s + i.amount, 0);
  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const pct =
    totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  const unpaid = installments.filter((i) => i.status !== "paid");

  // تلاش پرداختِ در جریان: شناسه‌ی قسط، «ALL» یا تهی
  const [paying, setPaying] = React.useState<string | null>(null);

  /** آغاز پرداخت — POST /api/payment/installment/start و انتقال به درگاه */
  async function startInstallmentPayment(ids: string[], tag: string) {
    if (paying) return;
    setPaying(tag);
    try {
      const res = await fetch("/api/payment/installment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installmentIds: ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectUrl) {
        throw new Error(data.error || "خطا در آغاز پرداخت قسط");
      }
      // انتقال کامل به درگاه (خروج از SPA — مثل فرم ثبت‌نام)
      window.location.assign(data.redirectUrl as string);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در آغاز پرداخت قسط"
      );
      setPaying(null);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-teal-500/30 bg-gradient-to-bl from-teal-500/[0.08] to-emerald-500/[0.03] p-4 dark:border-teal-400/25 dark:from-teal-400/[0.08] dark:to-emerald-400/[0.03]">
      {/* سربرگ + خلاصه‌ی پیشرفت */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-black text-foreground">
          <Wallet className="size-4 text-teal-600 dark:text-teal-300" />
          اقساط و پرداختی‌های دوره
        </h4>
        <p className="select-none text-[0.7rem] font-bold text-muted-foreground">
          {faDigits(paidCount)} از {faDigits(count)} قسط پرداخت شده
        </p>
      </div>

      <Progress
        value={pct}
        className="mt-3 h-2 bg-foreground/10 dark:bg-white/10"
        aria-label={`پیشرفت پرداخت اقساط: ${faDigits(pct)} درصد`}
      />

      {/* ردیف اقساط — روبروی هر قسطِ پرداخت‌نشده دکمه‌ی پرداخت */}
      <ul className="mt-3 space-y-2">
        {installments.map((i) => {
          // معوق = وضعیت معوق صریح، یا در انتظارِ سررسیدگذشته
          const isOverdue =
            i.status === "overdue" ||
            (i.status === "pending" &&
              new Date(i.dueDate).getTime() < now);
          const badge = isOverdue
            ? INSTALLMENT_BADGES.overdue
            : INSTALLMENT_BADGES[i.status];
          const unpaidItem = i.status !== "paid";
          const isPayingThis = paying === i.id;

          return (
            <li
              key={i.id}
              className={cn(
                "rounded-xl border px-3.5 py-3 dark:border-white/[0.07]",
                unpaidItem
                  ? "border-amber-500/25 bg-amber-500/[0.05] dark:bg-amber-400/[0.05]"
                  : "border-foreground/[0.07] bg-foreground/[0.02] dark:bg-white/[0.02]"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-black text-foreground">
                    قسط {faDigits(i.index)}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-foreground/90">
                    {faAmount(i.amount)} تومان
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="select-none text-[0.65rem] font-semibold text-muted-foreground">
                    سررسید: {faDate(i.dueDate)}
                  </span>
                  {badge ? (
                    <Chip className={badge.badge}>
                      {i.status === "paid" ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : null}
                      {badge.label}
                    </Chip>
                  ) : null}
                  {unpaidItem ? (
                    <Button
                      type="button"
                      onClick={() =>
                        void startInstallmentPayment([i.id], i.id)
                      }
                      disabled={paying !== null}
                      aria-label={`پرداخت قسط ${faDigits(i.index)}`}
                      title="پرداخت آنلاین این قسط — قبل از سررسید هم قابل پرداخت است"
                      className="h-8 rounded-lg bg-gradient-to-l from-teal-400 to-emerald-500 px-4 text-[0.65rem] font-black text-teal-950 shadow-md shadow-teal-500/20 transition-all hover:scale-[1.02] hover:shadow-lg dark:from-teal-300 dark:to-emerald-400 dark:text-teal-950"
                    >
                      {isPayingThis ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CreditCard className="size-3.5" />
                      )}
                      پرداخت
                    </Button>
                  ) : null}
                </div>
              </div>

              {i.status === "paid" && i.paidAt ? (
                <p className="mt-1.5 text-[0.65rem] font-semibold text-emerald-600/80 dark:text-emerald-300/80">
                  پرداخت‌شده در تاریخ {faDate(i.paidAt)}
                </p>
              ) : null}
              {i.note ? (
                <p className="mt-1.5 text-[0.65rem] leading-5 text-muted-foreground">
                  {i.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* دکمه‌ی پرداخت کل اقساطِ پرداخت‌نشده + جمع‌بندی */}
      {unpaid.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-teal-500/20 pt-3 dark:border-teal-400/15">
          <p className="select-none text-[0.7rem] font-bold text-muted-foreground">
            مانده‌ی اقساط پرداخت‌نشده:{" "}
            <span className="tabular-nums font-black text-amber-600 dark:text-amber-300">
              {faAmount(remainingAmount)} تومان
            </span>{" "}
            ({faDigits(unpaid.length)} قسط)
          </p>
          <Button
            type="button"
            onClick={() =>
              void startInstallmentPayment(
                unpaid.map((i) => i.id),
                "ALL"
              )
            }
            disabled={paying !== null}
            title="پرداخت جمع همه‌ی اقساط پرداخت‌نشده در یک تراکنش"
            className="h-10 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.02] hover:shadow-teal-400/40 dark:from-teal-300 dark:to-emerald-400 dark:text-teal-950"
          >
            {paying === "ALL" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Banknote className="size-4" />
            )}
            پرداخت کل اقساط ({faAmount(remainingAmount)} تومان)
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 border-t border-emerald-500/20 pt-3 text-[0.7rem] font-bold dark:border-emerald-400/15">
          <Check
            className="size-3.5 text-emerald-600 dark:text-emerald-300"
            strokeWidth={3}
          />
          <p className="select-none text-emerald-700 dark:text-emerald-300">
            همه‌ی اقساط این دوره پرداخت شده است.
          </p>
        </div>
      )}
    </div>
  );
}

/* ————————————————— بلوک پرداخت نقدی (با دکمه‌ی پرداخت) ————————————————— */

/**
 * CashPaymentBlock — خلاصه‌ی پرداختِ نقدیِ یک دوره با دکمه‌ی پرداخت آنلاین
 * برای وضعیت‌های «در انتظار» و «ناموفق» (تلاش مجدد).
 */
function CashPaymentBlock({ enrollment: e }: { enrollment: PanelEnrollment }) {
  const payStatus = PAYMENT_STATUSES[e.paymentStatus] ?? null;
  const canPay = e.paymentStatus === "pending" || e.paymentStatus === "failed";
  const [paying, setPaying] = React.useState(false);

  async function startCashPayment() {
    if (paying) return;
    setPaying(true);
    try {
      const res = await fetch("/api/payment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId: e.id, method: "cash" }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectUrl) {
        throw new Error(data.error || "خطا در آغاز پرداخت");
      }
      // انتقال کامل به درگاه (خروج از SPA — مثل فرم ثبت‌نام)
      window.location.assign(data.redirectUrl as string);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در آغاز پرداخت");
      setPaying(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-teal-500/30 bg-gradient-to-bl from-teal-500/[0.08] to-emerald-500/[0.03] p-4 dark:border-teal-400/25 dark:from-teal-400/[0.08] dark:to-emerald-400/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h4 className="flex items-center gap-2 text-sm font-black text-foreground">
            <Banknote className="size-4 text-teal-600 dark:text-teal-300" />
            پرداختی دوره
          </h4>
          <span className="text-sm font-bold tabular-nums text-foreground/90">
            {e.paymentAmount != null
              ? `${faAmount(e.paymentAmount)} تومان`
              : "—"}
          </span>
          {payStatus ? <Chip className={payStatus.badge}>{payStatus.label}</Chip> : null}
        </div>
        {canPay ? (
          <Button
            type="button"
            onClick={() => void startCashPayment()}
            disabled={paying}
            title="پرداخت آنلاین شهریه‌ی نقدی این دوره"
            className="h-10 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.02] hover:shadow-teal-400/40 dark:from-teal-300 dark:to-emerald-400 dark:text-teal-950"
          >
            {paying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4" />
            )}
            {e.paymentStatus === "failed" ? "تلاش مجدد پرداخت" : "پرداخت"}
          </Button>
        ) : null}
      </div>

      {/* جمع‌بندی */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-teal-500/20 pt-3 text-[0.7rem] font-bold dark:border-teal-400/15">
        <p className="select-none text-muted-foreground">
          روش: <span className="text-foreground">نقدی</span>
        </p>
        {e.paymentStatus === "paid" && e.paidAt ? (
          <p className="select-none text-muted-foreground">
            پرداخت‌شده در تاریخ {" "}
            <span className="text-foreground">{faDate(e.paidAt)}</span>
          </p>
        ) : null}
        {e.paymentStatus === "paid" && e.paymentRefId ? (
          <p className="select-none text-muted-foreground">
            کد پیگیری:{" "}
            <span dir="ltr" className="tabular-nums text-foreground">
              {faDigits(e.paymentRefId)}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * CoursePaymentsBlock — بلوک یکپارچه‌ی «اقساط و پرداختی‌ها» برای کارت دوره:
 * اقساطی → لیست اقساط با دکمه‌ی پرداخت؛ نقدی → خلاصه با دکمه‌ی پرداخت.
 * در نبود هر دو، هیچ چیزی رندر نمی‌شود.
 */
function CoursePaymentsBlock({ enrollment: e }: { enrollment: PanelEnrollment }) {
  if (e.paymentMethod === "installment" && e.installments.length > 0) {
    return <InstallmentsBlock enrollment={e} />;
  }
  if (e.paymentMethod === "cash" && e.paymentAmount != null) {
    return <CashPaymentBlock enrollment={e} />;
  }
  return null;
}

/* ————————————————— اسکلت بارگذاری ————————————————— */

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6" aria-hidden="true">
      {/* نوار بالا */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-11 animate-pulse rounded-2xl bg-foreground/10 dark:bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-36 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-9 animate-pulse rounded-xl bg-foreground/10 dark:bg-white/10" />
          <div className="h-9 w-28 animate-pulse rounded-xl bg-foreground/10 dark:bg-white/10" />
          <div className="h-9 w-20 animate-pulse rounded-xl bg-foreground/10 dark:bg-white/10" />
        </div>
      </div>

      {/* پروفایل — بدون آیکون (مطابق کارت نهایی) */}
      <div className={cn(CARD, "flex animate-pulse flex-wrap items-center gap-4")}>
        <div className="min-w-0 space-y-2.5">
          <div className="h-4 w-40 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
          <div className="h-3 w-56 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
        </div>
      </div>

      {/* کارت‌های آماری */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[0, 1, 2, 3].map((k) => (
          <div
            key={k}
            className="aspect-square animate-pulse rounded-2xl bg-foreground/10 dark:bg-white/10"
          />
        ))}
      </div>

      {/* سربرگ بخش */}
      <div className="flex items-center justify-between">
        <div className="h-5 w-36 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
        <div className="h-6 w-16 animate-pulse rounded-full bg-foreground/10 dark:bg-white/10" />
      </div>

      {/* کارت‌های ثبت‌نام */}
      {[0, 1].map((k) => (
        <div key={k} className={cn(CARD, "animate-pulse space-y-3")}>
          <div className="flex items-center justify-between">
            <div className="h-5 w-48 animate-pulse rounded bg-foreground/10 dark:bg-white/10" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-foreground/10 dark:bg-white/10" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="h-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
            <div className="h-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
            <div className="h-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
            <div className="h-11 animate-pulse rounded-xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
          </div>
          <div className="h-28 animate-pulse rounded-2xl bg-foreground/[0.07] dark:bg-white/[0.07]" />
        </div>
      ))}
    </div>
  );
}
