import type { Metadata } from "next";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import { CertificateVerifyPage } from "@/components/site/certificate-verify-page";
import { ChatWidget } from "@/components/chat/chat-widget";

export const metadata: Metadata = {
  title: "استعلام گواهی‌نامه | آوید",
  description:
    "استعلام آنلاین و عمومی گواهی‌نامه‌های آکادمی آوید با کد ملی — بدون نیاز به ورود به حساب، همراه با دانلود فایل گواهی‌نامه.",
};

export default async function Certificate() {
  const settings = await db.siteSettings.findUnique({
    where: { id: "main" },
  });

  return (
    <>
      <CertificateVerifyPage settings={settings ?? DEFAULT_SETTINGS} />
      {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ در همه‌ی صفحات */}
      <ChatWidget />
    </>
  );
}
