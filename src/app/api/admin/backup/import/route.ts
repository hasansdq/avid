import { NextRequest, NextResponse } from "next/server";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import type { Entry, ZipFile } from "yauzl";
import { writeFile } from "node:fs/promises";
import { sanitizeSvg } from "@/lib/svg-sanitize";
import { requireAdmin } from "@/lib/auth";
import { str } from "@/lib/api-helpers";
import {
  BACKUP_SECTION_KEYS,
  importBackup,
  validateBackupPayload,
  BackupDataLossError,
  BackupForeignKeyError,
  type BackupPayload,
  type BackupSectionKey,
  type DataLossItem,
} from "@/lib/backup";

/**
 * POST /api/admin/backup/import — بازیابی از فایل بکاپ (ماژول «بکاپ و بازیابی»).
 *
 * ورودی: multipart/form-data با فیلد file — یکی از دو:
 *  • فایل JSON خروجی «بکاپ داده‌ها» → بازیابی رکوردهای دیتابیس
 *  • فایل ZIP خروجی «بکاپ کامل» → بازیابی رکوردها + فایل‌های آپلودی
 *    (backup.json در ریشه‌ی ZIP و uploads/** کنار آن)
 *  • فیلد اختیاری force ("1") — تأیید صریحِ از دست رفتن داده‌ی فعلیِ
 *    بخش‌هایی که در فایل بکاپ قدیمی نیستند (پیش از هر تغییری بررسی
 *    می‌شود؛ بدون تأیید، پاسخ ۴۰۹ با فهرست موارد قابل از دست رفتن)
 *  • فیلد اختیاری section/only (کلید بخش) — بازیابی «فقط همان بخش» از
 *    فایل؛ مثلاً از یک بکاپ کامل فقط ویدئوها. غیبت = همه‌ی بخش‌های
 *    موجود در فایل (رفتار پیشین)
 *
 * ⚠ جایگزینی: داده‌های محتواییِ جدول‌های «موجود در فایل» با محتوای فایل
 * جایگزین می‌شوند (جدول‌های غایب از فایل دست‌نخورده می‌مانند). حساب و
 * نشست مدیرِ واردشده دست‌نخورده می‌ماند؛ نشست کاربران و کدهای
 * یک‌بارمصرف پاک می‌شوند.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** سقف حجم فایل بکاپ قابل بارگذاری (ZIP با ویدئوها) */
const IMPORT_MAX_BYTES = 512 * 1024 * 1024;

/* — سقف‌های استخراج ZIP (بند ۱۰): بمب‌زیپ/آرشیو داغون دیسک را رد می‌کند — */

/** سقف تعداد فایل‌های استخراج‌شده از ZIP */
const IMPORT_MAX_FILES = 20_000;
/** سقف حجم «غیرفشرده‌ی» هر entry */
const IMPORT_MAX_ENTRY_BYTES = 1024 * 1024 * 1024;
/** سقف مجموع حجم غیرفشرده‌ی استخراج‌شده */
const IMPORT_MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;
/** سقف حجم backup.json (پیش از خواندن در حافظه) */
const IMPORT_MAX_JSON_BYTES = 64 * 1024 * 1024;

/** ریشه‌ی آپلودها — مقصد بازیابی فایل‌ها از ZIP */
const UPLOADS_ROOT = resolve(process.cwd(), "public", "uploads");

/** اسمبل بکاپ از ZIP که خودمان تولید می‌کنیم + هر ZIP سازگار دیگر */
const BACKUP_JSON_NAMES = new Set(["backup.json", "avid-backup.json"]);

function isZipMagic(bytes: Buffer): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  );
}

/** مسیر نسبی امن داخل uploads — null یعنی ورودی رد شد */
function sanitizeUploadPath(raw: string): string[] | null {
  const clean = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter(
    (p) => p && p !== "." && p !== ".."
  );
  if (parts.length === 0) return null;
  if (parts[0] !== "uploads") return null;
  const rest = parts.slice(1);
  if (rest.length === 0) return null;
  if (rest.some((p) => p.includes("\0") || /[\\:*?"<>|]/.test(p))) return null;
  return rest;
}

/** خواندن کامل محتوای یک entry (برای backup.json که کوچک است) */
function readEntryBytes(zipfile: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise<Buffer>((resolvePromise, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolvePromise(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

/** استریم-to-دیسک: بازیابی یک فایل آپلودی از ZIP بدون بار کامل در حافظه */
function extractEntryTo(
  zipfile: ZipFile,
  entry: Entry,
  target: string
): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      void (async () => {
        try {
          await mkdir(dirname(target), { recursive: true });
          await pipeline(stream, createWriteStream(target));
          resolvePromise();
        } catch (pipeError) {
          reject(pipeError instanceof Error ? pipeError : new Error(String(pipeError)));
        }
      })();
    });
  });
}

/** خطای فارسیِ یکدست */
function invalid(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** پاسخ «بازیابی نیازمند تأیید» — بدون تغییر در دیتابیس */
function dataLossResponse(losses: DataLossItem[]): NextResponse {
  return NextResponse.json(
    {
      error:
        "بازیابی این بکاپ قدیمی، داده‌های فعلی برخی بخش‌ها را پاک می‌کند — برای ادامه باید صریحاً تأیید کنید.",
      code: "data-loss",
      losses,
    },
    { status: 409 }
  );
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  let file: File | null = null;
  let force = false;
  let only: BackupSectionKey | null = null;
  try {
    const form = await req.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
    const forceRaw = form.get("force");
    force = forceRaw === "1" || forceRaw === "true";
    // محدوده‌ی بازیابی — فیلد section یا only (هم‌ارز)
    const scopeRaw = form.get("section") ?? form.get("only");
    if (typeof scopeRaw === "string" && scopeRaw !== "" && scopeRaw !== "all") {
      if (!BACKUP_SECTION_KEYS.has(scopeRaw)) {
        return invalid("محدوده‌ی بازیابی انتخاب‌شده معتبر نیست.");
      }
      only = scopeRaw as BackupSectionKey;
    }
  } catch (error) {
    console.error("backup import form error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت فایل بکاپ." },
      { status: 500 }
    );
  }

  if (!file || file.size === 0) {
    return invalid("فایل بکاپ ارسال نشده است.");
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return invalid("حجم فایل بکاپ حداکثر ۵۱۲ مگابایت می‌تواند باشد.");
  }

  const name = str(file.name, "").toLowerCase();

  try {
    const bytes = Buffer.from(await file.arrayBuffer());

    // ————— مسیر ۱: ZIP (بکاپ کامل) —————
    if (isZipMagic(bytes) || name.endsWith(".zip")) {
      let zipfile: ZipFile | null = null;
      try {
        zipfile = await yauzl.fromBufferPromise(bytes, {
          autoClose: false,
          lazyEntries: true,
          decodeStrings: true,
          validateEntrySizes: true,
        });

        // ۱) جمع‌آوری همه‌ی entryها (پیمایش فهرست مرکزی)
        const entries: Entry[] = [];
        for await (const entry of zipfile.eachEntry()) {
          entries.push(entry);
        }

        // ۱.۵) سقف‌های استخراج (بند ۱۰) — پیش از هر خواندن/نوشتن:
        //  تعداد فایل، حجم هر entry، و مجموع حجم غیرفشرده — بمب‌زیپ
        //  (فهرست مرکزی جعلی) و آرشیو داغون دیسک رد می‌شوند.
        const fileEntries = entries.filter((e) => !e.fileName.endsWith("/"));
        if (fileEntries.length > IMPORT_MAX_FILES) {
          return invalid(
            `تعداد فایل‌های این ZIP بیش از حد مجاز است (حداکثر ${IMPORT_MAX_FILES.toLocaleString("en-US")} فایل).`
          );
        }
        for (const entry of fileEntries) {
          if (entry.uncompressedSize > IMPORT_MAX_ENTRY_BYTES) {
            return invalid(
              "یکی از فایل‌های ZIP بیش از سقف حجم مجاز است — استخراج انجام نشد."
            );
          }
        }
        const totalUncompressed = fileEntries.reduce(
          (sum, e) => sum + e.uncompressedSize,
          0
        );
        if (totalUncompressed > IMPORT_MAX_TOTAL_BYTES) {
          return invalid(
            "مجموع حجم غیرفشرده‌ی ZIP بیش از سقف مجاز است — استخراج انجام نشد."
          );
        }

        // ۲) یافتن و اعتبارسنجی backup.json پیش از هر تغییری
        const jsonEntry =
          entries.find((e) => BACKUP_JSON_NAMES.has(e.fileName)) ??
          entries.find(
            (e) =>
              e.fileName.endsWith(".json") &&
              !e.fileName.includes("/") &&
              !e.fileName.startsWith(".")
          );
        if (!jsonEntry) {
          return invalid(
            "در این ZIP فایل داده‌های بکاپ (backup.json) یافت نشد."
          );
        }
        // backup.json هم سقف حجم مستقل دارد (پیش از خواندن کامل در حافظه)
        if (jsonEntry.uncompressedSize > IMPORT_MAX_JSON_BYTES) {
          return invalid(
            "فایل داده‌های بکاپ (backup.json) بیش از ۶۴ مگابایت است — معتبر نیست."
          );
        }
        const rawJson = await readEntryBytes(zipfile, jsonEntry);
        let payload: BackupPayload;
        try {
          payload = validateBackupPayload(JSON.parse(rawJson.toString("utf-8")));
        } catch (parseError) {
          throw new Error(
            parseError instanceof Error
              ? parseError.message
              : "فایل داده‌های بکاپ خراب است."
          );
        }

        // ۳) بازیابی فایل‌های آپلودی (پیش از دیتابیس — اگر دیتابیس
        //    بازیابی نشود فقط فایل‌های بی‌ضرر اضافه شده‌اند)
        let filesRestored = 0;
        for (const entry of entries) {
          if (entry.fileName === jsonEntry.fileName) continue;
          if (entry.fileName.endsWith("/")) continue; // پوشه
          if (
            entry.fileName.startsWith("__MACOSX/") ||
            entry.fileName.split("/").some((p) => p.startsWith("."))
          ) {
            continue; // زباله‌های سیستم‌عامل
          }
          const parts = sanitizeUploadPath(entry.fileName);
          if (!parts) continue; // فقط uploads/** مجاز است
          const target = join(UPLOADS_ROOT, ...parts);
          // SVG بازیابی‌شده همان پاکسازیِ آپلود را می‌بیند (بند ۸) —
          // مسیر بازیابی نباید فایل مخرب روی دیسک بگذارد.
          if (entry.fileName.toLowerCase().endsWith(".svg")) {
            const raw = await readEntryBytes(zipfile, entry);
            const safe = sanitizeSvg(raw.toString("utf8"));
            if (/<svg[\s>]/i.test(safe)) {
              await mkdir(dirname(target), { recursive: true });
              await writeFile(target, safe, "utf8");
            }
            filesRestored += 1;
            continue;
          }
          await extractEntryTo(zipfile, entry, target);
          filesRestored += 1;
        }

        // ۴) جایگزینی رکوردهای دیتابیس داخل تراکنش واحد
        //    (بدون force: بکاپ قدیمی‌ای که حذف والد‌هایش داده‌ی فعلیِ
        //    آزمون‌ها/نمونه‌سؤال‌ها/گواهی‌نامه‌ها را پاک می‌کرد، رد می‌شود)
        const { restored, section } = await importBackup(payload, {
          force,
          only: only ?? undefined,
        });

        return NextResponse.json({
          ok: true,
          restored,
          section,
          filesRestored,
          exportedAt: payload.exportedAt,
        });
      } finally {
        try {
          zipfile?.close();
        } catch {
          /* بی‌صدا */
        }
      }
    }

    // ————— مسیر ۲: JSON (بکاپ داده‌ها) —————
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf-8"));
    } catch {
      return invalid("فایل JSON بکاپ قابل خواندن نیست.");
    }
    const payload = validateBackupPayload(parsed);
    const { restored, section } = await importBackup(payload, {
      force,
      only: only ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      restored,
      section,
      filesRestored: 0,
    });
  } catch (error) {
    // بازیابیِ نیازمند تأیید صریح (از دست رفتن داده‌ی فعلی بخش‌های غایب
    // از فایل قدیمی یا خارج از محدوده‌ی انتخابی) — بدون هیچ تغییری در دیتابیس
    if (error instanceof BackupDataLossError) {
      return dataLossResponse(error.losses);
    }
    // کلید خارجی بی‌مرجع در فایل — خطای قطعی با راهنمایی بازیابی والد مربوطه
    if (error instanceof BackupForeignKeyError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "fk-invalid",
          details: error.details,
        },
        { status: 400 }
      );
    }
    const message =
      error instanceof Error ? error.message : "خطای ناشناخته در بازیابی.";
    console.error("backup import error:", error);
    // خطاهای اعتبارسنجی → ۴۰۰ با پیام فارسی؛ بقیه → ۵۰۰
    const isValidation =
      /بکاپ|جدول|ردیف|نسخه|ساختار|خراب|ناشناخته/.test(message);
    return NextResponse.json(
      { error: isValidation ? message : "خطا در بازیابی بکاپ — " + message },
      { status: isValidation ? 400 : 500 }
    );
  }
}
