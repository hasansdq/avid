import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // برای بیلد آزمایشی کنار سرور توسعه (بدون دست‌زدن به .next)؛
  // در استقرار مقداردهی نمی‌شود و همان پیش‌فرض .next است.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // بررسی TypeScript هنگام بیلد فعال است (پیش‌تر ignore بود) — خطای tsc
  // بیلد را متوقف می‌کند تا نسخه‌ی معیوب منتشر نشود.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // نشانگر شناور ابزار توسعه (دکمه‌ی بنفش < /> ) در پیش‌نمایش حذف می‌شود
  devIndicators: false,
  // exceljs (خروجی اکسل حضور استریم) فقط سمت سرور لازم است و باید از باندل
  // استاندالون کنار بیرون بماند (CJS سنگین + فایل‌های اختیاری)
  serverExternalPackages: ["exceljs"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  allowedDevOrigins: ["*.space-z.ai", "127.0.0.1", "localhost"],
};

export default nextConfig;
