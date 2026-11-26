/**
 * سرویس کلاس آنلاین (استریم) آوید — سیگنالینگ WebRTC + اتاق چت + حضور.
 *
 * این سرویس فقط «رله‌ی بلادرنگ» است؛ منبع حقیقت داده‌ها (استریم، دعوت‌ها،
 * حضور، وضعیت) دیتابیس است که اپ Next.js آن را می‌نویسد. سرویس برای احراز
 * هویت اتصال‌ها و بررسی دعوت، دیتابیس را فقط‌خواندنی باز می‌کند (مانند
 * سرویس چت). تنها استثنا: جاروی «بستن خودکار کلاس‌های بیکار» (پایان همین
 * فایل) که جلساتِ بی‌فعالیت را با یک UPDATE کوتاه در همان دیتابیس می‌بندد:
 *
 *  • مدیر (کوکی avid_admin ← AdminSession)         → نقش «host»
 *  • کاربر (کوکی avid_user ← UserSession)           → نقش «student»
 *      — استثنا: استادِ مالک جلسه (LiveStream.hostId = او) → نقش «host»
 *
 * ورود دانشجو فقط با «دعوت فعال» پذیرفته می‌شود:
 *  • جلسه‌ی با لینک دعوت یکتا (جلسه‌ی استاد یا جلسه‌ی «لینک-تنها» مدیر) →
 *    هر کاربر واردشده‌ی دارنده‌ی لینک می‌تواند وارد شود.
 *  • جلسه‌ی مدیر بدون لینک (hostId = null و inviteSlug = null)  → ثبت‌نام
 *    دوره‌ی دعوت‌شده یا عضویت کلاس دعوت‌شده؛ کاربرِ اخراج‌شده
 *    (StreamParticipant.kicked) تا وقتی کلاس زنده است رد می‌شود.
 *
 * بستن خودکار بیکاری: اگر بیش از ۲۰ دقیقه هیچ فعالیتی (ورود/خروج/چت/
 * سیگنالینگ/عضو متصل) نباشد، جلسه در دیتابیس «ended» می‌شود تا باکس دعوت
 * هم از پنل کاربران حذف شود (جاروی دوره‌ای هر ۶۰ ثانیه).
 *
 * توپولوژی رسانه: مش (mesh) — ناشران = استاد (پیش‌فرض: فقط صدا و تصویر او)
 * و دانشجوهایی که اجازه گرفته و «publish» کرده‌اند. هر بیننده به هر ناشر یک
 * اتصال WebRTC مستقل می‌سازد و کیفیت خودش را («full» | «low» | «audio») در
 * «subscribe-request» اعلام می‌کند — ناشر همان لحظه م-lineهای متناسب را در
 * offer می‌گذارد و سقف بیت‌ریت همان اتصال را تنظیم می‌کند (بهینه برای اینترنت
 * ضعیف). «audio» یعنی فقط صدا (~۴۸kbps).
 *
 * رویدادهای ورودی (کلاینت → سرور):
 *   join {streamId} (+ack)              — ورود به اتاق استریم
 *   leave {streamId}                     — خروج خودخواسته
 *   chat {streamId, text}               — پیام چت (تا ۵۰۰ نویسه)
 *   signal {streamId, to, kind, payload}— رله‌ی سیگنالینگ offer/answer/ice
 *   subscribe-request {streamId, publisherId, quality}
 *   publish {streamId, active}           — دانشجوی اجازه‌گرفته/استاد: شروع/توقف پخش
 *   media:request {streamId}            — درخواست دانشجو برای روشن‌کردن دوربین/میکروفون
 *   media:response {streamId, userId, grant} — پاسخ استاد به درخواست
 *   media:revoke {streamId, userId}     — بازپس‌گیری اجازه‌ی دانشجو توسط استاد
 *   kick {streamId, userId}             — اخراج کاربر (فقط استاد)
 *   host:live {streamId}                — استاد پخش خود را شروع کرد
 *   host:ended {streamId}               — استاد جلسه را پایان داد
 *
 * رویدادهای خروجی (سرور → کلاینت):
 *   user-joined / user-left {userId, name, kicked}
 *   chat {userId, name, role, text, ts}
 *   signal {from, fromName, kind, payload}
 *   subscribe-request {viewerId, viewerName, viewerSocketId, quality}
 *   publisher-changed {publisherId, userId, name, active}
 *   media:request {userId, name}        (فقط استاد)
 *   media:granted / media:denied        (فقط خود درخواست‌کننده)
 *   media:revoked                       (فقط دانشجوی اجازه‌گرفته)
 *   stream:live {hostName} / stream:ended / host:offline
 *   kicked                             (فقط سوکت‌های کاربر اخراج‌شده)
 */
import { createServer, type IncomingMessage } from "http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { Server, type Socket } from "socket.io";

/* ------------------------------------------------------------------ */
/*  دیتابیس (فقط خواندنی — احراز هویت و بررسی دعوت)                     */
/* ------------------------------------------------------------------ */

function resolveDbPath(): string | null {
  const env = process.env.DATABASE_URL?.trim();
  if (env) {
    const p = env.replace(/^file:/i, "").trim();
    if (p) return p.startsWith("/") ? p : join(process.cwd(), p);
  }
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
        `[stream-service] دیتابیس در دسترس نیست (${DB_PATH ?? "مسیر نامشخص"}) — ورودها رد می‌شوند`
      );
      dbWarned = true;
    }
    return null;
  }
  try {
    authDb = new Database(DB_PATH, { readonly: true });
    authDb.exec("PRAGMA busy_timeout = 4000");
    return authDb;
  } catch (error) {
    if (!dbWarned) {
      console.warn("[stream-service] خطا در باز کردن دیتابیس:", error);
      dbWarned = true;
    }
    return null;
  }
}

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
      authDb = null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  احراز هویت اتصال (از کوکی‌های handshake)                            */
/* ------------------------------------------------------------------ */

const ADMIN_COOKIE = "avid_admin";
const USER_COOKIE = "avid_user";

/**
 * هویتِ اتصال — «ثابت» و مستقل از جلسه‌ی خاص (نقش میزبان در «اتصال» نیست؛
 * در هر join/رویداد برای «همین جلسه» دوباره محاسبه/بررسی می‌شود):
 *  • admin → مدیر سایت (به‌سازگاری طراحی فعلی: میزبان همه‌ی جلسات)
 *  • user  → کاربر سایت + آیا «استاد» است (User.role = teacher)
 */
interface AuthInfo {
  kind: "admin" | "user";
  userId: string | null; // مدیر کاربر سایت نیست
  name: string;
  phone: string | null;
  isTeacher: boolean; // فقط برای user
}

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

/** مدیر معتبر؟ (مدیر اول از دیتابیس نامش را می‌گیرد — فقط برای نمایش) */
function authAdmin(token: string | undefined): AuthInfo | null {
  if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) return null;
  const rows = runQuery(
    "SELECT s.expiresAt, a.username FROM AdminSession s JOIN AdminUser a ON a.id = s.adminId WHERE s.token = ? LIMIT 1",
    token
  );
  const row = rows?.[0] as { expiresAt?: number | string; username?: string } | undefined;
  if (!row?.expiresAt) return null;
  const exp = new Date(row.expiresAt as number | string).getTime();
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  return {
    kind: "admin",
    userId: null,
    name: row.username || "استاد",
    phone: null,
    isTeacher: false,
  };
}

/** کاربر سایت معتبر؟ (نشست فعال + حساب غیرمسدود) */
function authUser(token: string | undefined): AuthInfo | null {
  if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) return null;
  const rows = runQuery(
    "SELECT s.expiresAt, u.id, u.firstName, u.lastName, u.phone, u.status, u.role FROM UserSession s JOIN User u ON u.id = s.userId WHERE s.token = ? LIMIT 1",
    token
  );
  const row = rows?.[0] as
    | {
        expiresAt?: number | string;
        id?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        status?: string;
        role?: string;
      }
    | undefined;
  if (!row?.expiresAt || !row.id) return null;
  const exp = new Date(row.expiresAt as number | string).getTime();
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  if (row.status === "blocked") return null;
  return {
    kind: "user",
    userId: row.id,
    name: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "دانشجو",
    phone: row.phone ?? null,
    isTeacher: row.role === "teacher",
  };
}

/* ------------------------------------------------------------------ */
/*  بررسی استریم و دعوت                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  مبداهای مجاز اتصال (بند ۷)                                          */
/* ------------------------------------------------------------------ */

/**
 * اتصال فقط از مبداهای مجاز پذیرفته می‌شود:
 *  • SITE_URL / ALLOWED_ORIGINS (مبدای رسمی سایت در استقرار)
 *  • هم‌مبدأ با Host درخواست (مرورگر به سایت خودش پشت پروکسی nginx/gateway)
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

const IS_PRODUCTION_SERVICE = process.env.NODE_ENV === "production";

function isDevLocalOrigin(origin: string): boolean {
  if (IS_PRODUCTION_SERVICE) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

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
/*  تازگی نشست روی اتصال باز (بند ۷)                                    */
/* ------------------------------------------------------------------ */

/**
 * نشست فقط در handshake چک نمی‌شود — در «هر رویداد» با حافظه‌ی ۱۵ثانیه‌ای
 * دوباره از دیتابیس خوانده می‌شود؛ نشست منقضی/باطل‌شده (خروج، تغییر رمز،
 * revoke) یا «کاربر مسدود» (که نشستش هم پاک می‌شود) اتصال باز را همان
 * لحظه می‌بندد — قدرت‌های میزبانی/چت/رسانه قطع می‌شوند.
 */
interface AuthTokens {
  admin: string;
  user: string;
}

const authFreshness = new Map<string, { auth: AuthInfo; until: number }>();

function refreshAuth(socket: Socket): AuthInfo | null {
  const current = socket.data.auth as AuthInfo | null;
  if (!current) return null; // مهمان — برای پیام خطای خوانا نگه داشته می‌شود
  const tokens = (socket.data.authToken ?? {}) as Partial<AuthTokens>;
  const key =
    current.kind === "admin"
      ? `a:${tokens.admin ?? ""}`
      : `u:${tokens.user ?? ""}`;
  const now = Date.now();
  const cached = authFreshness.get(key);
  if (cached && now < cached.until) return cached.auth;
  const re =
    current.kind === "admin" ? authAdmin(tokens.admin) : authUser(tokens.user);
  if (!re) {
    authFreshness.delete(key);
    socket.data.auth = null;
    socket.disconnect(true);
    return null;
  }
  authFreshness.set(key, { auth: re, until: now + 15_000 });
  socket.data.auth = re;
  return re;
}

/* ------------------------------------------------------------------ */
/*  محدودیت نرخ رویدادها بر حسب نوع (بند ۷) — سیگنالینگ دست‌نخورده       */
/* ------------------------------------------------------------------ */

/**
 * نرخ‌ها متناسب با نوع رویدادند: سیگنالینگ WebRTC (پرتعداد — ICE/offer/
 * answer) سقف بسیار باز دارد تا آسیب نبیند؛ چت و درخواست عضویت سخت‌ترند.
 * سوکت نرمال هیچ‌گاه به سقف نمی‌رسد؛ هرزفرستنده بی‌صدا خاموش می‌شود.
 */
const EVENT_RATES: Record<string, { max: number; windowMs: number }> = {
  join: { max: 12, windowMs: 30_000 },
  chat: { max: 12, windowMs: 30_000 },
  signal: { max: 1200, windowMs: 60_000 },
  "subscribe-request": { max: 120, windowMs: 60_000 },
  publish: { max: 30, windowMs: 60_000 },
  "media:request": { max: 20, windowMs: 60_000 },
  "media:response": { max: 60, windowMs: 60_000 },
  "media:revoke": { max: 30, windowMs: 60_000 },
  kick: { max: 30, windowMs: 60_000 },
  "host:live": { max: 30, windowMs: 60_000 },
  "host:ended": { max: 30, windowMs: 60_000 },
  leave: { max: 60, windowMs: 60_000 },
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

interface StreamRow {
  id: string;
  title: string;
  status: string;
  hostId: string | null;
  // لینک دعوت یکتا — جلسه‌ی استاد و جلسه‌ی «لینک-تنها» مدیر
  inviteSlug: string | null;
}

function getStream(streamId: string): StreamRow | null {
  const rows = runQuery(
    "SELECT id, title, status, hostId, inviteSlug FROM LiveStream WHERE id = ? LIMIT 1",
    streamId
  );
  return (rows?.[0] as StreamRow | undefined) ?? null;
}

/* ------------------------------------------------------------------ */
/*  نقش «میزبان» — به‌ازای هر جلسه، نه به‌ازای اتصال                    */
/* ------------------------------------------------------------------ */

/**
 * نقش این هویت در «این جلسه» — هر بار از دیتابیس محاسبه می‌شود:
 *  • مدیر → میزبان همه‌ی جلسات (سازگار با طراحی فعلی)
 *  • استادِ مالکِ همین جلسه (LiveStream.hostId = او و User.role = teacher) → host
 *  • بقیه → student
 * نقش استاد در جلسه‌ای که مالکش «نیست» هرگز به او منتقل نمی‌شود.
 */
function roleForStream(auth: AuthInfo, stream: StreamRow): "host" | "student" {
  if (auth.kind === "admin") return "host";
  if (
    auth.kind === "user" &&
    auth.isTeacher &&
    auth.userId !== null &&
    stream.hostId === auth.userId
  ) {
    return "host";
  }
  return "student";
}

/**
 * مالکیت میزبانی در «همین لحظه» برای همین جلسه — در «هر رویداد» از نو
 * از دیتابیس خوانده می‌شود (اگر مالکیت جلسه در میانه تغییر کند، قدرت‌های
 * میزبان بلافاصله قطع می‌شوند).
 */
function isHostOfStream(auth: AuthInfo | null, streamId: string): boolean {
  if (!auth) return false;
  if (auth.kind === "admin") return true; // مدیر سایت — میزبان همه‌ی جلسات
  if (auth.kind !== "user" || !auth.isTeacher || !auth.userId) return false;
  const stream = getStream(streamId);
  return !!stream && stream.hostId === auth.userId;
}

/** استریم با «شناسه یا لینک دعوت یکتا» — صفحه‌ی /stream/{ref} هر دو را می‌پذیرد */
function getStreamByRef(ref: string): StreamRow | null {
  if (!ref || ref.length === 0 || ref.length > 64) return null;
  return getStream(ref) ?? streamBySlug(ref);
}

function streamBySlug(slug: string): StreamRow | null {
  const rows = runQuery(
    "SELECT id, title, status, hostId, inviteSlug FROM LiveStream WHERE inviteSlug = ? LIMIT 1",
    slug
  );
  return (rows?.[0] as StreamRow | undefined) ?? null;
}

/** آیا کاربر به این استریم دعوت شده است؟ (ثبت‌نام دوره یا عضویت کلاس دعوت‌شده) */
function userInvited(streamId: string, userId: string): boolean {
  const invitations = runQuery(
    "SELECT courseId, courseTitle, classId FROM StreamInvitation WHERE streamId = ?",
    streamId
  ) as Array<{ courseId: string | null; courseTitle: string | null; classId: string | null }> | null;
  if (!invitations || invitations.length === 0) return false;

  for (const inv of invitations) {
    if (inv.classId) {
      const member = runQuery(
        "SELECT id FROM ClassMembership WHERE userId = ? AND classId = ? LIMIT 1",
        userId,
        inv.classId
      );
      if (member && member.length > 0) return true;
    }
    if (inv.courseId) {
      // عنوان دوره‌ی دعوت — تصویر لحظه‌ای یا عنوان فعلی دوره
      const courseTitle =
        inv.courseTitle && inv.courseTitle.length > 0
          ? inv.courseTitle
          : (runQuery("SELECT title FROM Course WHERE id = ? LIMIT 1", inv.courseId)?.[0] as
              | { title?: string }
              | undefined)?.title ?? null;
      if (courseTitle) {
        const enrolled = runQuery(
          "SELECT id FROM Enrollment WHERE userId = ? AND course = ? LIMIT 1",
          userId,
          courseTitle
        );
        if (enrolled && enrolled.length > 0) return true;
      }
    }
  }
  return false;
}

/** کاربرِ اخراج‌شده از این استریم؟ (سند ماندگار در دیتابیس) */
function userKicked(streamId: string, userId: string): boolean {
  const rows = runQuery(
    "SELECT kicked FROM StreamParticipant WHERE streamId = ? AND userId = ? LIMIT 1",
    streamId,
    userId
  );
  const row = rows?.[0] as { kicked?: number } | undefined;
  return !!row?.kicked;
}

/* ------------------------------------------------------------------ */
/*  سرور و اتاقها                                                      */
/* ------------------------------------------------------------------ */

const httpServer = createServer();
const io = new Server(httpServer, {
  // مسیر عمداً «/» است (مانند سرویس چت): هم روتینگ گیت‌وی سندباکس
  // (query XTransformPort) و هم پروکسی استقرار روی /socket.io کار می‌کند.
  path: "/",
  cors: {
    // فقط مبداهای مجاز بازتاب داده می‌شوند (بند ۷)؛ هم‌مبدأ CORS لازم ندارد
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, ok?: boolean) => void
    ) => {
      if (!origin) return callback(null, true);
      const normalized =
        origin === "null" ? origin : normalizeOriginValue(origin);
      const ok =
        origin !== "null" &&
        (ALLOWED_ORIGIN_LIST.some(
          (a) => normalizeOriginValue(a) === normalized
        ) ||
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
  // پینگ فشرده‌تر: سوکتِ مرده (تب بسته‌شده/اینترنت قطع‌شده) حداکثر تا ~۳۵
  // ثانیه بعد از قطع واقعی از اتاق پاک می‌شود — قبلاً (۶۰+۲۵ ثانیه) ناشرِ
  // مرده تا نزدیک دو دقیقه در فهرست publishers می‌ماند و بیننده‌های تازه
  // به آن وصل می‌شدند و تصویری نمی‌گرفتند.
  pingInterval: 10000,
  pingTimeout: 25000,
  // بهینه VPS: فشرده‌سازی پیام خاموش (payloadهای سیگنالینگ کوچک‌اند؛
  // فشرده‌سازی فقط سربار CPU می‌شود) و حداکثر اندازه‌ی پیام محدود.
  perMessageDeflate: false,
  maxHttpBufferSize: 1e6,
});

/** عضو اتاق — به‌ازای هر سوکت */
interface RoomMember {
  socketId: string;
  userId: string | null; // null برای استاد
  name: string;
  role: "host" | "student";
}

/** پیام چت در حافظه (حلقه‌ی ۵۰تایی) */
interface ChatMsg {
  userId: string | null;
  name: string;
  role: "host" | "student";
  text: string;
  ts: number;
}

interface StreamRoom {
  streamId: string;
  status: string;
  members: Map<string, RoomMember>; // socketId → member
  banned: Set<string>; // userIdهای اخراج‌شده (بازگشت تا پایان جلسه ممنوع)
  granted: Set<string>; // userIdهای دانشجو با اجازه‌ی رسانه
  publishers: Set<string>; // socketIdهای در حال پخش (استاد/دانشجوی اجازه‌گرفته)
  hostOnline: boolean;
  chat: ChatMsg[];
  /** آخرین لحظه‌ی فعالیت (هر رویداد اتاق/حضور) — مبنا بستن خودکار بیکاری */
  lastActivityAt: number;
}

const rooms = new Map<string, StreamRoom>();

function getRoom(streamId: string): StreamRoom | null {
  return rooms.get(streamId) ?? null;
}

function ensureRoom(streamId: string, status: string): StreamRoom {
  let room = rooms.get(streamId);
  if (!room) {
    room = {
      streamId,
      status,
      members: new Map(),
      banned: new Set(),
      granted: new Set(),
      publishers: new Set(),
      hostOnline: false,
      chat: [],
      lastActivityAt: Date.now(),
    };
    rooms.set(streamId, room);
  }
  return room;
}

/** ثبت فعالیت تازه در اتاق — ورود/خروج/چت/سیگنالینگ/... همه را تازه نگه می‌دارد */
function touchRoom(room: StreamRoom): void {
  room.lastActivityAt = Date.now();
}

function roomUsers(room: StreamRoom, exceptSocketId?: string) {
  return Array.from(room.members.values())
    .filter((m) => m.socketId !== exceptSocketId)
    .map((m) => ({ userId: m.userId, name: m.name, role: m.role, socketId: m.socketId }));
}

function pushChat(room: StreamRoom, msg: ChatMsg) {
  room.chat.push(msg);
  if (room.chat.length > 50) room.chat.splice(0, room.chat.length - 50);
}

/** حذف عضویت سوکت از اتاق + رویداد خروج به بقیه */
function removeMember(room: StreamRoom, socketId: string, kicked = false) {
  const member = room.members.get(socketId);
  if (!member) return;
  touchRoom(room); // خروج (خودخواسته/قطع/اخراج) هم فعالیت لحظه‌ای است
  room.members.delete(socketId);
  // اگر ناشر بود، بیننده‌های او باید پیوند رسانه را ببندند
  if (room.publishers.delete(socketId)) {
    io.to(`stream:${room.streamId}`).emit("publisher-changed", {
      publisherId: socketId,
      userId: member.userId,
      name: member.name,
      active: false,
    });
  }
  // اگر آخرین سوکت استاد بود، اتاق بدون پخش می‌ماند
  const hostLeft = member.role === "host";
  const anyHostLeft = Array.from(room.members.values()).some((m) => m.role === "host");
  if (hostLeft && !anyHostLeft && room.hostOnline) {
    room.hostOnline = false;
    io.to(`stream:${room.streamId}`).emit("host:offline");
  }
  io.to(`stream:${room.streamId}`).emit("user-left", {
    userId: member.userId,
    name: member.name,
    kicked,
  });
  if (room.members.size === 0 && room.status !== "live") {
    // خالی و غیرزنده — اتاق از حافظه جمع می‌شود (چت پیش‌از-شروع هم پاک می‌شود)
    rooms.delete(room.streamId);
  }
}

const validId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 64;

/**
 * خروج سوکت از «هر اتاقی» که عضو آن است — هر سوکت حداکثر در یک اتاق
 * است؛ ورود به جلسه‌ی جدید ابتدا از جلسه‌ی قبلی خارجش می‌کند (نقش‌ها و
 * عضویت‌ها هرگز بین دو جلسه منتقل نمی‌شوند).
 */
function leaveAllRooms(socket: Socket): void {
  for (const [streamId, room] of Array.from(rooms.entries())) {
    if (room.members.has(socket.id)) {
      removeMember(room, socket.id);
      socket.leave(`stream:${streamId}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  اتصال‌ها                                                           */
/* ------------------------------------------------------------------ */

io.use((socket, next) => {
  // — گره‌ی مبدأ (بند ۷): سایت متفرقه در همان handshake رد می‌شود —
  const originHeader = socket.request.headers.origin;
  if (
    !connectionOriginAllowed(
      typeof originHeader === "string" ? originHeader : undefined,
      socket.request.headers.host
    )
  ) {
    return next(new Error("origin-not-allowed"));
  }
  const cookies = parseCookies(socket.request.headers.cookie);
  // توکن خام برای «تازگی نشست» در هر رویداد نگه داشته می‌شود (بند ۷)
  socket.data.authToken = {
    admin: cookies[ADMIN_COOKIE] ?? "",
    user: cookies[USER_COOKIE] ?? "",
  } satisfies AuthTokens;
  const auth = authAdmin(cookies[ADMIN_COOKIE]) ?? authUser(cookies[USER_COOKIE]);
  if (!auth) {
    // مهمان — اجازه‌ی هیچ اتاقی ندارد؛ ولی اتصال را نگه می‌داریم تا پیام خطای
    // خوانا برگردانیم (به‌جای قطع خاموش).
    socket.data.auth = null;
  } else {
    socket.data.auth = auth;
  }
  next();
});

io.on("connection", (socket: Socket) => {
  // — هر رویداد، هویت را با «تازگی» دوباره می‌خواند: نشست منقضی/باطل‌شده یا
  // کاربر مسدود، اتصال باز را می‌بندد (refreshAuth) —

  socket.on("join", (data: { streamId?: string }, ack?: (res: unknown) => void) => {
    if (!allowEvent(socket.id, "join")) return; // سیلِ ورود (rejoin storm) محدود
    const auth = refreshAuth(socket);
    const fail = (error: string) => ack?.({ ok: false, error });
    if (!validId(data?.streamId)) return fail("شناسه‌ی کلاس نامعتبر است.");
    if (!auth) return fail("برای ورود به کلاس، ابتدا وارد حساب خود شوید.");

    // شناسه‌ی واقعی یا «لینک دعوت یکتا» (inviteSlug جلسات استاد)
    const stream = getStreamByRef(data.streamId);
    if (!stream) return fail("کلاس پیدا نشد.");
    if (stream.status === "ended") return fail("این کلاس پایان یافته است.");

    const streamId = stream.id; // کلید اتاق = شناسه‌ی واقعی

    // — نقش در «همین جلسه» — هر بار از نو محاسبه می‌شود؛ نقش میزبانی
    // استاد در جلسه‌ای که مالکش نیست هرگز به او منتقل نمی‌شود (نقش روی
    // «اتصال» ذخیره نمی‌شود، روی عضویتِ همین اتاق) —
    const memberRole = roleForStream(auth, stream);

    if (memberRole === "student" && auth.userId) {
      if (userKicked(streamId, auth.userId)) {
        return fail("شما از این کلاس اخراج شده‌اید.");
      }
      // جلسه با «لینک دعوت یکتا» باز است (جلسه‌ی استاد و جلسه‌ی لینک-تنهای
      // مدیر)؛ جلسه‌ی مدیرِ بدون لینک فقط با دعوت دوره/کلاس
      if (
        stream.hostId === null &&
        stream.inviteSlug === null &&
        !userInvited(streamId, auth.userId)
      ) {
        return fail("شما به این کلاس دعوت نشده‌اید.");
      }
    }

    // — حداکثر یک اتاق برای هر سوکت: ورود به جلسه‌ی جدید = خروج کامل از جلسه‌ی قبلی —
    leaveAllRooms(socket);

    const room = ensureRoom(streamId, stream.status);
    touchRoom(room); // ورود تازه = فعالیت تازه
    // ممنوعیت بازگشت اخراج‌شده‌ها در همین اجرای سرویس
    if (memberRole === "student" && auth.userId && room.banned.has(auth.userId)) {
      return fail("شما از این کلاس اخراج شده‌اید.");
    }
    // سوکت دومِ همان استاد مجاز است (چند تب) — سوکت دومِ دانشجو هم مجاز؛
    // برای سادگی رسانه، هر سوکت اتصالات خودش را می‌سازد.
    if (memberRole === "host") {
      room.hostOnline = room.hostOnline || room.publishers.size > 0;
    }

    room.members.set(socket.id, {
      socketId: socket.id,
      userId: auth.userId,
      name: auth.name,
      role: memberRole,
    });
    socket.join(`stream:${streamId}`);

    // رویداد ورود برای بقیه + وضعیت کامل اتاق برای خودش
    socket.to(`stream:${streamId}`).emit("user-joined", {
      userId: auth.userId,
      name: auth.name,
      role: memberRole,
    });

    ack?.({
      ok: true,
      me: { userId: auth.userId, name: auth.name, role: memberRole, phone: auth.phone },
      room: {
        streamId,
        title: stream.title,
        status: room.status,
        hostOnline: room.hostOnline,
        users: roomUsers(room),
        publishers: Array.from(room.publishers),
        granted: auth.userId ? room.granted.has(auth.userId) : false,
        chat: room.chat.slice(-50),
      },
    });
  });

  /* ———————————— چت ———————————— */

  socket.on("chat", (data: { streamId?: string; text?: string }) => {
    if (!allowEvent(socket.id, "chat")) return;
    const auth = refreshAuth(socket);
    if (!auth || !validId(data?.streamId)) return;
    const text = typeof data.text === "string" ? data.text.trim().slice(0, 500) : "";
    if (!text) return;
    const room = getRoom(data.streamId);
    const member = room?.members.get(socket.id);
    if (!room || !member) return; // فقط عضو اتاق
    touchRoom(room); // پیام چت = فعالیت
    const msg: ChatMsg = {
      userId: auth.userId,
      name: auth.name,
      role: member.role,
      text,
      ts: Date.now(),
    };
    pushChat(room, msg);
    io.to(`stream:${data.streamId}`).emit("chat", msg);
  });

  /* ———————————— سیگنالینگ WebRTC ———————————— */

  socket.on(
    "signal",
    (data: { streamId?: string; to?: string; kind?: string; payload?: unknown }) => {
      if (!allowEvent(socket.id, "signal")) return; // سقف بسیار باز — سیگنالینگ سالم
      const auth = refreshAuth(socket);
      if (!auth || !validId(data?.streamId) || !validId(data?.to)) return;
      const room = getRoom(data.streamId);
      if (!room || !room.members.has(socket.id) || !room.members.has(data.to)) return;
      touchRoom(room); // سیگنالینگ = فعالیت
      // فقط بین اعضای همان اتاق رله می‌شود
      io.to(data.to).emit("signal", {
        from: socket.id,
        fromUserId: auth.userId,
        fromName: auth.name,
        fromRole: room.members.get(socket.id)?.role,
        kind: data.kind ?? "",
        payload: data.payload ?? null,
      });
    }
  );

  /** بیننده از ناشر media می‌خواهد (با کیفیت دلخواه) — ناشر offer می‌سازد */
  socket.on(
    "subscribe-request",
    (data: { streamId?: string; publisherId?: string; quality?: string }) => {
      if (!allowEvent(socket.id, "subscribe-request")) return;
      const auth = refreshAuth(socket);
      if (!auth || !validId(data?.streamId) || !validId(data?.publisherId)) return;
      const room = getRoom(data.streamId);
      if (!room || !room.members.has(socket.id) || !room.members.has(data.publisherId)) return;
      touchRoom(room); // درخواست اشتراک = فعالیت
      const quality =
        data.quality === "low" || data.quality === "audio" ? data.quality : "full";
      io.to(data.publisherId).emit("subscribe-request", {
        viewerSocketId: socket.id,
        viewerId: auth.userId,
        viewerName: auth.name,
        quality,
      });
    }
  );

  /** شروع/توقف پخش — استادِ مالکِ همین جلسه یا دانشجوی اجازه‌گرفته */
  socket.on("publish", (data: { streamId?: string; active?: boolean }) => {
    if (!allowEvent(socket.id, "publish")) return;
    const auth = refreshAuth(socket);
    if (!auth || !validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    const member = room?.members.get(socket.id);
    if (!room || !member) return;
    // — بررسی مجدد مالکیت میزبانی «در همین رویداد» (اتمیک برای این پخش) —
    const isHostHere = member.role === "host" && isHostOfStream(auth, data.streamId);
    touchRoom(room); // شروع/توقف پخش = فعالیت
    const allowed =
      isHostHere || (auth.userId !== null && room.granted.has(auth.userId));
    if (!allowed) return;
    const active = data.active === true;
    if (active) {
      room.publishers.add(socket.id);
      if (isHostHere) room.hostOnline = true;
    } else {
      room.publishers.delete(socket.id);
      if (isHostHere) {
        // استاد پخش را موقتاً قطع کرد — بیننده‌ها منتظر می‌مانند
        room.hostOnline = false;
      }
    }
    io.to(`stream:${data.streamId}`).emit("publisher-changed", {
      publisherId: socket.id,
      userId: auth.userId,
      name: auth.name,
      active,
    });
  });

  /* ———————————— اجازه‌ی رسانه (تصویر/صدای دانشجو) ———————————— */

  /** دانشجو درخواست روشن‌کردن دوربین/میکروفون خود را دارد */
  socket.on("media:request", (data: { streamId?: string }) => {
    if (!allowEvent(socket.id, "media:request")) return;
    const auth = refreshAuth(socket);
    if (!auth || !auth.userId || !validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    const member = room?.members.get(socket.id);
    if (!room || !member || member.role !== "student") return; // فقط دانشجو
    touchRoom(room);
    // به همه‌ی سوکت‌های استادِ همین جلسه
    for (const m of Array.from(room.members.values())) {
      if (m.role === "host") io.to(m.socketId).emit("media:request", { userId: auth.userId, name: auth.name });
    }
  });

  /** پاسخ استاد به درخواست — رویداد نتیجه فقط به خود دانشجو می‌رسد */
  socket.on("media:response", (data: { streamId?: string; userId?: string; grant?: boolean }) => {
    if (!allowEvent(socket.id, "media:response")) return;
    const auth = refreshAuth(socket);
    if (!auth || !validId(data?.streamId) || !validId(data?.userId)) return;
    const room = getRoom(data.streamId);
    const member = room?.members.get(socket.id);
    if (!room || !member) return;
    // — میزبان «همین جلسه»؟ مالکیت در همین رویداد از نو بررسی می‌شود —
    if (member.role !== "host" || !isHostOfStream(auth, data.streamId)) return;
    touchRoom(room);
    const grant = data.grant === true;
    if (grant) room.granted.add(data.userId);
    // به همه‌ی سوکت‌های آن دانشجو
    for (const m of Array.from(room.members.values())) {
      if (m.userId === data.userId) {
        io.to(m.socketId).emit(grant ? "media:granted" : "media:denied");
      }
    }
  });

  /** بازپس‌گیری اجازه — دانشجو پخش‌اش را قطع می‌کند و از فهرست ناشران می‌رود */
  socket.on("media:revoke", (data: { streamId?: string; userId?: string }) => {
    if (!allowEvent(socket.id, "media:revoke")) return;
    const auth = refreshAuth(socket);
    if (!auth || !validId(data?.streamId) || !validId(data?.userId)) return;
    const room = getRoom(data.streamId);
    const member = room?.members.get(socket.id);
    if (!room || !member) return;
    // — میزبان «همین جلسه»؟ مالکیت در همین رویداد از نو بررسی می‌شود —
    if (member.role !== "host" || !isHostOfStream(auth, data.streamId)) return;
    touchRoom(room);
    room.granted.delete(data.userId);
    for (const m of Array.from(room.members.values())) {
      if (m.userId === data.userId) io.to(m.socketId).emit("media:revoked");
    }
  });

  /* ———————————— اخراج (فقط میزبانِ همین جلسه) ———————————— */

  socket.on("kick", (data: { streamId?: string; userId?: string }) => {
    if (!allowEvent(socket.id, "kick")) return;
    const auth = refreshAuth(socket);
    if (!auth || !validId(data?.streamId) || !validId(data?.userId)) return;
    const room = getRoom(data.streamId);
    const member = room?.members.get(socket.id);
    if (!room || !member) return;
    // — میزبان «همین جلسه»؟ مالکیت در همین رویداد از نو بررسی می‌شود —
    if (member.role !== "host" || !isHostOfStream(auth, data.streamId)) return;
    touchRoom(room);
    room.banned.add(data.userId);
    room.granted.delete(data.userId);
    // همه‌ی سوکت‌های آن کاربر اخراج و از اتاق خارج می‌شوند
    for (const m of Array.from(room.members.values())) {
      if (m.userId === data.userId) {
        io.to(m.socketId).emit("kicked");
        io.in(m.socketId).socketsLeave(`stream:${data.streamId}`);
        removeMember(room, m.socketId, true);
      }
    }
    // سوکت‌های ناشرِ دانشجوی اخراج‌شده هم باید بسته شوند — بیننده‌ها با
    // رویداد user-left پیوند را می‌بندند.
  });

  /* ———————————— چرخه‌ی استاد ———————————— */

  socket.on("host:live", (data: { streamId?: string }) => {
    if (!allowEvent(socket.id, "host:live")) return;
    const auth = refreshAuth(socket);
    if (!auth || !validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    const member = room?.members.get(socket.id);
    if (!room || !member) return;
    // — میزبان «همین جلسه»؟ مالکیت در همین رویداد از نو بررسی می‌شود —
    if (member.role !== "host" || !isHostOfStream(auth, data.streamId)) return;
    touchRoom(room);
    room.status = "live";
    room.hostOnline = true;
    io.to(`stream:${data.streamId}`).emit("stream:live", { hostName: auth.name });
  });

  socket.on("host:ended", (data: { streamId?: string }) => {
    if (!allowEvent(socket.id, "host:ended")) return;
    const auth = refreshAuth(socket);
    if (!auth || !validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    const member = room?.members.get(socket.id);
    if (!room || !member) return;
    // — میزبان «همین جلسه»؟ مالکیت در همین رویداد از نو بررسی می‌شود —
    if (member.role !== "host" || !isHostOfStream(auth, data.streamId)) return;
    touchRoom(room);
    room.status = "ended";
    room.publishers.clear();
    room.hostOnline = false;
    io.to(`stream:${data.streamId}`).emit("stream:ended");
  });

  /* ———————————— خروج ———————————— */

  socket.on("leave", (data: { streamId?: string }) => {
    if (!allowEvent(socket.id, "leave")) return;
    if (!validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return;
    touchRoom(room);
    removeMember(room, socket.id);
    socket.leave(`stream:${data.streamId}`);
  });

  socket.on("disconnect", () => {
    cleanupRateBuckets(socket.id);
    // خروج کامل از هر اتاقِ ممکنِ این سوکت (اتاق‌های مانده از قبل هم پاک می‌شوند)
    leaveAllRooms(socket);
  });

  socket.on("error", (error: unknown) => {
    console.error(`[stream-service] socket error (${socket.id}):`, error);
  });
});

const PORT = Number(process.env.STREAM_PORT) || 3005;
httpServer.listen(PORT, () => {
  console.log(`[stream-service] socket.io signaling + chat relay on port ${PORT}`);
  console.log(`[stream-service] db: ${DB_PATH ?? "غیرقابل دسترس (رد ورودها)"}`);
});

/* ------------------------------------------------------------------ */
/*  بستن خودکار کلاس‌های بیکار                                        */
/* ------------------------------------------------------------------ */

/** اگر بیش از ۲۰ دقیقه (پیش‌فرض) هیچ فعالیتی در کلاس نباشد — نه ورود/خروج،
 *  نه چت/سیگنالینگ و نه هیچ عضو متصلی — جلسه خودکار بسته می‌شود
 *  (status=ended) تا باکس «دعوت به کلاس» هم از پنل کاربران حذف شود.
 *  (STREAM_IDLE_CLOSE_MS فقط برای تست/تنظیم است؛ پیش‌فرض ۲۰ دقیقه.) */
const IDLE_CLOSE_MS = Number(process.env.STREAM_IDLE_CLOSE_MS) || 20 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

let writeDb: Database | null = null;
let writeDbFailed = false;

/** اتصال نوشتنی مستقل به دیتابیس — فقط همین بستن خودکار می‌نویسد */
function getWriteDb(): Database | null {
  if (writeDb) return writeDb;
  if (writeDbFailed) return null;
  if (!DB_PATH || !existsSync(DB_PATH)) return null;
  try {
    writeDb = new Database(DB_PATH);
    writeDb.exec("PRAGMA busy_timeout = 5000");
    return writeDb;
  } catch (error) {
    writeDbFailed = true;
    console.warn("[stream-service] باز کردن دیتابیس برای نوشتن ممکن نشد:", error);
    return null;
  }
}

/** فرستانه‌ی زمان SQLite — Prisma تاریخ‌ها را epoch-میلی‌ثانیه ذخیره می‌کند */
function tsOf(v: unknown): number {
  const t = new Date(v as number | string).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** بستن یک کلاس بیکار در دیتابیس + اطلاع به اتاق (در صورت وجود) */
function closeIdleStream(id: string, title: string): void {
  const wdb = getWriteDb();
  if (!wdb) return;
  try {
    const now = Date.now();
    const res = wdb.run(
      "UPDATE LiveStream SET status = 'ended', endedAt = ?, updatedAt = ? WHERE id = ? AND status IN ('scheduled','live')",
      [now, now, id]
    );
    if (res.changes === 0) return; // هم‌زمانی — هم‌زمان بسته/حذف شده
    // حضور بازِ شرکت‌کنندگان هم بسته می‌شود (مثل پایان دستی جلسه)
    try {
      wdb.run(
        "UPDATE StreamParticipant SET leftAt = ? WHERE streamId = ? AND leftAt IS NULL",
        [now, id]
      );
    } catch {
      /* ثبت خروج بهترین تلاش است */
    }
    const room = rooms.get(id);
    if (room) {
      io.to(`stream:${id}`).emit("stream:ended");
      rooms.delete(id);
    }
    console.log(
      `[stream-service] کلاس بیکار بسته شد: «${title}» (${id}) — بیش از ${
        IDLE_CLOSE_MS / 60000
      } دقیقه بدون فعالیت`
    );
  } catch (error) {
    console.warn("[stream-service] خطا در بستن کلاس بیکار:", error);
  }
}

/** جاروی دوره‌ای — هر دقیقه اجرا می‌شود */
function sweepIdleStreams(): void {
  const rows = runQuery(
    "SELECT id, title, createdAt, updatedAt FROM LiveStream WHERE status IN ('scheduled','live')"
  ) as Array<{
    id: string;
    title: string;
    createdAt?: number | string;
    updatedAt?: number | string;
  }> | null;
  if (!rows) return; // دیتابیس در دسترس نیست
  const now = Date.now();
  for (const row of rows) {
    const room = rooms.get(row.id);
    if (room) {
      if (room.members.size > 0) {
        // عضو متصل = کلاس فعال — حضور خودش فعالیت است
        room.lastActivityAt = now;
        continue;
      }
      // اتاق خالی — شمارش از آخرین رویداد همان اتاق
      if (now - room.lastActivityAt <= IDLE_CLOSE_MS) continue;
    } else {
      // اتاقی در حافظه نیست — شمارش از آخرین نوشتن دیتابیس (ایجاد/ویرایش/شروع)
      const last = Math.max(tsOf(row.updatedAt), tsOf(row.createdAt));
      if (now - last <= IDLE_CLOSE_MS) continue;
    }
    closeIdleStream(row.id, row.title);
  }
}

const sweeper = setInterval(() => {
  try {
    sweepIdleStreams();
  } catch (error) {
    console.error("[stream-service] idle sweep error:", error);
  }
}, SWEEP_INTERVAL_MS);
// تایمر جارو نباید پروسه را زنده نگه دارد (سرور خودش زنده نگه می‌دارد)
if (typeof sweeper.unref === "function") sweeper.unref();
// جاروی اولین بار با کمی تأخیر — پس از بالاآمدن کامل سرویس
const firstSweep = setTimeout(() => {
  try {
    sweepIdleStreams();
  } catch {
    /* دوره‌ی بعد تلاش می‌شود */
  }
}, 15000);
if (typeof firstSweep.unref === "function") firstSweep.unref();

process.on("SIGTERM", () => {
  console.log("[stream-service] SIGTERM received, shutting down...");
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[stream-service] SIGINT received, shutting down...");
  httpServer.close(() => process.exit(0));
});
