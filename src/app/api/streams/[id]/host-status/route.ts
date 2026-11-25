import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionAdmin } from "@/lib/auth";
import { getSessionUser } from "@/lib/user-auth";
import { findStreamByRef } from "@/lib/streams";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/streams/[id]/host-status — شروع/پایان جلسه توسط میزبانِ زنده.
 * body: { status: "live" | "ended" }
 *
 * [id] هم شناسه‌ی واقعی و هم لینک دعوت یکتا (inviteSlug) است.
 *
 * مجاز برای: مدیر (کوکی avid_admin) یا استادِ مالک جلسه (hostId = او).
 * صفحه‌ی کلاس برای هر دو نقش میزبان همین مسیر را صدا می‌زند تا وضعیت
 * دیتابیسِ جلسات استاد هم هم‌زمان درست شود (نه فقط جلسات مدیر) —
 * در نتیجه با پایان جلسه، باکس «دعوت به کلاس» بلافاصله از پنل کاربران
 * حذف می‌شود و جلسات رهاشده هم به‌خوبی توسط بستنِ خودکارِ بیکاری جمع می‌شوند.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = (await req.json().catch(() => null)) as {
      status?: unknown;
    } | null;
    if (body?.status !== "live" && body?.status !== "ended") {
      return NextResponse.json(
        { error: "وضعیت جلسه معتبر نیست — live یا ended." },
        { status: 400 }
      );
    }

    const stream = await findStreamByRef(id);
    if (!stream) {
      return NextResponse.json(
        { error: "کلاس آنلاین پیدا نشد." },
        { status: 404 }
      );
    }

    // — مدیر → کنترل کامل جلسه —
    const admin = await getSessionAdmin(req);
    if (!admin) {
      // — وگرنه فقط استادِ مالکِ جلسه مجاز است —
      const session = await getSessionUser(req);
      if (!session || stream.hostId !== session.id) {
        return NextResponse.json(
          { error: "دسترسی غیرمجاز. لطفاً ابتدا وارد شوید." },
          { status: 401 }
        );
      }
      const host = await db.user.findUnique({
        where: { id: session.id },
        select: { role: true },
      });
      if (host?.role !== "teacher") {
        return NextResponse.json(
          { error: "دسترسی غیرمجاز. لطفاً ابتدا وارد شوید." },
          { status: 401 }
        );
      }
    }

    const now = new Date();
    const updated = await db.liveStream.update({
      where: { id: stream.id },
      data:
        body.status === "live"
          ? { status: "live", startedAt: now, endedAt: null }
          : { status: "ended", endedAt: now },
      select: { id: true, status: true },
    });

    // پایان جلسه: حضور همه‌ی افرادی که هنوز «در کلاس» هستند بسته می‌شود
    if (body.status === "ended") {
      await db.streamParticipant.updateMany({
        where: { streamId: stream.id, leftAt: null },
        data: { leftAt: now },
      });
    }

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    console.error("stream host-status error:", error);
    return NextResponse.json(
      { error: "خطا در به‌روزرسانی وضعیت جلسه." },
      { status: 500 }
    );
  }
}
