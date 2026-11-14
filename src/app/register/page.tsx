import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SiteTextsProvider } from "@/components/site/editable-texts";
import { getSiteTextsServerContext } from "@/lib/site-texts-server";
import { RegisterPage } from "@/components/site/register-page";
import { ChatWidget } from "@/components/chat/chat-widget";

export const metadata: Metadata = {
  title: "ثبت‌نام در دوره‌ها | آوید",
  description:
    "پیش‌ثبت‌نام در دوره‌های آکادمی آوید — ایجاد حساب کاربری و انتخاب دوره (الزامی)؛ در کمتر از یک دقیقه جای خود را رزرو کنید.",
};

export default async function Register() {
  const [courses, textsCtx] = await Promise.all([
    db.course.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      // قالب اقساط هر دوره (تعداد و سررسیدها) برای نمایش در فرم
      include: { installmentTemplate: { orderBy: { index: "asc" } } },
    }),
    // تنظیمات + زمینه‌ی ویرایشگر مدادی (مداد فقط برای مدیرِ وارد‌شده)
    getSiteTextsServerContext(),
  ]);

  return (
    <>
      <SiteTextsProvider
        enabled={textsCtx.settings.pencilEditorEnabled}
        isAdmin={textsCtx.isAdmin}
        rows={textsCtx.rows}
        fonts={textsCtx.fonts}
        defaults={textsCtx.defaults}
      >
        <RegisterPage settings={textsCtx.settings} courses={courses} />
      </SiteTextsProvider>
      {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ در همه‌ی صفحات */}
      <ChatWidget />
    </>
  );
}
