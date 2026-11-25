import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { generateStreamInviteSlug } from "@/lib/teacher";
import { bad, str } from "@/lib/api-helpers";
import {
  invitationViews,
  isStreamStatus,
  prepareInvitations,
} from "@/lib/streams";

type Params = { params: Promise<{ id: string }> };

/** شکل کامل برای جزئیات: دعوت‌ها + شرکت‌کنندگان + شمارنده */
const DETAIL_INCLUDE = {
  invitations: {
    include: {
      course: { select: { title: true } },
      classRoom: { select: { title: true } },
    },
  },
  _count: { select: { participants: true } },
  participants: {
    orderBy: { joinedAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          nationalId: true,
        },
      },
    },
  },
} satisfies Prisma.LiveStreamInclude;

/**
 * GET /api/admin/streams/[id] — جزئیات کلاس آنلاین + دعوت‌ها + شرکت‌کنندگان.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    // requireAdmin داخل try — خطای لایه‌ی احراز هم JSON مشخص برمی‌گرداند
    const { denial } = await requireAdmin(req);
    if (denial) return denial;

    const { id } = await params;
    const stream = await db.liveStream.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!stream) return bad("کلاس آنلاین پیدا نشد.", 404);

    return NextResponse.json({
      ...stream,
      invitations: invitationViews(stream),
    });
  } catch (error) {
    console.error("admin stream GET error:", error);
    return bad("خطا در دریافت جزئیات کلاس آنلاین.", 500);
  }
}

/**
 * PATCH /api/admin/streams/[id] — ویرایش کلاس آنلاین.
 * body: { title?, description?, status?: "live"|"ended"|"scheduled",
 *         courseIds?, classIds? }
 *
 *  • status="live"   → شروع جلسه (startedAt در اولین بار ثبت می‌شود)
 *  • status="ended"  → پایان جلسه (endedAt + بستن حضور باقی‌مانده)
 *  • courseIds/classIds (اختیاری) → جایگزینی کامل دعوت‌ها — پاک‌کردن کامل
 *    دعوت‌ها کلاس را «لینک-تنها» می‌کند: هیچ باکس دعوتی نمایش داده نمی‌شود
 *    و اگر لینک یکتا ندارد، ساخته می‌شود (ورود فقط برای دارندگان لینک).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    // requireAdmin داخل try — همان الگوی بالا
    const { denial } = await requireAdmin(req);
    if (denial) return denial;

    const { id } = await params;
    // جلسه‌ی فعلی برای بررسی inviteSlug هنگام پاک‌کردن دعوت‌ها
    const current = await db.liveStream.findUnique({
      where: { id },
      select: { id: true, inviteSlug: true },
    });
    if (!current) return bad("کلاس آنلاین پیدا نشد.", 404);
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const data: Record<string, unknown> = {};
    if (typeof body?.title === "string") {
      const title = str(body.title);
      if (title.length < 2 || title.length > 120) {
        return bad("عنوان کلاس آنلاین باید بین ۲ تا ۱۲۰ نویسه باشد.");
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

    // جایگزینی دعوت‌ها (اگر آرایه‌ها ارائه شده باشند)
    const replacingInvitations =
      Array.isArray(body?.courseIds) || Array.isArray(body?.classIds);

    if (Object.keys(data).length === 0 && !replacingInvitations) {
      return bad("هیچ فیلد قابل ویرایشی ارسال نشده است.");
    }

    // دعوت‌ها فقط تا وقتی جلسه شروع نشده قابل ویرایش‌اند؟ نه — مدیر می‌تواند
    // هر لحظه (حتی وسط جلسه) نفرات بیشگری دعوت کند؛ جایگزینی کامل انجام می‌شود.
    // پاک‌کردن کامل دعوت‌ها هم مجاز است (کلاس «لینک-تنها»).
    let preparedData: Prisma.StreamInvitationCreateManyStreamInput[] = [];
    if (replacingInvitations) {
      const courseIds = Array.isArray(body?.courseIds)
        ? (body.courseIds as unknown[]).map(String)
        : [];
      const classIds = Array.isArray(body?.classIds)
        ? (body.classIds as unknown[]).map(String)
        : [];
      const prepared = await prepareInvitations({ courseIds, classIds });
      if (!prepared.ok) return bad(prepared.error);
      preparedData = prepared.data;
    }

    // — پاک‌شدن کامل دعوت‌ها → کلاس «لینک-تنها»: اگر لینک یکتا ندارد،
    //   ساخته می‌شود تا ورود فقط برای دارندگان لینک ممکن بماند —
    if (
      replacingInvitations &&
      preparedData.length === 0 &&
      !current.inviteSlug
    ) {
      const slug = await generateStreamInviteSlug();
      if (!slug.ok) return bad(slug.error, 500);
      data.inviteSlug = slug.slug;
    }

    const stream = await db.liveStream.update({
      where: { id },
      data: {
        ...data,
        invitations: replacingInvitations
          ? {
              deleteMany: {},
              ...(preparedData.length > 0
                ? { createMany: { data: preparedData } }
                : {}),
            }
          : undefined,
      },
      include: DETAIL_INCLUDE,
    });

    // پایان جلسه: حضور همه‌ی افرادی که هنوز «در کلاس» هستند بسته می‌شود
    if (data.status === "ended") {
      await db.streamParticipant.updateMany({
        where: { streamId: id, leftAt: null },
        data: { leftAt: new Date() },
      });
    }

    return NextResponse.json({ ...stream, invitations: invitationViews(stream) });
  } catch (error) {
    console.error("admin stream PATCH error:", error);
    return bad("خطا در ویرایش کلاس آنلاین.", 500);
  }
}

/**
 * DELETE /api/admin/streams/[id] — حذف کلاس آنلاین (دعوت‌ها و حضورها هم پاک می‌شوند).
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    // requireAdmin داخل try — همان الگوی بالا
    const { denial } = await requireAdmin(req);
    if (denial) return denial;

    const { id } = await params;
    const stream = await db.liveStream.findUnique({
      where: { id },
      select: { title: true },
    });
    if (!stream) return bad("کلاس آنلاین پیدا نشد.", 404);

    await db.liveStream.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin stream DELETE error:", error);
    return bad("خطا در حذف کلاس آنلاین.", 500);
  }
}
