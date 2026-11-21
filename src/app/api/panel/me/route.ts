import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { destroyUserSession, getSessionUser } from "@/lib/user-auth";
import {
  isValidNationalId,
  normalizeNationalId,
} from "@/lib/national-id";

/**
 * GET /api/panel/me — داده‌ی پنل کاربر (پس از ورود با پیامک).
 *
 * نشست لازم است (کوکی avid_user)؛ کاربر مسدود → نشست باطل و ۴۰۳.
 * پاسخ: { user: {id, firstName, lastName, phone, nationalId, createdAt}, enrollments }
 * (هر ثبت‌نام همراه اقساط خودش و حضور و غیاب جلسات دوره — مرتب بر اساس شماره‌ی قسط/جلسه)
 *
 * PUT /api/panel/me — به‌روزرسانی کد ملی (اختیاری) توسط خود کاربر.
 * body: { nationalId: string } — رشته‌ی خالی = حذف کد ملی.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "برای مشاهده‌ی پنل، وارد حساب خود شوید." },
        { status: 401 }
      );
    }

    const user = await db.user.findUnique({ where: { id: session.id } });
    if (!user) {
      await destroyUserSession(req);
      return NextResponse.json(
        { error: "حساب کاربری یافت نشد؛ دوباره وارد شوید." },
        { status: 401 }
      );
    }

    // — کاربر مسدود: نشست باطل و توقف —
    if (user.status === "blocked") {
      await destroyUserSession(req);
      const res = NextResponse.json(
        { error: "حساب شما مسدود شده است." },
        { status: 403 }
      );
      res.cookies.set("avid_user", "", { path: "/", maxAge: 0 });
      return res;
    }

    const enrollments = await db.enrollment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { installments: { orderBy: { index: "asc" } } },
    });

    // — حضور و غیاب: دوره‌ی متناظر هر ثبت‌نام از روی عنوان پیدا می‌شود —
    const titles = Array.from(
      new Set(enrollments.map((e) => e.course).filter((t) => t.length > 0))
    );
    const courses =
      titles.length > 0
        ? await db.course.findMany({
            where: { title: { in: titles } },
            include: {
              attendanceSessions: { orderBy: { index: "asc" } },
            },
          })
        : [];
    const courseByTitle = new Map(courses.map((c) => [c.title, c]));

    // رکوردهای حضور و غیاب همه‌ی ثبت‌نام‌های این کاربر
    const enrollmentIds = enrollments.map((e) => e.id);
    const records =
      enrollmentIds.length > 0
        ? await db.attendanceRecord.findMany({
            where: { enrollmentId: { in: enrollmentIds } },
            include: {
              session: { select: { courseId: true, index: true } },
            },
          })
        : [];

    // enrollmentId → (courseId:index) → حاضر/غایب
    const recordsByEnrollment = new Map<string, Map<string, boolean>>();
    for (const r of records) {
      let m = recordsByEnrollment.get(r.enrollmentId);
      if (!m) {
        m = new Map<string, boolean>();
        recordsByEnrollment.set(r.enrollmentId, m);
      }
      m.set(`${r.session.courseId}:${r.session.index}`, r.present);
    }

    const enriched = enrollments.map((e) => {
      const course = courseByTitle.get(e.course);
      if (!course) return { ...e, attendance: null };

      const recs = recordsByEnrollment.get(e.id);
      return {
        ...e,
        attendance: {
          // تعداد کل جلسات دوره از تعریف دوره
          courseSessions: course.sessions,
          sessions: course.attendanceSessions.map((s) => ({
            index: s.index,
            active: s.active,
            heldAt: s.heldAt,
            // null یعنی حضور/غیاب این جلسه هنوز ثبت نشده است
            present: recs?.get(`${course.id}:${s.index}`) ?? null,
          })),
        },
      };
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          nationalId: user.nationalId,
          role: user.role, // student | teacher — استاد بخش‌های ویژه‌ی پنل را می‌بیند
          createdAt: user.createdAt,
        },
        enrollments: enriched,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("panel me GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت اطلاعات پنل." },
      { status: 500 }
    );
  }
}

/** PUT /api/panel/me — به‌روزرسانی کد ملی (فیلد اختیاری) حساب خود کاربر */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "برای ویرایش اطلاعات، وارد حساب خود شوید." },
        { status: 401 }
      );
    }

    const user = await db.user.findUnique({ where: { id: session.id } });
    if (!user) {
      await destroyUserSession(req);
      return NextResponse.json(
        { error: "حساب کاربری یافت نشد؛ دوباره وارد شوید." },
        { status: 401 }
      );
    }
    if (user.status === "blocked") {
      await destroyUserSession(req);
      const res = NextResponse.json(
        { error: "حساب شما مسدود شده است." },
        { status: 403 }
      );
      res.cookies.set("avid_user", "", { path: "/", maxAge: 0 });
      return res;
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.nationalId !== "string") {
      return NextResponse.json(
        { error: "بدنه‌ی درخواست نامعتبر است." },
        { status: 400 }
      );
    }

    const clean = normalizeNationalId(body.nationalId);

    // رشته‌ی خالی = حذف کد ملی؛ مقدار غیرخالی باید معتبر و یکتا باشد
    if (clean !== "") {
      if (!isValidNationalId(clean)) {
        return NextResponse.json(
          {
            error: "کد ملی ۱۰ رقمی معتبر وارد کنید یا این فیلد را خالی بگذارید.",
          },
          { status: 400 }
        );
      }
      const owner = await db.user.findUnique({ where: { nationalId: clean } });
      if (owner && owner.id !== user.id) {
        return NextResponse.json(
          { error: "این کد ملی به حساب کاربری دیگری تعلق دارد." },
          { status: 409 }
        );
      }
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { nationalId: clean === "" ? null : clean },
    });

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: updated.id,
          firstName: updated.firstName,
          lastName: updated.lastName,
          phone: updated.phone,
          nationalId: updated.nationalId,
          role: updated.role,
          createdAt: updated.createdAt,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("panel me PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی کد ملی." },
      { status: 500 }
    );
  }
}
