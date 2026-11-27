import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str, float } from "@/lib/api-helpers";
import { signCertFileUrl, stripCertSig } from "@/lib/cert-files";

/**
 * GET  /api/admin/certificates — لیست همه‌ی گواهینامه‌های صادرشده
 * POST /api/admin/certificates — صدور گواهینامه‌ی جدید از ماژول «صدور گواهینامه»
 *
 * POST بدنه: { userId, courseId, fileUrl, grade?, note? }
 *  · userId و courseId الزامی‌اند — کاربر و دوره‌ای که در آن شرکت کرده است.
 *  · fileUrl الزامی است: آدرس فایل آپلودشده (PDF یا تصویر) از
 *    POST /api/admin/upload با kind=certificate.
 *  · برای هر کاربر در هر دوره فقط یک گواهینامه مجاز است (تکرار → خطا).
 *  · grade اختیاری ۰ تا ۱۰۰ و note توضیح کوتاه اختیاری است.
 */

/** کد رهگیری یکتا — AVD-XXXXXXXX */
function newCode(): string {
  return `AVD-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** select مشترک برای پاسخ‌های API (لیست + صدور) */
const CERT_INCLUDE = {
  user: {
    select: { firstName: true, lastName: true, phone: true },
  },
} as const;

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const certificates = await db.certificate.findMany({
      orderBy: { issuedAt: "desc" },
      include: CERT_INCLUDE,
    });
    // فایل گواهینامه خصوصی است — لینک امضاشده‌ی کوتاه‌عمر در پاسخ می‌آید
    return NextResponse.json(
      { certificates: certificates.map((c) => ({ ...c, fileUrl: signCertFileUrl(c.fileUrl) })) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("certificates GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت گواهینامه‌ها." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const userId = str(body.userId);
    const courseId = str(body.courseId);
    // در ذخیره‌سازی query جدا می‌شود تا DB تمیز بماند (امضا فقط در پاسخ/نمایش)
    const fileUrl = stripCertSig(str(body.fileUrl));
    const note = str(body.note).slice(0, 300);

    if (!userId) return bad("انتخاب کاربر الزامی است.");
    if (!courseId) return bad("انتخاب دوره الزامی است.");
    if (!fileUrl) {
      return bad(
        "آپلود فایل گواهینامه (PDF یا تصویر) الزامی است."
      );
    }

    // — اعتبارسنجی کاربر —
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    if (!user) return bad("کاربر یافت نشد.", 404);

    // — اعتبارسنجی دوره —
    const course = await db.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    });
    if (!course) return bad("دوره یافت نشد.", 404);

    // — دوره باید یکی از دوره‌هایی باشد که کاربر در آن شرکت کرده است —
    const attended = await db.enrollment.findFirst({
      where: {
        userId,
        course: course.title,
        status: { not: "archived" },
      },
      select: { id: true, grade: true },
    });
    if (!attended) {
      return bad(
        "این کاربر در این دوره ثبت‌نام نکرده است؛ گواهینامه فقط برای دوره‌ای که کاربر در آن شرکت کرده صادر می‌شود."
      );
    }

    // — تکراری نبودن: هر کاربر در هر دوره فقط یک گواهینامه —
    const existing = await db.certificate.findFirst({
      where: { userId, courseId: course.id },
      select: { id: true, code: true },
    });
    if (existing) {
      return bad(
        `برای این کاربر در این دوره قبلاً گواهینامه صادر شده است (کد ${existing.code}). برای تغییر، همان گواهینامه را ویرایش کنید.`,
        409
      );
    }

    // — معدل اختیاری ۰ تا ۱۰۰ —
    let grade: number | null = null;
    const rawGrade = body.grade;
    if (rawGrade !== null && rawGrade !== undefined && String(rawGrade).trim() !== "") {
      grade = float(rawGrade, -1);
      if (grade < 0 || grade > 100) {
        return bad("معدل باید عددی بین ۰ تا ۱۰۰ باشد.");
      }
      grade = Math.round(grade * 100) / 100;
    }

    // — ساخت گواهینامه‌ی جدید — کد یکتا با سه تلاش
    let certificate: Awaited<ReturnType<typeof db.certificate.create>> | null =
      null;
    for (let attempt = 0; attempt < 3 && !certificate; attempt++) {
      try {
        certificate = await db.certificate.create({
          data: {
            code: newCode(),
            userId,
            courseId: course.id,
            courseTitle: course.title,
            grade,
            note,
            fileUrl,
          },
          include: CERT_INCLUDE,
        });
      } catch {
        // برخورد نادر کد تکراری — تلاش بعدی
      }
    }
    if (!certificate) {
      return bad("ساخت کد رهگیری ناموفق بود؛ دوباره تلاش کنید.");
    }

    return NextResponse.json(
      { ...certificate, fileUrl: signCertFileUrl(certificate.fileUrl) },
      { status: 201 }
    );
  } catch (error) {
    console.error("certificate POST error:", error);
    return NextResponse.json(
      { error: "خطا در صدور گواهینامه." },
      { status: 500 }
    );
  }
}
