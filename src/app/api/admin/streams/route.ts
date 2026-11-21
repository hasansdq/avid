import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import {
  invitationViews,
  prepareInvitations,
  STREAM_INCLUDE,
} from "@/lib/streams";

/**
 * GET /api/admin/streams — لیست کلاس‌های آنلاین با دعوت‌ها و تعداد شرکت‌کننده.
 */
export async function GET(req: NextRequest) {
  try {
    // requireAdmin داخل try: خطای دیتابیسِ لایه‌ی احراز هویت هم پاسخ JSON مشخص
    // می‌دهد (نه پاسخ ۵۰۰ خاموش که کلاینت نتواند پیامش را بخواند)
    const { denial } = await requireAdmin(req);
    if (denial) return denial;

    const streams = await db.liveStream.findMany({
      orderBy: { createdAt: "desc" },
      include: STREAM_INCLUDE,
    });
    return NextResponse.json(
      streams.map((s) => ({
        ...s,
        invitations: invitationViews(s),
      }))
    );
  } catch (error) {
    console.error("streams GET error:", error);
    return bad("خطا در دریافت کلاس‌های آنلاین.", 500);
  }
}

/**
 * POST /api/admin/streams — ایجاد کلاس آنلاین جدید با دعوت کاربران دوره/کلاس.
 * body: { title, description?, courseIds?: string[], classIds?: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    // requireAdmin داخل try — همان دلیل GET بالا
    const { denial } = await requireAdmin(req);
    if (denial) return denial;

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const title = str(body?.title);
    if (title.length < 2 || title.length > 120) {
      return bad("عنوان کلاس آنلاین باید بین ۲ تا ۱۲۰ نویسه باشد.");
    }
    const description = str(body?.description).slice(0, 600);

    const courseIds = Array.isArray(body?.courseIds)
      ? (body.courseIds as unknown[]).map(String)
      : [];
    const classIds = Array.isArray(body?.classIds)
      ? (body.classIds as unknown[]).map(String)
      : [];

    const prepared = await prepareInvitations({ courseIds, classIds });
    if (!prepared.ok) return bad(prepared.error);

    const stream = await db.liveStream.create({
      data: {
        title,
        description,
        invitations: { createMany: { data: prepared.data } },
      },
      include: STREAM_INCLUDE,
    });
    return NextResponse.json(
      { ...stream, invitations: invitationViews(stream) },
      { status: 201 }
    );
  } catch (error) {
    console.error("streams POST error:", error);
    return bad("خطا در ایجاد کلاس آنلاین.", 500);
  }
}
