import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  attachVisitorCookie,
  checkRateLimit,
  getChatSettings,
  issueChatTicket,
  parseChatMessage,
  readVisitorToken,
} from "@/lib/chat";
import { requestSecure } from "@/lib/http";

/**
 * GET /api/chat/messages —
 * تاریخچه‌ی گفتگوی بازدیدکننده‌ی فعلی (برای نوسازی پس از رویداد بلادرنگ).
 * با این فراخوانی پیام‌های خوانده‌شده از سوی بازدیدکننده «دیده» می‌شوند.
 */
export async function GET(req: NextRequest) {
  try {
    const { token, isNew } = readVisitorToken(req);

    const conversation = await db.chatConversation.findUnique({
      where: { visitorToken: token },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
    });

    // بازدیدکننده پیام‌های مدیر را دیده است
    if (conversation && conversation.unreadForVisitor > 0) {
      await db.chatConversation
        .update({
          where: { id: conversation.id },
          data: { unreadForVisitor: 0 },
        })
        .catch(() => {});
    }

    const res = NextResponse.json({
      conversation: conversation
        ? { id: conversation.id, messages: conversation.messages }
        : null,
    });
    if (isNew) attachVisitorCookie(res, token, requestSecure(req));
    return res;
  } catch (error) {
    console.error("chat messages GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت پیام‌ها." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/messages — ارسال پیام از سوی بازدیدکننده.
 * در اولین پیام، گفتگو ساخته می‌شود و پیام خوش‌آمدگویی چت‌بات ذخیره می‌گردد.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, isNew } = readVisitorToken(req);

    if (!checkRateLimit(token)) {
      return NextResponse.json(
        { error: "تعداد پیام‌های ارسالی زیاد است؛ کمی صبر کنید." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = parseChatMessage(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const settings = await getChatSettings();
    if (!settings.isActive) {
      return NextResponse.json(
        { error: "چت پشتیبانی در حال حاضر غیرفعال است." },
        { status: 403 }
      );
    }

    // پیدا یا ساخت گفتگو
    let conversation = await db.chatConversation.findUnique({
      where: { visitorToken: token },
    });

    let created = false;
    if (!conversation) {
      conversation = await db.chatConversation
        .create({ data: { visitorToken: token } })
        .catch(() => null);
      // در حالت همزمانی ممکن است رکورد تکراری ساخته شده باشد
      if (!conversation) {
        conversation = await db.chatConversation.findUniqueOrThrow({
          where: { visitorToken: token },
        });
      } else {
        created = true;
        // ذخیره‌ی پیام خوش‌آمدگویی به‌عنوان اولین پیام ربات
        const welcome = settings.welcomeMessage.trim();
        if (welcome) {
          await db.chatMessage.create({
            data: {
              conversationId: conversation.id,
              sender: "bot",
              senderName: settings.botName,
              content: welcome,
            },
          });
        }
      }
    }

    const message = await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        sender: "visitor",
        content: parsed.content,
      },
    });

    await db.chatConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: parsed.content.slice(0, 120),
        unreadForAdmin: { increment: 1 },
      },
    });

    const res = NextResponse.json({
      conversationId: conversation.id,
      created,
      message,
      // تیکت عضویت در اتاق همین گفتگو — برای عضویت بلادرنگ در سرویس رله
      ticket: issueChatTicket(conversation.id, token),
    });
    if (isNew) attachVisitorCookie(res, token, requestSecure(req));
    return res;
  } catch (error) {
    console.error("chat messages POST error:", error);
    return NextResponse.json(
      { error: "خطا در ارسال پیام. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
