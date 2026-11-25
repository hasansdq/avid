import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

/**
 * مانیفست وب‌اپلیکیشن (PWA) — /manifest.webmanifest
 *
 * داینامیک است تا «نام سایت» همیشه با تنظیمات پنل هم‌خوان بماند؛
 * نتیجه: سایت روی ویندوز/اندروید/iOS «نصب‌شدنی» است —
 *  • ویندوز (Edge/Chrome): منوی ⋮ → «نصب اپلیکیشن» → آیکون دسکتاپ/Start
 *  • اندروید (Chrome): منوی ⋮ → «نصب اپلیکیشن» → آیکون لانچر + پنجره مستقل
 *  • iOS (Safari): اشتراک‌گذاری → «Add to Home Screen» → وب‌اپ تمام‌صفحه
 *
 * آیکون‌ها با scripts/make-pwa-icons.ts از لوگوی سایت ساخته می‌شوند
 * (public/images/icons/) و sw.js همین مسیر را پیش‌کش می‌کند.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await db.siteSettings
    .findUnique({ where: { id: "main" } })
    .catch(() => null);

  const siteName = settings?.siteName?.trim() || "آوید";
  const tagline = settings?.tagline?.trim() || "آکادمی مهارت‌های آینده";
  const description =
    settings?.slogan?.trim() ||
    "یادگیری هر مهارتی، سرمایه‌ی شما در آینده است";

  return {
    id: "/",
    name: `${siteName} | ${tagline}`,
    short_name: siteName,
    description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "fa",
    dir: "rtl",
    // زمینه‌ی برند — همان رنگ عمیق آیکون‌های ماسکابل
    background_color: "#052e28",
    theme_color: "#052e28",
    categories: ["education"],
    icons: [
      {
        src: "/images/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/images/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/images/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/images/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "پنل کاربران",
        short_name: "پنل",
        url: "/panel",
        icons: [{ src: "/images/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "استعلام گواهینامه",
        short_name: "استعلام",
        url: "/certificate",
        icons: [{ src: "/images/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
