import type { Metadata } from "next";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import { RegisterPage } from "@/components/site/register-page";
import { ChatWidget } from "@/components/chat/chat-widget";

export const metadata: Metadata = {
  title: "ثبت‌نام در دوره‌ها | آوید",
  description:
    "فرم پیش‌ثبت‌نام دوره‌های آموزشی آکادمی آوید — در کمتر از یک دقیقه جای خود را در دوره‌ها رزرو کنید.",
};

export default async function Register() {
  const [settings, courses] = await Promise.all([
    db.siteSettings.findUnique({ where: { id: "main" } }),
    db.course.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      // قالب اقساط هر دوره (تعداد و سررسیدها) برای نمایش در فرم
      include: { installmentTemplate: { orderBy: { index: "asc" } } },
    }),
  ]);

  return (
    <>
      <RegisterPage
        settings={settings ?? DEFAULT_SETTINGS}
        courses={courses}
      />
      {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ در همه‌ی صفحات */}
      <ChatWidget />
    </>
  );
}
