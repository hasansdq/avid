import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import { validateInviteSlugInput } from "@/lib/classes";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/classes/[id] — ویرایش کلاس.
 *
 * body: { title?, description?, inviteSlug? }
 *
 * inviteSlug (شناسه‌ی لینک دعوت) فقط وقتی تغییر می‌کند که ارسال شده و
 * متفاوت با مقدار کنونی باشد؛ یکتایی آن بررسی می‌شود (۴۰۹ در صورت تکرار).
 * لینک‌های دعوت قبلی بلافاصله بی‌اعتبار می‌شوند.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("بدنه درخواست نامعتبر است.");

    const current = await db.classRoom.findUnique({ where: { id } });
    if (!current) return bad("کلاسی با این شناسه یافت نشد.", 404);

    const data: { title?: string; description?: string; inviteSlug?: string } = {};

    // — عنوان (اختیاری؛ ارسال شده یعنی تغییر) —
    if ("title" in body) {
      const title = str(body.title);
      if (title.length < 2 || title.length > 80) {
        return bad("عنوان کلاس باید بین ۲ تا ۸۰ نویسه باشد.");
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

        const owner = await db.classRoom.findUnique({
          where: { inviteSlug },
          select: { id: true },
        });
        if (owner && owner.id !== id) {
          return bad("این شناسه‌ی لینک قبلاً برای کلاس دیگری استفاده شده است.", 409);
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
      return bad("این شناسه‌ی لینک قبلاً برای کلاس دیگری استفاده شده است.", 409);
    }
    console.error("class PATCH error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش کلاس. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/classes/[id] — حذف کلاس.
 *
 * عضویت‌های کلاس حذف می‌شوند. آزمون‌های تعریف‌شده برای این کلاس حذف نمی‌شوند:
 * به «آزاد + منتشرنشده» تبدیل می‌شوند تا پاسخ‌برگه‌ها حفظ شود و مدیر بعداً
 * از بانک آزمون‌ها دوباره برای کلاس دیگر برگزارشان کند.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const classRoom = await db.classRoom
      .findUnique({ where: { id }, select: { id: true } })
      .catch(() => null);
    if (!classRoom) return bad("کلاسی با این شناسه یافت نشد.", 404);

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
    console.error("class DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف کلاس. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
