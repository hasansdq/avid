import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { checkAdminRateLimit, parseChatMessage } from "@/lib/chat";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/chat/admin/conversations/[id]/messages —
 * پاسخ مدیر به یک گفتگو.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { admin, denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;

    if (admin && !checkAdminRateLimit(admin.id)) {
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

    const conversation = await db.chatConversation
      .findUnique({ where: { id } })
      .catch(() => null);

    if (!conversation) {
      return NextResponse.json(
        { error: "گفتگو یافت نشد." },
        { status: 404 }
      );
    }

    const message = await db.chatMessage.create({
      data: {
        conversationId: id,
        sender: "admin",
        senderName: admin?.username ?? "پشتیبانی",
        content: parsed.content,
      },
    });

    await db.chatConversation.update({
      where: { id },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: parsed.content.slice(0, 120),
        unreadForVisitor: { increment: 1 },
        unreadForAdmin: 0,
      },
    });

    return NextResponse.json({ message });
  } catch (error) {
    console.error("admin chat reply error:", error);
    return NextResponse.json(
      { error: "خطا در ارسال پاسخ. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
