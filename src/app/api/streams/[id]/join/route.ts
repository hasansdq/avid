import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";
import {
  findStreamByRef,
  joinByLinkAllowed,
  userInvitedToStream,
  userKickedFromStream,
} from "@/lib/streams";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/streams/[id]/join — ثبت حضور دانشجو هنگام ورود به کلاس آنلاین.
 *
 * [id] هم شناسه‌ی واقعی و هم لینک دعوت یکتا (inviteSlug جلسات استاد) است.
 * پیش‌شرط‌ها: نشست کاربر + دعوت فعال (ثبت‌نام/عضویت یا لینک یکتای جلسه‌ی
 * استاد) + عدم اخراج + جلسه‌ی غیرپایان‌یافته. ردیف حضور (streamId,userId)
 * یکتاست؛ ورود دوباره بعد از خروج همان ردیف را با joinedAt تازه و leftAt
 * خالی به‌روز می‌کند (مگر اخراج‌شده — رد می‌شود).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "برای ورود به کلاس، ابتدا وارد حساب خود شوید." },
        { status: 401 }
      );
    }

    const stream = await findStreamByRef(id);
    if (!stream) {
      return NextResponse.json(
        { error: "کلاس آنلاین پیدا نشد." },
        { status: 404 }
      );
    }
    if (stream.status === "ended") {
      return NextResponse.json(
        { error: "این کلاس پایان یافته است." },
        { status: 403 }
      );
    }

    if (await userKickedFromStream(stream.id, session.id)) {
      return NextResponse.json(
        { error: "شما از این کلاس اخراج شده‌اید." },
        { status: 403 }
      );
    }

    // — دعوت: جلسات استاد با لینک یکتا باز هستند؛ جلسات مدیر فقط با
    //   ثبت‌نام دوره/عضویت کلاس —
    if (!joinByLinkAllowed(stream)) {
      const matched = await userInvitedToStream(stream.id, session.id);
      if (matched.length === 0) {
        return NextResponse.json(
          { error: "شما به این کلاس دعوت نشده‌اید." },
          { status: 403 }
        );
      }
    }

    await db.streamParticipant.upsert({
      where: { streamId_userId: { streamId: stream.id, userId: session.id } },
      create: { streamId: stream.id, userId: session.id, joinedAt: new Date() },
      update: { joinedAt: new Date(), leftAt: null, kicked: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("stream join error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت ورود به کلاس." },
      { status: 500 }
    );
  }
}
