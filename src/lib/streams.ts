import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * منطق مشترک کلاس آنلاین (استریم) — بین APIهای مدیر، پنل کاربر و صفحه‌ی کلاس.
 *
 * ساختار دسترسی:
 *  • مدیر (host)        → همیشه دسترسی کنترل کلاس را دارد
 *  • دانشجو (student)   → فقط اگر در دعوت فعال کلاس باشد:
 *      - ثبت‌نام (Enrollment) در دوره‌ی دعوت‌شده (تطبیق عنوان دوره)، یا
 *      - عضویت (ClassMembership) در کلاس دعوت‌شده
 */

export type StreamStatus = "scheduled" | "live" | "ended";

export const STREAM_STATUS_LABELS: Record<string, string> = {
  scheduled: "برنامه‌ریزی‌شده",
  live: "زنده",
  ended: "پایان‌یافته",
};

export function isStreamStatus(v: unknown): v is StreamStatus {
  return v === "scheduled" || v === "live" || v === "ended";
}

/** شکل دعوت‌شده برای پاسخ APIها */
export interface InvitationView {
  id: string;
  courseId: string | null;
  courseTitle: string | null;
  classId: string | null;
  classTitle: string | null;
}

/** استریم + دعوت‌ها + تعداد شرکت‌کننده (شکل مشترک لیست مدیر) */
export const STREAM_INCLUDE = {
  invitations: {
    include: {
      course: { select: { title: true } },
      classRoom: { select: { title: true } },
    },
  },
  _count: { select: { participants: true } },
} satisfies Prisma.LiveStreamInclude;

export type StreamWithExtras = Prisma.LiveStreamGetPayload<{
  include: typeof STREAM_INCLUDE;
}>;

/** هر استریم با دعوت‌های بارگذاری‌شده (عنوان دوره/کلاس — ساختار ساختاری) */
interface StreamWithInvitations {
  invitations: ReadonlyArray<{
    id: string;
    courseId: string | null;
    courseTitle: string;
    classId: string | null;
    course?: { title: string } | null;
    classRoom?: { title: string } | null;
  }>;
}

export function invitationViews(
  stream: StreamWithInvitations
): InvitationView[] {
  return stream.invitations.map((inv) => ({
    id: inv.id,
    courseId: inv.courseId,
    courseTitle: inv.courseTitle || inv.course?.title || null,
    classId: inv.classId,
    classTitle: inv.classRoom?.title ?? null,
  }));
}

/**
 * آیا این کاربر به استریم دعوت شده است؟ (ثبت‌نامِ دوره یا عضویت کلاس)
 * منطق همان چیزی است که سرویس سیگنالینگ در ورود به اتاق اجرا می‌کند.
 */
export async function userInvitedToStream(
  streamId: string,
  userId: string
): Promise<InvitationView[]> {
  const invitations = await db.streamInvitation.findMany({
    where: { streamId },
    include: {
      course: { select: { title: true } },
      classRoom: { select: { title: true } },
    },
  });

  const matched: InvitationView[] = [];
  for (const inv of invitations) {
    if (inv.classId) {
      const member = await db.classMembership.findFirst({
        where: { userId, classId: inv.classId },
        select: { id: true },
      });
      if (member) {
        matched.push({
          id: inv.id,
          courseId: null,
          courseTitle: null,
          classId: inv.classId,
          classTitle: inv.classRoom?.title ?? null,
        });
        continue;
      }
    }
    if (inv.courseId) {
      const courseTitle = inv.courseTitle || inv.course?.title || "";
      if (courseTitle) {
        const enrolled = await db.enrollment.findFirst({
          where: { userId, course: courseTitle },
          select: { id: true },
        });
        if (enrolled) {
          matched.push({
            id: inv.id,
            courseId: inv.courseId,
            courseTitle,
            classId: null,
            classTitle: null,
          });
        }
      }
    }
  }
  return matched;
}

/** آیا کاربر اخراج‌شده از این استریم است؟ */
export async function userKickedFromStream(streamId: string, userId: string) {
  const participant = await db.streamParticipant.findUnique({
    where: { streamId_userId: { streamId, userId } },
    select: { kicked: true },
  });
  return participant?.kicked === true;
}

/**
 * یافتن استریم با «شناسه یا لینک دعوت» — صفحه‌ی کلاس (/stream/[ref]) هم
 * با id واقعی و هم با inviteSlug یکتا باز می‌شود. لینک دعوتِ استریم‌های
 * استاد همان آدرس اشتراکی او با دانشجوهاست.
 */
export async function findStreamByRef(ref: string) {
  if (!ref || ref.length > 64) return null;
  const byId = await db.liveStream.findUnique({ where: { id: ref } });
  if (byId) return byId;
  return db.liveStream.findUnique({ where: { inviteSlug: ref } });
}

/**
 * دعوت دانشجو به استریم از دیدِ نوع جلسه:
 *  • جلسه‌ی استاد (hostId ≠ null) → «لینک دعوت» خودش دعوت است؛ هر کاربر
 *    واردشده‌ی دارنده‌ی لینک می‌تواند وارد شود (خروج از دعوت دوره/کلاس).
 *  • جلسه‌ی مدیر (hostId = null) → فقط ثبت‌نام دوره‌ی دعوت‌شده یا عضویت
 *    کلاس دعوت‌شده (رفتار همیشگی).
 */
export function joinByLinkAllowed(stream: { hostId: string | null }): boolean {
  return stream.hostId !== null;
}

/** برچسب فارسی دلیل دعوت کاربر (نمایش در باکس دعوت پنل کاربر) */
export function invitationReasonLabel(inv: InvitationView): string {
  if (inv.classId) return `کلاس «${inv.classTitle ?? ""}»`;
  return `دوره‌ی «${inv.courseTitle ?? ""}»`;
}

/** اعتبارسنجی انتخاب دوره/کلاس و ساخت رکوردهای دعوت */
export interface InvitationTargetsInput {
  courseIds: string[];
  classIds: string[];
}

export const MAX_STREAM_INVITATIONS = 60;

/** آماده‌سازی دعوت‌ها: شناسه‌ها را به رکوردهای موجود تبدیل می‌کند */
export async function prepareInvitations(
  input: InvitationTargetsInput
): Promise<
  | { ok: true; data: Prisma.StreamInvitationCreateManyStreamInput[] }
  | { ok: false; error: string }
> {
  const courseIds = Array.from(new Set(input.courseIds.filter(Boolean))).slice(
    0,
    MAX_STREAM_INVITATIONS
  );
  const classIds = Array.from(new Set(input.classIds.filter(Boolean))).slice(
    0,
    MAX_STREAM_INVITATIONS
  );
  if (courseIds.length + classIds.length === 0) {
    return { ok: false, error: "حداقل یک دوره یا کلاس برای دعوت انتخاب کنید." };
  }

  const rows: Prisma.StreamInvitationCreateManyStreamInput[] = [];

  if (courseIds.length > 0) {
    const courses = await db.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true },
    });
    if (courses.length !== courseIds.length) {
      return { ok: false, error: "یک یا چند دوره‌ی انتخاب‌شده پیدا نشد." };
    }
    for (const c of courses) rows.push({ courseId: c.id, courseTitle: c.title });
  }

  if (classIds.length > 0) {
    const classes = await db.classRoom.findMany({
      where: { id: { in: classIds } },
      select: { id: true },
    });
    if (classes.length !== classIds.length) {
      return { ok: false, error: "یک یا چند کلاس انتخاب‌شده پیدا نشد." };
    }
    for (const c of classes) rows.push({ classId: c.id });
  }

  return { ok: true, data: rows };
}
