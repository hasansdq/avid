/**
 * مدیریت صفحه‌ی اول سایت — تعریف ۸ سکشن اصلی و منطق نمایش به تفکیک پلتفرم.
 *
 * این ماژول «یک منبع حقیقت» است و هم در سرور (صفحه‌ی اصلی + API مدیر)
 * و هم در پنل مدیریت استفاده می‌شود:
 *   • HOMEPAGE_SECTIONS — تعریف سکشن‌ها (کلید، عنوان، توضیح محتوا، آیکون)
 *   • resolveSectionVisibility — ادغام رکوردهای DB با پیش‌فرض‌های نمایان
 *   • sectionVisibilityClass — تبدیل سه بولین به کلاس‌های ریسپانسیو Tailwind
 *
 * نقشه‌ی بریک‌پوینت‌ها (مطابق دموی سایت — md = مرز موبایل):
 *   • موبایل  : عرض < 768px        (کلاس پایه / بدون پیشوند)
 *   • تبلت    : عرض 768–1023px     (فقط ناحیه‌ی md)
 *   • دسکتاپ  : عرض ≥ 1024px       (lg به بالا)
 */

import type { LucideIcon } from "lucide-react";
import {
  Atom,
  BarChart3,
  FileQuestion,
  GraduationCap,
  MonitorPlay,
  Rocket,
  Speech,
  Users,
} from "lucide-react";
import type { HomepageSection as HomepageSectionRow } from "@prisma/client";

/** شناسه‌ی سکشن‌های صفحه‌ی اول — به ترتیب نمایش در سایت */
export const HOMEPAGE_SECTION_KEYS = [
  "hero",
  "courses",
  "actionCards",
  "counters",
  "register",
  "videos",
  "samples",
  "testimonials",
] as const;

export type HomepageSectionKey = (typeof HOMEPAGE_SECTION_KEYS)[number];

/** فرم نمایشی هر سکشن برای لیست پنل مدیریت */
export interface HomepageSectionDef {
  key: HomepageSectionKey;
  /** عنوان نمایشی سکشن */
  label: string;
  /** محتوای سکشن — توضیحی که مدیر می‌بیند */
  description: string;
  icon: LucideIcon;
}

/** ۸ سکشن صفحه‌ی اول — همان ترتیبی که در سایت رندر می‌شوند */
export const HOMEPAGE_SECTIONS: HomepageSectionDef[] = [
  {
    key: "hero",
    label: "هیرو",
    description:
      "متن اسلوگان، متن معرفی هیرو، دکمه‌های سه‌گانه (ثبت‌نام در دوره‌ها، تماشای ویدئوها، استعلام گواهی‌نامه) + زیرمجموعه‌ی «انیمیشن‌ها» (فقط صحنه‌ی اتم ↔ اثر انگشت؛ نمادهای شناور، آیکون‌ها و متن‌ها همیشه نمایان)",
    icon: Atom,
  },
  {
    key: "courses",
    label: "دوره‌های آموزشی",
    description: "متن توضیحات سکشن و کارت‌های دوره‌ها با فیلتر آنلاین/حضوری/ترکیبی",
    icon: GraduationCap,
  },
  {
    key: "actionCards",
    label: "استارت (از کجا شروع کنید؟)",
    description: "متن «از کجا شروع کنید؟» و سه کارت ثبت‌نام، ویدئوها و استعلام",
    icon: Rocket,
  },
  {
    key: "counters",
    label: "رشد آکادمی",
    description: "دو باکس دارای شمارنده (کارآموزان و دوره‌های تکمیل‌شده)",
    icon: BarChart3,
  },
  {
    key: "register",
    label: "ثبت‌نام در دوره‌ها",
    description:
      "فرم ثبت‌نام و متن‌های اطراف آن مانند «چرا آکادمی آوید؟»",
    icon: Users,
  },
  {
    key: "videos",
    label: "ویدئوهای آموزشی",
    description: "متن، توضیحات و لیست‌های پخش ویدئوها",
    icon: MonitorPlay,
  },
  {
    key: "samples",
    label: "نمونه سوالات",
    description: "متن، توضیحات و دسته‌بندی‌های نمونه سوالات",
    icon: FileQuestion,
  },
  {
    key: "testimonials",
    label: "نظرات",
    description: "متن‌های مختلف، توضیحات مربوط و باکس‌های نظرات کاربران",
    icon: Speech,
  },
];

/** وضعیت نمایش یک سکشن در سه پلتفرم */
export interface SectionVisibility {
  mobile: boolean;
  tablet: boolean;
  desktop: boolean;
}

/** وضعیت همه‌ی سکشن‌ها — کلید → نمایش در پلتفرم‌ها */
export type SectionVisibilityMap = Record<
  HomepageSectionKey,
  SectionVisibility
>;

/** پیش‌فرض: همه‌ی سکشن‌ها در هر سه پلتفرم نمایان‌اند */
export const DEFAULT_SECTION_VISIBILITY: SectionVisibility = {
  mobile: true,
  tablet: true,
  desktop: true,
};

/**
 * ادغام رکوردهای DB با پیش‌فرض‌ها — نبودِ رکورد یعنی نمایان.
 * (جدول HomepageSection فقط override های مدیر را نگه می‌دارد؛
 * رکورد با همه‌ی سه کلید روشن هم معادلِ «همه‌جا نمایان» است.)
 */
export function resolveSectionVisibility(
  rows: Pick<HomepageSectionRow, "key" | "mobile" | "tablet" | "desktop">[]
): SectionVisibilityMap {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const map = {} as SectionVisibilityMap;
  for (const key of HOMEPAGE_SECTION_KEYS) {
    const row = byKey.get(key);
    map[key] = row
      ? { mobile: row.mobile, tablet: row.tablet, desktop: row.desktop }
      : { ...DEFAULT_SECTION_VISIBILITY };
  }
  return map;
}

/**
 * تبدیل سه بولین به کلاس‌های ریسپانسیو Tailwind برای لفافِ سکشن:
 *
 *  • موبایل  → کلاس پایه (بدون پیشوند): hidden = مخفی در موبایل
 *  • تبلت    → ناحیه‌ی md: md:block / md:hidden (768–1023px)
 *  • دسکتاپ  → ناحیه‌ی lg به بالا: lg:block / lg:hidden (≥ 1024px)
 *
 * جدول حالت‌ها (۸ ترکیب):
 *   m  t  d  → کلاس‌ها
 *   ✅ ✅ ✅  → (بدون کلاس — همه‌جا نمایان)
 *   ❌ ✅ ✅  → hidden md:block
 *   ✅ ❌ ✅  → md:hidden lg:block
 *   ✅ ✅ ❌  → lg:hidden
 *   ❌ ❌ ✅  → hidden lg:block
 *   ❌ ✅ ❌  → hidden md:block lg:hidden
 *   ✅ ❌ ❌  → md:hidden
 *   ❌ ❌ ❌  → hidden
 *
 * نمایش لفاف همیشه block است؛ سکشن داخلی (section) display خودش
 * (flex و…) را حفظ می‌کند چون لفافِ block دورش است.
 */
export function sectionVisibilityClass(v: SectionVisibility): string {
  const classes: string[] = [];
  if (!v.mobile) classes.push("hidden");
  if (v.tablet && !v.mobile) classes.push("md:block");
  if (!v.tablet && v.mobile) classes.push("md:hidden");
  if (v.desktop && !v.mobile && !v.tablet) classes.push("lg:block");
  if (!v.desktop && (v.mobile || v.tablet)) classes.push("lg:hidden");
  return classes.join(" ");
}

/** برچسب‌های فارسی پلتفرم‌ها — برای پنل و متن‌های راهنما */
export const PLATFORM_LABELS: Record<
  keyof SectionVisibility,
  { label: string; hint: string }
> = {
  mobile: { label: "موبایل", hint: "عرض کمتر از ۷۶۸ پیکسل" },
  tablet: { label: "تبلت", hint: "عرض ۷۶۸ تا ۱۰۲۳ پیکسل" },
  desktop: { label: "دسکتاپ", hint: "عرض ۱۰۲۴ پیکسل و بیشتر" },
};
