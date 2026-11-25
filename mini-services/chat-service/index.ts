/**
 * سرویس رله‌ی بلادرنگ چت آوید — با احراز هویت اتصال و عضویت اتاق‌ها.
 *
 * ذخیره‌سازی پیام‌ها مسئولیت API اصلی Next.js است (منبع حقیقت: دیتابیس)؛
 * این سرویس فقط رویدادها را رله می‌کند — و عضویت در اتاق‌ها را احراز می‌کند:
 *
 *  • اتاق «admin»        → فقط مدیر با نشست معتبر (کوکی avid_admin ← AdminSession)
 *  • اتاق «conv:{id}»     → مدیر معتبر، یا بازدیدکننده‌ی مالک همان گفتگو
 *    (کوکی avid_chat_vid ← ChatConversation.visitorToken)؛ چون کوکی بازدیدکننده
 *    ممکن است بعد از برقراری اتصال socket ست شود، API اصلی برای هر گفتگو
 *    «تیکت امضاشده» (HMAC با CHAT_AUTH_SECRET) صادر می‌کند که در رویداد
 *    visitor:subscribe ارسال و اینجا تایید می‌شود.
 *
 * رویدادهای رله‌شده فقط از سوکت‌هایی پذیرفته می‌شوند که به همان گفتگو
 * دسترسی مجاز دارند (عضویت قبلی، مالکیت کوکی، یا مدیر).
 *
 * اتاق‌ها:
 *   conv:{conversationId} — شرکت‌کنندگان یک گفتگو (بازدیدکننده + مدیر باز)
 *   admin                 — همه‌ی مدیران متصل (برای نوتیف و به‌روزرسانی لیست)
 *
 * رویدادها (ورودی از کلاینت):
 *   visitor:subscribe {conversationId, ticket?}
 *   admin:subscribe
 *   admin:open {conversationId} / admin:leave {conversationId}
 *   activity {conversationId, kind} — kind: visitor-message | admin-message | read
 *   typing {conversationId, who}    — who: visitor | admin
 *
 * رویدادهای خروجی (رله‌شده به گیرندگان مجاز):
 *   activity {conversationId, kind}
 *   typing {conversationId, who}
 */
import { createServer, type IncomingMessage } from "http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { Server, type Socket } from "socket.io";

/* ------------------------------------------------------------------ */
/*  دیتابیس (فقط خواندنی — برای اعتبارسنجی نشست مدیر و مالکیت گفتگو)   */
/* ------------------------------------------------------------------ */

function resolveDbPath(): string | null {
  const env = process.env.DATABASE_URL?.trim();
  if (env) {
    const p = env.replace(/^file:/i, "").trim();
    if (p) return p.startsWith("/") ? p : join(process.cwd(), p);
  }
  // محیط توسعه: کنار سرویس (mini-services/chat-service/../../db/custom.db)
  const near = join(import.meta.dir, "..", "..", "db", "custom.db");
  if (existsSync(near)) return near;
  const cwd = join(process.cwd(), "db", "custom.db");
  if (existsSync(cwd)) return cwd;
  return null;
}

const DB_PATH = resolveDbPath();
let authDb: Database | null = null;
let dbWarned = false;

function getAuthDb(): Database | null {
  if (authDb) return authDb;
  if (!DB_PATH || !existsSync(DB_PATH)) {
    if (!dbWarned) {
      console.warn(
        `[chat-service] دیتابیس در دسترس نیست (${DB_PATH ?? "مسیر نامشخص"}) — همه‌ی عضویت‌ها رد می‌شوند`
      );
      dbWarned = true;
    }
    return null;
  }
  try {
    authDb = new Database(DB_PATH, { readonly: true });
    // در حین نوشتن اپ اصلی، چند میلی‌ثانیه صبر کن تا قفل رد نشود
    authDb.exec("PRAGMA busy_timeout = 4000");
    return authDb;
  } catch (error) {
    if (!dbWarned) {
      console.warn("[chat-service] خطا در باز کردن دیتابیس:", error);
      dbWarned = true;
    }
    return null;
  }
}

/** اجرای یک کوئری فقط‌خواندنی؛ در صورت خرابی اتصال یک بار با اتصال نو تلاش می‌شود */
function runQuery(sql: string, ...params: (string | number)[]): unknown[] | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    const db = getAuthDb();
    if (!db) return null;
    try {
      return db.query(sql).all(...params) as unknown[];
    } catch {
      try {
        db.close();
      } catch {
        /* بسته شده است */
      }
      authDb = null; // تلاش دوباره با اتصال تازه
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  احراز هویت                                                          */
/* ------------------------------------------------------------------ */

/** نام کوکی‌ها — همان نام‌های اپ Next.js */
const ADMIN_COOKIE = "avid_admin";
const VISITOR_COOKIE = "avid_chat_vid";

/** استخراج کوکی‌ها از هدر handshake */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

/** آیا این توکن، نشست مدیر معتبر و منقضی‌نشده است؟ */
function isValidAdminSession(token: string | undefined): boolean {
  if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) return false;
  const rows = runQuery(
    "SELECT expiresAt FROM AdminSession WHERE token = ? LIMIT 1",
    token
  );
  const row = rows?.[0] as { expiresAt?: number | string } | undefined;
  if (row?.expiresAt === undefined || row.expiresAt === null) return false;
  // Prisma در SQLite تاریخ‌ها را به‌صورت میلی‌ثانیه عددی ذخیره می‌کند
  const exp = new Date(row.expiresAt as number | string).getTime();
  return Number.isFinite(exp) && exp > Date.now();
}

/** آیا این توکن بازدیدکننده، صاحب این گفتگو است؟ */
function visitorOwnsConversation(
  visitorToken: string | null | undefined,
  conversationId: string
): boolean {
  if (!visitorToken || !/^[a-f0-9]{16,128}$/i.test(visitorToken)) return false;
  const rows = runQuery(
    "SELECT id FROM ChatConversation WHERE id = ? AND visitorToken = ? LIMIT 1",
    conversationId,
    visitorToken
  );
  return Array.isArray(rows) && rows.length > 0;
}

/* ------------------------------------------------------------------ */
/*  تیکت HMAC بازدیدکنده (صادره از API اصلی با CHAT_AUTH_SECRET)        */
/* ------------------------------------------------------------------ */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** در توسعه: خواندن CHAT_AUTH_SECRET از .env ریشه‌ی پروژه (دو سطح بالاتر) */
function readRootEnvSecret(): string {
  try {
    const p = join(import.meta.dir, "..", "..", ".env");
    if (!existsSync(p)) return "";
    const text = readFileSync(p, "utf8");
    const m = text.match(/^CHAT_AUTH_SECRET\s*=\s*(.*)\s*$/m);
    return (m?.[1] ?? "").trim();
  } catch {
    return "";
  }
}

const CHAT_AUTH_SECRET = (() => {
  const fromEnv = process.env.CHAT_AUTH_SECRET?.trim() ?? "";
  if (fromEnv) return fromEnv;
  if (!IS_PRODUCTION) return readRootEnvSecret();
  return "";
})();

if (IS_PRODUCTION && !CHAT_AUTH_SECRET) {
  console.error(
    "[chat-service] CHAT_AUTH_SECRET is required in production — refusing to start. Set it in .env next to compose.yaml (openssl rand -hex 32)."
  );
  process.exit(1);
}
if (!CHAT_AUTH_SECRET) {
  console.warn(
    "[chat-service] CHAT_AUTH_SECRET is not set (dev) — ticket verification is disabled; cookie-based membership still works."
  );
}

/**
 * تایید تیکت عضویت: base64url(payload).hmac — payload: v1|conversationId|visitorToken|expMs
 * تیکت فقط برای همان گفتگو و تا پایان اعتبار معتبر است.
 */
function verifyVisitorTicket(
  ticket: unknown,
  conversationId: string
): boolean {
  if (typeof ticket !== "string" || ticket.length < 8 || ticket.length > 1024)
    return false;
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return false;
  const b64 = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  if (!/^[a-f0-9]{64}$/.test(sig)) return false;

  let payload: string;
  try {
    payload = Buffer.from(b64, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const parts = payload.split("|");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const [, convId, , expStr] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (convId !== conversationId) return false;

  const expected = createHmac("sha256", CHAT_AUTH_SECRET)
    .update(payload)
    .digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/*  مبداهای مجاز اتصال (بند ۷)                                          */
/* ------------------------------------------------------------------ */

/**
 * اتصال فقط از مبداهای مجاز پذیرفته می‌شود:
 *  • SITE_URL / ALLOWED_ORIGINS (مبدای رسمی سایت در استقرار)
 *  • هم‌مبدأ با Host درخواست — یعنی اتصال هم‌مبدأ مرورگر به سایت خودش
 *    (پشت nginx/gateway که Host را حفظ می‌کند)
 *  • در محیط توسعه: localhost/127.0.0.1
 *  • بدون هدر Origin (پروکسی فالبک داخلی، کلاینت غیرمرورگری) مجاز می‌ماند.
 * مبدأ متفرقه (سایت مهاجم) در همان handshake رد می‌شود.
 */
const ALLOWED_ORIGIN_LIST = (() => {
  const out: string[] = [];
  for (const key of ["SITE_URL", "ALLOWED_ORIGINS"]) {
    const raw = process.env[key]?.trim() ?? "";
    for (const piece of raw.split(",")) {
      const t = piece.trim();
      if (!t) continue;
      try {
        out.push(new URL(t).origin);
      } catch {
        /* نامعتبر — نادیده */
      }
    }
  }
  return out;
})();

function normalizeOriginValue(value: string): string {
  try {
    const u = new URL(value);
    const host = `${u.hostname.toLowerCase()}${u.port ? ":" + u.port : ""}`;
    return `${u.protocol.toLowerCase()}//${host.replace(/:443$/, "").replace(/:80$/, "")}`;
  } catch {
    return value;
  }
}

function sameHostOrigin(origin: string, hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  try {
    const o = new URL(origin);
    const originHost = `${o.hostname.toLowerCase()}${o.port ? ":" + o.port : ""}`;
    const requestHost = hostHeader.toLowerCase();
    return (
      originHost.replace(/:443$/, "").replace(/:80$/, "") ===
      requestHost.replace(/:443$/, "").replace(/:80$/, "")
    );
  } catch {
    return false;
  }
}

function isDevLocalOrigin(origin: string): boolean {
  if (IS_PRODUCTION) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/** مبدأ اتصال مجاز است؟ (Origin غایب = مجاز — پروکسی فالبک/کلاینت غیرمرورگری) */
function connectionOriginAllowed(
  originHeader: string | undefined,
  hostHeader: string | undefined
): boolean {
  if (!originHeader) return true;
  if (originHeader === "null") return false;
  const normalized = normalizeOriginValue(originHeader);
  if (ALLOWED_ORIGIN_LIST.some((a) => normalizeOriginValue(a) === normalized)) {
    return true;
  }
  if (sameHostOrigin(originHeader, hostHeader)) return true;
  if (isDevLocalOrigin(originHeader)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  محدودیت نرخ رویدادها بر حسب نوع (بند ۷)                            */
/* ------------------------------------------------------------------ */

/**
 * نرخ‌ها متناسب با نوع رویدادند: سیگنال‌های سبک (typing/activity) شل،
 * عضویت‌ها باز — سوکت نرمال هیچ‌گاه به سقف نمی‌رسد؛ سوکت هرزنَواز
 * بی‌صدا خاموش می‌شود.
 */
const EVENT_RATES: Record<string, { max: number; windowMs: number }> = {
  "visitor:subscribe": { max: 30, windowMs: 60_000 },
  "admin:subscribe": { max: 30, windowMs: 60_000 },
  "admin:open": { max: 60, windowMs: 60_000 },
  "admin:leave": { max: 60, windowMs: 60_000 },
  activity: { max: 60, windowMs: 60_000 },
  typing: { max: 24, windowMs: 30_000 },
};

const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function allowEvent(socketId: string, ev: string): boolean {
  const policy = EVENT_RATES[ev];
  if (!policy) return true;
  const key = `${socketId}|${ev}`;
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= policy.windowMs) {
    bucket = { count: 0, windowStart: now };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= policy.max;
}

function cleanupRateBuckets(socketId: string): void {
  const prefix = `${socketId}|`;
  for (const key of rateBuckets.keys()) {
    if (key.startsWith(prefix)) rateBuckets.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/*  تازگی نشست مدیر روی اتصال باز (بند ۷)                               */
/* ------------------------------------------------------------------ */

/**
 * نشست مدیر فقط در handshake چک نمی‌شود — در «هر رویداد» با حافظه‌ی
 * ۳۰ثانیه‌ای دوباره از دیتابیس خوانده می‌شود؛ نشست باطل/منقضی‌شده
 * (تغییر رمز، خروج، revoke) اتصال باز را همان لحظه می‌بندد.
 */
const adminFreshness = new Map<string, { ok: boolean; until: number }>();

function ensureAdminFresh(socket: Socket): boolean {
  const auth = socket.data.auth as SocketAuth;
  const token = auth.adminToken;
  if (!token) return false;
  const now = Date.now();
  const cached = adminFreshness.get(token);
  if (cached && cached.ok && now < cached.until) return true;
  const ok = isValidAdminSession(token);
  if (ok) {
    adminFreshness.set(token, { ok: true, until: now + 30_000 });
    return true;
  }
  adminFreshness.delete(token);
  auth.admin = false; // نشست باطل — همه‌ی قدرت‌های سوکت بلافاصله قطع
  socket.disconnect(true);
  return false;
}

/* ------------------------------------------------------------------ */
/*  سرور                                                                */
/* ------------------------------------------------------------------ */

const httpServer = createServer();
const io = new Server(httpServer, {
  // مسیر عمداً «/» است: engine.io با path «/» هر مسیری را می‌پذیرد؛ در نتیجه
  // هم روتینگ گیت‌وی سندباکس (query XTransformPort) و هم پروکسی استقرار
  // (Apache/nginx روی /socket.io/) هر دو به این سرویس می‌رسند.
  path: "/",
  cors: {
    // فقط مبداهای مجاز بازتاب داده می‌شوند (بند ۷)؛ هم‌مبدأ CORS لازم ندارد
    origin: (origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) => {
      if (!origin) return callback(null, true);
      const normalized = origin === "null" ? origin : normalizeOriginValue(origin);
      const ok =
        origin !== "null" &&
        (ALLOWED_ORIGIN_LIST.some((a) => normalizeOriginValue(a) === normalized) ||
          isDevLocalOrigin(origin));
      callback(null, ok);
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  allowRequest: (
    req: IncomingMessage,
    callback: (err: string | null | undefined, success: boolean) => void
  ) => {
    // گره‌ی مبدأ در سطح HTTP (بند ۷): درخواست با مبدأ نامجاز پیش از
    // ساخت نشست engine.io با ۴۰۳ رد می‌شود — مکملِ گره‌ی io.use که
    // اتصال namespace را می‌بندد. مبدأ غایب (کلاینت غیرمرورگری/GET
    // هم‌مبدأ) مجاز می‌ماند.
    const origin = req.headers.origin;
    const host = req.headers.host;
    callback(
      null,
      connectionOriginAllowed(
        typeof origin === "string" ? origin : undefined,
        typeof host === "string" ? host : undefined
      )
    );
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

interface ActivityPayload {
  conversationId: string;
  kind: "visitor-message" | "admin-message" | "read";
}

interface TypingPayload {
  conversationId: string;
  who: "visitor" | "admin";
}

/** نتیجه احراز هویت اتصال (از کوکی‌های handshake) */
interface SocketAuth {
  admin: boolean;
  adminToken: string | null; // برای تازگیِ نشست در هر رویداد
  visitorToken: string | null;
}

io.use((socket, next) => {
  // — گره‌ی مبدأ (بند ۷): سایت متفرقه در همان handshake رد می‌شود —
  const origin = socket.request.headers.origin;
  if (
    !connectionOriginAllowed(
      typeof origin === "string" ? origin : undefined,
      socket.request.headers.host
    )
  ) {
    return next(new Error("origin-not-allowed"));
  }
  const cookies = parseCookies(socket.request.headers.cookie);
  const adminToken = cookies[ADMIN_COOKIE] ?? null;
  socket.data.auth = {
    admin: isValidAdminSession(adminToken),
    adminToken,
    visitorToken: cookies[VISITOR_COOKIE] ?? null,
  } satisfies SocketAuth;
  next();
});

io.on("connection", (socket) => {
  const auth = socket.data.auth as SocketAuth;
  // گفتگوهایی که این سوکت برایشان عضویت موفق گرفته است
  const authorizedConversations = new Set<string>();

  socket.on("disconnect", () => {
    cleanupRateBuckets(socket.id);
  });

  /** دسترسی مجاز این سوکت به یک گفتگو؟ (مدیرِ تازه / عضویت / مالکیت کوکی) */
  const canTouchConversation = (conversationId: string): boolean =>
    ensureAdminFresh(socket) ||
    authorizedConversations.has(conversationId) ||
    visitorOwnsConversation(auth.visitorToken, conversationId);

  // — بازدیدکننده سایت —
  socket.on(
    "visitor:subscribe",
    (data: { conversationId?: string; ticket?: string }) => {
      if (!allowEvent(socket.id, "visitor:subscribe")) return;
      const conversationId = data?.conversationId;
      if (!validId(conversationId)) return;
      // مالکیت: کوکی handshake یا تیکت امضاشده‌ی همین گفتگو
      const viaCookie = visitorOwnsConversation(
        auth.visitorToken,
        conversationId
      );
      const viaTicket = verifyVisitorTicket(data?.ticket, conversationId);
      if (!viaCookie && !viaTicket) {
        console.warn(
          `[chat-service] عضویت غیرمجاز رد شد (conv:${conversationId.slice(0, 12)}…)`
        );
        return;
      }
      authorizedConversations.add(conversationId);
      socket.join(`conv:${conversationId}`);
    }
  );

  // — پنل مدیریت —
  socket.on("admin:subscribe", () => {
    if (!allowEvent(socket.id, "admin:subscribe")) return;
    if (ensureAdminFresh(socket)) socket.join("admin");
  });

  socket.on("admin:open", (data: { conversationId?: string }) => {
    if (!allowEvent(socket.id, "admin:open")) return;
    if (ensureAdminFresh(socket) && validId(data?.conversationId)) {
      socket.join(`conv:${data.conversationId}`);
    }
  });

  socket.on("admin:leave", (data: { conversationId?: string }) => {
    if (!allowEvent(socket.id, "admin:leave")) return;
    if (ensureAdminFresh(socket) && validId(data?.conversationId)) {
      socket.leave(`conv:${data.conversationId}`);
    }
  });

  // — سیگنال فعالیت (بعد از ذخیره‌ی موفق پیام از سمت API فراخوانی می‌شود) —
  socket.on("activity", (data: ActivityPayload) => {
    if (!allowEvent(socket.id, "activity")) return;
    if (!validId(data?.conversationId) || !data?.kind) return;
    if (!canTouchConversation(data.conversationId)) return;
    // به اعضای همان گفتگو (بدون فرستنده)
    socket.to(`conv:${data.conversationId}`).emit("activity", data);
    // به مدیران (بدون فرستنده) — برای به‌روزرسانی لیست/نوتیف
    socket.to("admin").emit("activity", data);
  });

  // — نشانگر تایپ —
  socket.on("typing", (data: TypingPayload) => {
    if (!allowEvent(socket.id, "typing")) return;
    if (!validId(data?.conversationId) || !data?.who) return;
    if (!canTouchConversation(data.conversationId)) return;
    socket.to(`conv:${data.conversationId}`).emit("typing", data);
    socket.to("admin").emit("typing", data);
  });

  socket.on("error", (error: unknown) => {
    console.error(`[chat-service] socket error (${socket.id}):`, error);
  });
});

const PORT = Number(process.env.CHAT_PORT) || 3004;
httpServer.listen(PORT, () => {
  console.log(`[chat-service] socket.io relay (authenticated) on port ${PORT}`);
  console.log(`[chat-service] db: ${DB_PATH ?? "غیرقابل دسترس (رد عضویت‌ها)"}`);
});

// ناظر وبِ سندباکس: سرور توسعه‌ی Next (پورت 3000) را زنده نگه می‌دارد —
// فقط در محیط توسعه (غیر production) و «بارگذاری پوی» بارگذاری می‌شود:
// فایل web-dev-supervisor.ts عمداً در ایمیج Docker کپی نمی‌شود و نبودِ آن
// در production خطا نیست (پیش از این import ایستا باعث کرشِ کانتینر چت
// می‌شد — فایل در ایمیج نبود). با بارگذاری پوی، production هرگز به دنبال
// آن نمی‌رود و توسعه (bun --hot) همچنان از آن استفاده می‌کند.
if (process.env.NODE_ENV !== "production") {
  try {
    const { startWebDevSupervisor } = await import("./web-dev-supervisor");
    // در سطح ماژول (نه داخل callback شنیدن) فراخوانی می‌شود تا با
    // بارگذاری مجدد (bun --hot) همیشه نسخه‌ی تازه‌ی ناظر فعال شود.
    startWebDevSupervisor();
  } catch {
    // نبودِ فایل ناظر در این محیط — سرویس چت بدون آن سالم بالا می‌آید
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[chat-service] SIGTERM received, shutting down...");
  httpServer.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[chat-service] SIGINT received, shutting down...");
  httpServer.close(() => process.exit(0));
});
// reload-probe 1794511442
