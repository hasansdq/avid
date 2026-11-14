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
  // — هدر: منوی ناوبری —
  { id: "seed-nav-header-home", section: "header", label: "خانه", url: "#home", kind: "internal", target: "same", isButton: false, sortOrder: 1 },
  { id: "seed-nav-header-courses", section: "header", label: "دوره‌ها", url: "#courses", kind: "internal", target: "same", isButton: false, sortOrder: 2 },
  { id: "seed-nav-header-register", section: "header", label: "ثبت‌نام", url: "#register", kind: "internal", target: "same", isButton: false, sortOrder: 3 },
  { id: "seed-nav-header-videos", section: "header", label: "ویدئوها", url: "/videos", kind: "internal", target: "same", isButton: false, sortOrder: 4 },
  { id: "seed-nav-header-testimonials", section: "header", label: "نظرات", url: "#testimonials", kind: "internal", target: "same", isButton: false, sortOrder: 5 },
  { id: "seed-nav-header-cert", section: "header", label: "استعلام گواهی‌نامه", url: "/certificate", kind: "internal", target: "same", isButton: false, sortOrder: 6 },
  // — هدر: دکمه‌ی برجسته (CTA) به صفحه‌ی ثبت‌نام —
  { id: "seed-nav-header-cta", section: "header", label: "ثبت‌نام در دوره‌ها", url: "/register", kind: "internal", target: "same", isButton: true, sortOrder: 7 },
  // — فوتر: دسترسی سریع —
  { id: "seed-nav-footer-home", section: "footer", label: "خانه", url: "#home", kind: "internal", target: "same", isButton: false, sortOrder: 1 },
  { id: "seed-nav-footer-courses", section: "footer", label: "دوره‌ها", url: "#courses", kind: "internal", target: "same", isButton: false, sortOrder: 2 },
  { id: "seed-nav-footer-register", section: "footer", label: "ثبت‌نام", url: "#register", kind: "internal", target: "same", isButton: false, sortOrder: 3 },
  { id: "seed-nav-footer-videos", section: "footer", label: "ویدئوها", url: "/videos", kind: "internal", target: "same", isButton: false, sortOrder: 4 },
  { id: "seed-nav-footer-testimonials", section: "footer", label: "نظرات", url: "#testimonials", kind: "internal", target: "same", isButton: false, sortOrder: 5 },
  { id: "seed-nav-footer-cert", section: "footer", label: "استعلام گواهی‌نامه", url: "/certificate", kind: "internal", target: "same", isButton: false, sortOrder: 6 },
];

/** ساخت لینک‌های پیش‌فرض در صورت خالی بودن جدول (idempotent و امن در برابر رقابت همزمانی) */
export async function ensureNavLinksSeeded(): Promise<void> {
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
