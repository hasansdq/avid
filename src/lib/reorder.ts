import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bad } from "@/lib/api-helpers";

/**
 * ذخیره‌ی ترتیب جدید لیست (کشیدن و رها کردن در پنل مدیر).
 *
 * POST /api/admin/{courses|videos|exams}/reorder  بدنه: { ids: string[] }
 * ترتیب آرایه مرجع است — آیتم i ام «sortOrder = i + ۱» می‌گیرد.
 * کل عملیات در یک تراکنش؛ اگر آیتمی یافت نشد همه تغییرات برگردانده می‌شود.
 */
export async function reorderItems(
  model: "course" | "video" | "exam",
  body: unknown
): Promise<NextResponse> {
  const b = (body ?? {}) as { ids?: unknown };
  const ids = Array.isArray(b.ids)
    ? b.ids.map((x) => String(x)).filter(Boolean)
    : [];

  if (ids.length === 0) return bad("فهرست ترتیب ارسال نشده است.");
  if (new Set(ids).size !== ids.length) {
    return bad("فهرست ترتیب تکراری است؛ دوباره تلاش کنید.");
  }

  try {
    await db.$transaction(
      ids.map((id, i) => {
        const data = { sortOrder: i + 1 };
        return model === "course"
          ? db.course.update({ where: { id }, data })
          : model === "video"
            ? db.video.update({ where: { id }, data })
            : db.exam.update({ where: { id }, data });
      })
    );
  } catch {
    return bad("یکی از آیتم‌های فهرست یافت نشد؛ لیست را نوسازی کنید.");
  }

  return NextResponse.json({ ok: true, message: "ترتیب جدید ذخیره شد." });
}
