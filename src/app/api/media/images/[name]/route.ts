import { NextRequest } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import { IMAGES_DIR, mimeOf, toWebStream } from "@/lib/media";

/**
 * سرو عمومی تصاویر — GET /api/media/images/[name]
 * تصاویر آپلودی (لوگو، بندانگشتی دوره، کاور لیست پخش و ...) را
 * با نوع MIME درست و کش طولانی سرو می‌کند.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { name } = await params;

  // اعتبارسنجی نام پرونده — فقط یک سطح، بدون پیمایش مسیر
  if (!SAFE_SEGMENT.test(name) || name.includes("..")) {
    return new Response("مسیر تصویر نامعتبر است.", { status: 400 });
  }

  const filePath = join(IMAGES_DIR, name);
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) {
    return new Response("تصویر یافت نشد.", { status: 404 });
  }

  const mime = mimeOf(filePath) ?? "application/octet-stream";
  const stream = Readable.from(createReadStream(filePath));

  return new Response(toWebStream(stream), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(info.size),
      // نام پرونده‌ها تصادفی است — کش طولانی امن است
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
