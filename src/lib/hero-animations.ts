/**
 * «انیمیشن‌های هیرو» — زیرمجموعه‌ی سکشن هیرو در مدیریت صفحه‌ی اول.
 *
 * یک گروه سه‌سوئیچه‌ای (موبایل < 768px · تبلت 768–1023px · دسکتاپ ≥ 1024px)
 * که فقط انیمیشن «اتم ↔ اثر انگشت» را روشن/خاموش می‌کند: صحنه‌ی مورفینگ
 * (هسته، مدارها، الکترون‌ها، رگه‌های اثر انگشت) و درخشش محیطی صحنه.
 *
 * نمادهای شناور (π، ∑، ∞، </>، …)، آیکون‌ها و متن‌های هیرو تابعِ این
 * سوئیچ‌ها نیستند و همیشه نمایان می‌مانند؛ مخفی‌سازی کل هیرو (متن، دکمه‌ها
 * و همه‌چیز) از سوئیچ‌های خودِ سکشن هیرو انجام می‌شود.
 *
 * همان معماری سکشن‌ها: جدول HeroAnimation فقط overrideهای مدیر را نگه می‌دارد؛
 * نبودِ رکورد = انیمیشن در هر سه پلتفرم روشن (پیش‌فرض ایمن).
 * کلاس‌های ریسپانسیو با همان sectionVisibilityClass سکشن‌ها ساخته می‌شوند
 * (کلاس پایه = موبایل · md = تبلت · lg = دسکتاپ).
 */

import type { LucideIcon } from "lucide-react";
import { Fingerprint } from "lucide-react";
import type { HeroAnimation as HeroAnimationRow } from "@prisma/client";
import {
  DEFAULT_SECTION_VISIBILITY,
  type SectionVisibility,
} from "@/lib/homepage-sections";

/** کلید رکورد DB — فقط صحنه‌ی مورفینگ «اتم ↔ اثر انگشت» */
export const HERO_ANIMATION_KEYS = ["scene"] as const;

export type HeroAnimationKey = (typeof HERO_ANIMATION_KEYS)[number];

/** فرم نمایشی انیمیشن برای لیست پنل مدیریت */
export interface HeroAnimationDef {
  key: HeroAnimationKey;
  /** عنوان نمایشی انیمیشن */
  label: string;
  /** توضیح محتوا — آنچه مدیر می‌بیند */
  description: string;
  icon: LucideIcon;
}

/** انیمیشن‌های هیرو — همان ترتیبی که در پنل نمایش داده می‌شوند (فقط یکی) */
export const HERO_ANIMATIONS: HeroAnimationDef[] = [
  {
    key: "scene",
    label: "اتم ↔ اثر انگشت",
    description:
      "صحنه‌ی مورفینگ پیوسته — هسته، مدارها، الکترون‌ها و رگه‌های اثر انگشت. نمادهای شناور (π، ∑، ∞، </>)، آیکون‌ها و متن‌ها همیشه نمایان می‌مانند.",
    icon: Fingerprint,
  },
];

/** وضعیت نمایش انیمیشن‌های هیرو — کلید → نمایش در پلتفرم‌ها */
export type HeroAnimationVisibilityMap = Record<
  HeroAnimationKey,
  SectionVisibility
>;

/** ادغام رکوردهای DB با پیش‌فرض‌ها — نبودِ رکورد یعنی روشن/نمایان */
export function resolveHeroAnimations(
  rows: Pick<HeroAnimationRow, "key" | "mobile" | "tablet" | "desktop">[]
): HeroAnimationVisibilityMap {
  const row = rows.find((r) => r.key === "scene");
  return {
    scene: row
      ? { mobile: row.mobile, tablet: row.tablet, desktop: row.desktop }
      : { ...DEFAULT_SECTION_VISIBILITY },
  };
}
