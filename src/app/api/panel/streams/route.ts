import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";
import { invitationReasonLabel, userInvitedToStream } from "@/lib/streams";

/**
 * GET /api/panel/streams — دعوت‌های فعال کلاس آنلاین برای کاربر وارد‌شده.
 *
 * باکس «دعوت به کلاس» در پنل کاربر از همین پاسخ پر می‌شود — اگر هیچ دعوتِ
 * فعالی نبود پاسخ خالی است و باکس کاملاً مخفی می‌ماند. مرتب‌سازی: زنده‌ها
 * اول، بعد جدیدترین برنامه‌ریزی‌شده‌ها.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "برای مشاهده، وارد حساب خود شوید." },
        { status: 401 }
      );
    }

    const streams = await db.liveStream.findMany({
      where: { status: { in: ["scheduled", "live"] } },
      orderBy: { createdAt: "desc" },
      include: {
        invitations: {
          include: {
            course: { select: { title: true } },
            classRoom: { select: { title: true } },
          },
        },
      },
    });

    const invited: Array<{
      id: string;
      title: string;
      description: string;
      status: string;
      startedAt: string | null;
      reasons: string[];
    }> = [];

    for (const s of streams) {
      const matched = await userInvitedToStream(s.id, session.id);
      if (matched.length === 0) continue;
      invited.push({
        id: s.id,
        title: s.title,
        description: s.description,
        status: s.status,
        startedAt: s.startedAt ? s.startedAt.toISOString() : null,
        reasons: matched.map(invitationReasonLabel),
      });
    }

    // زنده‌ها اول؛ در هر گروه بر اساس createdAt نزولی
    invited.sort((a, b) => {
      if (a.status === "live" && b.status !== "live") return -1;
      if (a.status !== "live" && b.status === "live") return 1;
      return 0;
    });

    return NextResponse.json(
      { streams: invited },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("panel streams GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت کلاس‌های آنلاین." },
      { status: 500 }
    );
  }
}
