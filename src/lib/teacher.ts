import { NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";
import { generateInviteSlug } from "@/lib/classes";

/**
 * نقش استاد (استاد) — گارد و ابزارهای مشترک APIهای پنل استاد.
 *
 * استاد کاربر سایت با role="teacher" است که مدیر از پنل «مدیریت کاربران»
 * (تب اساتید) آن را تعیین کرده است. استاد با همان ورود پیامکی پنل کاربر
 * وارد می‌شود و بخش‌های استاد در پنل او نمایان می‌شود.
 */

/** نقش‌های مجاز حساب کاربر */
export const USER_ROLES = new Set(["student", "teacher"]);

export function isUserRole(v: unknown): v is "student" | "teacher" {
  return v === "student" || v === "teacher";
}

/**
 * گارد مسیرهای استاد — کوکی avid_user باید متعلق به کاربرِ فعالِ
 * «استاد» باشد. پاسخ‌ها:
 *  • 401 — نشست نیست / حساب حذف شده
 *  • 403 — حساب مسدود یا نقش غیر استاد
 */
export async function requireTeacher(
  req: NextRequest
): Promise<{ teacher: User | null; denial: NextResponse | null }> {
  const session = await getSessionUser(req);
  if (!session) {
    return {
      teacher: null,
      denial: NextResponse.json(
        { error: "برای استفاده از بخش استاد، وارد حساب خود شوید." },
        { status: 401 }
      ),
    };
  }

  const user = await db.user.findUnique({ where: { id: session.id } });
  if (!user) {
    return {
      teacher: null,
      denial: NextResponse.json(
        { error: "حساب کاربری یافت نشد؛ دوباره وارد شوید." },
        { status: 401 }
      ),
    };
  }
  if (user.status === "blocked") {
    return {
      teacher: null,
      denial: NextResponse.json(
        { error: "حساب شما مسدود شده است." },
        { status: 403 }
      ),
    };
  }
  if (user.role !== "teacher") {
    return {
      teacher: null,
      denial: NextResponse.json(
        { error: "این بخش فقط برای استادهای آکادمی فعال است." },
        { status: 403 }
      ),
    };
  }
  return { teacher: user, denial: null };
}

/** آیا دوره‌ی داده‌شده متعلق به این استاد است؟ (teacherId تطبیق) */
export function ownsCourse(
  course: { teacherId: string | null },
  teacherId: string
): boolean {
  return course.teacherId === teacherId;
}

/** آیا کلاس داده‌شده متعلق به این استاد است؟ */
export function ownsClass(
  classRoom: { teacherId: string | null },
  teacherId: string
): boolean {
  return classRoom.teacherId === teacherId;
}

/** آیا استریم داده‌شده میزبانش این استاد است؟ */
export function ownsStream(
  stream: { hostId: string | null },
  teacherId: string
): boolean {
  return stream.hostId === teacherId;
}

/** عنوان‌های دوره‌های یک استاد — Enrollment با «عنوان دوره» به Course وصل است */
export async function teacherCourseTitles(teacherId: string): Promise<string[]> {
  const courses = await db.course.findMany({
    where: { teacherId },
    select: { title: true },
  });
  return courses.map((c) => c.title).filter((t) => t.length > 0);
}

/** تولید شناسه‌ی یکتای لینک دعوت استریم — با تلاش مجدد در برخورد */
export async function generateStreamInviteSlug(): Promise<
  { ok: true; slug: string } | { ok: false; error: string }
> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateInviteSlug();
    const clash = await db.liveStream.findUnique({
      where: { inviteSlug: slug },
      select: { id: true },
    });
    if (!clash) return { ok: true, slug };
  }
  return { ok: false, error: "تولید شناسه‌ی یکتای لینک دعوت ناموفق بود." };
}
