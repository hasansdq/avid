import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { str } from "@/lib/api-helpers";

/**
 * GET /api/admin/sms-logs — گزارش ارسال پیامک‌ها.
 *
 * پارامترها: phone? (contains)، kind?، page (۱ مبنا؛ ۲۰ رکورد در هر صفحه)
 * پاسخ: { logs, total, page, pageCount }
 */

const PER_PAGE = 20;

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const sp = req.nextUrl.searchParams;
    const phone = str(sp.get("phone") ?? "").replace(/[\s-]/g, "");
    const kind = str(sp.get("kind") ?? "");
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);

    const where: Prisma.SmsLogWhereInput = {};
    if (phone) where.phone = { contains: phone };
    if (kind) where.kind = kind;

    const total = await db.smsLog.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

    const logs = await db.smsLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    });

    return NextResponse.json({ logs, total, page, pageCount });
  } catch (error) {
    console.error("sms-logs GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت گزارش پیامک‌ها." },
      { status: 500 }
    );
  }
}
