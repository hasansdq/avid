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
 * سرو «خصوصی» فایل‌های گواهینامه — GET /api/uploads/certificates/<file>
 *
 * درخواست‌های /uploads/certificates/** با rewrite قبل-از-فایل‌سیستم
 * (next.config.ts → beforeFiles) به همین route می‌رسند؛ فایل‌های
 * گواهینامه دیگر از مسیر عمومی/استاتیک سرو نمی‌شوند.
 *
 * گره‌ی دسترسی (هر درخواست):
 *  • امضای HMAC معتبر در query (?sig=expiry.hmac) — لینک‌هایی که API
 *    برای مصرف‌کننده‌های مجاز صادر می‌کند (پنل کاربر، استعلام عمومی،
 *    بهینه‌ساز تصویر next/image)؛
 *  • نشست مدیر (کوکی avid_admin)؛
 *  • نشست کاربر «مالکِ» همان گواهینامه (کوکی avid_user) — بررسی مالکیت.
 * بقیه ۴۰۴ می‌گیرند (بدون افشای وجود/نبود فایل).
 *
 * پشتیبانی Range برای پیش‌نمایش PDF در iframe. پاسخ‌های GET/HEAD/Range
 * «کش عمومی» ندارند: Cache-Control: private, no-store — فایل خصوصی است
 * و در کش عمومی واسطه‌ها/CDN جایی ندارد (بند ۸).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_ROOT = resolve(process.cwd(), "public", "uploads");
const CERT_DIR = resolve(UPLOADS_ROOT, "certificates");

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
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

function resolveCertFile(segments: string[]): FilePart | null {
  const rel = segments.join(sep);
  if (!rel || rel.split(sep).some((s) => !s || s === "." || s === "..")) {
    return null;
  }
  // فقط نام فایلِ ساده در ریشه‌ی certificates (بدون زیرپوشه)
  if (segments.length !== 1) return null;
  const abs = resolve(CERT_DIR, rel);
  if (!abs.startsWith(CERT_DIR + sep)) return null;
  try {
    const info = statSync(abs);
    if (!info.isFile()) return null;
    return { abs, size: info.size, mtimeMs: info.mtimeMs };
  } catch {
    return null;
  }
}

function etagFor(f: FilePart): string {
  return `W/"${f.size}-${Math.round(f.mtimeMs)}"`;
}

/** مسیر منطقی ذخیره‌شده در DB برای این فایل (بدون query) */
function storedPath(name: string): string {
  return `/uploads/certificates/${name}`;
}

async function certificateAccessAllowed(
  req: NextRequest,
  filePath: string
): Promise<boolean> {
  const sig = req.nextUrl.searchParams.get("sig");
  if (sig && verifyCertSig(filePath, sig)) return true;
  try {
    if (await getSessionAdmin(req)) return true;
  } catch {
    /* ادامه به بررسی مالکیت */
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
    /* رد */
  }
  return false;
}

function notFound(): NextResponse {
  return new NextResponse("not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;
  if (rawStart === "") {
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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path: segments } = await ctx.params;
  const file = resolveCertFile(segments);
  if (!file) return notFound();

  const filePath = storedPath(segments.join("/"));
  const allowed = await certificateAccessAllowed(req, filePath);
  if (!allowed) return notFound();

  const etag = etagFor(file);
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-store" },
    });
  }

  // SVG گواهینامه — پاکسازی زمان سرو (دفاع لایه‌ای)
  if (file.abs.toLowerCase().endsWith(".svg")) {
    let safe: string;
    try {
      safe = sanitizeSvg(await readFile(file.abs, "utf8"));
    } catch {
      return notFound();
    }
    return new NextResponse(safe, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, no-store",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; script-src 'none'; sandbox",
      },
    });
  }

  const contentType = mimeFor(file.abs);
  const base: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  const range = parseRange(req.headers.get("range"), file.size);
  if (range === "invalid") {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${file.size}`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (range) {
    const stream = Readable.toWeb(
      createReadStream(file.abs, { start: range.start, end: range.end })
    ) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        ...base,
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
    headers: { ...base, "Content-Length": String(file.size) },
  });
}

/** HEAD — گره‌ی همان GET (بدون بدنه) */
export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path: segments } = await ctx.params;
  const file = resolveCertFile(segments);
  if (!file) return new NextResponse(null, { status: 404 });
  const filePath = storedPath(segments.join("/"));
  if (!(await certificateAccessAllowed(req, filePath))) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": mimeFor(file.abs),
      "Content-Length": String(file.size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
