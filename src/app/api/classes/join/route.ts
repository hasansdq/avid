import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";

/**
 * POST /api/classes/join — عضویت کاربر واردشده در کلاس از طریق لینک دعوت.
 *
 * body: { slug }
 *
 * عضویت از طریق لینک دعوت انجام می‌شود (صفحه /join/{slug})؛ ثبت‌نام معمولی
 * سایت بدون کلاس است و کاربر می‌تواند عضو چندین کلاس باشد. اگر از قبل عضو
 * باشد پاسخ alreadyMember=true می‌گیرد (بدون خطا) تا صفحه بپیوندد/بسلامت
 * اطلاع‌رسانی کند.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const slug =
      typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";

    if (!slug) {
      return NextResponse.json(
        { error: "شناسه‌ی لینک دعوت ارسال نشده است." },
        { status: 400 }
      );
    }

    // — عضویت فقط برای کاربر واردشده — فرم ثبت‌نام صفحه دعوت این نشست را می‌سازد —
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "برای عضویت در کلاس، ابتدا شماره موبایل خود را تایید کنید." },
        { status: 401 }
      );
    }

    const classRoom = await db.classRoom.findUnique({
      where: { inviteSlug: slug },
      select: { id: true, title: true },
    });
    if (!classRoom) {
      return NextResponse.json(
        { error: "کلاس یافت نشد — لینک دعوت نامعتبر است یا تغییر کرده است." },
        { status: 404 }
      );
    }

    // — کاربر مسدود عضو کلاس نمی‌شود —
    const fresh = await db.user.findUnique({
      where: { id: sessionUser.id },
      select: { status: true },
    });
    if (fresh?.status === "blocked") {
      return NextResponse.json(
        {
          error:
            "حساب شما توسط مدیر مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.",
        },
        { status: 403 }
      );
    }

    // — عضویت از قبل موجود؟ (بدون خطا؛ صفحه اطلاع می‌دهد) —
    const existing = await db.classMembership.findUnique({
      where: { userId_classId: { userId: sessionUser.id, classId: classRoom.id } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          ok: true,
          alreadyMember: true,
          classTitle: classRoom.title,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    try {
      await db.classMembership.create({
        data: { userId: sessionUser.id, classId: classRoom.id },
      });
    } catch (error) {
      // برخورد یکتایی در رقابت همزمان → عملاً عضو شده است
      if ((error as { code?: string })?.code !== "P2002") throw error;
    }

    return NextResponse.json(
      { ok: true, alreadyMember: false, classTitle: classRoom.title },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("class join error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت عضویت. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
