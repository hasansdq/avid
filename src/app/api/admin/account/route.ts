import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/admin/account — اطلاعات حساب مدیر جاری.
 * (نام کاربری + تعداد نشست‌های فعال برای ماژول «حساب و امنیت»)
 */
export async function GET(req: NextRequest) {
  const { admin, denial } = await requireAdmin(req);
  if (denial) return denial;

  const activeSessions = await db.adminSession.count({
    where: { adminId: admin.id, expiresAt: { gt: new Date() } },
  });

  return NextResponse.json({
    username: admin.username,
    activeSessions,
    createdAt: admin.createdAt,
  });
}
