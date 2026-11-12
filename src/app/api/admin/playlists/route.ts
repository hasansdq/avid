import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { str, int, bool, bad } from "@/lib/api-helpers";

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

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const playlists = await db.playlist.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(playlists);
  } catch (error) {
    console.error("playlists GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت لیست‌های پخش." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const data = parsePlaylist(body);
    if (typeof data === "string") return bad(data);

    const playlist = await db.playlist.create({ data });
    return NextResponse.json(playlist, { status: 201 });
  } catch (error) {
    console.error("playlists POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد لیست پخش. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
