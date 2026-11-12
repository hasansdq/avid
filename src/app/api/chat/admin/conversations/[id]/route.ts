import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/chat/admin/conversations/[id] —
 * جزئیات یک گفتگو + پیام‌های آن؛ با باز کردن، شمارنده‌ی «خوانده‌نشده» صفر می‌شود.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;

    const conversation = await db.chatConversation
      .findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 300 } },
      })
      .catch(() => null);

    if (!conversation) {
      return NextResponse.json(
        { error: "گفتگو یافت نشد." },
        { status: 404 }
      );
    }

    // مدیر گفتگو را دیده است
    if (conversation.unreadForAdmin > 0) {
      await db.chatConversation
        .update({ where: { id }, data: { unreadForAdmin: 0 } })
        .catch(() => {});
    }

    return NextResponse.json({
      id: conversation.id,
      displayName: conversation.displayName,
      visitorToken: conversation.visitorToken,
      createdAt: conversation.createdAt,
      lastMessageAt: conversation.lastMessageAt,
      messages: conversation.messages,
    });
  } catch (error) {
    console.error("admin chat conversation GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت گفتگو." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/admin/conversations/[id] — حذف گفتگو.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const deleted = await db.chatConversation
      .delete({ where: { id } })
      .catch(() => null);

    if (!deleted) {
      return NextResponse.json(
        { error: "گفتگو یافت نشد." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin chat conversation DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف گفتگو." },
      { status: 500 }
    );
  }
}
