/**
 * پشتیبان‌گیری غیرمخرب از دیتابیس SQLite — VACUUM INTO (بکاپ آنلاین).
 *
 * • مقصد: BACKUP_DIR (پیش‌فرض /app/backups — والی جداگانه در compose)
 * • نام فایل: avid-YYYYMMDD-HHMMSS.db
 * • نگهداری آخرین BACKUP_KEEP نسخه (پیش‌فرض ۱۴)
 *
 * اجرا (روی VPS):  docker compose run --rm migrate bun scripts/backup.ts
 */
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

function resolveDbPath(): string {
  const env = process.env.DATABASE_URL?.trim();
  if (env) {
    const p = env.replace(/^file:/i, "").trim();
    if (p) return p.startsWith("/") ? p : join(process.cwd(), p);
  }
  return join(process.cwd(), "db", "custom.db");
}

const src = resolveDbPath();
const destDir = process.env.BACKUP_DIR?.trim() || "/app/backups";
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

if (!existsSync(src)) {
  console.error(`backup: دیتابیس یافت نشد (${src})`);
  process.exit(1);
}
if (!existsSync(destDir)) {
  console.error(`backup: پوشه‌ی مقصد یافت نشد (${destDir})`);
  process.exit(1);
}

const stamp = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .replace(/\..+$/, "")
  .replace(/(\d{8})(\d{6})/, "$1-$2");
const dest = join(destDir, `avid-${stamp}.db`);

const db = new Database(src, { readonly: true });
db.exec("PRAGMA busy_timeout = 5000");
// بکاپ آنلاین و سازگار — بدون توقف اپ
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();

console.log(`✔ پشتیبان ساخته شد: ${dest}`);

// نگهداری آخرین N نسخه
const files = readdirSync(destDir)
  .filter((f) => /^avid-\d{8}-\d{6}\.db$/.test(f))
  .sort()
  .reverse();
for (const old of files.slice(keep)) {
  try {
    unlinkSync(join(destDir, old));
    console.log(`— پشتیبان قدیمی حذف شد: ${old}`);
  } catch {
    /* بی‌صدا */
  }
}
