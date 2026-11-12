import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseVideo, bad } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
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

    const video = await db.video
      .update({ where: { id }, data })
      .catch(() => null);

    if (!video) return bad("ویدئویی با این شناسه یافت نشد.", 404);
    return NextResponse.json(video);
  } catch (error) {
    console.error("video PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش ویدئو. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const video = await db.video
      .delete({ where: { id } })
      .catch(() => null);

    if (!video) return bad("ویدئویی با این شناسه یافت نشد.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("video DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف ویدئو. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
