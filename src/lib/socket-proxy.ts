import type { NextRequest } from "next/server";
import { allowedOriginsFor, normalizeOrigin } from "@/lib/http";

/**
 * پروکسی fallback سوکت‌ها در اپ Next.js
 * ---------------------------------------------------------------
 *
 * مسیرهای `/stream-socket/` و `/socket.io/` در استقرار استاندارد باید توسط
 * پروکسی معکوس وب‌سرور (Apache/nginx — deploy/) مستقیم به سرویس‌های
 * socket.io (پورت ۳۰۰۵/۳۰۰۴) برده شوند. اگر آن location blockها در
 * وب‌سرور تنظیم نشده باشند، درخواست‌ها به خود اپ Next.js می‌رسند و بدون
 * این پروکسی با ۴۰۴ رد می‌شوند — صفحه‌ی کلاس آنلاین برای همیشه در
 * «اتصال...» می‌ماند.
 *
 * این ماژول یک پروکسی HTTP (پاس‌دار) برای همان مسیرها می‌سازد تا حتی در
 * نبودِ location block وب‌سرور، اتصال با «polling» برقرار بماند:
 *  • handshake و long-poll و POST پیام‌ها عیناً به سرویس پاس داده می‌شوند؛
 *  • کوکی‌های نشست (avid_admin/avid_user) هدایت می‌شوند تا احراز هویت اتاق
 *    در سرویس کار کند؛
 *  • هدر Origin و Host اصلی هم هدایت می‌شوند تا «گره‌ی مبدأ» خود سرویس
 *    سوکت (بند ۷) از مسیر این پروکسی دور زده نشود؛
 *  • ارتقای WebSocket در Route Handler ممکن نیست — پروب upgrade شکست
 *    می‌خورد و اتصال روی polling می‌ماند (کاملاً کارا؛ سیگنالینگ WebRTC
 *    پیام‌های کوچک JSON است).
 *  • query «XTransformPort» گیت‌وی سندباکس هم پذیرفته می‌شود: درخواست
 *    /socket.io/?XTransformPort=3005 به سرویس استریم می‌رود (نه چت) تا
 *    دسترسی مستقیم به اپ بدون گیت‌وی هم درست کار کند.
 *
 * گره‌ی مبدأ (بند ۷) در خودِ این پروکسی هم اعمال می‌شود: درخواست مبدأدارِ
 * (مرورگر) فقط از مبداهای مجاز پاس داده می‌شود — SITE_URL / ALLOWED_ORIGINS /
 * هم‌مبدأ با Host همین درخواست / توسعه‌ی محلی. مبدأ «null» و سایت متفرقه
 * پیش از رسیدن به سرویس با ۴۰۳ رد می‌شود؛ درخواست بدون Origin (کلاینت
 * غیرمرورگری/GET هم‌مبدأ) مجاز می‌ماند تا اتصال عادی چت/سیگنالینگ نشکند.
 *
 * نشانی سرویس به این ترتیب پیدا می‌شود:
 *  ۱) متغیر محیطی صریح (مثلاً STREAM_INTERNAL_URL=http://stream:3005)
 *  ۲) نام سرویس docker compose (شبکه‌ی داخلی compose: http://stream:3005)
 *  ۳) 127.0.0.1 همان میزبان (استقرار بدون docker)
 * اولین نشانی پاس‌گو کش می‌شود و در خطای بعدی دوباره جست‌وجو می‌شود.
 */

interface ProxyOptions {
  /** پیشوند مسیر عمومی که این route آن را سرو می‌کند (مثل «/stream-socket») */
  routePrefix: string;
  /** متغیر محیطی نشانی داخلی سرویس (اختیاری) */
  envUrl?: string | undefined;
  /** نام سرویس docker compose (مثل «stream») */
  dockerService: string;
  /** پورت سرویس */
  port: number;
}

interface ResolvedTarget {
  base: string;
}

/** نقشه‌ی پورت → سرویس compose (برای پذیرش XTransformPort درخواست‌های گیت‌وی) */
const SERVICE_BY_PORT: Record<number, string> = {
  3004: "chat",
  3005: "stream",
};

/** نشانی‌های نامزد برای یک پورت مشخص (env فقط برای پورت خود route) */
function basesForPort(opts: ProxyOptions, port: number): string[] {
  const list: string[] = [];
  if (port === opts.port && opts.envUrl) {
    list.push(opts.envUrl.replace(/\/$/, ""));
  }
  const svc = port === opts.port ? opts.dockerService : SERVICE_BY_PORT[port];
  if (svc) list.push(`http://${svc}:${port}`);
  list.push(`http://127.0.0.1:${port}`);
  return Array.from(new Set(list));
}

/**
 * پروب سلامت: پاسخ HTTP از هر کدی (< ۵۰۰) یعنی سرویس در دسترس است.
 * engine.io بدون پارامتر transport با ۴۰۰ «Transport unknown» جواب می‌دهد
 * — بدون ساخت نشست؛ همین برای تشخیص دسترسی کافی است.
 */
async function probeBase(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/?EIO=4`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
      redirect: "manual",
    });
    // ۴۰۰ = engine.io زنده؛ ۲۰۰ = دسترسی OK. خطاهای ۵xx/۴۰۴ = ناسالم.
    return res.status < 500 && res.status !== 404;
  } catch {
    return false;
  }
}

function createSocketIoProxy(opts: ProxyOptions) {
  const targetCache = new Map<number, ResolvedTarget>();

  async function resolveTarget(
    port: number
  ): Promise<ResolvedTarget | null> {
    const cached = targetCache.get(port);
    if (cached) return cached;
    for (const base of basesForPort(opts, port)) {
      if (await probeBase(base)) {
        const found = { base };
        targetCache.set(port, found);
        return found;
      }
    }
    return null;
  }

  const unreachable = (msg: string) =>
    new Response(
      JSON.stringify({ code: "SOCKET_SERVICE_UNREACHABLE", message: msg }),
      {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );

  const forbidden = () =>
    new Response(
      JSON.stringify({
        code: "ORIGIN_NOT_ALLOWED",
        message: "درخواست از مبدأ غیرمجاز پذیرفته نمی‌شود.",
      }),
      {
        status: 403,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      }
    );

  /** آیا مبدأ این درخواست در فهرست مجازِ همین درخواست است؟ */
  function originAllowed(req: NextRequest, origin: string): boolean {
    if (origin === "null") return false;
    const normalized = normalizeOrigin(origin);
    return allowedOriginsFor(req).some((a) => a === normalized);
  }

  async function proxyRequest(req: NextRequest): Promise<Response> {
    const incoming = new URL(req.url);

    // — گره‌ی مبدأ (بند ۷): درخواست مبدأدارِ نامجاز پیش از ارسال رد می‌شود —
    const origin = req.headers.get("origin");
    if (origin && !originAllowed(req, origin)) {
      return forbidden();
    }

    // پذیرش query گیت‌وی: XTransformPort پورت مقصد را تعیین می‌کند
    const xPort = Number(incoming.searchParams.get("XTransformPort"));
    const port = SERVICE_BY_PORT[xPort] ? xPort : opts.port;

    const target = await resolveTarget(port);
    if (!target) {
      return unreachable(
        "سرویس سوکت در دسترس نیست — اپ docker compose و سلامت کانتینرها را بررسی کنید."
      );
    }

    const targetUrl = `${target.base}${incoming.pathname}${incoming.search}`;

    // هدرهای هدایت‌شده: کوکی نشست برای احراز هویت + content-type پیام‌های
    // POST + Origin و Host اصلی — سرویس سوکت خودش هم مبدأ اتصال را می‌سنجد
    // (بند ۷)؛ بدون هدایت این دو، گره‌ی مبدأ سرویس از مسیرِ همین پروکسی
    // دور می‌زد و فقط اتصال مستقیم پشت وب‌سرور بررسی می‌شد.
    const headers: Record<string, string> = {};
    const cookie = req.headers.get("cookie");
    if (cookie) headers.cookie = cookie;
    const contentType = req.headers.get("content-type");
    if (contentType) headers["content-type"] = contentType;
    if (origin) headers.origin = origin;
    const host = req.headers.get("host");
    if (host) headers.host = host;
    const xff = req.headers.get("x-forwarded-for");
    if (xff) headers["x-forwarded-for"] = xff;

    let body: ArrayBuffer | undefined;
    if (req.method === "POST" || req.method === "PUT") {
      body = await req.arrayBuffer();
    }

    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        cache: "no-store",
        redirect: "manual",
      });

      // اگر سرویس در میانه‌ی کار از دسترس خارج شد، کش را باطل کن
      if (upstream.status >= 500) {
        targetCache.delete(port);
      }

      const outHeaders = new Headers();
      const ct = upstream.headers.get("content-type");
      if (ct) outHeaders.set("content-type", ct);
      outHeaders.set("cache-control", "no-store");
      outHeaders.set("x-avid-socket-proxy", opts.routePrefix);

      return new Response(upstream.body, {
        status: upstream.status,
        headers: outHeaders,
      });
    } catch {
      // شبکه به سرویس قطع شد — برای درخواست بعدی دوباره جست‌وجو کن
      targetCache.delete(port);
      return unreachable("ارتباط با سرویس سوکت قطع شد؛ کمی بعد دوباره تلاش می‌شود.");
    }
  }

  return {
    GET: (req: NextRequest) => proxyRequest(req),
    POST: (req: NextRequest) => proxyRequest(req),
  };
}

export { createSocketIoProxy };
