/**
 * بازیابی دیتابیس از پشتیبان — بعد از توقف سرویس‌ها اجرا می‌شود:
 *
 *   docker compose stop web chat stream
 *   docker compose run --rm -e RESTORE_DB=/app/backups/avid-....db migrate bun scripts/restore.ts
 *   docker compose up -d
 *
 * RESTORE_DB = مسیر فایل بکاپ داخل کانتینر migrate (والی avid_backups).
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

function resolveDbPath(): string {
  const env = process.env.DATABASE_URL?.trim();
  if (env) {
    const p = env.replace(/^file:/i, "").trim();
    if (p) return p.startsWith("/") ? p : join(process.cwd(), p);
  }
  return join(process.cwd(), "db", "custom.db");
}

const src = process.env.RESTORE_DB?.trim();
const dst = resolveDbPath();

if (!src || !existsSync(src)) {
  console.error("restore: RESTORE_DB تنظیم نشده یا فایل یافت نشد.");
  process.exit(1);
}

// — سلامت بکاپ —
const check = new Database(src, { readonly: true });
const integrity = check
  .query("PRAGMA integrity_check")
  .all() as Array<{ integrity_check?: string }>;
check.close();
const ok = integrity[0]?.integrity_check === "ok";
if (!ok) {
  console.error("restore: فایل بکاپ سالم نیست (integrity_check) — بازیابی متوقف شد.");
  process.exit(1);
}

// — جایگزینی —
mkdirSync(dirname(dst), { recursive: true });
for (const side of ["-wal", "-shm", "-journal"]) {
  try {
    rmSync(dst + side, { force: true });
  } catch {
    /* بی‌صدا */
  }
}
await Bun.write(dst, Bun.file(src));
console.log(`✔ بازیابی شد: ${src} → ${dst}`);

// — تایید نهایی —
const verify = new Database(dst, { readonly: true });
const rows = verify.query("SELECT COUNT(*) AS c FROM sqlite_master").get() as {
  c: number;
};
verify.close();
console.log(`✔ سلامت تایید شد (${rows.c} آبجکت در دیتابیس).`);
