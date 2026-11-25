import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isValidNationalId, normalizeNationalId } from "@/lib/national-id";
import { signCertFileUrl } from "@/lib/cert-files";

/**
 * POST /api/certificate/verify — استعلام عمومی گواهی‌نامه‌ها با کد ملی.
 *
 * عمومی است (بدون نیاز به ورود)؛ کد ملی ۱۰ رقمی معتبر گرفته می‌شود و:
 *  • کاربری با این کد ملی نبود یا گواهی‌نامه‌ای نداشت →
 *      { ok: false, reason: "not_found" | "no_certificates" }
 *  • دارای حداقل یک گواهی‌نامه بود →
 *      { ok: true, user: {firstName, lastName}, certificates: [...] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const nationalId = normalizeNationalId(
      typeof body?.nationalId === "string" ? body.nationalId : ""
    );

    if (!isValidNationalId(nationalId)) {
      return NextResponse.json(
        { error: "کد ملی ۱۰ رقمی معتبر وارد کنید." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { nationalId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, reason: "not_found" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const certificates = await db.certificate.findMany({
      where: { userId: user.id },
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

    if (certificates.length === 0) {
      return NextResponse.json(
        { ok: false, reason: "no_certificates" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        user: { firstName: user.firstName, lastName: user.lastName },
        // فایل گواهینامه دیگر «لینک همیشگی عمومی» نیست — لینک امضاشده‌ی
        // کوتاه‌عمر برگردانده می‌شود؛ مسیر دانلود با امضا/مالکیت گره خورده است.
        certificates: certificates.map((c) => ({
          ...c,
          fileUrl: signCertFileUrl(c.fileUrl),
          issuedAt: c.issuedAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("certificate verify by national id error:", error);
    return NextResponse.json(
      { error: "خطا در استعلام گواهی‌نامه؛ لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
