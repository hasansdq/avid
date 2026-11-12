import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFontsSeeded } from "@/lib/fonts";

/**
 * مدیریت فونت‌های نصب‌شده سایت —
 *  GET  : فهرست همه‌ی فونت‌ها (با ساخت فونت‌های پیش‌فرض در اولین اجرا)
 *  POST : نصب فونت جدید با آپلود فایل (woff/woff2/ttf/otf)
 */

/** نوع‌های مجاز → پسوند فایل */
const ALLOWED_TYPES = new Map<string, string>([
  ["font/woff", "woff"],
  ["font/woff2", "woff2"],
  ["font/ttf", "ttf"],
  ["font/otf", "otf"],
  ["application/font-woff", "woff"],
  ["application/font-woff2", "woff2"],
  ["application/x-font-ttf", "ttf"],
  ["application/x-font-otf", "otf"],
  ["font/sfnt", "otf"],
  // برخی مرورگرها ttf/otf را octet-stream معرفی می‌کنند — با بررسی پسوند نام فایل هم می‌پذیریم
]);

const ACCEPT_LABEL = "WOFF، WOFF2، TTF یا OTF";
const MAX_BYTES = 8 * 1024 * 1024; // ۸ مگابایت

/** پسوند مجاز از نام فایل (برای موارد octet-stream) */
function extFromName(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  const ext = m?.[1]?.toLowerCase() ?? "";
  return ["woff", "woff2", "ttf", "otf"].includes(ext) ? ext : null;
}

/** ساخت کلید یکتا و امن برای فونت آپلودی */
function makeKey(label: string): string {
  const slug = label
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .slice(0, 40);
  return `custom-${slug || "font"}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  await ensureFontsSeeded();

  const fonts = await db.installedFont.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(fonts);
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const label = String(form.get("label") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "فایل فونت ارسال نشده است." },
        { status: 400 }
      );
    }
    if (label.length < 2 || label.length > 60) {
      return NextResponse.json(
        { error: "نام نمایشی فونت باید بین ۲ تا ۶۰ نویسه باشد." },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "فایل خالی است." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "حجم فایل فونت حداکثر ۸ مگابایت می‌تواند باشد." },
        { status: 400 }
      );
    }

    let ext = ALLOWED_TYPES.get(file.type) ?? extFromName(file.name);
    if (!ext) {
      return NextResponse.json(
        { error: `فرمت فونت باید ${ACCEPT_LABEL} باشد.` },
        { status: 400 }
      );
    }

    // نام خانواده از نام نمایشی (بدون نویسه‌های خاص) + شناسه‌ی یکتا
    const familyBase = label.replace(/[^\p{L}\p{N} ]/gu, "").trim() || "Custom";
    const key = makeKey(label);
    const family = `${familyBase.replace(/\s+/g, " ")} ${crypto
      .randomBytes(2)
      .toString("hex")}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const name = `${key}.${ext}`;

    const dir = path.join(process.cwd(), "public", "uploads", "fonts");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);

    const format = ext === "woff2" ? "woff2" : ext === "woff" ? "woff" : ext === "ttf" ? "truetype" : "opentype";
    const cssText = `@font-face{font-family:'${family}';src:url('/uploads/fonts/${name}') format('${format}');font-weight:400;font-style:normal;font-display:swap}`;

    const created = await db.installedFont.create({
      data: {
        key,
        label,
        family,
        cssText,
        builtin: false,
        sortOrder: 100,
      },
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("fonts POST error:", error);
    return NextResponse.json(
      { error: "خطا در نصب فونت. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
