import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";
import { signCertFileUrl } from "@/lib/cert-files";

/**
 * GET /api/panel/certificates — گواهینامه‌های کاربر وارد‌شده.
 *
 * هر گواهینامه شامل کد رهگیری، عنوان دوره (تصویر لحظه‌ای)، معدل،
 * تاریخ صدور، توضیح و فایل آپلودشده (PDF یا تصویر) است —
 * کاربر می‌تواند فایل را دانلود کند؛ گواهینامه‌های بدون فایل به‌صورت
 * برگه‌ی سیستمی قابل چاپ نمایش داده می‌شوند.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "برای مشاهده‌ی گواهینامه‌ها، وارد حساب خود شوید." },
        { status: 401 }
      );
    }

    const certificates = await db.certificate.findMany({
      where: { userId: session.id },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        code: true,
        courseTitle: true,
        grade: true,
        note: true,
        fileUrl: true,
        issuedAt: true,
      },
    });

    // فایل گواهینامه خصوصی است — لینک «امضاشده» کوتاه‌عمر صادر می‌شود؛
    // مسیر دانلود (uploads/certificates) با مالکیت/امضا گره خورده است.
    return NextResponse.json(
      {
        certificates: certificates.map((c) => ({
          ...c,
          fileUrl: signCertFileUrl(c.fileUrl),
          issuedAt: c.issuedAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("panel certificates GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت گواهینامه‌ها." },
      { status: 500 }
    );
  }
}
