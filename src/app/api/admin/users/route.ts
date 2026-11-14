import { NextRequest, NextResponse } from "next/server";
import type { Prisma, User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import {
  isValidNationalId,
  normalizeNationalId,
} from "@/lib/national-id";

/**
 * GET /api/admin/users — فهرست کاربران سایت با آمار ثبت‌نام و اقساط.
 *
 * پارامترها:
 *  • q      — جست‌وجو در نام/نام خانوادگی/شماره (contains)
 *  • status — all | active | blocked
 *  • page   — شماره‌ی صفحه (۱ مبنا؛ ۲۰ کاربر در هر صفحه)
 *
 * پاسخ: { users: (User + آمار)[], total, page, pageCount }
 *
 * POST /api/admin/users — افزودن کاربر جدید توسط مدیر.
 * فیلدهای الزامی: نام، نام خانوادگی و شماره موبایل (یکتا).
 * یادداشت مدیر اختیاری است؛ وضعیت حساب پیش‌فرض «فعال» است.
 */

const PER_PAGE = 20;

interface UserStats {
  enrollmentsCount: number;
  installmentPaid: number;
  installmentPending: number;
  installmentTotalAmount: number;
  installmentPaidAmount: number;
}

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const sp = req.nextUrl.searchParams;
    const q = str(sp.get("q") ?? "").slice(0, 80);
    const status = str(sp.get("status") ?? "all");
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);

    const where: Prisma.UserWhereInput = {};
    if (q) {
      // جست‌وجو در نام/نام خانوادگی/شماره/کد ملی
      where.OR = [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { phone: { contains: q } },
        { nationalId: { contains: q } },
      ];
    }
    if (status === "active" || status === "blocked") {
      where.status = status;
    }

    const total = await db.user.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

    const users: User[] = await db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    });

    // — آمار ثبت‌نام و اقساط همه‌ی کاربرانِ همین صفحه در یک پرس‌وجو —
    const ids = users.map((u) => u.id);
    const enrollments = ids.length
      ? await db.enrollment.findMany({
          where: { userId: { in: ids } },
          select: {
            userId: true,
            installments: { select: { amount: true, status: true } },
          },
        })
      : [];

    const statsByUser = new Map<string, UserStats>();
    for (const e of enrollments) {
      // ثبت‌نام‌های بدون حساب کاربری (SetNull) در آمار لحاظ نمی‌شوند
      if (!e.userId) continue;
      const stats: UserStats =
        statsByUser.get(e.userId) ??
        {
          enrollmentsCount: 0,
          installmentPaid: 0,
          installmentPending: 0,
          installmentTotalAmount: 0,
          installmentPaidAmount: 0,
        };
      stats.enrollmentsCount += 1;
      for (const inst of e.installments) {
        stats.installmentTotalAmount += inst.amount;
        if (inst.status === "paid") {
          stats.installmentPaid += 1;
          stats.installmentPaidAmount += inst.amount;
        } else {
          // اقساط پرداخت‌نشده: pending یا overdue
          stats.installmentPending += 1;
        }
      }
      statsByUser.set(e.userId, stats);
    }

    const usersWithStats = users.map((u) => {
      const stats = statsByUser.get(u.id);
      return {
        ...u,
        enrollmentsCount: stats?.enrollmentsCount ?? 0,
        installmentPaid: stats?.installmentPaid ?? 0,
        installmentPending: stats?.installmentPending ?? 0,
        installmentTotalAmount: stats?.installmentTotalAmount ?? 0,
        installmentPaidAmount: stats?.installmentPaidAmount ?? 0,
      };
    });

    return NextResponse.json({
      users: usersWithStats,
      total,
      page,
      pageCount,
    });
  } catch (error) {
    console.error("admin users GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت فهرست کاربران." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    // — فیلدهای الزامی: نام، نام خانوادگی و شماره موبایل —
    const firstName = str(body.firstName);
    const lastName = str(body.lastName);
    const phone = str(body.phone).replace(/[\s-]/g, "");

    if (firstName.length < 2 || firstName.length > 40) {
      return bad("نام باید ۲ تا ۴۰ نویسه باشد.");
    }
    if (lastName.length < 2 || lastName.length > 40) {
      return bad("نام خانوادگی باید ۲ تا ۴۰ نویسه باشد.");
    }
    if (!/^09\d{9}$/.test(phone)) {
      return bad("شماره موبایل معتبر نیست (مثال: 09123456789).");
    }

    // — یکتایی شماره موبایل —
    const clash = await db.user.findUnique({ where: { phone } });
    if (clash) {
      return bad("این شماره موبایل به کاربر دیگری تعلق دارد.", 409);
    }

    // — کد ملی (اختیاری) — ۱۰ رقم معتبر و یکتا —
    let nationalId: string | undefined;
    if (typeof body.nationalId === "string" && body.nationalId.trim() !== "") {
      const clean = normalizeNationalId(body.nationalId);
      if (!isValidNationalId(clean)) {
        return bad("کد ملی ۱۰ رقمی معتبر وارد کنید یا این فیلد را خالی بگذارید.");
      }
      const owner = await db.user.findUnique({ where: { nationalId: clean } });
      if (owner) {
        return bad("این کد ملی به کاربر دیگری تعلق دارد.", 409);
      }
      nationalId = clean;
    }

    // — یادداشت مدیر (اختیاری) —
    const rawNote = body.note;
    const note =
      rawNote === null || rawNote === undefined ? "" : str(String(rawNote));
    if (note.length > 500) {
      return bad("یادداشت نمی‌تواند بیش از ۵۰۰ نویسه باشد.");
    }

    const user = await db.user.create({
      data: {
        firstName,
        lastName,
        phone,
        ...(nationalId ? { nationalId } : {}),
        ...(note ? { note } : {}),
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("admin users POST error:", error);
    return NextResponse.json(
      { error: "خطا در افزودن کاربر." },
      { status: 500 }
    );
  }
}
