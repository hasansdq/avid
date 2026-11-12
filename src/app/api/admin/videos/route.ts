import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseVideo, bad } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const videos = await db.video.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(videos);
  } catch (error) {
    console.error("videos GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت ویدئوها." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const data = parseVideo(body);
    if (typeof data === "string") return bad(data);

    // اگر لیست پخشی ارسال شده، باید واقعی باشد
    if (data.playlistId) {
      const playlist = await db.playlist
        .findUnique({ where: { id: data.playlistId } })
        .catch(() => null);
      if (!playlist) return bad("لیست پخش یافت نشد");
    }

    const video = await db.video.create({ data });
    return NextResponse.json(video, { status: 201 });
  } catch (error) {
    console.error("videos POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد ویدئو. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
