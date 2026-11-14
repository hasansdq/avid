import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { resolve, sep } from "node:path";

/**
 * سرو فایل‌های آپلودی — GET /uploads/<فایل> و /uploads/videos/<فایل>
 *
 * چرا این مسیر لازم است؟ خروجی standalone مرور Next.js فهرست public/ را
 * «در زمان بیلد» می‌سازد؛ فایلی که پس از بیلد (در زمان اجرا) در
 * public/uploads نوشته می‌شود از سمت فایل‌استاتیک ۴۰۴ برمی‌گردد. این
 * route همان فایل را مستقیم از دیسک (از همان مسیری که API آپلود می‌نویسد)
 * به‌صورت استریم برمی‌گرداند — بنابراین نمایش تصویر/ویدئوی تازه بلافاصله
 * پس از آپلود و پس از بازسازی کانتینر (فایل‌ها در والی اند) کار می‌کند.
 * فایل‌های موجود در public (نمونه‌های build-time) همچنان از مسیر استاتیک
 * خود سرو می‌شوند و به این route نمی‌رسند.
 *
 * • Range/206 برای پخش ویدئو (seek) پشتیبانی می‌شود.
 * • ETag/304 و کش نامحدود — نام فایل‌ها یکتا و تصادفی است (هر آپلود URL
 *   تازه می‌سازد)، پس کشِ immutable امن است.
 * • گارد پیمایش مسیر (path traversal): فقط فایل‌های داخل uploads سرو می‌شوند.
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
  };
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

  // مشتری نسخه‌ی کش‌شده دارد؟
  const etag = etagFor(file);
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
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
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path: segments } = await ctx.params;
  const file = resolveFile(segments);
  if (!file) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, {
    status: 200,
    headers: {
      ...baseHeaders(file, mimeFor(file.abs)),
      "Content-Length": String(file.size),
    },
  });
}
