import type { NextConfig } from "next";

/**
 * CSP سازگار با همه‌ی کارکردهای فعلی:
 *  • فونت‌ها: self + data: (فونت‌های نصب‌شده از /uploads/fonts)
 *  • تصاویر/ویدئو: هر http(s) + data/blob (دوره‌ها با کاور CDN، رسانه blob)
 *  • اتصال استریم و سوکت‌ها: ws/wss + http/https (هم‌مبدأ از پروکسی)
 *  • درگاه‌ها: ناوبری سطح‌بالا محدود نمی‌شود؛ فرم‌ها با form-action https
 *  • نمادهای اعتماد: اسکریپت رسمی اینماد/زرین‌پال (دامنه‌های رسمی فقط)
 *  • frame-ancestors: خود سایت + پیش‌نمایش (پنل داخل iframe سندباکس) —
 *    X-Frame-Options گذاشته نمی‌شود چون پیش‌نمایش را می‌شکند.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://enamad.ir https://*.enamad.ir https://zarinpal.com https://*.zarinpal.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http: https:",
  "media-src 'self' blob: http: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http: https: blob:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "worker-src 'self' blob:",
  "frame-ancestors 'self' https://*.space-z.ai",
].join("; ");

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
  // ریدایرکت ۳۰۸ «حذف اسلش انتهایی» خاموش — مسیرهای socket.io
  // (/stream-socket/ و /socket.io/) با اسلش انتهایی به route handler های
  // fallback می‌رسند؛ ریدایرکت، polling را می‌شکند و upgrade وب‌سوکت را
  // بیهوده می‌کند.
  skipTrailingSlashRedirect: true,
  // نشانگر شناور ابزار توسعه (دکمه‌ی بنفش < /> ) در پیش‌نمایش حذف می‌شود
  devIndicators: false,
  // exceljs (خروجی اکسل حضور استریم) فقط سمت سرور لازم است و باید از باندل
  // استاندالون کنار بیرون بماند (CJS سنگین + فایل‌های اختیاری)
  serverExternalPackages: ["exceljs", "sanitize-html"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
    // لوگوی سایت می‌تواند SVG باشد؛ از طریق بهینه‌ساز تصویر عبور داده می‌شود
    // (پیش‌تر SVG با خطای ۴۰۰ «image type is not allowed» رد می‌شد و لوگو
    // در هدر/فوتر/پنل لود نمی‌شد). با CSP سخت‌گیرانه و بدون اجرای اسکریپت.
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  allowedDevOrigins: ["*.space-z.ai", "127.0.0.1", "localhost"],
  // ————— هدرهای امنیتی (بند ۹) —————
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // دوربین/میکروفون/فول‌اسکرین برای کلاس استریمِ خود سایت؛
            // بقیه‌ی قابلیت‌های حساس بسته‌اند
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), display-capture=(self), fullscreen=(self), geolocation=(), payment=()",
          },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
  // ————— فایل‌های گواهینامه خصوصی‌اند (بند ۸) —————
  // beforeFiles: پیش از مسیر فایل‌سیستمی (استاتیک public) اجرا می‌شود؛
  // بنابراین /uploads/certificates/** در «dev» (سرو استاتیکِ runtime) و
  // «production» (فایل‌های build-time) هر دو به روتی با گره‌ی مالکیت/
  // امضا می‌رسند — نه سرو مستقیم عمومی.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/uploads/certificates/:path*",
          destination: "/api/uploads/certificates/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
