import type { Metadata } from "next";
import { VideosPage } from "@/components/site/videos-page";
import { ChatWidget } from "@/components/chat/chat-widget";

/**
 * صفحه‌ی مستقل ویدئوها — شبکه‌ی تصویری لیست‌های پخش.
 * مخاطب هر لیست پخش (مهمان/کاربر/هر دو) سمت سرورِ /api/videos اعمال می‌شود.
 */
export const metadata: Metadata = {
  title: "ویدئوهای آموزشی | آکادمی آوید",
  description:
    "لیست‌های پخش آموزشی آکادمی آوید — مجموعه‌های ویدئویی رایگان برای یادگیری مهارت‌های آینده.",
};

export default function VideosRoute() {
  return (
    <>
      <VideosPage />
      {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ */}
      <ChatWidget />
    </>
  );
}
