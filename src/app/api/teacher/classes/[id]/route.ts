import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher, ownsClass } from "@/lib/teacher";
import { bad, str } from "@/lib/api-helpers";
import { validateInviteSlugInput } from "@/lib/classes";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/teacher/classes/[id] — ویرایش کلاسِ «خودِ» استاد.
 *
 * body: { title?, description?, inviteSlug? }
 *
 * inviteSlug (شناسه‌ی لینک دعوت) فقط وقتی تغییر می‌کند که ارسال شده و
 * متفاوت با مقدار کنونی باشد؛ یکتایی آن نسبت به «کلاس‌های دیگر» و
 * «کلاس‌های آنلاین (استریم)» بررسی می‌شود (۴۰۹ در صورت تکرار).
 * DELETE /api/teacher/classes/[id] — حذف کلاسِ خودِ استاد.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("بدنه درخواست نامعتبر است.");

    // مالکیت: کلاس باید متعلق به همین استاد باشد (کلاسِ خارج → ۴۰۴)
    const current = await db.classRoom.findUnique({ where: { id } });
    if (!current || !ownsClass(current, teacher.id)) {
      return bad("کلاس پیدا نشد.", 404);
    }

    const data: { title?: string; description?: string; inviteSlug?: string } = {};

    // — عنوان (اختیاری؛ ارسال شده یعنی تغییر) —
    if ("title" in body) {
      const title = str(body.title);
      if (title.length < 2 || title.length > 80) {
        return bad("عنوان کلاس باید ۲ تا ۸۰ نویسه باشد.");
      }
      data.title = title;
    }

    // — توضیحات (اختیاری) —
    if ("description" in body) {
      data.description = str(body.description).slice(0, 400);
    }

    // — شناسه‌ی لینک دعوت (اختیاری؛ فقط اگر متفاوت با کنونی باشد) —
    if ("inviteSlug" in body) {
      const inviteSlug = str(body.inviteSlug).toLowerCase();
      if (inviteSlug && inviteSlug !== current.inviteSlug) {
        const validationError = validateInviteSlugInput(inviteSlug);
        if (validationError) return bad(validationError);

        // یکتایی نسبت به کلاس‌های دیگر (به‌جز خودِ این کلاس)
        const owner = await db.classRoom.findUnique({
          where: { inviteSlug },
          select: { id: true },
        });
        if (owner && owner.id !== id) {
          return bad("این شناسه‌ی لینک دعوت قبلاً استفاده شده است.", 409);
        }

        // یکتایی نسبت به کلاس‌های آنلاین (استریم) — لینک دعوت هر دو یک مسیر است
        const streamClash = await db.liveStream.findUnique({
          where: { inviteSlug },
          select: { id: true },
        });
        if (streamClash) {
          return bad("این شناسه‌ی لینک دعوت قبلاً استفاده شده است.", 409);
        }

        data.inviteSlug = inviteSlug;
      }
    }

    if (Object.keys(data).length === 0) {
      return bad("هیچ فیلد قابل ویرایشی ارسال نشده است.");
    }

    const classRoom = await db.classRoom.update({
      where: { id },
      data,
      include: { _count: { select: { members: true } } },
    });
    return NextResponse.json(classRoom);
  } catch (error) {
    // برخورد یکتایی در رقابت نادر همزمانی
    if ((error as { code?: string })?.code === "P2002") {
      return bad("این شناسه‌ی لینک دعوت قبلاً استفاده شده است.", 409);
    }
    console.error("کلاس‌های استاد — PATCH:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش کلاس. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/teacher/classes/[id] — حذف کلاسِ خودِ استاد.
 *
 * عضویت‌های کلاس حذف می‌شوند. آزمون‌های تعریف‌شده برای این کلاس حذف نمی‌شوند:
 * به «آزاد + منتشرنشده» تبدیل می‌شوند تا پاسخ‌برگه‌ها حفظ شود و مدیر بعداً
 * از بانک آزمون‌ها دوباره برای کلاس دیگر برگزارشان کند.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const { id } = await params;

    // مالکیت: کلاس باید متعلق به همین استاد باشد (کلاسِ خارج → ۴۰۴)
    const classRoom = await db.classRoom.findUnique({
      where: { id },
      select: { id: true, teacherId: true },
    });
    if (!classRoom || !ownsClass(classRoom, teacher.id)) {
      return bad("کلاس پیدا نشد.", 404);
    }

    await db.$transaction([
      // آزمون‌های این کلاس: آزاد + پیش‌نویس (تا ناگهان برای همه visible نشوند)
      db.exam.updateMany({
        where: { classId: id },
        data: { accessType: "open", classId: null, published: false },
      }),
      db.classRoom.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("کلاس‌های استاد — DELETE:", error);
    return NextResponse.json(
      { error: "خطا در حذف کلاس. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
