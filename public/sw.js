/**
 * Service Worker وب‌اپلیکیشن «آوید» — نصب‌پذیری روی اندروید/iOS/ویندوز
 *
 * راهبرد ساده و ایمن:
 *  • ناوبری صفحات: network-first؛ در حالت آفلاین آخرین نسخه‌ی کش‌شده‌ی
 *    همان مسیر و در نبود آن، پوسته‌ی کش‌شده‌ی «/» سرو می‌شود.
 *  • دارایی‌های ایستا (/_next/static، /images، /fonts، /uploads،
 *    manifest): cache-first با پرکردنِ خودکار کش در اولین دیدار.
 *  • درخواست‌های API: همیشه فقط شبکه (هرگز پاسخ API کش نمی‌شود).
 *
 * نسخه‌بندی با SW_VERSION انجام می‌شود؛ تغییر مقدار = بازسازی کش‌ها.
 */

const SW_VERSION = "avid-pwa-v3";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const ASSET_CACHE = `${SW_VERSION}-assets`;

/* پوسته‌ی پایه — هنگام نصب پیش‌کش می‌شود */
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/images/icons/icon-192.png",
  "/images/icons/icon-512.png",
  "/images/icons/apple-touch-icon.png",
  "/images/logo.png",
];

/* ————— چرخه‌ی عمر ————— */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // پیش‌کشِ بهترین‌تلاش: شکستِ یک آیتم نصب را نمی‌شکند
      await Promise.allSettled(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" }))
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // حذف کش‌های نسخه‌های قدیمی
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(SW_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/* ————— راهبرد ارسال ————— */

/** آیا درخواستِ «دارایی ایستا» قابل کش است؟ */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/uploads/") ||
    url.pathname.startsWith("/Download/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|ttf|otf|css|js|mp4|webm)$/i.test(
      url.pathname
    )
  );
}

/** ناوبری صفحات — شبکه اول، جایگزین کش در آفلاین */
async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    // نسخه‌ی تازه پوسته را برای آفلاین بعدی نگه می‌داریم
    const cache = await caches.open(SHELL_CACHE);
    cache.put("/", fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const shell = await caches.match("/");
    if (shell) return shell;
    return new Response(
      "<!doctype html><html lang='fa' dir='rtl'><head><meta charset='utf-8'><title>آوید — آفلاین</title></head><body style='background:#050b09;color:#e6f5f1;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0'><div style='text-align:center'><h1 style='font-size:1.5rem'>آفلاین هستید</h1><p style='opacity:.7'>اتصال اینترنت برقرار نیست؛ پس از اتصال دوباره تلاش کنید.</p></div></body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

/** دارایی ایستا — «شبکه اول» با به‌روزرسانی کش + جایگزین کش در آفلاین.
 *  (cache-first در توسعه‌ی Turbopack نامناسب است: نشانی چانک‌ها پایدار
 *  ولی محتوایشان با هر تغییر بیلد تازه می‌شود — نسخه‌ی قدیمی سرو می‌شد.) */
async function handleAsset(request) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(ASSET_CACHE);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // فقط GET مدیریت می‌شود

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // خارج از دامنه: بدون مداخله

  // ناوبری صفحه (سند HTML)
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // دارایی ایستا
  if (isCacheableAsset(url)) {
    event.respondWith(handleAsset(request));
    return;
  }

  // هر چیز دیگر (API و…) — فقط شبکه؛ SW مداخله نمی‌کند
});
