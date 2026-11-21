import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionAdmin } from "@/lib/auth";
import { getSessionUser } from "@/lib/user-auth";
import {
  findStreamByRef,
  joinByLinkAllowed,
  userInvitedToStream,
  userKickedFromStream,
} from "@/lib/streams";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/streams/[id] — وضعیت ورود صفحه‌ی کلاس آنلاین برای بیننده‌ی فعلی.
 *
 * [id] هم شناسه‌ی واقعی استریم است و هم «لینک دعوت» یکتای آن (inviteSlug
 * جلسات استاد) — هر دو به همین مسیر می‌رسند.
 *
 * نقش‌ها:
 *  • مدیر وارد‌شده (کوکی avid_admin) → role=host (کنترل کامل کلاس)
 *  • استادِ مالک جلسه (کاربر role=teacher و hostId جلسه = او) → role=host
 *  • کاربر وارد‌شده و دعوت‌شده → role=student + canJoin
 *    — دعوت: ثبت‌نام/عضویت (جلسات مدیر) یا «لینک یکتای جلسه» (جلسات استاد)
 *  • کاربر بدون دعوت / اخراج‌شده / جلسه‌ی پایان‌یافته → canJoin=false + reason
 *  • مهمان (بدون ورود) → role=guest + reason=login (دعوت به ورود از پنل)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const stream = await findStreamByRef(id);
    if (!stream) {
      return NextResponse.json(
        { error: "کلاس آنلاین پیدا نشد." },
        { status: 404 }
      );
    }

    // — مدیر: کنترل کلاس —
    const admin = await getSessionAdmin(req);
    if (admin) {
      return NextResponse.json(
        {
          role: "host",
          canJoin: true,
          stream: {
            id: stream.id,
            title: stream.title,
            description: stream.description,
            status: stream.status,
            startedAt: stream.startedAt,
            endedAt: stream.endedAt,
          },
          me: { name: admin.username },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // — کاربر سایت —
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        {
          role: "guest",
          canJoin: false,
          reason: "login",
          stream: {
            id: stream.id,
            title: stream.title,
            description: stream.description,
            status: stream.status,
          },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // — استادِ مالک جلسه → کنترل کامل کلاس (مانند مدیر) —
    if (stream.hostId === session.id) {
      const host = await db.user.findUnique({
        where: { id: session.id },
        select: { role: true, firstName: true, lastName: true },
      });
      if (host?.role === "teacher") {
        return NextResponse.json(
          {
            role: "host",
            canJoin: true,
            stream: {
              id: stream.id,
              title: stream.title,
              description: stream.description,
              status: stream.status,
              startedAt: stream.startedAt,
              endedAt: stream.endedAt,
            },
            me: { name: `${host.firstName} ${host.lastName}`.trim() },
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    if (stream.status === "ended") {
      return NextResponse.json(
        {
          role: "student",
          canJoin: false,
          reason: "ended",
          stream: { id: stream.id, title: stream.title, status: stream.status },
          me: { name: `${session.firstName} ${session.lastName}` },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const kicked = await userKickedFromStream(stream.id, session.id);
    if (kicked) {
      return NextResponse.json(
        {
          role: "student",
          canJoin: false,
          reason: "kicked",
          stream: { id: stream.id, title: stream.title, status: stream.status },
          me: { name: `${session.firstName} ${session.lastName}` },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // — دعوت: جلسات استاد با «لینک یکتا» باز هستند؛ جلسات مدیر فقط با
    //   ثبت‌نام دوره/عضویت کلاس (رفتار پیشین دست‌نخورده می‌ماند) —
    if (!joinByLinkAllowed(stream)) {
      const matched = await userInvitedToStream(stream.id, session.id);
      if (matched.length === 0) {
        return NextResponse.json(
          {
            role: "student",
            canJoin: false,
            reason: "not-invited",
            stream: {
              id: stream.id,
              title: stream.title,
              status: stream.status,
            },
            me: { name: `${session.firstName} ${session.lastName}` },
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    return NextResponse.json(
      {
        role: "student",
        canJoin: true,
        stream: {
          id: stream.id,
          title: stream.title,
          description: stream.description,
          status: stream.status,
          startedAt: stream.startedAt,
          endedAt: stream.endedAt,
        },
        me: { name: `${session.firstName} ${session.lastName}` },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("stream session GET error:", error);
    return NextResponse.json(
      { error: "خطا در بررسی وضعیت کلاس." },
      { status: 500 }
    );
  }
}
