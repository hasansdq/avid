import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SuperAdminApp } from "@/components/admin/super-admin";

export async function generateMetadata(): Promise<Metadata> {
  let siteName = "آوید";
  try {
    const settings = await db.siteSettings.findUnique({
      where: { id: "main" },
    });
    if (settings?.siteName) siteName = settings.siteName;
  } catch {
    // fallback به نام پیش‌فرض
  }

  return {
    title: `پنل مدیریت | ${siteName}`,
    robots: { index: false, follow: false },
  };
}

export default function SuperAdminPage() {
  return <SuperAdminApp />;
}
