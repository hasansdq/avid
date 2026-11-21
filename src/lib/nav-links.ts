import { db } from "@/lib/db";
import type { NavLink } from "@prisma/client";

/**
 * لینک‌ها و دکمه‌های هدر و فوتر — داده در جدول NavLink نگهداری می‌شود و
 * از ماژول «ویرایش هدر و فوتر» قابل مدیریت است.
 * در اولین اجرا پنج لینک پیش‌فرض هدر + دکمه‌ی CTA + پنج لینک فوتر ساخته می‌شوند.
 */

export interface NavLinkSeed {
  /** شناسه‌ی قطعی — جلوگیری از درج تکراری در رقابت همزمانی */
  id: string;
  section: "header" | "footer";
  label: string;
  url: string;
  kind: "internal" | "external";
  target: "same" | "blank";
  isButton: boolean;
  sortOrder: number;
}

export const DEFAULT_NAV_LINKS: NavLinkSeed[] = [
  // — هدر: منوی ناوبری («نظرات» حذف شد — به درخواست، از هدر برداشته می‌شود؛ نسخه‌ی فوتر باقی است) —
  // («ثبت‌نام» هدر به «نمونه سوال» (بخش نمونه‌سوالات صفحه‌ی اول) تبدیل شد — به درخواست)
  { id: "seed-nav-header-home", section: "header", label: "خانه", url: "#home", kind: "internal", target: "same", isButton: false, sortOrder: 1 },
  { id: "seed-nav-header-courses", section: "header", label: "دوره‌ها", url: "#courses", kind: "internal", target: "same", isButton: false, sortOrder: 2 },
  { id: "seed-nav-header-samples", section: "header", label: "نمونه سوال", url: "/samples", kind: "internal", target: "same", isButton: false, sortOrder: 3 },
  { id: "seed-nav-header-videos", section: "header", label: "ویدئوها", url: "/videos", kind: "internal", target: "same", isButton: false, sortOrder: 4 },
  { id: "seed-nav-header-cert", section: "header", label: "استعلام گواهی‌نامه", url: "/certificate", kind: "internal", target: "same", isButton: false, sortOrder: 5 },
  // — هدر: دکمه‌ی برجسته (CTA) به صفحه‌ی ثبت‌نام —
  { id: "seed-nav-header-cta", section: "header", label: "ثبت‌نام در دوره‌ها", url: "/register", kind: "internal", target: "same", isButton: true, sortOrder: 6 },
  // — فوتر: دسترسی سریع —
  { id: "seed-nav-footer-home", section: "footer", label: "خانه", url: "#home", kind: "internal", target: "same", isButton: false, sortOrder: 1 },
  { id: "seed-nav-footer-courses", section: "footer", label: "دوره‌ها", url: "#courses", kind: "internal", target: "same", isButton: false, sortOrder: 2 },
  { id: "seed-nav-footer-register", section: "footer", label: "ثبت‌نام", url: "#register", kind: "internal", target: "same", isButton: false, sortOrder: 3 },
  { id: "seed-nav-footer-videos", section: "footer", label: "ویدئوها", url: "/videos", kind: "internal", target: "same", isButton: false, sortOrder: 4 },
  { id: "seed-nav-footer-testimonials", section: "footer", label: "نظرات", url: "#testimonials", kind: "internal", target: "same", isButton: false, sortOrder: 5 },
  { id: "seed-nav-footer-cert", section: "footer", label: "استعلام گواهی‌نامه", url: "/certificate", kind: "internal", target: "same", isButton: false, sortOrder: 6 },
];

/**
 * شناسه‌های پیش‌فرضی که از محصول حذف شده‌اند — در هر فراخوانی، رکورد
 * معادلشان (در صورت وجود) حذف می‌شود تا نصب‌های موجود هم بدون دخالت مدیر
 * به‌روز شوند. فقط seedهای شناخته‌شده را حذف می‌کند؛ لینک‌های سفارشی
 * مدیر (با idهای cuid) دست‌نخورده می‌مانند.
 */
const RETIRED_SEED_IDS = ["seed-nav-header-testimonials"] as const;

/**
 * تغییرات محتوایی seedهای شناخته‌شده در نصب‌های موجود — فقط وقتی رکورد هنوز
 * مقادیر پیش‌فرض قبلی را دارد به‌روز می‌شود؛ لینک‌های سفارشی‌شده توسط مدیر
 * (با label/url دلخواه) هرگز بازنویسی نمی‌شوند.
 */
const SEED_CONTENT_UPDATES: {
  id: string;
  /** فقط وقتی این مقادیر فعلی دقیقاً برابر باشد، به‌روزرسانی انجام می‌شود */
  when: { label: string; url: string };
  /** مقادیر جدید seed جاری */
  set: { label: string; url: string };
}[] = [
  {
    id: "seed-nav-header-register",
    when: { label: "ثبت‌نام", url: "#register" },
    set: { label: "نمونه سوال", url: "#samples" },
  },
  // «نمونه سوال» به صفحه‌ی اختصاصی /samples منتقل شد — دو شناسه‌ی ممکن:
  // نصب‌های قدیمی که لینک را از «ثبت‌نام» مهاجرت داده‌اند (id قبلی register)
  // و نصب‌های جدید که seed جداگانه‌ی samples دارند.
  {
    id: "seed-nav-header-register",
    when: { label: "نمونه سوال", url: "#samples" },
    set: { label: "نمونه سوال", url: "/samples" },
  },
  {
    id: "seed-nav-header-samples",
    when: { label: "نمونه سوال", url: "#samples" },
    set: { label: "نمونه سوال", url: "/samples" },
  },
];

/** ساخت لینک‌های پیش‌فرض در صورت خالی بودن جدول (idempotent و امن در برابر رقابت همزمانی) */
export async function ensureNavLinksSeeded(): Promise<void> {
  // حذف seedهای بازنشسته‌شده (مثل «نظرات» هدر) از نصب‌های موجود
  try {
    await db.navLink.deleteMany({ where: { id: { in: [...RETIRED_SEED_IDS] } } });
  } catch {
    // حذف-best-effort — رندر سایت نباید به آن وابسته باشد
  }
  // به‌روزرسانی seedهای تغییر‌یافته (مثل «ثبت‌نام» ← «نمونه سوال») — فقط
  // رکوردهایی که هنوز مقدار پیش‌فرض قبلی را دارند (سفارشی‌سازی مدیر محفوظ می‌ماند)
  try {
    for (const upd of SEED_CONTENT_UPDATES) {
      await db.navLink.updateMany({
        where: { id: upd.id, label: upd.when.label, url: upd.when.url },
        data: { label: upd.set.label, url: upd.set.url },
      });
    }
  } catch {
    // به‌روزرسانی-best-effort — رندر سایت نباید به آن وابسته باشد
  }
  const count = await db.navLink.count();
  if (count === 0) {
    try {
      await db.navLink.createMany({ data: DEFAULT_NAV_LINKS });
    } catch {
      // رقابت همزمانی: درخواست دیگری همین لحظه لینک‌ها را ساخته است
    }
  }
}

/** لینک‌های منتشرشده‌ی یک بخش (هدر یا فوتر) به ترتیب نمایش */
export async function getPublishedLinks(section: "header" | "footer"): Promise<NavLink[]> {
  await ensureNavLinksSeeded();
  return db.navLink.findMany({
    where: { section, published: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** آیا لینک باید در تب جدید باز شود؟ */
export function opensInNewTab(link: NavLink): boolean {
  return link.target === "blank" || link.kind === "external";
}

/** ویژگی‌های رایج <a> برای رندر امن لینک */
export function anchorProps(link: NavLink): {
  href: string;
  target?: string;
  rel?: string;
} {
  const blank = opensInNewTab(link);
  return {
    href: link.url,
    ...(blank ? { target: "_blank", rel: "noreferrer" } : {}),
  };
}
