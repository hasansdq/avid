/**
 * آزمون دود احراز هویت سرویس رله چت (mini-services/chat-service) —
 * اتصال مستقیم به 127.0.0.1:3004 و بررسی سناریوهای مجاز/غیرمجاز:
 *
 *  ۱. مدیر معتبر → عضویت در اتاق «admin» و relaying به آن
 *  ۲. بازدیدکننده مالک گفتگو (کوکی) → عضویت در اتاق conv و دریافت رله
 *  ۳. سوکت بی‌احراز → عضویت admin رد / عضویت conv رد / رله typing رد
 *  ۴. تیکت HMAC معتبر (بدون کوکی) → عضویت مجاز
 *  ۵. تیکت خراب (امضای غلط) → رد
 *
 * اجرا:  bun tests/socket-auth-smoke.ts
 */
import { io } from "socket.io-client";
import { Database } from "bun:sqlite";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const SERVICE = "http://127.0.0.1:3004";

/** کلید امضا — از environment یا .env ریشه‌ی پروژه (کلید ثابتی در کد نیست) */
function loadSecret(): string {
  const fromEnv = process.env.CHAT_AUTH_SECRET?.trim() ?? "";
  if (fromEnv) return fromEnv;
  try {
    const text = readFileSync(".env", "utf8");
    const m = text.match(/^CHAT_AUTH_SECRET\s*=\s*(.*)\s*$/m);
    return (m?.[1] ?? "").trim();
  } catch {
    return "";
  }
}
const SECRET = loadSecret();

// — داده‌های واقعی از دیتابیس توسعه —
const db = new Database("db/custom.db", { readonly: true });
const adminRow = db
  .query("SELECT token FROM AdminSession ORDER BY expiresAt DESC LIMIT 1")
  .get() as { token: string };
const convRow = db
  .query("SELECT id, visitorToken FROM ChatConversation LIMIT 1")
  .get() as { id: string; visitorToken: string };
db.close();

function mintTicket(conversationId: string, visitorToken: string): string {
  const payload = `v1|${conversationId}|${visitorToken}|${Date.now() + 60_000}`;
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${b64}.${sig}`;
}

function connect(cookie?: string) {
  return io(SERVICE, {
    path: "/",
    transports: ["polling"],
    extraHeaders: cookie ? { cookie } : {},
    reconnection: false,
    timeout: 4000,
  });
}

function connectAndReady(cookie?: string) {
  return new Promise<ReturnType<typeof connect>>((resolve, reject) => {
    const s = connect(cookie);
    s.on("connect", () => resolve(s));
    s.on("connect_error", (e: Error) => reject(e));
    setTimeout(() => reject(new Error("connect timeout")), 5000);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
  if (!ok) failures++;
}

async function main() {
  console.log(`conv: ${convRow.id}`);
  const received = new Map<string, string[]>();
  const track = (key: string, event: string) => (s: ReturnType<typeof connect>) => {
    received.set(`${key}:${event}`, []);
    s.on(event, (d: { conversationId?: string }) => {
      received.get(`${key}:${event}`)?.push(String(d?.conversationId));
    });
  };

  // ۲) بازدیدکننده مالک (کوکی) — عضویت مجاز انتظار می‌رود
  const visitor = await connectAndReady(
    `avid_chat_vid=${convRow.visitorToken}`
  );
  track("visitor", "activity")(visitor);
  track("visitor", "typing")(visitor);
  visitor.emit("visitor:subscribe", { conversationId: convRow.id });

  // ۱) مدیر معتبر
  const admin = await connectAndReady(`avid_admin=${adminRow.token}`);
  admin.emit("admin:subscribe");
  admin.emit("admin:open", { conversationId: convRow.id });
  await sleep(400);

  // ۳) سوکت بی‌احراز — همه‌ی مسیرها باید رد شوند
  const attacker = await connectAndReady();
  track("attacker", "activity")(attacker);
  track("attacker", "typing")(attacker);
  attacker.emit("visitor:subscribe", { conversationId: convRow.id }); // بدون کوکی/تیکت
  attacker.emit("admin:subscribe"); // بدون نشست مدیر
  attacker.emit("typing", { conversationId: convRow.id, who: "visitor" }); // بدون دسترسی

  // ۴) تیکت معتبر بدون کوکی — عضویت مجاز
  const ticketed = await connectAndReady();
  track("ticketed", "activity")(ticketed);
  ticketed.emit("visitor:subscribe", {
    conversationId: convRow.id,
    ticket: mintTicket(convRow.id, convRow.visitorToken),
  });

  // ۵) تیکت خراب (امضای غلط) — رد
  const badTicket = mintTicket(convRow.id, "f".repeat(48)).slice(0, -4) + "0000";
  const forged = await connectAndReady();
  track("forged", "activity")(forged);
  forged.emit("visitor:subscribe", { conversationId: convRow.id, ticket: badTicket });

  await sleep(500);

  // رله‌ی فعالیت از سوی مدیر (عضو مجاز هر دو اتاق)
  admin.emit("activity", { conversationId: convRow.id, kind: "admin-message" });
  admin.emit("typing", { conversationId: convRow.id, who: "admin" });
  await sleep(600);

  // — ارزیابی —
  const got = (key: string, event: string) =>
    (received.get(`${key}:${event}`) ?? []).filter((c) => c === convRow.id)
      .length;
  check("بازدیدکننده مالک (کوکی) فعالیت را دریافت کرد", got("visitor", "activity") >= 1);
  check("بازدیدکننده مالک (کوکی) نشانگر تایپ را دریافت کرد", got("visitor", "typing") >= 1);
  check("تیکت معتبر → عضویت و دریافت فعالیت", got("ticketed", "activity") >= 1);
  check("سوکت بی‌احراز هیچ چیزی دریافت نکرد", got("attacker", "activity") === 0 && got("attacker", "typing") === 0);
  check("تیکت خراب → رد عضویت", got("forged", "activity") === 0);

  // رله از سوی سوکت بی‌احراز نباید به کسی برسد (رویداد typing مهاجم)
  // — visitor نباید typing جدیدی بگیرد (شمارش فعلی را ثابت نگه می‌داریم) —
  const visitorTypingBefore = got("visitor", "typing");
  attacker.emit("typing", { conversationId: convRow.id, who: "visitor" });
  await sleep(500);
  check(
    "رله‌ی typing مهاجم به اعضای گفتگو نرسید",
    got("visitor", "typing") === visitorTypingBefore
  );

  // مدیریت عضویت admin: بازدیدکننده بدون نشست نمی‌تواند وارد اتاق مدیر شود —
  // اثبات: attacker قبلا admin:subscribe زد و هیچ رویدادی نگرفت ✓ (بالا)

  visitor.disconnect();
  admin.disconnect();
  attacker.disconnect();
  ticketed.disconnect();
  forged.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
