import { createSocketIoProxy } from "@/lib/socket-proxy";

/**
 * مسیر fallback سرویس چت — `/socket.io/[[...rest]]`
 *
 * در استقرار استاندارد، وب‌سرور `/socket.io/` را مستقیم به پورت ۳۰۰۴
 * (سرویس چت) پروکسی می‌کند و این route هرگز اجرا نمی‌شود. اگر آن location
 * block تنظیم نشده باشد، درخواست‌های polling چت به همین route می‌رسند و از
 * این‌جا به سرویس پاس داده می‌شوند تا گفتگوی زنده وصل بماند.
 *
 * نشانی سرویس: CHAT_INTERNAL_URL → http://chat:3004 (compose) →
 * http://127.0.0.1:3004 (همان میزبان).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const proxy = createSocketIoProxy({
  routePrefix: "/socket.io",
  envUrl: process.env.CHAT_INTERNAL_URL,
  dockerService: "chat",
  port: 3004,
});

export const GET = proxy.GET;
export const POST = proxy.POST;
