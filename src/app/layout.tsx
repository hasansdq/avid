import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { FontStylesheets } from "@/components/font-loader";
import { db } from "@/lib/db";
import { cssTextForKeys } from "@/lib/fonts";

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
    openGraph: {
      title: `${siteName} | ${tagline}`,
      description: slogan,
      type: "website",
      locale: "fa_IR",
      siteName,
    },
  };
}

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
        <FontStylesheets cssTexts={cssTexts} />
        <ThemeProvider>
          {children}
          <Toaster position="top-center" dir="rtl" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
