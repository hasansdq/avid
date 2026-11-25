import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getSessionUser } from "@/lib/user-auth";
import { bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/streams/[id]/kick — اخراج کاربر از کلاس آنلاین.
 * body: { userId: string }
 *
 * مجوز: مدیر سایت یا «استادِ مالک همین جلسه» (LiveStream.hostId) — همان
 * مجوزی که سرویس سیگنالینگ به میزبان می‌دهد؛ سند ماندگار اخراج همین‌جا
 * ثبت می‌شود (kicked + leftAt) و سوکتِ خودکار کاربر هم از سرویس جدا می‌شود.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // requireAdmin داخل try — خطای لایه‌ی احراز هم JSON مشخص برمی‌گرداند
    const { denial } = await requireAdmin(req);
    let mayKick = true;
    if (denial) {
      mayKick = false;
      // — استادِ مالکِ همین جلسه هم می‌تواند اخراج کند (نه فقط مدیر) —
      const session = await getSessionUser(req);
      if (session) {
        const [stream, user] = await Promise.all([
          db.liveStream.findUnique({ where: { id } }),
          db.user.findUnique({ where: { id: session.id } }),
        ]);
        if (
          stream &&
          stream.hostId === session.id &&
          user?.role === "teacher" &&
          user.status === "active"
        ) {
          mayKick = true;
        }
      }
      if (!mayKick) return denial;
    }

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

    // — میزبان جلسه را نمی‌توان اخراج کرد —
    const stream = await db.liveStream.findUnique({ where: { id } });
    if (stream?.hostId === userId) {
      return bad("میزبان جلسه را نمی‌توان اخراج کرد.");
    }

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
