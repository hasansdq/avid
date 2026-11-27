import type { SiteSettings } from "@prisma/client";

/** تنظیمات پیش‌فرض هویت سایت — مطابق پیش‌فرض‌های اسکیمای دیتابیس */
export const DEFAULT_SETTINGS: SiteSettings = {
  id: "main",
  siteName: "آوید",
  tagline: "آکادمی مهارت‌های آینده",
  slogan: "یادگیری هر مهارتی، سرمایه‌ی شما در آینده است",
  heroDescription:
    "در آکادمی آوید، از هوش مصنوعی تا برنامه‌نویسی کودکان، با پروژه‌های واقعی و پشتیبانی متخصص‌ها مهارت بسازید و آینده شغلی خود را تضمین کنید.",
  logoUrl: "/images/logo.png",
  // favicon اختصاصی — خالی یعنی همان لوگو در تب مرورگر استفاده می‌شود
  faviconUrl: "",
  studentsCount: 270,
  completedCoursesCount: 13,
  rating: 4.9,
  // — اطلاعات تماس عمداً خالی: داده‌ی نمونه‌ی ساختگی در پیش‌فرض‌ها نیست؛
  // مدیر از ماژول «تنظیمات سایت» مقادیر واقعی را وارد می‌کند.
  contactPhone: "",
  contactEmail: "",
  address: "",
  supportHours: "",
  instagramUrl: "",
  telegramUrl: "",
  youtubeUrl: "",
  linkedinUrl: "",
  footerDescription:
    "یادگیری هر مهارتی، سرمایه‌ی شما در آینده است. ما با دوره‌های پروژه‌محور و مربیان متخصص، همراه شما در این مسیر هستیم.",
  enamadCode: "",
  zarinpalCode: "",
  sloganFont: "vazirmatn",
  headerFont: "vazirmatn",
  footerFont: "vazirmatn",
  pencilEditorEnabled: true,
  updatedAt: new Date(),
};
