/**
 * مهاجرتِ غیرمخرب دیتابیس «آوید» — اجرا در سرویس migrate (compose):
 *   bun scripts/migrate.ts
 *
 * اصول این نسخه (prisma db push به‌کل از مسیر production حذف شده است):
 *
 *  ۱) نصب تازه (فایل دیتابیس بدون جدول):
 *       prisma migrate deploy → اجرای مرتبِ کل زنجیره‌ی migration ها.
 *
 *  ۲) دیتابیسِ موجود (هر وضعیتی): «آشتی‌سازی» (reconcile) —
 *       بکاپ آنلاین (VACUUM INTO)
 *       → شفا‌ی افزایشی ساختار: فقط «افزودنِ» جدول/ستون/ایندکس جاافتاده
 *         (همان سازوکار بوتِ اپ؛ هرگز چیزی حذف/تغییر نمی‌دهد)
 *       → بازپخشِ جمله‌به‌جمله‌ی مهاجرت‌هایِ «ثبت‌نشده» با تحملِ خطای
 *         «هم‌اکنون موجود»: جمله‌ای که با «duplicate column/table/index»
 *         رد شود یعنی اثرش از قبل در دیتابیس هست و بی‌خطر رد می‌شود
 *         (ریشه‌ی خطای معروف «duplicate column zarinpalCode»: ساختار
 *         دیتابیس‌های production گاهی جلوتر از تاریخچه‌ی Prisma بود)
 *       → ثبت مهاجرت در تاریخچه (prisma migrate resolve --applied)
 *       → تایید نهایی: «بعد از آشتی‌سازی» هیچ اختلاف ساختاری با schema
 *         نباشد و شمارش سطرهای جدول‌های موجود تغییر نکرده باشد.
 *
 *     هر خطای «غیر از هم‌اکنون‌موجود» → دیتابیس عیناً از بکاپ بازگردانده
 *     می‌شود و مهاجرت با کد ۱ متوقف می‌شود (بدون تغییرِ نیمه‌کاره).
 *     اگر در پایان اختلاف ساختاری باقی بماند، اسکریپتِ اختلاف چاپ و
 *     دیتابیس بازگردانده می‌شود — یعنی باید migration جدیدی زنجیره را
 *     کامل کند؛ هیچ تغییری خارج از فایل‌های migration اعمال نمی‌شود.
 */
import { spawnSync } from "node:child_process";
import { Database } from "bun:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { sqliteRows } from "./sqlite-query";
import { ensureSchema } from "./ensure-schema";
import { SITE_TEXT_KEY_ALIASES } from "./site-text-registry";

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

/** اسکریپتِ اختلاف «دیتابیس فعلی → schema هدف»؛ null یعنی بدون اختلاف */
function driftScript(): string | null {
  const res = prisma([
    "migrate",
    "diff",
    "--from-url",
    DB_URL,
    "--to-schema-datamodel",
    SCHEMA_PATH,
    "--script",
  ]);
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
  const rows = sqliteRows<{ name: string }>(
    db, "SELECT name FROM sqlite_master WHERE type='table'"
  );
  return rows
    .map((r) => r.name)
    .filter((n) => !n.startsWith("sqlite_") && n !== "_prisma_migrations");
}

/** شمارش سطرهای هر جدول — برای اثبات حفظ داده */
function tableCounts(db: Database): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of appTables(db)) {
    try {
      out[t] = sqliteRows<{ c: number }>(
        db, `SELECT COUNT(*) AS c FROM "${t}"`
      )[0].c;
    } catch {
      out[t] = -1;
    }
  }
  return out;
}

/**
 * مهاجرت‌های «با موفقیت ثبت‌شده» در تاریخچه‌ی Prisma —
 * مهاجرتِ نشسته یا شکست‌خورده (بدون finished_at یا rollback‌شده) جزو
 * «ثبت‌نشده» حساب می‌شود و بازپخش می‌شود.
 */
function doneMigrationNames(): Set<string> {
  try {
    const probe = new Database(DB_PATH, { readonly: true });
    try {
      const rows = sqliteRows<{ migration_name: string }>(
        probe,
        "SELECT migration_name FROM _prisma_migrations " +
          "WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"
      );
      return new Set(rows.map((r) => r.migration_name));
    } finally {
      probe.close(true);
    }
  } catch {
    return new Set<string>();
  }
}

/** جدول تاریخچه‌ی Prisma را در صورت نبود می‌سازد (پیش از ثبت نتیجه) */
function ensureHistoryTable(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" DATETIME,
    "migration_name" VARCHAR(255),
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`);
}

/** بکاپ آنلاین و سازگار — VACUUM INTO (بدون توقف اپ) */
function backupDb(dest: string): void {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  } finally {
    db.close(true);
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

/** گزینش جملات SQL از فایل migration (خطوط کامنت/خالی حذف می‌شوند) */
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

/**
 * آیا خطای sqlite یعنی «اثر این جمله از قبل در دیتابیس هست»؟
 *  • duplicate column name: X  → ستون X هم‌اکنون موجود است
 *  • table X already exists    → جدول X هم‌اکنون موجود است
 *  • index X already exists    → ایندکس X هم‌اکنون موجود است
 * این جمله‌ها (و فقط همین‌ها) بی‌خطر رد می‌شوند؛ تایید نهاییِ ساختار در
 * پایان آشتی‌سازی انجام می‌شود.
 */
function isAlreadyAppliedError(message: string): boolean {
  return /duplicate column name|already exists/i.test(message);
}

function fail(msg: string): never {
  console.error(`migrate: ${msg}`);
  process.exit(1);
}

/** بازگردانی از بکاپ + خروج با کد ۱ (پیام یکدست برای همه مسیرهای شکست) */
function abortWithRestore(
  backup: string,
  reason: string,
  detail?: string
): never {
  console.error(`migrate: ${reason} — بازیابی از بکاپ …`);
  if (detail) console.error(detail.split("\n").slice(-14).join("\n"));
  try {
    restoreBackup(backup);
    console.error(`✔ دیتابیس عیناً از بکاپ بازگردانده شد (${backup}).`);
  } catch (error) {
    console.error(
      `migrate: بازیابی از بکاپ ناموفق بود! فایل بکاپ: ${backup} — ${(error as Error).message}`
    );
  }
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  حفاظت از متن‌های ویرایشگر مدادی (SiteText) در طول آپدیت              */
/* ------------------------------------------------------------------ */

/** یک ردیف خام SiteText — updatedAt به‌صورت epoch-millis عددی ذخیره می‌شود */
interface SiteTextRawRow {
  key: string;
  text: string | null;
  color: string | null;
  fontKey: string | null;
  fontSize: number | null;
  hidden: number;
  updatedAt: number;
}

/**
 * تصویر لحظه‌ای ردیف‌های SiteText — «اثبات ماندگاری» متن‌های سفارشی:
 * آپدیت هرگز نباید متن/رنگ/فونت/اندازه/مخفی‌بودن ویرایش‌های مدیر را
 * بازنویسی یا حذف کند؛ بعد از مهاجرت‌ها همین تصویر دوباره خوانده و
 * مقایسه می‌شود و کوچک‌ترین اختلاف = شکست آپدیت + بازگردانی از بکاپ.
 */
function siteTextSnapshot(dbPath: string): SiteTextRawRow[] {
  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      return sqliteRows<SiteTextRawRow>(
        db,
        "SELECT key, text, color, fontKey, fontSize, hidden, updatedAt " +
          "FROM SiteText ORDER BY key"
      );
    } finally {
      db.close(true);
    }
  } catch {
    // جدول SiteText هنوز وجود ندارد — تصویری خالی
    return [];
  }
}

/** ردیف‌های یکسان؟ (ترتیبِ key تضمین شده — مقایسه سطر‌به‌سطر) */
function sameSiteTextSnapshot(
  a: SiteTextRawRow[],
  b: SiteTextRawRow[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.key !== y.key ||
      x.text !== y.text ||
      x.color !== y.color ||
      x.fontKey !== y.fontKey ||
      Number(x.fontSize) !== Number(y.fontSize) ||
      Number(x.hidden) !== Number(y.hidden) ||
      Number(x.updatedAt) !== Number(y.updatedAt)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * انتقال رکوردهای SiteText با کلید منسوخ به کلید جاری (طبق
 * SITE_TEXT_KEY_ALIASES در scripts/site-text-registry.ts):
 *   • فقط رکورد قدیمی موجود است → rename به کلید جدید؛
 *   • هر دو موجود → «آخرین ویرایش مدیر» (updatedAt بزرگ‌تر) برنده و
 *     رکورد دیگر حذف می‌شود.
 * امروزه فهرست مستعارها خالی است (کلیدها در طول تاریخ فقط «افزایشی»
 * بوده‌اند) — این گام بنابراین no-op و فقط سازوکارِ آینده است.
 */
function applySiteTextKeyAliases(dbPath: string): {
  renamed: string[];
  mergedKeep: string[];
  removed: string[];
} {
  const result = {
    renamed: [] as string[],
    mergedKeep: [] as string[],
    removed: [] as string[],
  };
  const aliases = Object.entries(SITE_TEXT_KEY_ALIASES);
  if (aliases.length === 0 || !existsSync(dbPath)) return result;

  const db = new Database(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("BEGIN");
    for (const [oldKey, newKey] of aliases) {
      if (oldKey === newKey) continue;
      const oldRow = sqliteRows<SiteTextRawRow>(
        db,
        "SELECT key, text, color, fontKey, fontSize, hidden, updatedAt " +
          "FROM SiteText WHERE key = ?",
        oldKey
      )[0];
      if (!oldRow) continue;
      const newRow = sqliteRows<{ key: string; updatedAt: number }>(
        db, "SELECT key, updatedAt FROM SiteText WHERE key = ?", newKey
      )[0];
      if (!newRow) {
        // فقط رکورد قدیمی موجود است → انتقال ساده به کلید جاری
        db.run("UPDATE SiteText SET key = ? WHERE key = ?", [newKey, oldKey]);
        result.renamed.push(`${oldKey} → ${newKey}`);
      } else if (Number(oldRow.updatedAt) > Number(newRow.updatedAt)) {
        // هر دو موجود؛ ویرایشِ کلید قدیمی جدیدتر است → محتوایش برنده می‌شود
        // و روی رکوردِ کلید جاری می‌نشیند؛ رکورد قدیمی حذف می‌شود.
        db.run(
          "UPDATE SiteText SET text = ?, color = ?, fontKey = ?, fontSize = ?, " +
            "hidden = ?, updatedAt = ? WHERE key = ?",
          [
            oldRow.text,
            oldRow.color,
            oldRow.fontKey,
            oldRow.fontSize,
            Number(oldRow.hidden),
            Number(oldRow.updatedAt),
            newKey,
          ]
        );
        db.run("DELETE FROM SiteText WHERE key = ?", [oldKey]);
        result.mergedKeep.push(`${oldKey} (آخرین ویرایش) → ${newKey}`);
        result.removed.push(oldKey);
      } else {
        // هر دو موجود؛ ویرایشِ کلید جاری جدیدتر/برابر است → همان برنده است
        db.run("DELETE FROM SiteText WHERE key = ?", [oldKey]);
        result.mergedKeep.push(`${newKey} (آخرین ویرایش) نگه داشته شد`);
        result.removed.push(oldKey);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* بی‌صدا */
    }
    throw error;
  } finally {
    db.close(true);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  حالت ۱: نصب تازه — prisma migrate deploy                            */
/* ------------------------------------------------------------------ */
function deployFlow(): void {
  const res = prisma(["migrate", "deploy"]);
  if (res.status !== 0) {
    console.error("migrate: prisma migrate deploy ناموفق بود:");
    console.error((res.stderr || res.stdout).trim());
    console.error("راهنمایی: لاگ بالا را ببینید؛ دیتابیس تازه است و بکاپ لازم نیست.");
    process.exit(1);
  }
  for (const l of (res.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-5)) {
    console.log(`prisma: ${l}`);
  }
}

/* ------------------------------------------------------------------ */
/*  حالت ۲: دیتابیس موجود — آشتی‌سازی مهاجرت‌ها (بدون db push)          */
/* ------------------------------------------------------------------ */
async function reconcileFlow(): Promise<void> {
  const bdir = backupDir();
  mkdirSync(bdir, { recursive: true });
  const backup = join(bdir, `avid-before-migrate-${stamp()}.db`);

  console.log("— دیتابیس موجود شناسایی شد.");
  console.log("— گام ۱: بکاپ پیش از هر تغییری …");
  backupDb(backup);
  console.log(`✔ بکاپ ساخته شد: ${backup}`);

  const before = (() => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      return tableCounts(db);
    } finally {
      db.close(true);
    }
  })();

  // — تصویر لحظه‌ای متن‌های ویرایشگر مدادی — برای اثبات ماندگاری —
  const siteTextBefore = siteTextSnapshot(DB_PATH);

  // — گام ۲: شفا‌ی افزایشی ساختار (فقط افزودنِ جدول/ستون/ایندکس) —
  // این گام تضمین می‌کند ارجاع‌های ستونیِ مهاجرت‌های قدیمی (مثل
  // INSERT…SELECT بازسازی SiteSettings) روی دیتابیس‌های خیلی قدیمی هم
  // معتبرند؛ همان سازوکار بوتِ اپ و هرگز مخرب نیست.
  console.log("— گام ۲: شفا‌ی افزایشی ساختار (جدول/ستون/ایندکس جاافتاده) …");
  try {
    const heal = await ensureSchema(DB_PATH);
    const made =
      heal.createdTables.length +
      heal.addedColumns.length +
      heal.createdIndexes.length;
    if (made > 0) {
      console.log(
        `✔ ${heal.createdTables.length} جدول، ${heal.addedColumns.length} ستون و ${heal.createdIndexes.length} ایندکس جاافتاده افزوده شد.`
      );
    } else {
      console.log("— چیزی برای افزودن نبود (ساختار افزایشیِ کامل).");
    }
    if (heal.warnings.length > 0) {
      console.warn(
        `migrate: ${heal.warnings.length} هشدار در خودترمیمی — ${heal.warnings.slice(0, 3).join(" | ")}`
      );
    }
  } catch (error) {
    console.warn(
      `migrate: خودترمیمی افزایشی رد شد — ${(error as Error | undefined)?.message ?? error}`
    );
  }

  // — گام ۳: بازپخش مهاجرت‌های ثبت‌نشده با تحملِ «هم‌اکنون موجود» —
  const done = doneMigrationNames();
  const pending = migrationNames().filter((n) => !done.has(n));
  if (pending.length === 0) {
    console.log("— همه‌ی مهاجرت‌ها قبلاً در تاریخچه ثبت شده‌اند.");
  } else {
    console.log(
      `— گام ۳: آشتی‌سازی ${pending.length} مهاجرتِ ثبت‌نشده (${pending.join("، ")}) …`
    );
    for (const name of pending) {
      let skipped = 0;
      try {
        const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
        const statements = parseStatements(readFileSync(sqlPath, "utf8"));
        const db = new Database(DB_PATH);
        try {
          db.exec("PRAGMA busy_timeout = 5000");
          ensureHistoryTable(db);
          for (const stmt of statements) {
            try {
              db.exec(stmt);
            } catch (error) {
              const message = (error as Error | undefined)?.message ?? String(error);
              if (!isAlreadyAppliedError(message)) {
                throw new Error(`جمله:\n${stmt.slice(0, 400)}\nخطا: ${message}`);
              }
              skipped += 1;
            }
          }
        } finally {
          // All prepared statements are finalized before Prisma opens a writer.
          db.close(true);
        }
      } catch (error) {
        abortWithRestore(backup, `اجرای مهاجرت «${name}» ناموفق بود`, String(error));
      }

      const res = prisma(["migrate", "resolve", "--applied", name]);
      if (res.status !== 0) {
        abortWithRestore(
          backup,
          `ثبت «${name}» در تاریخچه ناموفق بود`,
          (res.stderr || res.stdout).trim()
        );
      }
      console.log(
        `✔ تاریخچه‌ی Prisma: «${name}» به‌عنوان اعمال‌شده ثبت شد${skipped > 0 ? ` (${skipped} جمله‌ی هم‌اکنون‌موجود رد شد)` : ""}.`
      );
    }
  }

  // — گام ۴: تایید نهاییِ ساختار — هیچ اختلافی با schema نباید بماند —
  const drift = driftScript();
  if (drift !== null) {
    abortWithRestore(
      backup,
      "پس از آشتی‌سازی هنوز اختلاف ساختاری با schema باقی است",
      `اسکریپتِ اختلاف (برای написانِ migration جدید):\n${drift.slice(0, 2000)}`
    );
  }
  console.log("✔ ساختار دیتابیس دقیقاً با schema مطابق است.");

  // — گام ۴.۵: اثبات ماندگاری متن‌های سفارشی (SiteText) —
  // هیچ مهاجرت/بازیابی/شفایی نباید متن/رنگ/فونت/اندازه/مخفی‌بودنِ
  // ویرایش‌های مدیر را تغییر داده باشد؛ کوچک‌ترین اختلاف = شکستِ
  // آپدیت + بازگردانی کامل از بکاپ. (پیش‌فرض‌ها فقط در «کد» زندگی
  // می‌کنند؛ جدول SiteText فقط ویرایش‌های مدیر را نگه می‌دارد و
  // بازگردانی به پیش‌فرض فقط با دکمه‌ی خودِ مدیر انجام می‌شود.)
  const siteTextAfter = siteTextSnapshot(DB_PATH);
  if (!sameSiteTextSnapshot(siteTextBefore, siteTextAfter)) {
    const changed = siteTextAfter
      .filter(
        (r) =>
          !siteTextBefore.some(
            (b) =>
              b.key === r.key &&
              b.text === r.text &&
              b.color === r.color &&
              b.fontKey === r.fontKey &&
              Number(b.fontSize) === Number(r.fontSize) &&
              Number(b.hidden) === Number(r.hidden)
          )
      )
      .map((r) => r.key)
      .slice(0, 8);
    const missing = siteTextBefore
      .filter(
        (b) => !siteTextAfter.some((r) => r.key === b.key)
      )
      .map((r) => r.key)
      .slice(0, 8);
    abortWithRestore(
      backup,
      "ردیف‌های SiteText (متن‌های ویرایشگر مدادی) در طول مهاجرت تغییر کرده‌اند — " +
        "آپدیت هرگز نباید متن سفارشی مدیر را بازنویسی یا حذف کند",
      [
        changed.length > 0 ? `کلیدهای تغییر‌یافته: ${changed.join("، ")}` : "",
        missing.length > 0 ? `کلیدهای حذف‌شده: ${missing.join("، ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  console.log(
    `✔ متن‌های ویرایشگر مدادی دست‌نخورده ماندند — ${siteTextAfter.length} رکورد SiteText بدون تغییر.`
  );

  // — گام ۵: تایید حفظ داده — شمارش سطرهای جدول‌های موجود تغییر نکرده —
  const after = (() => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      return tableCounts(db);
    } finally {
      db.close(true);
    }
  })();
  const mismatch = Object.keys(before).filter(
    (t) => after[t] !== undefined && after[t] !== before[t]
  );
  if (mismatch.length > 0) {
    abortWithRestore(
      backup,
      `شمارش سطرهای این جدول‌ها تغییر کرده است: ${mismatch.join(", ")}`
    );
  }
  console.log(
    `✔ داده‌ها حفظ شدند — ${Object.keys(before).length} جدول موجود، سطرها بدون تغییر.`
  );

  // — گام ۶: انتقال کلیدهای منسوخ SiteText به کلیدهای جاری —
  // سازوکارِ آینده: امروزه فهرست مستعارها خالی است (کلیدها در طول
  // تاریخ فقط «افزایشی» بوده‌اند) و این گام no-op است؛ اگر روزی کلیدی
  // تغییر نام داد، رکورد قبلی به‌طور خودکار منتقل می‌شود و در وجود
  // هر دو، «آخرین ویرایش مدیر» (updatedAt بزرگ‌تر) برنده می‌ماند.
  // (عمداً بعد از گام ۵ اجرا می‌شود تا حذفِ آگاهانه‌ی رکوردهای تکراری
  // توسط گارد شمارش سطر، «شکست» تلقی نشود.)
  let aliases: ReturnType<typeof applySiteTextKeyAliases>;
  try {
    aliases = applySiteTextKeyAliases(DB_PATH);
  } catch (error) {
    abortWithRestore(
      backup,
      "انتقال کلیدهای منسوخ SiteText ناموفق بود",
      String(error)
    );
  }
  if (
    aliases.renamed.length > 0 ||
    aliases.mergedKeep.length > 0
  ) {
    for (const r of aliases.renamed) {
      console.log(`✔ SiteText: انتقال کلید ${r}`);
    }
    for (const m of aliases.mergedKeep) {
      console.log(`✔ SiteText: ادغام — ${m}`);
    }
    for (const d of aliases.removed) {
      console.log(
        `— SiteText: رکورد تکراری «${d}» حذف شد (آخرین ویرایش برنده شد).`
      );
    }
  } else {
    console.log(
      "✔ کلیدهای SiteText بین نسخه‌ها ثابت‌اند — کلید منسوخی برای انتقال نبود."
    );
  }
}

/* ------------------------------------------------------------------ */
/*  انتخاب و اجرا                                                       */
/* ------------------------------------------------------------------ */
async function main(): Promise<void> {
  if (!existsSync(MIGRATIONS_DIR)) {
    fail("پوشه‌ی prisma/migrations پیدا نشد.");
  }
  if (!existsSync(dirname(DB_PATH))) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
  }

  // — نصب تازه از والی خالی: اگر فایل دیتابیس وجود ندارد، همین‌جا یک
  // فایل SQLiteِ «خالی» ساخته می‌شود تا موتور مهاجرت Prisma (Schema
  // engine) هرگز با «Schema engine error: unable to open database file»
  // رد نشود — همین راه‌حل روی VPS با «ساخت فایل خالی» تأیید شده بود
  // (مهاجرت دو بار با Schema engine error شکست خورد و با فایل خالی
  // موفق شد)؛ این‌جا خودکار انجام می‌شود تا نصب تازه‌ی Docker بدون
  // کار دستی بالا بیاید.
  // — گارد دسترسیِ نوشتاری هم همین‌جا اجرا می‌شود: فایل/پوشه باید برای
  // فرآیند فعلی (در Docker: کاربر bun) قابل نوشتن باشد؛ اگر والی
  // مالکِ درستی ندارد، به‌جای خطای مبهم «Schema engine error» پیامِ
  // روشن و راه‌حلِ دقیق چاپ می‌شود (چون هیچ‌چیز تغییر نکرده، امن است).
  try {
    if (!existsSync(DB_PATH)) {
      console.log(
        "migrate: فایل دیتابیس وجود ندارد — فایل SQLite خالی ساخته می‌شود …"
      );
      const db = new Database(DB_PATH);
      db.close(true);
    } else {
      const probe = new Database(DB_PATH);
      probe.close(true);
    }
  } catch (error) {
    fail(
      `فایل دیتابیس «${DB_PATH}» برای این فرآیند قابل بازکردنِ نوشتاری نیست ` +
        `(مالکیت والی Docker؟ — ${(error as Error | undefined)?.message ?? error}).\n` +
        `راه حل (اجرای یک‌باره به‌عنوان root برای اصلاح مالکیت والی‌ها):\n` +
        `  docker compose run --rm --user 0 migrate sh -c "chown -R bun:bun /app/data /app/backups"\n` +
        `سپس دوباره: docker compose up -d`
    );
  }

  console.log(`migrate: دیتابیس ${DB_PATH}`);

  // — طبقه‌بندی: دیتابیس تازه (بدون جدول اپ) یا موجود —
  let fresh = true;
  if (existsSync(DB_PATH)) {
    const probe = new Database(DB_PATH, { readonly: true });
    try {
      fresh = appTables(probe).length === 0;
    } finally {
      probe.close(true);
    }
  }

  console.log(`migrate: حالت = ${fresh ? "نصب تازه" : "آشتی‌سازی"}`);

  if (fresh) {
    deployFlow();
  } else {
    await reconcileFlow();
  }

  // — تایید نهایی: دیتابیس باید دقیقاً با schema مطابق باشد —
  if (driftScript() !== null) {
    fail("پس از مهاجرت هنوز اختلاف ساختاری با schema باقی مانده است!");
  }
  console.log(
    "✔ مهاجرت کامل شد — ساختار با schema مطابق است و داده‌ها حفظ شده‌اند."
  );
}

await main();
