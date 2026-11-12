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
  studentsCount: 270,
  completedCoursesCount: 13,
  rating: 4.9,
  contactPhone: "",
  contactEmail: "",
  address: "",
  supportHours: "شنبه تا جمعه، ۹ صبح تا ۱۸",
  instagramUrl: "",
  telegramUrl: "",
  youtubeUrl: "",
  linkedinUrl: "",
  footerDescription:
    "یادگیری هر مهارتی، سرمایه‌ی شما در آینده است. ما با دوره‌های پروژه‌محور و مربیان متخصص، همراه شما در این مسیر هستیم.",
  sloganFont: "vazirmatn",
  headerFont: "vazirmatn",
  footerFont: "vazirmatn",
  updatedAt: new Date(),
};
