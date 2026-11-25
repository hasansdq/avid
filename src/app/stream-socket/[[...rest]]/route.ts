import { createSocketIoProxy } from "@/lib/socket-proxy";

/**
 * مسیر fallback سرویس کلاس آنلاین — `/stream-socket/[[...rest]]`
 *
 * در استقرار استاندارد، وب‌سرور `/stream-socket/` را مستقیم به پورت ۳۰۰۵
 * (سرویس استریم) پروکسی می‌کند و این route هرگز اجرا نمی‌شود. اگر آن
 * location block در Apache/nginx (DirectAdmin Custom HTTPD) تنظیم
 * نشده باشد، درخواست‌های polling سیگنالینگ به همین route می‌رسند و از
 * این‌جا به سرویس پاس داده می‌شوند تا کلاس آنلاین وصل بماند.
 *
 * نشانی سرویس: STREAM_INTERNAL_URL → http://stream:3005 (compose) →
 * http://127.0.0.1:3005 (همان میزبان).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const proxy = createSocketIoProxy({
  routePrefix: "/stream-socket",
  envUrl: process.env.STREAM_INTERNAL_URL,
  dockerService: "stream",
  port: 3005,
});

export const GET = proxy.GET;
export const POST = proxy.POST;
