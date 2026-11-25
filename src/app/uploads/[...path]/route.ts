import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { resolve, sep } from "node:path";
import { db } from "@/lib/db";
import { getSessionAdmin } from "@/lib/auth";
import { getSessionUser } from "@/lib/user-auth";
import { verifyCertSig } from "@/lib/cert-files";
import { sanitizeSvg } from "@/lib/svg-sanitize";

/**
 * سرو فایل‌های آپلودی — GET /uploads/<فایل> و /uploads/videos/<فایل>
 *
 * چرا این مسیر لازم است؟ خروجی standalone مرور Next.js فهرست public/ را
 * «در زمان بیلد» می‌سازد؛ فایلی که پس از بیلد (در زمان اجرا) در
 * public/uploads نوشته می‌شود از سمت فایل‌استاتیک ۴۰۴ برمی‌گردد. این
 * route همان فایل را مستقیم از دیسک (از همان مسیری که API آپلود می‌نویسد)
 * به‌صورت استریم برمی‌گرداند — بنابراین نمایش تصویر/ویدئوی تازه بلافاصله
 * پس از آپلود و پس از بازسازی کانتینر (فایل‌ها در والیوم) کار می‌کند.
 * فایل‌های موجود در public (نمونه‌های build-time) همچنان از مسیر استاتیک
 * خود سرو می‌شوند و به این route نمی‌رسند.
 *
 * • Range/206 برای پخش ویدئو (seek) پشتیبانی می‌شود.
 * • ETag/304 و کش نامحدود — نام فایل‌ها یکتا و تصادفی است (هر آپلود URL
 *   تازه می‌سازد)، پس کشِ immutable امن است.
 * • گارد پیمایش مسیر (path traversal): فقط فایل‌های داخل uploads سرو می‌شوند.
 * • امنیت (اصلاحات ۸):
 *   – فایل‌های گواهینامه «خصوصی»اند: فقط با امضای HMAC معتبر (?sig=)،
 *     نشست مدیر، یا نشست کاربرِ مالکِ همان گواهینامه سرو می‌شوند؛
 *     بقیه ۴۰۴ می‌گیرند (بدون افشای وجود/نبود فایل). لینک‌های عمومی
 *     موردنیاز سایت (استعلام گواهینامه با nationalId، پنل کاربر) همان
 *     API است که لینک امضاشده صادر می‌کند — پس نمایش عمومی استعلام و
 *     نمایش خصوصی پنل هر دو کار می‌کنند.
 *   – فایل‌های SVG در زمان «سرو» هم پاکسازی و با CSP سخت‌گیرانه
 *     (script-src 'none'; sandbox) ارسال می‌شوند — حتی فایل‌های قدیمی
 *     یا بازیابی‌شده از بکاپ از این لایه رد می‌شوند؛ نمایش لوگو حفظ می‌شود.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ریشه‌ی آپلودها — همان مسیری که /api/admin/upload در آن می‌نویسد */
const UPLOADS_ROOT = resolve(process.cwd(), "public", "uploads");

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

function mimeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

interface FilePart {
  abs: string;
  size: number;
  mtimeMs: number;
}

/** یافتن امن فایل داخل uploads (بدون پیمایش مسیر) */
function resolveFile(segments: string[]): FilePart | null {
  const rel = segments.join(sep);
  if (!rel || rel.split(sep).some((s) => !s || s === "." || s === "..")) {
    return null;
  }
  const abs = resolve(UPLOADS_ROOT, rel);
  if (abs !== UPLOADS_ROOT && !abs.startsWith(UPLOADS_ROOT + sep)) return null;
  let info;
  try {
    info = statSync(abs);
  } catch {
    return null;
  }
  if (!info.isFile()) return null;
  return { abs, size: info.size, mtimeMs: info.mtimeMs };
}

/**
 * گره‌ی دسترسی فایل‌های گواهینامه (خصوصی):
 *  امضای معتبر در query، یا نشست مدیر، یا نشست کاربرِ مالک گواهینامه.
 */
async function certificateAccessAllowed(
  req: NextRequest,
  segments: string[]
): Promise<boolean> {
  const rel = [ "uploads", ...segments ].join("/");
  const filePath = `/${rel}`; // بدون query — همان مقداری که در DB ذخیره می‌شود
  const sig = req.nextUrl.searchParams.get("sig");
  if (sig && verifyCertSig(filePath, sig)) return true;
  try {
    if (await getSessionAdmin(req)) return true;
  } catch {
    /* خطای دیتابیس — به بررسی مالکیت ادامه بده */
  }
  try {
    const session = await getSessionUser(req);
    if (session) {
      const cert = await db.certificate.findFirst({
        where: { fileUrl: filePath },
        select: { userId: true },
      });
      if (cert && cert.userId === session.id) return true;
    }
  } catch {
    /* بدون نشست/خطا — رد */
  }
  return false;
}

/** ETag ضعیف بر اساس اندازه/زمان تغییر — نام‌ها یکتا هستند */
function etagFor(f: FilePart): string {
  return `W/"${f.size}-${Math.round(f.mtimeMs)}"`;
}

/** تجزیه‌ی Range تک‌بخشی؛ null یعنی بدون هدر/چندبخشی → پاسخ کامل */
function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // قالب غیرمعتبر/چندبخشی → پاسخ کامل ۲۰۰
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;
  if (rawStart === "") {
    // bytes=-N → N بایت آخر
    const suffix = Number(rawEnd);
    if (suffix <= 0) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  if (start >= size) return "invalid";
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) return "invalid";
  return { start, end };
}

function baseHeaders(f: FilePart, contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etagFor(f),
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * سرو امن SVG — محتوا در زمان سرو پاکسازی و با CSP بدون-اسکریپت ارسال
 * می‌شود (دفاع لایه‌ای روی پاکسازیِ زمان آپلود). نمایش لوگو حفظ می‌شود.
 */
async function serveSanitizedSvg(
  req: NextRequest,
  f: FilePart
): Promise<Response> {
  const etag = etagFor(f);
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  let safe: string;
  try {
    safe = sanitizeSvg(await readFile(f.abs, "utf8"));
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
  return new NextResponse(safe, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      // اسکریپت‌ها مختل می‌شوند حتی اگر محتوایی رد شود؛ شکل‌ها/گرادیان‌ها سالم‌اند
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; script-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path: segments } = await ctx.params;
  const file = resolveFile(segments);
  if (!file) {
    return new NextResponse("not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // — گره‌ی گواهینامه‌ها (فایل خصوصی): بدون امضا/مالکیت/نشست مدیر → ۴۰۴ —
  if (segments[0] === "certificates") {
    const allowed = await certificateAccessAllowed(req, segments);
    if (!allowed) {
      return new NextResponse("not found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  // مشتری نسخه‌ی کش‌شده دارد؟
  const etag = etagFor(file);
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  // SVG → پاکسازیِ زمان سرو + CSP سخت‌گیرانه
  if (file.abs.toLowerCase().endsWith(".svg")) {
    return serveSanitizedSvg(req, file);
  }

  const contentType = mimeFor(file.abs);
  const range = parseRange(req.headers.get("range"), file.size);

  if (range === "invalid") {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${file.size}` },
    });
  }

  if (range) {
    const stream = Readable.toWeb(
      createReadStream(file.abs, { start: range.start, end: range.end })
    ) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        ...baseHeaders(file, contentType),
        "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }

  const stream = Readable.toWeb(
    createReadStream(file.abs)
  ) as unknown as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    status: 200,
    headers: {
      ...baseHeaders(file, contentType),
      "Content-Length": String(file.size),
    },
  });
}

/** HEAD (مثلاً curl -I / بررسی سلامت لینک) بدون بدنه */
export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path: segments } = await ctx.params;
  const file = resolveFile(segments);
  if (!file) return new NextResponse(null, { status: 404 });

  // گره‌ی گواهینامه‌ها روی HEAD هم اعمال می‌شود
  if (segments[0] === "certificates") {
    const allowed = await certificateAccessAllowed(req, segments);
    if (!allowed) return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      ...baseHeaders(file, mimeFor(file.abs)),
      "Content-Length": String(file.size),
    },
  });
}
