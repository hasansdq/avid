import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import { generateInviteSlug } from "@/lib/classes";

/**
 * GET /api/admin/classes — لیست کلاس‌ها با شمارنده‌ی اعضا (نزولی بر اساس ایجاد).
 */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const classes = await db.classRoom.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } } },
    });
    return NextResponse.json(classes);
  } catch (error) {
    console.error("classes GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت کلاس‌ها." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/classes — ایجاد کلاس جدید.
 *
 * body: { title, description? }
 *
 * شناسه‌ی لینک دعوت یکتا به‌صورت خودکار تولید می‌شود و بعداً از
 * پنل مدیر قابل مشاهده، کپی و تغییر است.
 */
export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const title = str(body?.title);
    const description = str(body?.description).slice(0, 400);

    if (title.length < 2 || title.length > 80) {
      return bad("عنوان کلاس باید بین ۲ تا ۸۰ نویسه باشد.");
    }

    // — تولید شناسه‌ی یکتا (چند تلاش در صورت برخورد بسیار نادر) —
    for (let attempt = 0; attempt < 5; attempt++) {
      const inviteSlug = generateInviteSlug();
      const exists = await db.classRoom.findUnique({
        where: { inviteSlug },
        select: { id: true },
      });
      if (exists) continue;

      const classRoom = await db.classRoom.create({
        data: { title, description, inviteSlug },
        include: { _count: { select: { members: true } } },
      });
      return NextResponse.json(classRoom, { status: 201 });
    }

    return bad("تولید شناسه‌ی یکتای لینک دعوت ناموفق بود؛ دوباره تلاش کنید.", 500);
  } catch (error) {
    console.error("classes POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد کلاس. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
