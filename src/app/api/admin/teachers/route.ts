import { NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import { trackSignup } from "@/lib/stats";
import {
  isValidNationalId,
  normalizeNationalId,
} from "@/lib/national-id";

/**
 * GET /api/admin/teachers — فهرست اساتید آکادمی با آمار هر استاد.
 *
 * اساتید همان کاربرانی هستند که role آنها «teacher» است؛ به‌ازای هر استاد
 * شمار دوره‌ها، کلاس‌ها، استریم‌ها (کل و پایان‌یافته) و دانشجویان یکتای
 * دوره‌هایش محاسبه می‌شود.
 *
 * پاسخ: { teachers: (User + آمار)[], total }
 *
 * POST /api/admin/teachers — افزودن استاد به دو صورت:
 *  ۱) { userId } → تبدیل کاربر موجود به استاد (ارتقای نقش)
 *  ۲) { firstName, lastName, phone, nationalId?, note? } → ساخت کاربر جدیدِ استاد
 *     (اعتبارسنجی عین POST /api/admin/users)
 */

/** پاسخ یک استاد با آمار صفر (برای ایجاد/ارتقای تازه) */
function withZeroStats(user: User) {
  return {
    ...user,
    coursesCount: 0,
    classesCount: 0,
    streamsCount: 0,
    streamsEndedCount: 0,
    studentsCount: 0,
  };
}

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const teachers: User[] = await db.user.findMany({
      where: { role: "teacher" },
      orderBy: { createdAt: "desc" },
    });
    const ids = teachers.map((t) => t.id);

    // — دوره‌های همه‌ی اساتید در یک پرس‌وجو (مالک + عنوان) —
    const courses = ids.length
      ? await db.course.findMany({
          where: { teacherId: { in: ids } },
          select: { teacherId: true, title: true },
        })
      : [];
    const coursesByTeacher = new Map<string, number>();
    // عنوان دوره → استادهای مالکِ عنوان (دوره‌های هم‌عنوانِ دو استاد را هم پوشش می‌دهد)
    const teacherByTitle = new Map<string, Set<string>>();
    for (const c of courses) {
      if (!c.teacherId) continue;
      coursesByTeacher.set(c.teacherId, (coursesByTeacher.get(c.teacherId) ?? 0) + 1);
      const owners = teacherByTitle.get(c.title) ?? new Set<string>();
      owners.add(c.teacherId);
      teacherByTitle.set(c.title, owners);
    }

    // — کلاس‌های هر استاد (یک پرس‌وجوی گروهی) —
    const classGroups = ids.length
      ? await db.classRoom.groupBy({
          by: ["teacherId"],
          where: { teacherId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const classesByTeacher = new Map<string, number>();
    for (const g of classGroups) {
      if (g.teacherId) classesByTeacher.set(g.teacherId, g._count._all);
    }

    // — استریم‌های هر استاد: کل + شمار پایان‌یافته (یک پرس‌وجوی گروهی) —
    const streamGroups = ids.length
      ? await db.liveStream.groupBy({
          by: ["hostId", "status"],
          where: { hostId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const streamsByHost = new Map<string, number>();
    const streamsEndedByHost = new Map<string, number>();
    for (const g of streamGroups) {
      if (!g.hostId) continue;
      const count = g._count._all;
      streamsByHost.set(g.hostId, (streamsByHost.get(g.hostId) ?? 0) + count);
      if (g.status === "ended") {
        streamsEndedByHost.set(g.hostId, (streamsEndedByHost.get(g.hostId) ?? 0) + count);
      }
    }

    // — دانشجویان یکتای دوره‌های هر استاد — ثبت‌نام‌ها بر اساس «عنوان دوره»
    //   به مالک آن عنوان نگاشت می‌شوند و userId یکتا شمرده می‌شود.
    const allTitles = [...teacherByTitle.keys()];
    const enrollments = allTitles.length
      ? await db.enrollment.findMany({
          where: { course: { in: allTitles } },
          select: { course: true, userId: true },
        })
      : [];
    const studentsByTeacher = new Map<string, Set<string>>();
    for (const e of enrollments) {
      if (!e.userId) continue; // ثبت‌نام بدون حساب کاربری شمرده نمی‌شود
      const owners = teacherByTitle.get(e.course);
      if (!owners) continue;
      for (const teacherId of owners) {
        const set = studentsByTeacher.get(teacherId) ?? new Set<string>();
        set.add(e.userId);
        studentsByTeacher.set(teacherId, set);
      }
    }

    const rows = teachers.map((t) => ({
      ...t,
      coursesCount: coursesByTeacher.get(t.id) ?? 0,
      classesCount: classesByTeacher.get(t.id) ?? 0,
      streamsCount: streamsByHost.get(t.id) ?? 0,
      streamsEndedCount: streamsEndedByHost.get(t.id) ?? 0,
      studentsCount: studentsByTeacher.get(t.id)?.size ?? 0,
    }));

    return NextResponse.json({ teachers: rows, total: rows.length });
  } catch (error) {
    console.error("admin teachers GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت فهرست اساتید." },
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

    // — حالت ۱: تبدیل کاربر موجود به استاد —
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) return bad("کاربر پیدا نشد.", 404);
      if (user.role === "teacher") {
        return bad("این کاربر قبلاً استاد شده است.", 409);
      }
      const updated = await db.user.update({
        where: { id: userId },
        data: { role: "teacher" },
      });
      return NextResponse.json(withZeroStats(updated), { status: 201 });
    }

    // — حالت ۲: ساخت کاربر جدید با نقش استاد —
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
        role: "teacher",
        ...(nationalId ? { nationalId } : {}),
        ...(note ? { note } : {}),
      },
    });
    // ساخت دستی استاد توسط مدیر → آمار ثبت‌نام
    void trackSignup();

    return NextResponse.json(withZeroStats(user), { status: 201 });
  } catch (error) {
    console.error("admin teachers POST error:", error);
    return NextResponse.json(
      { error: "خطا در افزودن استاد." },
      { status: 500 }
    );
  }
}
