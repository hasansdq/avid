import { NextRequest } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import {
  VIDEOS_DIR,
  mimeOf,
  toWebStream,
} from "@/lib/media";

/**
 * سرو عمومی رسانه — GET /api/media/videos/[...path]
 * مسیرهای مجاز: videos/<file> و videos/thumbs/<file>
 * برای ویدئوها از هدر Range پشتیبانی می‌شود تا جابه‌جایی (seek) پلیر کار کند.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

type Params = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { path: segments } = await params;

  // اعتبارسنجی مسیر — فقط دو سطح: <file> یا thumbs/<file>
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.length > 2 ||
    !segments.every((s) => SAFE_SEGMENT.test(s) && !s.includes(".."))
  ) {
    return new Response("مسیر رسانه نامعتبر است.", { status: 400 });
  }
  if (segments.length === 2 && segments[0] !== "thumbs") {
    return new Response("مسیر رسانه یافت نشد.", { status: 404 });
  }

  const filePath = join(VIDEOS_DIR, ...segments);
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) {
    return new Response("رسانه یافت نشد.", { status: 404 });
  }

  const mime = mimeOf(filePath) ?? "application/octet-stream";
  const size = info.size;

  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    // نام پرونده‌ها تصادفی است — کش طولانی امن است
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  // — درخواست بخشی (Range) → پاسخ ۲۰۶ برای seek ویدیو —
  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : size - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
        return new Response("بازه‌ی درخواست نامعتبر است.", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      if (start >= size) {
        return new Response("بازه‌ی درخواست خارج از اندازه‌ی پرونده است.", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      end = Math.min(end, size - 1);

      const chunk = createReadStream(filePath, { start, end });
      return new Response(toWebStream(chunk), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  // — پاسخ کامل ۲۰۰ —
  const stream = Readable.from(createReadStream(filePath));
  return new Response(toWebStream(stream), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
