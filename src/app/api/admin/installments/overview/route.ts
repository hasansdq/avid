import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/admin/installments/overview — نمای اقساط برای هدر پنل مدیریت
 *
 * پاسخ:
 *  · dueSoon   : اقساط سررسیدشده از امروز تا پس‌فردا (امروز/فردا/پس‌فردا) + معوق‌های گذشته
 *  · recentPaid: آخرین اقساط پرداخت‌شده (۱۰ مورد اخیر)
 *  · remaining : همه‌ی اقساط باقیمانده‌ی همه‌ی کاربران (pending/overdue) — قدیمی‌ترین سررسید اول
 *  · summary   : شمارش‌ها و مبالغ کل
 *
 * هر قسط همراه نام کاربر/ثبت‌نام و دوره است.
 */

/** شروع روز (ساعت ۰۰:۰۰ به وقت محلی سرور) */
function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** پایان روز (۲۳:۵۹:۵۹.۹۹۹) */
function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** فیلد مشترک برای انتخاب قسط + داده‌ی ثبت‌نام/کاربر */
const INCLUDE = {
  enrollment: {
    include: {
      user: {
        select: { firstName: true, lastName: true, phone: true },
      },
    },
  },
} as const;

type InstallmentWithHolder = {
  id: string;
  index: number;
  amount: number;
  dueDate: Date;
  status: string;
  paidAt: Date | null;
  note: string | null;
  enrollmentId: string;
  enrollment: {
    name: string;
    course: string;
    user: { firstName: string; lastName: string; phone: string } | null;
  };
};

/** نام نمایشی دارنده‌ی قسط */
function holderName(inst: InstallmentWithHolder): string {
  if (inst.enrollment.user) {
    const name = `${inst.enrollment.user.firstName} ${inst.enrollment.user.lastName}`.trim();
    if (name) return name;
  }
  return inst.enrollment.name || inst.enrollment.user?.phone || "—";
}

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const dayAfterTomorrowEnd = endOfDay(
      new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
    );

    // ۱) اقساط سررسید امروز تا پس‌فردا + معوق‌های گذشته (که هنوز پرداخت نشده‌اند)
    const [dueSoonCurrent, overdueList, recentPaid, remaining, totals] =
      await Promise.all([
        db.installment.findMany({
          where: {
            status: { not: "paid" },
            dueDate: { gte: todayStart, lte: dayAfterTomorrowEnd },
          },
          include: INCLUDE,
          orderBy: { dueDate: "asc" },
        }),
        db.installment.findMany({
          where: {
            status: { not: "paid" },
            dueDate: { lt: todayStart },
          },
          include: INCLUDE,
          orderBy: { dueDate: "asc" },
        }),
        db.installment.findMany({
          where: { status: "paid", paidAt: { not: null } },
          include: INCLUDE,
          orderBy: { paidAt: "desc" },
          take: 10,
        }),
        db.installment.findMany({
          where: { status: { not: "paid" } },
          include: INCLUDE,
          orderBy: { dueDate: "asc" },
        }),
        db.installment.groupBy({
          by: ["status"],
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

    // معوق‌های گذشته هم «رسید امروز» محسوب می‌شوند (نیازمند اقدام فوری)
    const dueSoon = [...overdueList, ...dueSoonCurrent];

    // خلاصه‌ی کلی
    const summary = {
      total: 0,
      paid: 0,
      paidAmount: 0,
      pending: 0,
      pendingAmount: 0,
      overdue: 0,
      overdueAmount: 0,
    };
    for (const g of totals) {
      summary.total += g._count._all;
      if (g.status === "paid") {
        summary.paid += g._count._all;
        summary.paidAmount += g._sum.amount ?? 0;
      } else if (g.status === "overdue") {
        summary.overdue += g._count._all;
        summary.overdueAmount += g._sum.amount ?? 0;
        summary.pending += g._count._all;
        summary.pendingAmount += g._sum.amount ?? 0;
      } else {
        summary.pending += g._count._all;
        summary.pendingAmount += g._sum.amount ?? 0;
      }
    }

    /** برچسب نسبی سررسید */
    function relativeDay(
      dueDate: Date
    ): "overdue" | "today" | "tomorrow" | "dayAfter" | "later" {
      const t = startOfDay(new Date(dueDate)).getTime();
      const today = todayStart.getTime();
      const DAY = 24 * 60 * 60 * 1000;
      if (t < today) return "overdue";
      if (t === today) return "today";
      if (t === today + DAY) return "tomorrow";
      if (t === today + 2 * DAY) return "dayAfter";
      return "later";
    }

    const map = (inst: InstallmentWithHolder) => ({
      id: inst.id,
      index: inst.index,
      amount: inst.amount,
      dueDate: inst.dueDate,
      status: inst.status,
      paidAt: inst.paidAt,
      note: inst.note,
      holder: holderName(inst),
      phone: inst.enrollment.user?.phone ?? "",
      course: inst.enrollment.course,
      enrollmentId: inst.enrollmentId,
      relative: relativeDay(inst.dueDate),
    });

    return NextResponse.json(
      {
        dueSoon: dueSoon.map(map),
        recentPaid: recentPaid.map(map),
        remaining: remaining.map(map),
        summary,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("installments overview error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت وضعیت اقساط." },
      { status: 500 }
    );
  }
}
