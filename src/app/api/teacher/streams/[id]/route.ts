import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTeacher, ownsStream } from "@/lib/teacher";
import { bad, str } from "@/lib/api-helpers";
import { validateInviteSlugInput } from "@/lib/classes";
import {
  invitationViews,
  isStreamStatus,
  MAX_STREAM_INVITATIONS,
  STREAM_INCLUDE,
  type StreamWithExtras,
} from "@/lib/streams";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/teacher/streams/[id] — ویرایش جلسه‌ی آنلاینی که خودِ استاد
 * میزبانش است. body:
 *  { title?, description?, status?: "live"|"ended"|"scheduled",
 *    courseIds?, classIds?, inviteSlug? }
 *
 *  • status="live"   → شروع جلسه (startedAt در اولین بار ثبت می‌شود)
 *  • status="ended"  → پایان جلسه (endedAt + بستن حضور باقی‌مانده)
 *  • courseIds/classIds (اختیاری) → جایگزینی کامل دعوت‌ها (صفر دعوت مجاز —
 *    لینک دعوت یکتا خودش دعوت است)
 *  • inviteSlug → تغییر شناسه‌ی لینک دعوت (یکتایی نسبت به کلاس‌ها بررسی می‌شود)
 * DELETE /api/teacher/streams/[id] — حذف جلسه‌ی خودِ استاد.
 */

/** شکل ردیف استریم استاد — `_count` حذف و participantsCount افزوده می‌شود */
function toTeacherStream(s: StreamWithExtras) {
  const { _count, ...rest } = s;
  return {
    ...rest,
    invitations: invitationViews(s),
    participantsCount: _count.participants,
  };
}

/**
 * اعتبارسنجی اهداف دعوت جلسه‌ی استاد — دوره/کلاس باید متعلق به خودِ او
 * باشد. برخلاف جلسه‌ی مدیر، صفر دعوت هم مجاز است («لینک-تنها»).
 * شناسه‌ها یکتاسازی و در مجموع به سقف MAX_STREAM_INVITATIONS محدود می‌شوند.
 */
async function ownInvitationRows(
  teacherId: string,
  courseIds: string[],
  classIds: string[]
): Promise<
  | { ok: true; rows: Prisma.StreamInvitationCreateManyStreamInput[] }
  | { ok: false; error: string }
> {
  const dedupedCourseIds = Array.from(new Set(courseIds.filter(Boolean)));
  const dedupedClassIds = Array.from(new Set(classIds.filter(Boolean)));
  if (
    dedupedCourseIds.length + dedupedClassIds.length >
    MAX_STREAM_INVITATIONS
  ) {
    return {
      ok: false,
      error: "حداکثر ۶۰ دوره/کلاس برای دعوت هر جلسه‌ی آنلاین می‌توان انتخاب کرد.",
    };
  }

  const rows: Prisma.StreamInvitationCreateManyStreamInput[] = [];
  if (dedupedCourseIds.length > 0) {
    const courses = await db.course.findMany({
      where: { id: { in: dedupedCourseIds }, teacherId },
      select: { id: true, title: true },
    });
    if (courses.length !== dedupedCourseIds.length) {
      return { ok: false, error: "یک یا چند دوره‌ی انتخاب‌شده پیدا نشد." };
    }
    for (const c of courses) rows.push({ courseId: c.id, courseTitle: c.title });
  }

  if (dedupedClassIds.length > 0) {
    const classes = await db.classRoom.findMany({
      where: { id: { in: dedupedClassIds }, teacherId },
      select: { id: true },
    });
    if (classes.length !== dedupedClassIds.length) {
      return { ok: false, error: "یک یا چند کلاس انتخاب‌شده پیدا نشد." };
    }
    for (const c of classes) rows.push({ classId: c.id });
  }

  return { ok: true, rows };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    // requireTeacher داخل try — خطای لایه‌ی احراز هم JSON مشخص برمی‌گرداند
    const { teacher, denial } = await requireTeacher(req);
    if (denial) return denial;
    // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
    if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    // مالکیت: میزبان جلسه باید همین استاد باشد (جلسه‌ی خارج → ۴۰۴)
    const current = await db.liveStream.findUnique({ where: { id } });
    if (!current || !ownsStream(current, teacher.id)) {
      return bad("کلاس آنلاین پیدا نشد.", 404);
    }

    const data: Record<string, unknown> = {};
    if (typeof body?.title === "string") {
      const title = str(body.title);
      if (title.length < 2 || title.length > 120) {
        return bad("عنوان کلاس آنلاین باید ۲ تا ۱۲۰ نویسه باشد.");
      }
      data.title = title;
    }
    if (typeof body?.description === "string") {
      data.description = str(body.description).slice(0, 600);
    }
    if (body?.status !== undefined) {
      if (!isStreamStatus(body.status)) return bad("وضعیت کلاس معتبر نیست.");
      if (body.status === "live") {
        data.status = "live";
        // startedAt فقط در اولین شروع ثبت می‌شود
        data.startedAt = new Date();
        data.endedAt = null;
      } else if (body.status === "ended") {
        data.status = "ended";
        data.endedAt = new Date();
      } else {
        data.status = "scheduled";
      }
    }

    // — شناسه‌ی لینک دعوت (اختیاری؛ فقط اگر متفاوت با کنونی باشد) —
    if (typeof body?.inviteSlug === "string") {
      const inviteSlug = str(body.inviteSlug).toLowerCase();
      if (inviteSlug && inviteSlug !== current.inviteSlug) {
        const validationError = validateInviteSlugInput(inviteSlug);
        if (validationError) return bad(validationError);

        // یکتایی نسبت به استریم‌های دیگر (به‌جز خودِ این جلسه)
        const streamOwner = await db.liveStream.findUnique({
          where: { inviteSlug },
          select: { id: true },
        });
        if (streamOwner && streamOwner.id !== id) {
          return bad("این شناسه‌ی لینک دعوت قبلاً استفاده شده است.", 409);
        }
        // یکتایی نسبت به کلاس‌ها — لینک دعوت هر دو یک مسیر است
        const classOwner = await db.classRoom.findUnique({
          where: { inviteSlug },
          select: { id: true },
        });
        if (classOwner) {
          return bad("این شناسه‌ی لینک دعوت قبلاً استفاده شده است.", 409);
        }
        data.inviteSlug = inviteSlug;
      }
    }

    // — جایگزینی دعوت‌ها (اگر آرایه‌ها ارائه شده باشند) —
    const replacingInvitations =
      Array.isArray(body?.courseIds) || Array.isArray(body?.classIds);

    if (Object.keys(data).length === 0 && !replacingInvitations) {
      return bad("هیچ فیلد قابل ویرایشی ارسال نشده است.");
    }

    let preparedRows: Prisma.StreamInvitationCreateManyStreamInput[] | null =
      null;
    if (replacingInvitations) {
      const courseIds = Array.isArray(body?.courseIds)
        ? (body.courseIds as unknown[]).map(String)
        : [];
      const classIds = Array.isArray(body?.classIds)
        ? (body.classIds as unknown[]).map(String)
        : [];
      const prepared = await ownInvitationRows(teacher.id, courseIds, classIds);
      if (!prepared.ok) return bad(prepared.error);
      // صفر دعوت هم مجاز است — لینک دعوت یکتا خودش دعوت است
      preparedRows = prepared.rows;
    }

    const stream = await db.liveStream.update({
      where: { id },
      data: {
        ...data,
        invitations: preparedRows
          ? {
              deleteMany: {},
              createMany: { data: preparedRows },
            }
          : undefined,
      },
      include: STREAM_INCLUDE,
    });

    // پایان جلسه: حضور همه‌ی افرادی که هنوز «در کلاس» هستند بسته می‌شود
    if (data.status === "ended") {
      await db.streamParticipant.updateMany({
        where: { streamId: id, leftAt: null },
        data: { leftAt: new Date() },
      });
    }

    return NextResponse.json(toTeacherStream(stream));
  } catch (error) {
    // برخورد یکتایی شناسه‌ی لینک دعوت در رقابت نادر همزمانی
    if ((error as { code?: string })?.code === "P2002") {
      return bad("این شناسه‌ی لینک دعوت قبلاً استفاده شده است.", 409);
    }
    console.error("کلاس آنلاین استاد — PATCH:", error);
    return bad("خطا در ویرایش کلاس آنلاین.", 500);
  }
}

/**
 * DELETE /api/teacher/streams/[id] — حذف جلسه‌ی خودِ استاد
 * (دعوت‌ها و حضورها هم پاک می‌شوند).
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    // requireTeacher داخل try — همان الگوی PATCH بالا
    const { teacher, denial } = await requireTeacher(req);
    if (denial) return denial;
    // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
    if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

    const { id } = await params;
    const stream = await db.liveStream.findUnique({
      where: { id },
      select: { id: true, hostId: true },
    });
    if (!stream || !ownsStream(stream, teacher.id)) {
      return bad("کلاس آنلاین پیدا نشد.", 404);
    }

    await db.liveStream.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("کلاس آنلاین استاد — DELETE:", error);
    return bad("خطا در حذف کلاس آنلاین.", 500);
  }
}
