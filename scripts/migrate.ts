/**
 * مهاجرتِ غیرمخرب دیتابیس «آوید» — اجرا در سرویس migrate (compose):
 *   bun scripts/migrate.ts
 *
 * سه حالت پشتیبانی می‌شود (حفظ داده در همه‌ی حالت‌ها):
 *
 *  ۱) نصب تازه — فایل دیتابیس نیست (یا جدولی ندارد):
 *       prisma migrate deploy → ساخت کامل اسکیمای + تاریخچه‌ی Prisma.
 *
 *  ۲) دیتابیس با تاریخچه‌ی Prisma — مهاجرت‌های معلق اعمال می‌شوند.
 *
 *  ۳) دیتابیسِ نسخه‌ی قبلی — جدول‌ها هست، جدول _prisma_migrations نه
 *     (دیتابیس‌های ساخته‌شده با db push در نسخه‌های پیشین):
 *       بکاپ (VACUUM INTO، بدون توقف اپ)
 *       → بررسی تطابق ساختار با schema فعلی (prisma migrate diff)
 *       → اعمال دستورهای غیرمخربِ اختلاف (CREATE TABLE / ADD COLUMN …)
 *       → ثبت migration اولیه در تاریخچه‌ی Prisma (migrate resolve --applied)
 *       → تایید حفظ داده (مقایسه‌ی شمارش سطرهای جدول‌ها).
 *
 *     اگر اختلاف شامل دستور مخرب باشد (حذف جدول/ستون/تغییر نام)، مهاجرت
 *     بدون کوچک‌ترین تغییری متوقف می‌شود و مسیر بکاپ اعلام می‌گردد.
 *     اگر در میانه‌ی کار خطایی رخ دهد، دیتابیس از بکاپ بازگردانده می‌شود.
 */
import { spawnSync } from "node:child_process";
import { Database } from "bun:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "..");
const SCHEMA_PATH = join(PROJECT_ROOT, "prisma", "schema.prisma");
const MIGRATIONS_DIR = join(PROJECT_ROOT, "prisma", "migrations");

function resolveDbPath(): string {
  const env = process.env.DATABASE_URL?.trim();
  if (env) {
    const p = env.replace(/^file:/i, "").trim();
    if (p) return p.startsWith("/") ? p : join(process.cwd(), p);
  }
  return join(process.cwd(), "db", "custom.db");
}

const DB_PATH = resolveDbPath();
const DB_URL = `file:${DB_PATH}`;

function backupDir(): string {
  const env = process.env.BACKUP_DIR?.trim();
  if (env) return env;
  if (existsSync("/app/backups")) return "/app/backups";
  return join(dirname(DB_PATH), "backups");
}

/** اجرای یک فرمان prisma CLI با DATABASE_URL صریح */
function prisma(args: string[]): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const res = spawnSync("bunx", ["prisma", ...args], {
    env: { ...process.env, DATABASE_URL: DB_URL },
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  return {
    status: res.status ?? 1,
    stdout: (res.stdout ?? "").toString(),
    stderr: (res.stderr ?? "").toString(),
  };
}

/** مهاجرت‌های موجود (به ترتیب نام = ترتیب اجرا) */
function migrationNames(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        existsSync(join(MIGRATIONS_DIR, e.name, "migration.sql"))
    )
    .map((e) => e.name)
    .sort();
}

/** Older databases can retain their original contact-field defaults. */
function legacyContactSchema(): string | null {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const columns = db.query('PRAGMA table_info("SiteSettings")').all() as {
      name: string;
      dflt_value: string | null;
    }[];
    let schema = readFileSync(SCHEMA_PATH, "utf8");
    let changed = false;
    for (const field of ["contactPhone", "contactEmail", "address"]) {
      const value = columns.find((column) => column.name === field)?.dflt_value;
      if (!value || value === "''" || !/^'(?:[^']|'')*'$/.test(value)) continue;
      const replacement = JSON.stringify(value.slice(1, -1).replace(/''/g, "'"));
      const declaration = new RegExp(`(^\\s*${field}\\s+String\\s+@default\\()""(\\))`, "m");
      schema = schema.replace(declaration, (_, start, end) => start + replacement + end);
      changed = true;
    }
    return changed ? schema : null;
  } finally {
    db.close();
  }
}

/** Compare with the release schema, allowing only historic contact defaults. */
function driftScript(): string | null {
  const compatibleSchema = legacyContactSchema();
  const temporary = compatibleSchema ? mkdtempSync(join(tmpdir(), "avid-schema-")) : null;
  const target = temporary ? join(temporary, "schema.prisma") : SCHEMA_PATH;
  const res = (() => {
    try {
      if (compatibleSchema) writeFileSync(target, compatibleSchema, { mode: 0o600 });
      return prisma([
        "migrate", "diff", "--from-url", DB_URL,
        "--to-schema-datamodel", target, "--script",
      ]);
    } finally {
      if (temporary) rmSync(temporary, { recursive: true, force: true });
    }
  })();
  if (res.status !== 0) {
    throw new Error(
      `prisma migrate diff ناموفق بود:\n${(res.stderr || res.stdout).trim()}`
    );
  }
  const out = res.stdout.trim();
  // بدون جمله‌ی اجرایی (خالی، «No difference detected» یا کامنتِ
  // «This is an empty migration») → بدون اختلاف
  if (!out || parseStatements(out).length === 0) return null;
  return out;
}

/** جدول‌های اپ (بدون جدول‌های داخلی sqlite و تاریخچه‌ی Prisma) */
function appTables(db: Database): string[] {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;
  return rows
    .map((r) => r.name)
    .filter((n) => !n.startsWith("sqlite_") && n !== "_prisma_migrations");
}

/** شمارش سطرهای هر جدول — برای اثبات حفظ داده */
function tableCounts(db: Database): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of appTables(db)) {
    try {
      out[t] = (
        db.query(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }
      ).c;
    } catch {
      out[t] = -1;
    }
  }
  return out;
}

/** بکاپ آنلاین و سازگار — VACUUM INTO (بدون توقف اپ) */
function backupDb(dest: string): void {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

/** بازیابی از بکاپ — اگر مهاجرت در میانه‌ی کار شکست بخورد */
function restoreBackup(backup: string): void {
  for (const side of ["", "-wal", "-shm", "-journal"]) {
    try {
      rmSync(DB_PATH + side, { force: true });
    } catch {
      /* بی‌صدا */
    }
  }
  copyFileSync(backup, DB_PATH);
}

function stamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .replace(/\..+$/, "")
    .replace(/(\d{8})(\d{6})/, "$1-$2");
}

/** گزینش جملات SQL از خروجی --script (خطوط کامنت/خالی حذف می‌شوند) */
function parseStatements(sql: string): string[] {
  const stmts: string[] = [];
  let cur = "";
  for (const line of sql.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("--")) continue;
    cur += (cur ? "\n" : "") + line;
    if (t.endsWith(";")) {
      stmts.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

/** آیا جمله مخرب است؟ (حذف/تغییر نام — در مهاجرتِ غیرمخرب اجرا نمی‌شود) */
function isDestructive(stmt: string): boolean {
  const body = stmt
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /^DROP (TABLE|INDEX|VIEW|TRIGGER)\b/i.test(body) ||
    /^ALTER TABLE .*\bDROP COLUMN\b/i.test(body) ||
    /^ALTER TABLE .*\bRENAME\b/i.test(body)
  );
}

function fail(msg: string): never {
  console.error(`migrate: ${msg}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  حالت ۳: انتقال دیتابیس نسخه‌ی قبلی (بدون تاریخچه‌ی Prisma)           */
/* ------------------------------------------------------------------ */
function legacyFlow(): void {
  const bdir = backupDir();
  mkdirSync(bdir, { recursive: true });
  const backup = join(bdir, `avid-before-migrate-${stamp()}.db`);

  console.log("— دیتابیس نسخه‌ی قبلی شناسایی شد (بدون تاریخچه‌ی Prisma).");
  console.log("— گام ۱: بکاپ پیش از هر تغییری …");
  backupDb(backup);
  console.log(`✔ بکاپ ساخته شد: ${backup}`);

  const before = (() => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      return tableCounts(db);
    } finally {
      db.close();
    }
  })();

  // — گام ۲: بررسی تطابق ساختار با schema فعلی —
  const drift = driftScript();
  if (drift !== null) {
    const stmts = parseStatements(drift);
    const destructive = stmts.filter(isDestructive);
    const safe = stmts.filter((s) => !isDestructive(s));

    if (destructive.length > 0) {
      console.error(
        "migrate: اختلاف ساختاری شامل دستورهای «مخرب» است؛ مهاجرت متوقف شد"
      );
      console.error("— بدون هیچ تغییری در دیتابیس. دستورهای مخرب:");
      for (const s of destructive) {
        console.error(`  ${s.split("\n")[0].slice(0, 120)}`);
      }
      console.error(
        "این تغییرات باید به‌صورت دستی (با بکاپِ موجود) اعمال شود؛ با پشتیبانی هماهنگ کنید."
      );
      console.error(`بکاپ: ${backup}`);
      process.exit(1);
    }

    if (safe.length > 0) {
      console.log(
        `— گام ۲: اعمال ${safe.length} دستور غیرمخرب (جدول/ستون‌های تازه) …`
      );
      const db = new Database(DB_PATH);
      try {
        db.exec("PRAGMA busy_timeout = 5000");
        const tx = db.transaction(() => {
          for (const s of safe) db.exec(s);
        });
        tx();
      } catch (error) {
        db.close();
        console.error("migrate: اعمال دستورها ناموفق بود — بازیابی از بکاپ …");
        console.error(error);
        restoreBackup(backup);
        console.error(`✔ دیتابیس از بکاپ بازگردانده شد (${backup}).`);
        process.exit(1);
      }
      db.close();
    }
  }

  // — گام ۳: تایید تطابق کامل ساختار —
  const remaining = driftScript();
  if (remaining !== null) {
    console.error(
      "migrate: پس از اعمال دستورهای غیرمخرب هنوز اختلاف ساختاری باقی است — بازیابی از بکاپ …"
    );
    restoreBackup(backup);
    console.error(`✔ دیتابیس از بکاپ بازگردانده شد (${backup}).`);
    process.exit(1);
  }

  // — گام ۴: ثبت migration اولیه در تاریخچه‌ی Prisma (بدون اجرای مجدد) —
  const names = migrationNames();
  for (const name of names) {
    const res = prisma(["migrate", "resolve", "--applied", name]);
    if (res.status !== 0) {
      console.error(`migrate: ثبت «${name}» در تاریخچه ناموفق بود — بازیابی از بکاپ …`);
      console.error((res.stderr || res.stdout).trim());
      restoreBackup(backup);
      console.error(`✔ دیتابیس از بکاپ بازگردانده شد (${backup}).`);
      process.exit(1);
    }
    console.log(`✔ تاریخچه‌ی Prisma: «${name}» به‌عنوان اعمال‌شده ثبت شد.`);
  }

  // — گام ۵: تایید حفظ داده —
  const after = (() => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      return tableCounts(db);
    } finally {
      db.close();
    }
  })();
  const mismatch = Object.keys(before).filter(
    (t) => after[t] !== undefined && after[t] !== before[t]
  );
  if (mismatch.length > 0) {
    console.error(
      `migrate: شمارش سطرهای این جدول‌ها تغییر کرده است: ${mismatch.join(", ")} — بازیابی از بکاپ …`
    );
    restoreBackup(backup);
    console.error(`✔ دیتابیس از بکاپ بازگردانده شد (${backup}).`);
    process.exit(1);
  }
  console.log(
    `✔ داده‌ها حفظ شدند — ${Object.keys(before).length} جدول موجود، سطرها بدون تغییر.`
  );
}

/* ------------------------------------------------------------------ */
/*  انتخاب و اجرا                                                       */
/* ------------------------------------------------------------------ */
function main(): void {
  if (!existsSync(MIGRATIONS_DIR)) {
    fail("پوشه‌ی prisma/migrations پیدا نشد.");
  }
  if (!existsSync(dirname(DB_PATH))) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
  }

  console.log(`migrate: دیتابیس ${DB_PATH}`);

  // — طبقه‌بندی وضعیت دیتابیس —
  let kind: "fresh" | "history" | "legacy" = "fresh";
  if (existsSync(DB_PATH)) {
    const probe = new Database(DB_PATH, { readonly: true });
    try {
      const tables = appTables(probe);
      const historyRows = (() => {
        try {
          return (
            probe.query("SELECT COUNT(*) AS c FROM _prisma_migrations").get() as {
              c: number;
            }
          ).c;
        } catch {
          return -1; // جدول تاریخچه وجود ندارد
        }
      })();
      if (tables.length === 0) kind = "fresh";
      else if (historyRows === -1 || historyRows === 0) kind = "legacy";
      else kind = "history";
    } finally {
      probe.close();
    }
  }

  console.log(`migrate: حالت = ${kind}`);

  if (kind === "fresh" || kind === "history") {
    if (kind === "fresh" && !existsSync(DB_PATH)) {
      // SQLite creates the empty file with the same user that runs migrations.
      new Database(DB_PATH, { create: true }).close();
    }
    const res = prisma(["migrate", "deploy"]);
    if (res.status !== 0) {
      console.error("migrate: prisma migrate deploy ناموفق بود:");
      console.error((res.stderr || res.stdout).trim());
      console.error("راهنمایی: لاگ بالا را ببینید؛ بکاپِ قبلی دست‌نخورده است.");
      process.exit(1);
    }
    const lines = (res.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const l of lines.slice(-5)) console.log(`prisma: ${l}`);
  } else {
    legacyFlow();
  }

  // — تایید نهایی: دیتابیس باید دقیقاً با schema مطابق باشد —
  if (driftScript() !== null) {
    fail("پس از مهاجرت هنوز اختلاف ساختاری با schema باقی مانده است!");
  }
  console.log(
    "✔ مهاجرت کامل شد — ساختار با schema مطابق است و داده‌ها حفظ شده‌اند."
  );
}

main();
