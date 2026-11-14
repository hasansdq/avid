import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { requireAdmin } from "@/lib/auth";
import { BACKUP_VERSION, backupCounts, buildBackupPayload } from "@/lib/backup";

/**
 * GET /api/admin/backup — ماژول «بکاپ و بازیابی» پنل مدیریت.
 *
 *  • ?mode=summary (پیش‌فرض): آمار رکوردها و فایل‌های آپلودی برای نمایش
 *  • ?mode=json:  دانلود بکاپ همه‌ی داده‌ها به‌صورت فایل JSON
 *  • ?mode=zip:   دانلود بکاپ کامل — JSON داده‌ها + فایل‌های آپلودی
 *                (تصاویر، ویدئوها و فونت‌های public/uploads)
 *
 * خارج از بکاپ: حساب/نشست مدیر، نشست کاربران و کدهای یک‌بارمصرف.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ریشه‌ی آپلودها — همان مسیری که API آپلود در آن می‌نویسد */
const UPLOADS_ROOT = resolve(process.cwd(), "public", "uploads");

interface UploadFile {
  rel: string;
  abs: string;
  size: number;
}

/** فهرست بازگشتی فایل‌های uploads با مسیر نسبی امن */
async function scanUploads(): Promise<UploadFile[]> {
  const out: UploadFile[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // پوشه‌ی uploads هنوز وجود ندارد — بکاپ خالی
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        const abs = join(dir, entry.name);
        const info = await stat(abs).catch(() => null);
        if (info) out.push({ rel, abs, size: info.size });
      }
    }
  }

  await walk(UPLOADS_ROOT, "");
  return out;
}

/** مهر زمانی فشرده برای نام فایل دانلودی */
function stamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .replace(/\..+$/, "");
}

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  const mode = req.nextUrl.searchParams.get("mode") ?? "summary";

  try {
    // ————— خلاصه‌ی آماری (برای نمایش داخل ماژول) —————
    if (mode === "summary") {
      const [counts, files] = await Promise.all([
        backupCounts(),
        scanUploads(),
      ]);
      return NextResponse.json({
        ok: true,
        version: BACKUP_VERSION,
        counts,
        uploads: {
          files: files.length,
          bytes: files.reduce((sum, f) => sum + f.size, 0),
        },
      });
    }

    // ————— بکاپ داده‌ها (JSON) —————
    if (mode === "json") {
      const payload = await buildBackupPayload();
      const body = JSON.stringify(payload);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="avid-backup-${stamp()}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // ————— بکاپ کامل (ZIP: داده‌ها + فایل‌های آپلودی) —————
    if (mode === "zip") {
      const [payload, files] = await Promise.all([
        buildBackupPayload(),
        scanUploads(),
      ]);

      // فایل‌های بزرگ (ویدئو) به‌صورت STORE — فشرده‌سازی بی‌فایده و پرهزینه است
      const STORE_THRESHOLD = 4 * 1024 * 1024;

      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.append(JSON.stringify(payload, null, 2), { name: "backup.json" });
      for (const f of files) {
        archive.append(createReadStream(f.abs), {
          name: `uploads/${f.rel.split(sep).join("/")}`,
          store: f.size > STORE_THRESHOLD,
        });
      }

      const webStream = Readable.toWeb(
        archive
      ) as unknown as ReadableStream<Uint8Array>;
      // finalize بدون انتظار — استریم با مصرفِ پاسخ تخلیه می‌شود
      void archive.finalize().catch(() => {
        // خطا روی خود استریم هم منتشر می‌شود؛ این‌جا فقط از rejection
        // بی‌صدا جلوگیری می‌کنیم تا پایداری route حفظ شود
      });

      return new NextResponse(webStream, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="avid-backup-${stamp()}.zip"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(
      { error: `حالت ناشناخته: ${mode}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("backup GET error:", error);
    return NextResponse.json(
      { error: "خطا در ساخت بکاپ. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
