import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/streams/[id]/kick — اخراج کاربر از کلاس آنلاین.
 * body: { userId: string }
 *
 * سند ماندگار اخراج همین‌جا ثبت می‌شود (kicked + leftAt)؛ سوکتِ خودکار
 * کاربر هم از سرویس سیگنالینگ جدا می‌شود (سند لحظه‌ای = همان سرویس).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    // requireAdmin داخل try — خطای لایه‌ی احراز هم JSON مشخص برمی‌گرداند
    const { denial } = await requireAdmin(req);
    if (denial) return denial;

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const userId = typeof body?.userId === "string" ? body.userId : "";
    if (!userId) return bad("شناسه‌ی کاربر ارسال نشده است.");

    const participant = await db.streamParticipant.findUnique({
      where: { streamId_userId: { streamId: id, userId } },
    });
    if (!participant) return bad("این کاربر در کلاس حضور ندارد.", 404);

    await db.streamParticipant.update({
      where: { streamId_userId: { streamId: id, userId } },
      data: { kicked: true, leftAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin stream kick error:", error);
    return bad("خطا در اخراج کاربر از کلاس.", 500);
  }
}
