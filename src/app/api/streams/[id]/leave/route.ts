import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";
import { findStreamByRef } from "@/lib/streams";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/streams/[id]/leave — ثبت خروج دانشجو از کلاس آنلاین.
 *
 * [id] هم شناسه‌ی واقعی و هم لینک دعوت یکتا (inviteSlug جلسات استاد) است.
 * با sendBeacon هم فراخوانی می‌شود (بدون JSON) — بدنه اختیاری است. خروج
 * اخراج‌شده‌ها (kicked=true) وضعیت اخراج را دست نمی‌زند؛ فقط leftAt نو می‌شود.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const session = await getSessionUser(req);
    if (!session) {
      // بی‌خطر: نشست مرده — خروجی برای ثبت نیست
      return NextResponse.json({ ok: true });
    }

    // خروج با id یا لینک دعوت — ردیف حضور با id واقعی ثبت شده است
    const stream = await findStreamByRef(id);
    const streamId = stream?.id ?? id;

    await db.streamParticipant.updateMany({
      where: { streamId, userId: session.id },
      data: { leftAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("stream leave error:", error);
    return NextResponse.json({ ok: true });
  }
}
