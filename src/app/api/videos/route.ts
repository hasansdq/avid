import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";

/**
 * GET /api/videos — ویدئوها و لیست‌های پخش عمومی برای صفحه‌ی /videos
 *
 * مخاطب هر لیست پخش از فیلد visibility تعیین می‌شود:
 *  · guest → فقط برای مهمان‌ها (کاربر لاگین‌کرده نمی‌بیند)
 *  · user  → فقط برای کاربران وارد‌شده (مهمان نمی‌بیند)
 *  · both  → برای همه
 * نشست کاربر از کوکی avid_user خوانده می‌شود (بدون نیاز به ورود).
 */
export async function GET(req: NextRequest) {
  try {
    // وضعیت ورود کاربر (مهمان = null)
    const session = await getSessionUser(req).catch(() => null);
    const isLoggedIn = Boolean(session);

    const [videos, playlists] = await Promise.all([
      db.video.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      db.playlist.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
    ]);

    // فیلتر لیست‌های پخش بر اساس مخاطب و وضعیت ورود
    const visiblePlaylists = playlists.filter((p) => {
      if (p.visibility === "guest") return !isLoggedIn;
      if (p.visibility === "user") return isLoggedIn;
      return true; // both
    });
    const visibleIds = new Set(visiblePlaylists.map((p) => p.id));

    // ویدئوهای لیست‌های نامرئی از خروجی حذف می‌شوند؛
    // ویدئوهای مستقل (بدون لیست) همیشه عمومی‌اند.
    const visibleVideos = videos.filter(
      (v) => !v.playlistId || visibleIds.has(v.playlistId)
    );

    return NextResponse.json(
      {
        isLoggedIn,
        videos: visibleVideos,
        playlists: visiblePlaylists,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("videos GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت ویدئوها." },
      { status: 500 }
    );
  }
}
