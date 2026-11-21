import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/teacher";
import { bad, str } from "@/lib/api-helpers";
import { generateInviteSlug } from "@/lib/classes";

/**
 * GET /api/teacher/classes — کلاس‌های خودِ استاد با شمارنده‌ی اعضا
 * (جدیدترین اول). POST /api/teacher/classes — ایجاد کلاس جدید به نام
 * استاد؛ شناسه‌ی لینک دعوت یکتا خودکار تولید می‌شود (برخورد با کلاس‌ها
 * و استریم‌ها بررسی می‌شود).
 */
export async function GET(req: NextRequest) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const classes = await db.classRoom.findMany({
      where: { teacherId: teacher.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } } },
    });
    return NextResponse.json(classes);
  } catch (error) {
    console.error("کلاس‌های استاد — GET:", error);
    return NextResponse.json(
      { error: "خطا در دریافت کلاس‌ها." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teacher/classes — ایجاد کلاس جدید (مالک: استاد).
 *
 * body: { title, description? }
 *
 * شناسه‌ی لینک دعوت یکتا خودکار تولید می‌شود؛ یکتایی آن نسبت به «کلاس‌ها»
 * و «کلاس‌های آنلاین (استریم)» بررسی می‌شود تا لینک دعوت همه‌جا بی‌ابهام
 * بماند. استاد بعداً می‌تواند آن را از پنل خود تغییر دهد.
 */
export async function POST(req: NextRequest) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const body = await req.json().catch(() => null);
    const title = str(body?.title);
    const description = str(body?.description).slice(0, 400);

    if (title.length < 2 || title.length > 80) {
      return bad("عنوان کلاس باید ۲ تا ۸۰ نویسه باشد.");
    }

    // — تولید شناسه‌ی یکتا (چند تلاش در صورت برخورد بسیار نادر) —
    // یکتایی نسبت به کلاس‌ها «و» استریم‌ها بررسی می‌شود.
    for (let attempt = 0; attempt < 5; attempt++) {
      const inviteSlug = generateInviteSlug();
      const [classClash, streamClash] = await Promise.all([
        db.classRoom.findUnique({
          where: { inviteSlug },
          select: { id: true },
        }),
        db.liveStream.findUnique({
          where: { inviteSlug },
          select: { id: true },
        }),
      ]);
      if (classClash || streamClash) continue;

      const classRoom = await db.classRoom.create({
        data: { title, description, inviteSlug, teacherId: teacher.id },
        include: { _count: { select: { members: true } } },
      });
      return NextResponse.json(classRoom, { status: 201 });
    }

    return bad("تولید شناسه‌ی یکتای لینک دعوت ناموفق بود.", 500);
  } catch (error) {
    console.error("کلاس‌های استاد — POST:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد کلاس. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
