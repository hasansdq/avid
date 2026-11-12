import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str, int } from "@/lib/api-helpers";

/**
 * GET  /api/admin/courses/[id]/attendance — حضور و غیاب دوره
 * PUT  /api/admin/courses/[id]/attendance — عملیات حضور و غیاب
 *
 * GET پاسخ:
 *  · course     : { id, title, sessions, type }
 *  · sessions   : ردیف‌های جلسه‌های فعال‌شده/برگزارشده [{ index, active, heldAt }]
 *  · enrollments: ثبت‌نام‌های دوره [{ id, name, phone, status }]
 *  · records    : [{ enrollmentId, index, present }]
 *
 * PUT بدنه (action):
 *  · activate   { index } — فعال‌سازی جلسه: جلسه‌ی فعال دیگر (اگر بود) نهایی می‌شود؛
 *                            برای همه‌ی ثبت‌نام‌ها رکورد «حاضر» ساخته می‌شود.
 *  · deactivate { index } — غیرفعال‌سازی جلسه (رکوردها حفظ می‌شود).
 *  · toggle     { index, enrollmentId, present } — تغییر حضور/غیاب یک ثبت‌نام در جلسه.
 *  · setDate    { index, date } — تغییر تاریخ برگزاری جلسه (YYYY-MM-DD یا ISO)؛
 *                            تاریخ پیش‌فرض فعال‌سازی، همان امروز است اما مدیر می‌تواند آن را اصلاح کند.
 */

type Params = { params: Promise<{ id: string }> };

/** نام نمایشی ثبت‌نام — نام کاربر پیوندشده یا نام فرم */
function enrollmentName(e: {
  name: string;
  firstName: string;
  lastName: string;
}): string {
  const full = `${e.firstName} ${e.lastName}`.trim();
  return full || e.name || "—";
}

export async function GET(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const course = await db.course.findUnique({ where: { id } });
    if (!course) return bad("دوره‌ای با این شناسه یافت نشد.", 404);

    // ثبت‌نام‌های این دوره — تطبیق با عنوان دوره؛ آرشیوشده‌ها کنار گذاشته می‌شوند
    const enrollments = await db.enrollment.findMany({
      where: { course: course.title, status: { not: "archived" } },
      orderBy: { createdAt: "asc" },
    });

    const sessions = await db.attendanceSession.findMany({
      where: { courseId: course.id },
      orderBy: { index: "asc" },
    });

    const records = await db.attendanceRecord.findMany({
      where: { session: { courseId: course.id } },
      select: {
        enrollmentId: true,
        present: true,
        session: { select: { index: true } },
      },
    });

    return NextResponse.json(
      {
        course: {
          id: course.id,
          title: course.title,
          sessions: course.sessions,
          type: course.type,
        },
        sessions: sessions.map((s) => ({
          index: s.index,
          active: s.active,
          heldAt: s.heldAt,
        })),
        enrollments: enrollments.map((e) => ({
          id: e.id,
          name: enrollmentName(e),
          phone: e.phone,
          status: e.status,
        })),
        records: records.map((r) => ({
          enrollmentId: r.enrollmentId,
          index: r.session.index,
          present: r.present,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("attendance GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت حضور و غیاب دوره." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const course = await db.course.findUnique({ where: { id } });
    if (!course) return bad("دوره‌ای با این شناسه یافت نشد.", 404);

    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const action = str(body.action);
    const index = int(body.index, 0);

    if (index < 1 || index > course.sessions) {
      return bad(`شماره‌ی جلسه باید بین ۱ تا ${course.sessions} باشد.`);
    }

    // ——— فعال‌سازی جلسه ———
    if (action === "activate") {
      // جلسه‌ی فعال دیگرِ همین دوره نهایی می‌شود (رکوردهایش حفظ می‌شود)
      await db.attendanceSession.updateMany({
        where: { courseId: course.id, active: true },
        data: { active: false },
      });

      // ردیف جلسه (اگر بود ویرایش، وگرنه ساخت) — فعال با تاریخ امروز
      const session = await db.attendanceSession.upsert({
        where: { courseId_index: { courseId: course.id, index } },
        create: { courseId: course.id, index, active: true, heldAt: new Date() },
        update: { active: true, heldAt: new Date() },
      });

      // رکوردهای قبلی این جلسه پاک و همه «حاضر» ثبت می‌شوند
      await db.attendanceRecord.deleteMany({ where: { sessionId: session.id } });
      const enrollments = await db.enrollment.findMany({
        where: { course: course.title, status: { not: "archived" } },
        select: { id: true },
      });
      if (enrollments.length > 0) {
        await db.attendanceRecord.createMany({
          data: enrollments.map((e) => ({
            sessionId: session.id,
            enrollmentId: e.id,
            present: true,
          })),
        });
      }

      return NextResponse.json({
        ok: true,
        message: `جلسه ${index} فعال شد — همه حاضر ثبت شدند`,
      });
    }

    // ——— غیرفعال‌سازی جلسه ———
    if (action === "deactivate") {
      await db.attendanceSession.updateMany({
        where: { courseId: course.id, index },
        data: { active: false },
      });
      return NextResponse.json({ ok: true, message: `جلسه ${index} غیرفعال شد` });
    }

    // ——— تغییر تاریخ برگزاری جلسه ———
    if (action === "setDate") {
      const raw = typeof body.date === "string" ? body.date.trim() : "";
      if (!raw) return bad("تاریخ جلسه ارسال نشده است.");

      // پذیرش YYYY-MM-DD یا ISO کامل — ساعت نیمه‌شب گرفته می‌شود تا نمایش
      // شمسی همان روز انتخابی را نشان دهد
      const ts = Date.parse(raw.length === 10 ? `${raw}T00:00:00` : raw);
      if (Number.isNaN(ts)) {
        return bad("تاریخ نامعتبر است.");
      }
      const heldAt = new Date(ts);

      // ردیف جلسه — اگر نبود، با همین تاریخ ساخته می‌شود (غیرفعال) تا
      // مدیر بتواند از قبل تاریخ جلسات آینده را برنامه‌ریزی کند
      const session = await db.attendanceSession.upsert({
        where: { courseId_index: { courseId: course.id, index } },
        create: { courseId: course.id, index, active: false, heldAt },
        update: { heldAt },
      });

      return NextResponse.json({
        ok: true,
        message: `تاریخ جلسه ${index} ثبت شد`,
        session: { index: session.index, active: session.active, heldAt: session.heldAt },
      });
    }

    // ——— تغییر حضور/غیاب یک ثبت‌نام ———
    if (action === "toggle") {
      const enrollmentId = str(body.enrollmentId);
      const present = body.present === true || body.present === "true";

      if (!enrollmentId) return bad("شناسه‌ی ثبت‌نام لازم است.");

      const enrollment = await db.enrollment.findUnique({
        where: { id: enrollmentId },
      });
      if (!enrollment || enrollment.course !== course.title) {
        return bad("این ثبت‌نام متعلق به دوره‌ی مورد نظر نیست.", 404);
      }

      // ردیف جلسه — اگر نبود (نمی‌بایست رخ دهد) ساخته می‌شود
      const session = await db.attendanceSession.upsert({
        where: { courseId_index: { courseId: course.id, index } },
        create: { courseId: course.id, index, active: false },
        update: {},
      });

      await db.attendanceRecord.upsert({
        where: {
          sessionId_enrollmentId: {
            sessionId: session.id,
            enrollmentId,
          },
        },
        create: { sessionId: session.id, enrollmentId, present },
        update: { present },
      });

      return NextResponse.json({ ok: true });
    }

    return bad("عملیات نامعتبر است (activate | deactivate | toggle).");
  } catch (error) {
    console.error("attendance PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت حضور و غیاب." },
      { status: 500 }
    );
  }
}
