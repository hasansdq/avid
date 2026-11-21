import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { requireAdmin } from "@/lib/auth";
import {
  BACKUP_SECTION_KEYS,
  BACKUP_VERSION,
  backupCounts,
  buildBackupPayload,
  type BackupPayload,
  type BackupSectionKey,
} from "@/lib/backup";

/**
 * GET /api/admin/backup — ماژول «بکاپ و بازیابی» پنل مدیریت.
 *
 *  • ?mode=summary (پیش‌فرض): آمار رکوردها و فایل‌های آپلودی برای نمایش
 *  • ?mode=json:  دانلود بکاپ داده‌ها به‌صورت فایل JSON — کل سایت یا یک بخش
 *  • ?mode=zip:   دانلود بکاپ کامل — JSON داده‌ها + فایل‌های آپلودی
 *                (تصاویر، ویدئوها و فونت‌های public/uploads)
 *  • ?section=<کلید بخش>: محدود کردن بکاپ به همان بخش (دوره‌ها/ویدئوها/
 *    کاربران/نمونه‌سؤال‌ها/گواهی‌نامه‌ها/صفحات). غیبت یا "full" = کل سایت
 *    (رفتار امروز). در ZIP بخشی، فقط فایل‌های آپلودیِ ارجاع‌شده از رکوردهای
 *    همان بخش قرار می‌گیرد.
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

/** الگوی ارجاع به فایل آپلودی در رشته‌های دیتابیس (مثل /uploads/videos/a.mp4) */
const UPLOAD_REF_PATTERN = /\/uploads\/[^\s"'<>{}()\[\]]+/g;

/**
 * فیلدهایی از جدول‌های هر بخش که ممکن است به فایل آپلودی (/uploads/...)
 * اشاره کنند — مبنای انتخاب فایل‌های ZIP بخشی.
 */
const SECTION_UPLOAD_FIELDS: Partial<
  Record<BackupSectionKey, Record<string, string[]>>
> = {
  courses: { course: ["imageUrl"], examQuestion: ["image", "video"] },
  videos: { playlist: ["thumbnail"], video: ["thumbnail", "url"] },
  sampleQuestions: { sampleQuestion: ["fileUrl"] },
  certificates: { certificate: ["fileUrl"] },
  pages: { siteSettings: ["logoUrl"], installedFont: ["cssText"] },
  users: {}, // کاربران فایل آپلودی ندارند — ZIP فقط شامل backup.json است
};

/**
 * فایل‌های آپلودیِ یک بخش — مسیرهای /uploads/... از رکوردهای همان بخش
 * جمع می‌شود و فقط فایل‌هایی که واقعاً روی دیسک هستند در ZIP می‌آیند.
 */
async function collectSectionUploadFiles(
  payload: BackupPayload
): Promise<UploadFile[]> {
  const section = payload.section ?? "full";
  const fieldsByTable = SECTION_UPLOAD_FIELDS[section] ?? {};
  const rels = new Set<string>();

  for (const [table, fields] of Object.entries(fieldsByTable)) {
    const rows = payload.tables[table as keyof typeof payload.tables];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      for (const field of fields) {
        const value = row[field];
        if (typeof value !== "string" || !value) continue;
        for (const match of value.matchAll(UPLOAD_REF_PATTERN)) {
          const rel = match[0]
            .replace(/^\/uploads\//, "")
            .split("/")
            .filter((p) => p && p !== "." && p !== "..");
          if (rel.length > 0) rels.add(rel.join("/"));
        }
      }
    }
  }

  const out: UploadFile[] = [];
  for (const rel of rels) {
    const parts = rel.split("/").filter((p) => p && p !== "." && p !== "..");
    if (parts.length === 0) continue;
    const abs = join(UPLOADS_ROOT, ...parts);
    const info = await stat(abs).catch(() => null);
    if (info && info.isFile()) {
      out.push({ rel: parts.join("/"), abs, size: info.size });
    }
  }
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

  // بخش بکاپ — غیبت/«full» = کل سایت؛ کلید ناشناخته → ۴۰۰
  const sectionParam = req.nextUrl.searchParams.get("section")?.trim() || "full";
  if (!BACKUP_SECTION_KEYS.has(sectionParam)) {
    return NextResponse.json(
      { error: `بخش بکاپ ناشناخته: «${sectionParam}».` },
      { status: 400 }
    );
  }
  const section = sectionParam as BackupSectionKey;

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

    // ————— بکاپ داده‌ها (JSON) — کل سایت یا یک بخش —————
    if (mode === "json") {
      const payload = await buildBackupPayload(section);
      const body = JSON.stringify(payload);
      const suffix = section === "full" ? "" : `-${section}`;
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="avid-backup${suffix}-${stamp()}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // ————— بکاپ کامل (ZIP: داده‌ها + فایل‌های آپلودی) —————
    if (mode === "zip") {
      const payload = await buildBackupPayload(section);
      // کل سایت: همه‌ی فایل‌های uploads؛ بخش: فقط فایل‌های ارجاع‌شده
      const files =
        section === "full"
          ? await scanUploads()
          : await collectSectionUploadFiles(payload);

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

      const suffix = section === "full" ? "" : `-${section}`;
      return new NextResponse(webStream, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="avid-backup${suffix}-${stamp()}.zip"`,
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
