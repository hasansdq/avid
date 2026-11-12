import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  attachVisitorCookie,
  getChatSettings,
  getClientIp,
  issueChatTicket,
  readVisitorToken,
  shouldShowWelcome,
  toPublicChatSettings,
} from "@/lib/chat";
import { requestSecure } from "@/lib/http";

/**
 * GET /api/chat/bootstrap —
 * بارگذاری اولیه‌ی ویجت چت برای بازدیدکننده:
 * تنظیمات عمومی چت‌بات + تاریخچه‌ی گفتگوی همان بازدیدکننده (بر اساس کوکی).
 * در اولین بازدید کوکی شناسایی بازدیدکننده ست می‌شود.
 * «showWelcome» فقط برای نخستین بازدید هر IP در هر شبانه‌روز true است —
 * حباب خوش‌آمدگویی (نه پنجره‌ی کامل چت) به‌صورت خودکار نمایش داده می‌شود.
 */
export async function GET(req: NextRequest) {
  try {
    const { token, isNew } = readVisitorToken(req);

    const [settings, conversation] = await Promise.all([
      getChatSettings(),
      db.chatConversation.findUnique({
        where: { visitorToken: token },
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 200 },
        },
      }),
    ]);

    // حباب خوش‌آمدگویی فقط وقتی چت فعال و نمایش خودکار روشن باشد بررسی می‌شود؛
    // در حالت خامش ثبت نمایش انجام نمی‌شود تا با روشن شدن تنظیم، همان روز قابل نمایش بماند.
    const showWelcome =
      settings.isActive && settings.autoOpen
        ? await shouldShowWelcome(getClientIp(req))
        : false;

    const res = NextResponse.json({
      settings: toPublicChatSettings(settings),
      conversation: conversation
        ? {
            id: conversation.id,
            messages: conversation.messages,
            // تیکت امضاشده برای عضویت در اتاق همین گفتگو (سرویس رله)
            ticket: issueChatTicket(conversation.id, token),
          }
        : null,
      showWelcome,
    });

    if (isNew) attachVisitorCookie(res, token, requestSecure(req));
    return res;
  } catch (error) {
    console.error("chat bootstrap error:", error);
    return NextResponse.json(
      { error: "خطا در بارگذاری چت. لطفاً صفحه را نوسازی کنید." },
      { status: 500 }
    );
  }
}
