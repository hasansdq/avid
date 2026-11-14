import type { Metadata } from "next";
import { VideosPage } from "@/components/site/videos-page";
import { SiteTextsProvider } from "@/components/site/editable-texts";
import { getSiteTextsServerContext } from "@/lib/site-texts-server";
import { ChatWidget } from "@/components/chat/chat-widget";

/**
 * صفحه‌ی مستقل ویدئوها — شبکه‌ی تصویری لیست‌های پخش.
 * مخاطب هر لیست پخش (مهمان/کاربر/هر دو) سمت سرورِ /api/videos اعمال می‌شود.
 *
 * ویرایشگر ظاهری مدادی روی تیتر و توضیح صفحه فعال است (SiteTextsProvider) —
 * فقط مدیرِ وارد‌شده آیکون مداد را می‌بیند.
 */
export const metadata: Metadata = {
  title: "ویدئوهای آموزشی | آکادمی آوید",
  description:
    "لیست‌های پخش آموزشی آکادمی آوید — مجموعه‌های ویدئویی رایگان برای یادگیری مهارت‌های آینده.",
};

export default async function VideosRoute() {
  const textsCtx = await getSiteTextsServerContext();

  return (
    <>
      <SiteTextsProvider
        enabled={textsCtx.settings.pencilEditorEnabled}
        isAdmin={textsCtx.isAdmin}
        rows={textsCtx.rows}
        fonts={textsCtx.fonts}
        defaults={textsCtx.defaults}
      >
        <VideosPage />
      </SiteTextsProvider>
      {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ */}
      <ChatWidget />
    </>
  );
}
