import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { FontStylesheets } from "@/components/font-loader";
import { MobileBottomNav } from "@/components/site/mobile-bottom-nav";
import { VisitBeacon } from "@/components/site/visit-beacon";
import { PwaBootstrap } from "@/components/pwa/pwa-bootstrap";
import { InstallBanner } from "@/components/pwa/install-banner";
import { db } from "@/lib/db";
import { cssTextForKeys } from "@/lib/fonts";

/**
 * متادیتای viewport موبایل — رنگ نوار مرورگر (themeColor) برای هر دو
 * حالت روشن/تیره سیستم. مؤلفه‌ی ThemeColorMeta داخل ThemeProvider این
 * مقدار را به‌صورت پویا با تمِ درون‌سایتی همگام می‌کند.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5faf8" },
    { media: "(prefers-color-scheme: dark)", color: "#04080a" },
  ],
};

// تمام صفحات پویا رندر می‌شوند — محتوای سایت (تنظیمات، دوره‌ها، منوها و…)
// از دیتابیس خوانده می‌شود و باید بلافاصله پس از تغییر در پنل مدیریت
// بدون بیلدِ مجدد نمایش داده شود. همچنین بیلدِ production مستقل از
// دیتابیس می‌شود (prebuild استاتیکِ صفحاتِ وابسته به دیتابیس با
// DATABASE_URL موقتِ بیلد شکست می‌خورد و بیلدِ Docker متوقف می‌شد).
export const dynamic = "force-dynamic";

const vazirmatn = Vazirmatn({
  variable: "--font-vazir",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await db.siteSettings
    .findUnique({ where: { id: "main" } })
    .catch(() => null);

  const siteName = settings?.siteName ?? "آوید";
  const tagline = settings?.tagline ?? "آکادمی مهارت‌های آینده";
  const slogan =
    settings?.slogan ?? "یادگیری هر مهارتی، سرمایه‌ی شما در آینده است";

  return {
    title: `${siteName} | ${tagline}`,
    description: slogan,
    keywords: [
      "آموزش آنلاین",
      "دوره هوش مصنوعی",
      "طراحی سایت",
      "کامپیوتر کودکان",
      "برنامه‌نویسی",
      siteName,
    ],
    authors: [{ name: `آکادمی ${siteName}` }],
    // — وب‌اپلیکیشن نصب‌شدنی (PWA) روی اندروید/iOS/ویندوز —
    manifest: "/manifest.webmanifest",
    applicationName: siteName,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: siteName,
    },
    icons: {
      icon: [
        { url: "/images/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/images/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: "/images/icons/apple-touch-icon.png",
    },
    openGraph: {
      title: `${siteName} | ${tagline}`,
      description: slogan,
      type: "website",
      locale: "fa_IR",
      siteName,
    },
  };
}

/**
 * نگهبان خودترمیمی هیدراتاسیون — اسکریپت درون‌خطی (مستقل از چانک‌های React).
 *
 * اگر بعد از مهلت مشخص، «نشانه‌ی هیدراتاسیون» (که کلاینتِ سالم ست می‌کند)
 * هنوز نباشد، یعنی چانک‌های جاوااسکریپت کهنه/خراب سرو شده‌اند و صفحه در
 * حالتِ اولیه‌ی SSR (مثل «در حال بررسی دسترسی...») گیر کرده است.
 * در این حالت Service Worker و کش‌های مرورگر پاک و صفحه یک‌بار (فقط یک‌بار
 * در هر نشست) نوسازی می‌شود تا نسخه‌ی تازه دانلود شود. اگر نه SW هست و
 * نه کشی، کاری نمی‌کنیم — مشکل از کهنگی نیست و نوسازی کمکی نمی‌کند.
 */
const HYDRATION_WATCHDOG = `(function(){try{
var DELAY=18000,FLAG="__avidHydrated";
setTimeout(function(){try{
 if(window[FLAG])return;
 if(window.__avidHealAttempted)return;
 try{if(window.sessionStorage&&sessionStorage.getItem("avidSelfHeal")==="1")return}catch(e){}
 var hasSW=false,hasCaches=false;
 var p1=(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations)?navigator.serviceWorker.getRegistrations().then(function(rs){hasSW=rs.length>0}).catch(function(){}):Promise.resolve();
 var p2=window.caches?window.caches.keys().then(function(ks){hasCaches=ks.length>0}).catch(function(){}):Promise.resolve();
 Promise.all([p1,p2]).then(function(){
  if(!hasSW&&!hasCaches)return;
  window.__avidHealAttempted=true;
  try{window.sessionStorage&&sessionStorage.setItem("avidSelfHeal","1")}catch(e){}
  var regs=(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations)?navigator.serviceWorker.getRegistrations().catch(function(){return[]}):Promise.resolve([]);
  var regsP=Promise.resolve(regs).then(function(rs){return Promise.all((rs||[]).map(function(r){return r.unregister().catch(function(){})}))}).catch(function(){});
  var keysP=window.caches?window.caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return window.caches.delete(k)}))}).catch(function(){}):Promise.resolve();
  Promise.all([regsP,keysP]).then(function(){
   try{
    var u=new URL(window.location.href);
    u.searchParams.set("_avidHeal",String(Date.now()));
    window.location.replace(u.href);
   }catch(e){window.location.reload()}
  }).catch(function(){window.location.reload()});
 }).catch(function(){});
}catch(e){}},DELAY);
}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // فونت‌های انتخاب‌شده از تنظیمات — @font-face فونت‌های نصب‌شده (محلی) تزریق می‌شود
  const [settings, fonts] = await Promise.all([
    db.siteSettings.findUnique({ where: { id: "main" } }).catch(() => null),
    db.installedFont.findMany().catch(() => []),
  ]);
  const cssTexts = cssTextForKeys(fonts, [
    settings?.sloganFont,
    settings?.headerFont,
    settings?.footerFont,
  ]);

  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        className={`${vazirmatn.variable} font-sans antialiased bg-background text-foreground overflow-x-clip`}
      >
        {/* نگهبان خودترمیمی هیدراتاسیون — درون‌خطی و مستقل از چانک‌های React */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: HYDRATION_WATCHDOG }} />
        <FontStylesheets cssTexts={cssTexts} />
        <ThemeProvider>
          {children}
          {/* منوی موبایلی زیبا و جذاب پایین صفحه — حساب کاربری / نمونه سوال / ویدئوها */}
          <MobileBottomNav />
          {/* وب‌اپلیکیشن نصب‌شدنی — رجیستری Service Worker + بنر درخواست نصب */}
          <PwaBootstrap />
          <InstallBanner />
          {/* بیکن آمار بازدید صفحات عمومی سایت */}
          <VisitBeacon />
          <Toaster position="top-center" dir="rtl" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
