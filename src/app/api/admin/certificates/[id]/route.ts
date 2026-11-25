import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str, float } from "@/lib/api-helpers";
import { signCertFileUrl, stripCertSig } from "@/lib/cert-files";

/**
 * PATCH  /api/admin/certificates/[id] — ویرایش گواهینامه (معدل، توضیح، جایگزینی فایل)
 * DELETE /api/admin/certificates/[id] — حذف گواهینامه (فایل آپلودشده هم از دیسک پاک می‌شود)
 *
 * PATCH بدنه: { note?, grade?, fileUrl? } — فقط فیلدهای ارسالی تغییر می‌کنند.
 */

/** حذف فایل آپلودشده‌ی محلی از دیسک (فقط مسیرهای /uploads/certificates/...) */
async function removeLocalFile(fileUrl: string): Promise<void> {
  try {
    const m = /^\/uploads\/certificates\/([a-z0-9-]+\.[a-z0-9]+)$/i.exec(
      fileUrl.trim()
    );
    if (!m) return; // فایل خارجی یا نامعتبر — دست نزنیم
    const abs = path.join(
      process.cwd(),
      "public",
      "uploads",
      "certificates",
      m[1]
    );
    await unlink(abs);
  } catch {
    // فایل از قبل حذف شده یا در دسترس نیست — بی‌خیال
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const existing = await db.certificate.findUnique({
      where: { id },
      select: { id: true, fileUrl: true },
    });
    if (!existing) return bad("گواهینامه یافت نشد.", 404);

    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const data: { note?: string; grade?: number | null; fileUrl?: string } = {};

    if ("note" in body) {
      const note = str(body.note).slice(0, 300);
      data.note = note;
    }

    if ("grade" in body) {
      const raw = body.grade;
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        data.grade = null;
      } else {
        const grade = float(raw, -1);
        if (grade < 0 || grade > 20) {
          return bad("معدل باید عددی بین ۰ تا ۲۰ باشد.");
        }
        data.grade = Math.round(grade * 100) / 100;
      }
    }

    if ("fileUrl" in body) {
      const fileUrl = stripCertSig(str(body.fileUrl));
      if (!fileUrl) return bad("آدرس فایل گواهینامه نمی‌تواند خالی باشد.");
      data.fileUrl = fileUrl; // ذخیره‌سازی بدون query — امضا فقط در پاسخ/نمایش است
    }

    if (Object.keys(data).length === 0) {
      return bad("هیچ فیلد قابل ویرایشی ارسال نشده است.");
    }

    const updated = await db.certificate.update({
      where: { id },
      data,
      include: {
        user: {
          select: { firstName: true, lastName: true, phone: true },
        },
      },
    });

    // فایل قبلی محلی بعد از جایگزینی موفق پاک می‌شود
    if (data.fileUrl && existing.fileUrl && existing.fileUrl !== data.fileUrl) {
      await removeLocalFile(existing.fileUrl);
    }

    return NextResponse.json(
      { ...updated, fileUrl: signCertFileUrl(updated.fileUrl) }
    );
  } catch (error) {
    console.error("certificate PATCH error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش گواهینامه." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const existing = await db.certificate.findUnique({
      where: { id },
      select: { id: true, fileUrl: true },
    });
    if (!existing) return bad("گواهینامه یافت نشد.", 404);

    await db.certificate.delete({ where: { id } });

    // فایل آپلودشده‌ی محلی هم پاک می‌شود
    if (existing.fileUrl) {
      await removeLocalFile(existing.fileUrl);
    }

    return NextResponse.json({ ok: true, message: "گواهینامه حذف شد." });
  } catch (error) {
    console.error("certificate DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف گواهینامه." },
      { status: 500 }
    );
  }
}
