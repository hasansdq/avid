import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/chat/admin/conversations —
 * لیست گفتگوهای بازدیدکنندگان برای صندوق ورودی پنل مدیریت.
 */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const conversations = await db.chatConversation.findMany({
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    });

    return NextResponse.json(
      conversations.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        visitorToken: c.visitorToken,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        unreadForAdmin: c.unreadForAdmin,
        createdAt: c.createdAt,
      }))
    );
  } catch (error) {
    console.error("admin chat conversations error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت لیست گفتگوها." },
      { status: 500 }
    );
  }
}
