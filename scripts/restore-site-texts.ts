/**
 * بازیابی «فقط متن‌های ویرایشگر مدادی» (SiteText) از یک فایل بکاپ دیتابیس —
 *
 *   bun scripts/restore-site-texts.ts <مسیر-فایل-بکاپ.db> [--dry-run]
 *
 * سناریو: بعد از یک آپدیت/اتفاق، متن‌های سفارشی به پیش‌فرض برگشته‌اند
 * (مثلاً والی دیتابیس نو شده)، ولی فایل بکاپ کامل (avid-….db — ساخته‌شده
 * با deploy/backup.sh یا گام بکاپِ خودِ migrate.ts) هنوز متن‌ها را دارد.
 *
 * روش بازیابی «جراحی» است — فقط رکوردهای SiteText:
 *   • جدول‌های دیگر (کاربران، دوره‌ها، ثبت‌نام‌ها، تنظیمات، …) هرگز
 *     لمس نمی‌شوند؛ بقیه‌ی داده‌های فعلی سایت دست‌نخورده می‌مانند.
 *   • برای هر کلید، «آخرین ویرایش مدیر» برنده است: رکوردی که updatedAt
 *     بزرگ‌تری دارد (مقایسه‌ی بکاپ با وضعیت فعلی) نگه داشته می‌شود؛
 *     یعنی ویرایش‌های جدیدترِ پس از بکاپ هم از بین نمی‌روند.
 *   • کلیدهای منسوخِ داخل بکاپ (طبق SITE_TEXT_KEY_ALIASES) قبل از ادغام
 *     به کلید جاری منتقل می‌شوند (مثل خودِ migrate.ts).
 *   • فیلدهای آینه در SiteSettings (اسلوگان/تماس فوتر/شمارنده‌ها) از
 *     رکوردهای «برنده» به‌روز می‌شوند تا صفحاتی که مستقیم از تنظیمات
 *     می‌خوانند هم درست نمایش بدهند — فقط با مقادیر غیرتهی، تا چیزی
 *     که مدیر بعداً عوض کرده بی‌دلیل بازنشانی نشود.
 *
 * در Docker (فایل بکاپ داخل والی avid_backups است):
 *   docker compose stop web chat
 *   docker compose run --rm migrate bun scripts/restore-site-texts.ts /app/backups/avid-YYYYMMDD-HHMMSS.db
 *   docker compose up -d
 *
 * با --dry-run فقط گزارشِ «چه اتفاقی می‌افتاد» چاپ می‌شود (بدون نوشتن).
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import {
  SITE_TEXT_KEY_ALIASES,
  SITE_TEXT_MIRROR_FIELDS,
  canonicalSiteTextKey,
} from "./site-text-registry";

interface SiteTextRawRow {
  key: string;
  text: string | null;
  color: string | null;
  fontKey: string | null;
  fontSize: number | null;
  hidden: number;
  updatedAt: number;
}

function resolveDbPath(): string {
  const env = process.env.DATABASE_URL?.trim();
  if (env) {
    const p = env.replace(/^file:/i, "").trim();
    if (p) return p.startsWith("/") ? p : join(process.cwd(), p);
  }
  return join(process.cwd(), "db", "custom.db");
}

function backupDir(): string {
  const env = process.env.BACKUP_DIR?.trim();
  if (env) return env;
  if (existsSync("/app/backups")) return "/app/backups";
  return join(dirname(resolveDbPath()), "backups");
}

function resolveBackupPath(raw: string): string {
  if (isAbsolute(raw) && existsSync(raw)) return raw;
  if (existsSync(raw)) return raw;
  const inBackups = join(backupDir(), raw);
  if (existsSync(inBackups)) return inBackups;
  const abs = join(process.cwd(), raw);
  if (existsSync(abs)) return abs;
  return raw; // برای پیام خطای بعدی
}

/** استخراج عدد از متن فارسی/انگلیسی — مثل parseSiteCounterNumber اپ */
function parseCounterNumber(text: string): number | null {
  const faToEn = text.replace(/[۰-۹]/g, (d) =>
    String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
  );
  const digits = faToEn.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n <= 100_000_000 ? n : null;
}

/** خواندن SiteText از یک فایل دیتابیس (فقط‌خواندنی) */
function readSiteText(dbPath: string): SiteTextRawRow[] | null {
  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      return db
        .query(
          "SELECT key, text, color, fontKey, fontSize, hidden, updatedAt " +
            "FROM SiteText ORDER BY key"
        )
        .all() as SiteTextRawRow[];
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * انتقال کلیدهای منسوخ بکاپ به کلیدهای جاری (در حافظه):
 * برای هر جفت (قدیمی، جاری): فقط قدیمی → نگاشت به جاری؛
 * هر دو → آخرین ویرایش (updatedAt بزرگ‌تر) برنده می‌شود.
 */
function foldAliases(rows: SiteTextRawRow[]): {
  folded: Map<string, SiteTextRawRow>;
  renames: string[];
} {
  const folded = new Map<string, SiteTextRawRow>();
  const renames: string[] = [];
  for (const row of rows) {
    const canonical = canonicalSiteTextKey(row.key);
    if (canonical !== row.key) {
      renames.push(`${row.key} → ${canonical}`);
    }
    const existing = folded.get(canonical);
    if (
      !existing ||
      Number(row.updatedAt) > Number(existing.updatedAt)
    ) {
      folded.set(canonical, { ...row, key: canonical });
    }
  }
  return { folded, renames };
}

/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const backupArg = args.filter((a) => a !== "--dry-run")[0];

if (!backupArg) {
  console.error(
    "استفاده: bun scripts/restore-site-texts.ts <مسیر-فایل-بکاپ.db> [--dry-run]\n" +
      "  فایل بکاپ کامل دیتابیس است (avid-YYYYMMDD-HHMMSS.db از deploy/backup.sh)\n" +
      "  در Docker کافی است نام فایل را بدهید (داخل والی backups جست‌وجو می‌شود)."
  );
  process.exit(1);
}

const LIVE_DB = resolveDbPath();
const BACKUP_DB = resolveBackupPath(backupArg);

if (!existsSync(BACKUP_DB)) {
  console.error(`restore-site-texts: فایل بکاپ پیدا نشد: «${BACKUP_DB}»`);
  process.exit(1);
}
if (!existsSync(LIVE_DB)) {
  console.error(
    `restore-site-texts: دیتابیس فعلی پیدا نشد: «${LIVE_DB}» — ابتدا سایت را بالا بیاورید (migrate).`
  );
  process.exit(1);
}

const backupRows = readSiteText(BACKUP_DB);
if (backupRows === null) {
  console.error(
    "restore-site-texts: جدول SiteText در فایل بکاپ خوانده نشد — فایل معتبر نیست."
  );
  process.exit(1);
}
const liveRows = readSiteText(LIVE_DB);
if (liveRows === null) {
  console.error(
    "restore-site-texts: جدول SiteText در دیتابیس فعلی خوانده نشد."
  );
  process.exit(1);
}

const { folded: backupByCanonical, renames } = foldAliases(backupRows);
const liveByKey = new Map(liveRows.map((r) => [r.key, r]));

type Action = "insert" | "overwrite" | "keep-current";
const plan: { key: string; action: Action; winner: "backup" | "current" }[] =
  [];
const appliedRows: SiteTextRawRow[] = [];

for (const [key, backupRow] of backupByCanonical) {
  const liveRow = liveByKey.get(key);
  if (!liveRow) {
    plan.push({ key, action: "insert", winner: "backup" });
    appliedRows.push(backupRow);
  } else if (Number(backupRow.updatedAt) > Number(liveRow.updatedAt)) {
    plan.push({ key, action: "overwrite", winner: "backup" });
    appliedRows.push(backupRow);
  } else {
    plan.push({ key, action: "keep-current", winner: "current" });
  }
}

console.log(`restore-site-texts: بکاپ «${BACKUP_DB}»`);
console.log(
  `— ${backupRows.length} رکورد در بکاپ، ${liveRows.length} رکورد در دیتابیس فعلی.`
);
for (const r of renames) {
  console.log(`— انتقال کلید منسوخ بکاپ: ${r}`);
}
for (const p of plan) {
  if (p.action === "insert") {
    console.log(`＋ «${p.key}» از بکاپ بازمی‌گردد (در دیتابیس فعلی نبود).`);
  } else if (p.action === "overwrite") {
    console.log(
      `↻ «${p.key}» با ویرایشِ بکاپ به‌روز می‌شود (بکاپ جدیدتر از مقدار فعلی است).`
    );
  } else {
    console.log(
      `＝ «${p.key}» دست‌نخورده می‌ماند (ویرایش فعلی جدیدتر یا برابر است).`
    );
  }
}
const untouched = liveRows.filter(
  (r) => !backupByCanonical.has(r.key)
).length;
if (untouched > 0) {
  console.log(
    `＋ ${untouched} رکوردِ فقط-در-فعلی (ویرایش‌های بعد از بکاپ) حفظ می‌شوند.`
  );
}
console.log(
  "— هیچ جدولی غیر از SiteText (و فیلدهای آینه‌ی SiteSettings) تغییر نمی‌کند."
);

if (dryRun) {
  console.log("✔ حالت dry-run — هیچ چیزی نوشته نشد.");
  process.exit(0);
}

/* — اجرا — */
const db = new Database(LIVE_DB);
try {
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("BEGIN");

  for (const row of appliedRows) {
    db.run(
      "INSERT INTO SiteText (key, text, color, fontKey, fontSize, hidden, updatedAt) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET " +
        "text = excluded.text, color = excluded.color, fontKey = excluded.fontKey, " +
        "fontSize = excluded.fontSize, hidden = excluded.hidden, updatedAt = excluded.updatedAt",
      [
        row.key,
        row.text,
        row.color,
        row.fontKey,
        row.fontSize,
        Number(row.hidden),
        Number(row.updatedAt),
      ]
    );
  }

  // — فیلدهای آینه از رکوردهای برنده (فقط مقادیر غیرتهی) —
  const settingsExists = (() => {
    const row = db
      .query("SELECT id FROM SiteSettings WHERE id = 'main'")
      .get() as { id: string } | null;
    return row !== null;
  })();
  let mirrored = 0;
  if (settingsExists) {
    for (const row of appliedRows) {
      const mirror = SITE_TEXT_MIRROR_FIELDS[row.key];
      if (!mirror) continue;
      const sets: string[] = [];
      const params: (string | number)[] = [];
      if (mirror.settingsField && row.text) {
        sets.push(`"${mirror.settingsField}" = ?`);
        params.push(row.text);
      }
      if (mirror.fontField && row.fontKey) {
        sets.push(`"${mirror.fontField}" = ?`);
        params.push(row.fontKey);
      }
      if (mirror.numberField && row.text) {
        const n = parseCounterNumber(row.text);
        if (n !== null) {
          sets.push(`"${mirror.numberField}" = ?`);
          params.push(n);
        }
      }
      if (sets.length === 0) continue;
      db.run(
        `UPDATE SiteSettings SET ${sets.join(", ")} WHERE id = 'main'`,
        params
      );
      mirrored += 1;
    }
  } else {
    console.warn(
      "— رکورد SiteSettings موجود نیست — فیلدهای آینه به‌روز نشدند (بی‌خطر)."
    );
  }

  db.exec("COMMIT");

  const inserted = plan.filter((p) => p.action === "insert").length;
  const overwritten = plan.filter((p) => p.action === "overwrite").length;
  const kept = plan.filter((p) => p.action === "keep-current").length;
  console.log(
    `✔ بازیابی متن‌های ویرایشگر مدادی کامل شد — ${inserted} بازگردانی، ` +
      `${overwritten} به‌روز، ${kept} ویرایش جدیدتر حفظ شد` +
      (mirrored > 0 ? `؛ ${mirrored} فیلد آینه همگام شد.` : ".")
  );
  if (Object.keys(SITE_TEXT_KEY_ALIASES).length === 0 && renames.length === 0) {
    console.log(
      "— کلیدهای SiteText بین نسخه‌ها ثابت‌اند؛ کلید منسوخی برای انتقال نبود."
    );
  }
  console.log("— بقیه‌ی داده‌های سایت (کاربران/دوره‌ها/ثبت‌نام‌ها/…) دست‌نخورده ماند.");
} catch (error) {
  try {
    db.exec("ROLLBACK");
  } catch {
    /* بی‌صدا */
  }
  console.error(`restore-site-texts: خطا — ${(error as Error)?.message ?? error}`);
  process.exit(1);
} finally {
  db.close();
}
