import type { Metadata } from "next";
import { cache } from "react";
import type { SiteSettings } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import { PanelApp } from "@/components/panel/panel-app";
import { ChatWidget } from "@/components/chat/chat-widget";

/**
 * پنل کاربران — صفحه‌ی مستقل تمام‌صفحه (بدون ایندکس توسط موتورهای جست‌وجو).
 * عنوان داینامیک از نام سایت خوانده می‌شود (با جایگزین امن «آوید»).
 */

const getSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const settings = await db.siteSettings.findUnique({
      where: { id: "main" },
    });
    return settings ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: `پنل کاربران | ${settings.siteName}`,
    robots: { index: false, follow: false },
  };
}

export default async function PanelPage() {
  const settings = await getSettings();

  return (
    <>
      <PanelApp settings={settings} />
      {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ در همه‌ی صفحات */}
      <ChatWidget />
    </>
  );
}
