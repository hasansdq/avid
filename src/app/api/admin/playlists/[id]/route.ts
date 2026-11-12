import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { str, int, bool, bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/** ورودی اعتبارسنجی‌شده‌ی لیست پخش */
interface PlaylistInput {
  title: string;
  description: string;
  thumbnail: string;
  sortOrder: number;
  published: boolean;
  visibility: "guest" | "user" | "both";
}

/** مقادیر مجاز مخاطب لیست پخش */
const VISIBILITIES = new Set(["guest", "user", "both"]);

/**
 * اعتبارسنجی بدنه‌ی لیست پخش —
 * عنوان ۲ تا ۱۲۰ نویسه، توضیحات ≤۶۰۰، تصویر ≤۵۰۰، ترتیب عدد صحیح ≥۰،
 * مخاطب نمایش: مهمان/کاربر/هر دو.
 */
function parsePlaylist(body: Record<string, unknown> | null): PlaylistInput | string {
  if (!body) return "بدنه درخواست نامعتبر است.";
  const title = str(body.title);
  if (title.length < 2 || title.length > 120)
    return "عنوان لیست پخش باید بین ۲ تا ۱۲۰ نویسه باشد.";

  const description = str(body.description);
  if (description.length > 600)
    return "توضیحات لیست پخش حداکثر ۶۰۰ نویسه می‌تواند باشد.";

  const thumbnail = str(body.thumbnail);
  if (thumbnail.length > 500)
    return "آدرس تصویر لیست پخش حداکثر ۵۰۰ نویسه می‌تواند باشد.";

  const sortOrder = int(body.sortOrder, 0);
  if (sortOrder < 0) return "ترتیب نمایش نمی‌تواند منفی باشد.";

  const visibilityRaw = str(body.visibility, "both") || "both";
  if (!VISIBILITIES.has(visibilityRaw))
    return "مخاطب نمایش لیست پخش باید «مهمان»، «کاربر» یا «هر دو» باشد.";

  return {
    title,
    description: description.slice(0, 600),
    thumbnail: thumbnail.slice(0, 500),
    sortOrder,
    published: bool(body.published, true),
    visibility: visibilityRaw as PlaylistInput["visibility"],
  };
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const data = parsePlaylist(body);
    if (typeof data === "string") return bad(data);

    const existing = await db.playlist
      .findUnique({ where: { id } })
      .catch(() => null);
    if (!existing) return bad("لیست پخشی با این شناسه یافت نشد", 404);

    const playlist = await db.playlist.update({ where: { id }, data });
    return NextResponse.json(playlist);
  } catch (error) {
    console.error("playlist PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش لیست پخش. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    // رابطه‌ی Video.playlist با onDelete: SetNull —
    // ویدئوهای لیست حذف نمی‌شوند و به‌صورت مستقل باقی می‌مانند.
    const playlist = await db.playlist
      .delete({ where: { id } })
      .catch(() => null);

    if (!playlist) return bad("لیست پخشی با این شناسه یافت نشد", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("playlist DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف لیست پخش. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
