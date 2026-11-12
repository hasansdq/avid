import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/health — سلامت سرویس (برای healthcheck داکر/مانیتورینگ).
 *
 * وضعیت «ناموفق» (۵۰۳) وقتی گزارش می‌شود که اتصال دیتابیس برقرار نشود —
 * یعنی healthcheck کانتینر وب با خطای دیتابیس «unhealthy» می‌شود و در
 * `docker compose ps` قابل مشاهده است (خودِ فرآیند زنده است اما سرویس
 * قابل استفاده نیست).
 */
export async function GET() {
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json(
    {
      ok: dbOk,
      service: "avid-web",
      db: dbOk ? "ok" : "error",
      time: new Date().toISOString(),
    },
    {
      status: dbOk ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
