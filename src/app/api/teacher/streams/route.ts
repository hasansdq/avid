import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTeacher, generateStreamInviteSlug } from "@/lib/teacher";
import { bad, str } from "@/lib/api-helpers";
import {
  invitationViews,
  MAX_STREAM_INVITATIONS,
  STREAM_INCLUDE,
  type StreamWithExtras,
} from "@/lib/streams";

/**
 * GET /api/teacher/streams — کلاس‌های آنلاینی که خودِ استاد میزبان آن‌هاست
 * (جدیدترین اول) با دعوت‌ها و تعداد شرکت‌کننده.
 * POST /api/teacher/streams — ایجاد جلسه‌ی آنلاین جدید به نام استاد.
 *
 * برخلاف جلسه‌ی مدیر، «صفر دعوت» مجاز است: لینک دعوت یکتای جلسه خودش
 * دعوت است و هر کاربرِ دارنده‌ی لینک می‌تواند وارد شود. دوره/کلاس‌های
 * انتخاب‌شده باید متعلق به خودِ استاد باشند.
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

export async function GET(req: NextRequest) {
  try {
    // requireTeacher داخل try: خطای دیتابیسِ لایه‌ی احراز هویت هم پاسخ JSON مشخص
    // می‌دهد (نه پاسخ ۵۰۰ خاموش که کلاینت نتواند پیامش را بخواند)
    const { teacher, denial } = await requireTeacher(req);
    if (denial) return denial;
    // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
    if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

    const streams = await db.liveStream.findMany({
      where: { hostId: teacher.id },
      orderBy: { createdAt: "desc" },
      include: STREAM_INCLUDE,
    });
    return NextResponse.json(streams.map(toTeacherStream));
  } catch (error) {
    console.error("کلاس آنلاین استاد — GET:", error);
    return bad("خطا در دریافت کلاس‌های آنلاین.", 500);
  }
}

/**
 * POST /api/teacher/streams — ایجاد جلسه‌ی آنلاین با دعوت‌های دوره/کلاس
 * خودِ استاد (اختیاری؛ صفر دعوت = جلسه‌ی «لینک-تنها»).
 * body: { title, description?, courseIds?: string[], classIds?: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    // requireTeacher داخل try — همان دلیل GET بالا
    const { teacher, denial } = await requireTeacher(req);
    if (denial) return denial;
    // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
    if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const title = str(body?.title);
    if (title.length < 2 || title.length > 120) {
      return bad("عنوان کلاس آنلاین باید ۲ تا ۱۲۰ نویسه باشد.");
    }
    const description = str(body?.description).slice(0, 600);

    const courseIds = Array.isArray(body?.courseIds)
      ? (body.courseIds as unknown[]).map(String)
      : [];
    const classIds = Array.isArray(body?.classIds)
      ? (body.classIds as unknown[]).map(String)
      : [];

    // صفر دعوت مجاز است — لینک دعوت یکتا خودش دعوت است
    const prepared = await ownInvitationRows(teacher.id, courseIds, classIds);
    if (!prepared.ok) return bad(prepared.error);

    // — تولید شناسه‌ی یکتای لینک دعوت جلسه (چند تلاش در برخورد نادر) —
    const slug = await generateStreamInviteSlug();
    if (!slug.ok) return bad(slug.error, 500);

    const stream = await db.liveStream.create({
      data: {
        title,
        description,
        inviteSlug: slug.slug,
        hostId: teacher.id,
        invitations: { createMany: { data: prepared.rows } },
      },
      include: STREAM_INCLUDE,
    });
    return NextResponse.json(toTeacherStream(stream), { status: 201 });
  } catch (error) {
    console.error("کلاس آنلاین استاد — POST:", error);
    return bad("خطا در ایجاد کلاس آنلاین.", 500);
  }
}
