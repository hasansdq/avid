/**
 * سرویس کلاس آنلاین (استریم) آوید — سیگنالینگ WebRTC + اتاق چت + حضور.
 *
 * این سرویس فقط «رله‌ی بلادرنگ» است؛ منبع حقیقت داده‌ها (استریم، دعوت‌ها،
 * حضور، وضعیت) دیتابیس است که اپ Next.js آن را می‌نویسد. سرویس برای احراز
 * هویت اتصال‌ها و بررسی دعوت، دیتابیس را فقط‌خواندنی باز می‌کند (مانند
 * سرویس چت) و هیچ نوشتاری انجام نمی‌دهد:
 *
 *  • مدیر (کوکی avid_admin ← AdminSession)         → نقش «host»
 *  • کاربر (کوکی avid_user ← UserSession)           → نقش «student»
 *      — استثنا: استادِ مالک جلسه (LiveStream.hostId = او) → نقش «host»
 *
 * ورود دانشجو فقط با «دعوت فعال» پذیرفته می‌شود:
 *  • جلسه‌ی استاد (hostId ≠ null) → «لینک دعوت یکتا» خودش دعوت است؛
 *    هر کاربر واردشده‌ی دارنده‌ی لینک می‌تواند وارد شود.
 *  • جلسه‌ی مدیر (hostId = null)  → ثبت‌نام دوره‌ی دعوت‌شده یا عضویت کلاس
 *    دعوت‌شده؛ کاربرِ اخراج‌شده (StreamParticipant.kicked) تا وقتی
 *    کلاس زنده است رد می‌شود.
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
import { createServer } from "http";
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

interface AuthInfo {
  role: "host" | "student";
  userId: string | null; // مدیر کاربر سایت نیست
  name: string;
  phone: string | null;
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
  return { role: "host", userId: null, name: row.username || "استاد", phone: null };
}

/** کاربر سایت معتبر؟ (نشست فعال + حساب غیرمسدود) */
function authUser(token: string | undefined): AuthInfo | null {
  if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) return null;
  const rows = runQuery(
    "SELECT s.expiresAt, u.id, u.firstName, u.lastName, u.phone, u.status FROM UserSession s JOIN User u ON u.id = s.userId WHERE s.token = ? LIMIT 1",
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
      }
    | undefined;
  if (!row?.expiresAt || !row.id) return null;
  const exp = new Date(row.expiresAt as number | string).getTime();
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  if (row.status === "blocked") return null;
  return {
    role: "student",
    userId: row.id,
    name: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "دانشجو",
    phone: row.phone ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  بررسی استریم و دعوت                                               */
/* ------------------------------------------------------------------ */

interface StreamRow {
  id: string;
  title: string;
  status: string;
  hostId: string | null;
}

function getStream(streamId: string): StreamRow | null {
  const rows = runQuery(
    "SELECT id, title, status, hostId FROM LiveStream WHERE id = ? LIMIT 1",
    streamId
  );
  return (rows?.[0] as StreamRow | undefined) ?? null;
}

/** استریم با «شناسه یا لینک دعوت یکتا» — صفحه‌ی /stream/{ref} هر دو را می‌پذیرد */
function getStreamByRef(ref: string): StreamRow | null {
  if (!ref || ref.length === 0 || ref.length > 64) return null;
  return getStream(ref) ?? streamBySlug(ref);
}

function streamBySlug(slug: string): StreamRow | null {
  const rows = runQuery(
    "SELECT id, title, status, hostId FROM LiveStream WHERE inviteSlug = ? LIMIT 1",
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
  cors: { origin: true, methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
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
    };
    rooms.set(streamId, room);
  }
  return room;
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

/* ------------------------------------------------------------------ */
/*  اتصال‌ها                                                           */
/* ------------------------------------------------------------------ */

io.use((socket, next) => {
  const cookies = parseCookies(socket.request.headers.cookie);
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
  const auth = socket.data.auth as AuthInfo | null;

  socket.on("join", (data: { streamId?: string }, ack?: (res: unknown) => void) => {
    const fail = (error: string) => ack?.({ ok: false, error });
    if (!validId(data?.streamId)) return fail("شناسه‌ی کلاس نامعتبر است.");
    if (!auth) return fail("برای ورود به کلاس، ابتدا وارد حساب خود شوید.");

    // شناسه‌ی واقعی یا «لینک دعوت یکتا» (inviteSlug جلسات استاد)
    const stream = getStreamByRef(data.streamId);
    if (!stream) return fail("کلاس پیدا نشد.");
    if (stream.status === "ended") return fail("این کلاس پایان یافته است.");

    const streamId = stream.id; // کلید اتاق = شناسه‌ی واقعی

    // — استادِ مالک جلسه (hostId = او) → نقش host برای همین سوکت —
    if (auth.role === "student" && auth.userId && stream.hostId === auth.userId) {
      auth.role = "host";
    }

    if (auth.role === "student" && auth.userId) {
      if (userKicked(streamId, auth.userId)) {
        return fail("شما از این کلاس اخراج شده‌اید.");
      }
      // جلسه‌ی استاد با لینک یکتا باز است؛ جلسه‌ی مدیر فقط با دعوت دوره/کلاس
      if (stream.hostId === null && !userInvited(streamId, auth.userId)) {
        return fail("شما به این کلاس دعوت نشده‌اید.");
      }
    }

    const room = ensureRoom(streamId, stream.status);
    // ممنوعیت بازگشت اخراج‌شده‌ها در همین اجرای سرویس
    if (auth.role === "student" && auth.userId && room.banned.has(auth.userId)) {
      return fail("شما از این کلاس اخراج شده‌اید.");
    }
    // سوکت دومِ همان استاد مجاز است (چند تب) — سوکت دومِ دانشجو هم مجاز؛
    // برای سادگی رسانه، هر سوکت اتصالات خودش را می‌سازد.
    if (auth.role === "host") {
      room.hostOnline = room.hostOnline || room.publishers.size > 0;
    }

    room.members.set(socket.id, {
      socketId: socket.id,
      userId: auth.userId,
      name: auth.name,
      role: auth.role,
    });
    socket.join(`stream:${streamId}`);

    // رویداد ورود برای بقیه + وضعیت کامل اتاق برای خودش
    socket.to(`stream:${streamId}`).emit("user-joined", {
      userId: auth.userId,
      name: auth.name,
      role: auth.role,
    });

    ack?.({
      ok: true,
      me: { userId: auth.userId, name: auth.name, role: auth.role, phone: auth.phone },
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
    if (!auth || !validId(data?.streamId)) return;
    const text = typeof data.text === "string" ? data.text.trim().slice(0, 500) : "";
    if (!text) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return; // فقط عضو اتاق
    const msg: ChatMsg = {
      userId: auth.userId,
      name: auth.name,
      role: auth.role,
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
      if (!auth || !validId(data?.streamId) || !validId(data?.to)) return;
      const room = getRoom(data.streamId);
      if (!room || !room.members.has(socket.id) || !room.members.has(data.to)) return;
      // فقط بین اعضای همان اتاق رله می‌شود
      io.to(data.to).emit("signal", {
        from: socket.id,
        fromUserId: auth.userId,
        fromName: auth.name,
        kind: data.kind ?? "",
        payload: data.payload ?? null,
      });
    }
  );

  /** بیننده از ناشر media می‌خواهد (با کیفیت دلخواه) — ناشر offer می‌سازد */
  socket.on(
    "subscribe-request",
    (data: { streamId?: string; publisherId?: string; quality?: string }) => {
      if (!auth || !validId(data?.streamId) || !validId(data?.publisherId)) return;
      const room = getRoom(data.streamId);
      if (!room || !room.members.has(socket.id) || !room.members.has(data.publisherId)) return;
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

  /** شروع/توقف پخش — استاد یا دانشجوی اجازه‌گرفته */
  socket.on("publish", (data: { streamId?: string; active?: boolean }) => {
    if (!auth || !validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return;
    const allowed =
      auth.role === "host" || (auth.userId !== null && room.granted.has(auth.userId));
    if (!allowed) return;
    const active = data.active === true;
    if (active) {
      room.publishers.add(socket.id);
      if (auth.role === "host") room.hostOnline = true;
    } else {
      room.publishers.delete(socket.id);
      if (auth.role === "host") {
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
    if (!auth || auth.role !== "student" || !auth.userId || !validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return;
    // به همه‌ی سوکت‌های استاد
    for (const m of Array.from(room.members.values())) {
      if (m.role === "host") io.to(m.socketId).emit("media:request", { userId: auth.userId, name: auth.name });
    }
  });

  /** پاسخ استاد به درخواست — رویداد نتیجه فقط به خود دانشجو می‌رسد */
  socket.on("media:response", (data: { streamId?: string; userId?: string; grant?: boolean }) => {
    if (!auth || auth.role !== "host" || !validId(data?.streamId) || !validId(data?.userId)) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return;
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
    if (!auth || auth.role !== "host" || !validId(data?.streamId) || !validId(data?.userId)) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return;
    room.granted.delete(data.userId);
    for (const m of Array.from(room.members.values())) {
      if (m.userId === data.userId) io.to(m.socketId).emit("media:revoked");
    }
  });

  /* ———————————— اخراج (فقط استاد) ———————————— */

  socket.on("kick", (data: { streamId?: string; userId?: string }) => {
    if (!auth || auth.role !== "host" || !validId(data?.streamId) || !validId(data?.userId)) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return;
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
    if (!auth || auth.role !== "host" || !validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return;
    room.status = "live";
    room.hostOnline = true;
    io.to(`stream:${data.streamId}`).emit("stream:live", { hostName: auth.name });
  });

  socket.on("host:ended", (data: { streamId?: string }) => {
    if (!auth || auth.role !== "host" || !validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return;
    room.status = "ended";
    room.publishers.clear();
    room.hostOnline = false;
    io.to(`stream:${data.streamId}`).emit("stream:ended");
  });

  /* ———————————— خروج ———————————— */

  socket.on("leave", (data: { streamId?: string }) => {
    if (!validId(data?.streamId)) return;
    const room = getRoom(data.streamId);
    if (!room || !room.members.has(socket.id)) return;
    removeMember(room, socket.id);
    socket.leave(`stream:${data.streamId}`);
  });

  socket.on("disconnect", () => {
    // سوکت ممکن است در چند اتاق نباشد؛ در این طرح هر سوکت حداکثر یک اتاق دارد
    for (const [streamId, room] of Array.from(rooms.entries())) {
      if (room.members.has(socket.id)) {
        removeMember(room, socket.id);
        // سوکت‌های رسانه‌ی این کاربر/استاد قطع شدند — بیننده‌ها خودشان پیوند را می‌بندند
        void streamId;
        break;
      }
    }
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

process.on("SIGTERM", () => {
  console.log("[stream-service] SIGTERM received, shutting down...");
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[stream-service] SIGINT received, shutting down...");
  httpServer.close(() => process.exit(0));
});
