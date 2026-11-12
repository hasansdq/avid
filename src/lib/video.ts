/**
 * تشخیص منبع پخش ویدئو از روی لینک —
 * پشتیبانی از: فایل محلی آپلودی، یوتیوب، آپارات، وی‌میو
 * و **لینک مستقیم فایل ویدئو** از هر منبع خارجی دیگر (MP4/WebM/…).
 *
 * در همه‌ی صفحات (بخش ویدئوهای صفحه اصلی و صفحه‌ی /videos) از همین
 * توابع استفاده می‌شود تا رفتار پخش یکسان بماند.
 */

/** انواع منبع پخش قابل تشخیص */
export type VideoSourceKind =
  | "none" // لینکی ثبت نشده — حالت «به‌زودی فعال می‌شود»
  | "local" // فایل آپلودی داخل پروژه (/uploads/...)
  | "direct" // لینک مستقیم فایل ویدئو (داخلی یا خارجی) → پخش با VideoPlayer
  | "youtube" // یوتیوب → iframe
  | "aparat" // آپارات → iframe
  | "vimeo"; // وی‌میو → iframe

export interface VideoSource {
  kind: VideoSourceKind;
  /** آدرس فایل برای VideoPlayer — فقط kind=local/direct */
  src?: string;
  /** آدرس iframe قابل جاسازی — فقط kind=youtube/aparat/vimeo */
  embedUrl?: string;
  /** لینک خارجی است؟ (برای دکمه‌ی «تماشا در منبع پخش») */
  external?: boolean;
}

/* ------------------------------------------------------------------ */
/*  یوتیوب                                                             */
/* ------------------------------------------------------------------ */

/** استخراج شناسه ویدئو یوتیوب از انواع لینک رایج */
export function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ?? null;
    }
    if (
      u.hostname === "youtube.com" ||
      u.hostname === "www.youtube.com" ||
      u.hostname === "m.youtube.com"
    ) {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        return v ? v : null;
      }
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  آپارات                                                             */
/* ------------------------------------------------------------------ */

/**
 * استخراج هش ویدئوی آپارات از لینک‌های رایج:
 *  • https://www.aparat.com/v/XXXXX
 *  • https://www.aparat.com/video/XXXXX
 *  • https://www.aparat.com/video/video/embed/videohash/XXXXX/vt/frame
 *  • ?videoHash=XXXXX
 */
export function getAparatHash(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "aparat.com" && host !== "m.aparat.com") return null;

    const segs = u.pathname.split("/").filter(Boolean);
    // فرم امبد: .../video/video/embed/videohash/HASH/...
    const vi = segs.indexOf("videohash");
    if (vi >= 0 && segs[vi + 1]) return segs[vi + 1];
    // فرم کوتاه: /v/HASH
    if (segs[0] === "v" && segs[1]) return segs[1];
    // فرم صفحه‌ی ویدئو: /video/HASH (نه /video/video/embed/…)
    if (segs[0] === "video" && segs[1] && segs[1] !== "video" && segs[1] !== "embed") {
      return segs[1];
    }
    // پارامتر کوئری
    const q = u.searchParams.get("videoHash");
    if (q) return q;
    return null;
  } catch {
    return null;
  }
}

/** ساخت آدرس iframe امبد آپارات از هش */
export function aparatEmbedUrl(hash: string): string {
  return `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame`;
}

/* ------------------------------------------------------------------ */
/*  وی‌میو                                                              */
/* ------------------------------------------------------------------ */

/** استخراج شناسه ویدئو وی‌میو (https://vimeo.com/123456 یا player.vimeo.com/video/…) */
export function getVimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
    const m = u.pathname.match(/(?:video\/)?(\d{6,12})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  لینک مستقیم فایل ویدئو                                              */
/* ------------------------------------------------------------------ */

/** پسوندهای فایل ویدئویی که مرورگرها پشتیبانی گسترده دارند */
const DIRECT_VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(?:[?#].*)?$/i;

/** آیا لینک فایل ویدئوی آپلودشده‌ی محلی است؟ */
export function isLocalVideo(url: string): boolean {
  return url.trim().startsWith("/");
}

/**
 * تشخیص منبع پخش یک لینک ویدئو —
 * ترتیب اولویت: محلی → یوتیوب → آپارات → وی‌میو → پسوند فایل → لینک خارجی مستقیم.
 * لینک‌های خارجی بدون پسوند هم به‌عنوان direct امتحان می‌شوند؛ در صورت عدم
 * پخش‌پذیری، VideoPlayer حالت خطا + «تلاش دوباره» را نشان می‌دهد.
 */
export function resolveVideoSource(rawUrl: string | null | undefined): VideoSource {
  const url = (rawUrl ?? "").trim();
  if (!url) return { kind: "none" };

  if (isLocalVideo(url)) return { kind: "local", src: url, external: false };

  const youtubeId = getYouTubeId(url);
  if (youtubeId) {
    return {
      kind: "youtube",
      embedUrl: `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`,
      external: true,
    };
  }

  const aparatHash = getAparatHash(url);
  if (aparatHash) {
    return { kind: "aparat", embedUrl: aparatEmbedUrl(aparatHash), external: true };
  }

  const vimeoId = getVimeoId(url);
  if (vimeoId) {
    return {
      kind: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeoId}?autoplay=1`,
      external: true,
    };
  }

  // لینک مستقیم: پسوند ویدئویی یا هر لینک http(s) خارجی دیگر
  if (/^https?:\/\//i.test(url)) {
    return { kind: "direct", src: url, external: true };
  }

  // مسیر نسبی بدون اسلش ابتدا — مثل فایل محلی رفتار می‌کنیم
  return { kind: "direct", src: url, external: false };
}

/** آیا لینک در پلیر اختصاصی آوید پخش می‌شود؟ (local یا direct) */
export function isNativePlayerSource(rawUrl: string | null | undefined): boolean {
  const kind = resolveVideoSource(rawUrl).kind;
  return kind === "local" || kind === "direct";
}
