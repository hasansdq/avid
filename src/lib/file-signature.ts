/**
 * تشخیص نوع واقعی فایل از روی «بایت‌های آغازین» (magic bytes) —
 * (بند ۸ اصلاحات امنیتی: اعتماد صرف به پسوند/MIME ارسالی کافی نیست)
 *
 * کاربرد: پیش از نوشتن فایل آپلودی روی دیسک، «محتوای واقعی» با پسوند
 * ادعایی هم‌خوانی سنجیده می‌شود؛ فایل جعل‌شده (مثلاً HTML/PHP با نام
 * *.png یا SVG حامل اسکریپت) رد یا پاکسازی می‌شود.
 */

export type SniffedKind =
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "avif"
  | "bmp"
  | "svg"
  | "pdf"
  | "mp4"
  | "quicktime"
  | "matroska"
  | "ogg"
  | "woff"
  | "woff2"
  | "ttf"
  | "otf"
  | "ttc"
  | null;

function asciiAt(bytes: Uint8Array, offset: number, len: number): string {
  let s = "";
  for (
    let i = offset;
    i < Math.min(offset + len, bytes.length);
    i++
  ) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

/** اسنیف باینری محتوای فایل از ۶۴ کیلوبایت آغازین */
function sniffBinary(bytes: Uint8Array): SniffedKind {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0x89 && asciiAt(bytes, 1, 3) === "PNG") return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  if (asciiAt(bytes, 0, 3) === "GIF") return "gif";
  if (asciiAt(bytes, 0, 2) === "BM") return "bmp";
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP")
    return "webp";
  if (asciiAt(bytes, 0, 4) === "%PDF") return "pdf";
  // EBML — WebM / Matroska
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "matroska";
  if (asciiAt(bytes, 0, 4) === "OggS") return "ogg";
  // ISO BMFF — برند مشخص‌گر قالب
  if (asciiAt(bytes, 4, 4) === "ftyp") {
    const brand = asciiAt(bytes, 8, 4).toLowerCase();
    if (brand === "avif" || brand === "avis") return "avif";
    if (brand.startsWith("qt")) return "quicktime";
    return "mp4"; // isom/mp41/mp42/avc1/M4V و …
  }
  // فونت‌ها
  const s4 = asciiAt(bytes, 0, 4);
  if (s4 === "wOFF") return "woff";
  if (s4 === "wOF2") return "woff2";
  if (s4 === "OTTO") return "otf";
  if (s4 === "ttcf") return "ttc";
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x00
  )
    return "ttf";
  return null;
}

/** آیا ابتدای متن، SVG است؟ (SVG متنی است، نه باینری) */
function sniffSvgText(head: string): boolean {
  // SVG با <svg، <?xml، <!DOCTYPE یا کامنت شروع می‌شود — جست‌وجوی
  // «<svg» در ۴ کیلوبایت آغازین برای همه‌ی این حالات کافی است.
  return /<svg[\s>]/.test(head.slice(0, 4096).trim().toLowerCase());
}

/** تشخیص نوع محتوا از ابتدای فایل (باینری یا متنی) */
export function sniffFileKind(head: Uint8Array): SniffedKind {
  const binary = sniffBinary(head);
  if (binary) return binary;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      head.slice(0, 4096)
    );
    if (sniffSvgText(text)) return "svg";
  } catch {
    /* متن UTF-8 معتبر نبود — باینری ناشناخته */
  }
  return null;
}

/** انواعِ قابل‌قبول برای هر پسوند */
const EXT_ACCEPTS: Record<string, readonly SniffedKind[]> = {
  png: ["png"],
  jpg: ["jpeg"],
  jpeg: ["jpeg"],
  webp: ["webp"],
  gif: ["gif"],
  avif: ["avif"],
  bmp: ["bmp"],
  svg: ["svg"],
  pdf: ["pdf"],
  mp4: ["mp4"],
  m4v: ["mp4"],
  mov: ["quicktime", "mp4"],
  webm: ["matroska"],
  mkv: ["matroska"],
  ogv: ["ogg"],
  ogg: ["ogg"],
  woff: ["woff"],
  woff2: ["woff2"],
  ttf: ["ttf"],
  otf: ["otf"],
  ttc: ["ttc", "otf", "ttf"],
};

/**
 * آیا محتوای واقعی فایل با پسوند ادعایی هم‌خوانی دارد؟
 * برای پسوندهای فهرست‌نشده «true» برمی‌گردد (فراخوانی‌کننده خودش
 * پسوندها را از لیست مجاز خود گذشته است).
 */
export function contentMatchesExt(ext: string, head: Uint8Array): boolean {
  const accepts = EXT_ACCEPTS[ext.toLowerCase()];
  if (!accepts) return true;
  const kind = sniffFileKind(head);
  return kind !== null && accepts.includes(kind);
}
