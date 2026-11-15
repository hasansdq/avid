import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Database as BunSqliteDatabase } from "bun:sqlite";

/**
 * خودترمیمیِ افزایشی اسکیمای دیتابیس «آوید» — اجرا در بوت سرور
 * (src/instrumentation.ts) و هدف: رفع خطای معروف پنل مدیر روی VPS.
 *
 * ریشه‌ی مشکل: مهاجرت 0_init در گذر زمان «درجا» ویرایش شده بود؛
 * دیتابیس‌های VPS که نسخه‌ی قدیمی 0_init را اعمال کرده بودند، ستون‌ها/
 * جدول‌های تازه را هرگز نگرفتند و API های ماژول‌های «تنظیمات سایت»،
 * «ویرایش هدر و فوتر» و «فونت‌ها» با خطای ۵۰۰ (و توست «خطای ناشناخته»)
 * شکست می‌خوردند.
 *
 * درمان: در هر بوتِ سرور، DDL کامل اسکیمای جاری (prisma/baseline.sql —
 * تولیدشده با prisma migrate diff --from-empty) به‌صورت «فقط افزایشی»
 * با ساختار واقعی دیتابیس تطبیق می‌یابد:
 *   • جدول نیست → CREATE کامل
 *   • جدول هست ولی ستونی ندارد → ALTER TABLE … ADD COLUMN (با پیش‌فرض ثابت)
 *   • ایندکس نیست → CREATE [UNIQUE] INDEX
 * هرگز چیزی حذف یا تغییر نمی‌کند؛ هر جمله خطادار فقط ثبت و رد می‌شود.
 * بنابراین اجرای مکررش بی‌اثر (idempotent) و برای داده‌ها بی‌خطر است.
 */

/**
 * بارگذاری bun:sqlite بدون تحلیل ایستای باندلر —
 * شناسه‌ی ماژول در متغیر است تا webpack/turbopack آن را bundle نکنند
 * (زمان اجرای node آن را بی‌صدا رد می‌کند؛ اجرای bun همیشه در دسترس است).
 */
async function loadSqlite(): Promise<
  typeof BunSqliteDatabase | null
> {
  try {
    const specifier = "bun:sqlite";
    const mod = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ specifier
    )) as typeof import("bun:sqlite");
    return mod.Database;
  } catch {
    return null;
  }
}

/** مسیر فایل دیتابیس — پارامتر صریح یا DATABASE_URL یا پیش‌فرض db/custom.db */
function resolveDbPath(explicit?: string): string {
  if (explicit) return explicit;
  const env = process.env.DATABASE_URL?.trim();
  if (env) {
    const p = env.replace(/^file:/i, "").trim();
    if (p) return p.startsWith("/") ? p : join(process.cwd(), p);
  }
  return join(process.cwd(), "db", "custom.db");
}

/** مسیر فایل DDL پایه (اسکیمای کامل جاری) */
function resolveBaselinePath(): string | null {
  const candidates = [
    join(process.cwd(), "prisma", "baseline.sql"),
    // استقرار standalone: cwd = /app
    "/app/prisma/baseline.sql",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

/** تقسیم SQL به جمله‌ها — هر جمله با «؛» در انتهای خط تمام می‌شود */
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

interface ColumnDef {
  name: string;
  /** عبارت کامل بعد از نام ستون — نوع + قیدها */
  def: string;
  type: string;
  unique: boolean;
}

/**
 * تجزیه‌ی بدنه‌ی CREATE TABLE به ستون‌ها (قیدهای سطح-جدول نادیده گرفته می‌شوند؛
 * جداکننده‌ها فقط کامای بیرون رشته‌ها/پرانتزها معتبرند).
 */
function parseColumns(body: string): ColumnDef[] {
  // — تقسیم سطح-بالا روی کاماها —
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  let inString = false;
  for (const ch of body) {
    if (ch === "'" && depth === 0) inString = !inString;
    if (!inString) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        parts.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  const cols: ColumnDef[] = [];
  for (let raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    // قیدهای سطح-جدول (کلید خارجی/یکتایی جمعی/کلید اصلی)
    if (/^(CONSTRAINT|FOREIGN\s+KEY|PRIMARY\s+KEY|UNIQUE|CHECK)\b/i.test(t)) {
      continue;
    }
    const m = /^"([^"]+)"\s+([A-Za-z]+)\s*([\s\S]*)$/.exec(t);
    if (!m) continue;
    const [, name, type, restRaw] = m;
    let rest = (restRaw ?? "").trim();
    // قیدهای درون‌ستونی که ALTER پشتیبانی نمی‌کند حذف و جداگانه ساخته می‌شوند
    let unique = false;
    if (/\bUNIQUE\b/i.test(rest)) {
      unique = true;
      rest = rest.replace(/\s*\bUNIQUE\b/i, "").trim();
    }
    // کلید اصلیِ ستونی (id) — روی جدولِ موجود همیشه هست؛ نادیده
    rest = rest.replace(/\s*\bPRIMARY\s+KEY\b/i, "").trim();
    cols.push({ name, def: `${type} ${rest}`.trim(), type, unique });
  }
  return cols;
}

/** پیش‌فرض ثابتِ SQLite-پسند برای ALTER ADD COLUMN */
function constantDefaultFor(type: string): string {
  switch (type.toUpperCase()) {
    case "INTEGER":
    case "REAL":
    case "BOOLEAN":
    case "NUMERIC":
      return "DEFAULT 0";
    case "DATETIME":
      // ثابتِ مجاز — SQLite در ADD COLUMN اجازه‌ی CURRENT_TIMESTAMP نمی‌دهد؛
      // خودِ Prisma هنگام نوشتن مقدار را می‌گذارد.
      return "DEFAULT '2000-01-01 00:00:00'";
    default:
      return "DEFAULT ''";
  }
}

/** تبدیل تعریف ستون به عبارتِ مجاز ALTER ADD (پیش‌فرض باید ثابت باشد) */
function alterClause(def: string): string {
  let out = def.replace(/\bDEFAULT\s+CURRENT_TIMESTAMP\b/i, "").trim();
  out = out.replace(/\bDEFAULT\s+true\b/ig, "DEFAULT 1");
  out = out.replace(/\bDEFAULT\s+false\b/ig, "DEFAULT 0");
  const hasDefault = /\bDEFAULT\b/i.test(out);
  const notNull = /\bNOT\s+NULL\b/i.test(out);
  if (notNull && !hasDefault) {
    const type = out.split(/\s+/)[0] ?? "TEXT";
    out = `${out} ${constantDefaultFor(type)}`.trim();
  }
  return out;
}

interface HealReport {
  createdTables: string[];
  addedColumns: string[];
  createdIndexes: string[];
  warnings: string[];
}

/** اجرای خودترمیمی — بدون پرتاب (هر خطا فقط در گزارش) */
export async function ensureSchema(
  explicitDbPath?: string
): Promise<HealReport> {
  const report: HealReport = {
    createdTables: [],
    addedColumns: [],
    createdIndexes: [],
    warnings: [],
  };

  // — فقط زیر زمان اجرای bun:sqlite (server: bun server.js / bun next dev) —
  const DatabaseCtor = await loadSqlite();
  if (!DatabaseCtor) {
    report.warnings.push(
      "runtime بدون bun:sqlite است — خودترمیمی اسکیما رد شد."
    );
    return report;
  }

  const baselinePath = resolveBaselinePath();
  if (!baselinePath) {
    report.warnings.push("prisma/baseline.sql پیدا نشد — خودترمیمی رد شد.");
    return report;
  }
  const dbPath = resolveDbPath(explicitDbPath);
  if (!existsSync(dbPath)) {
    // دیتابیس نیست — ساختش کارِ migrate service است؛ اینجا فقط رد می‌شود
    report.warnings.push("فایل دیتابیس موجود نیست — خودترمیمی رد شد.");
    return report;
  }

  const statements = parseStatements(readFileSync(baselinePath, "utf8"));
  const db = new DatabaseCtor(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 15000");

    const tableNames = () =>
      new Set(
        (
          db
            .query("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as Array<{ name: string }>
        ).map((r) => r.name)
      );
    const indexNames = () =>
      new Set(
        (
          db
            .query("SELECT name FROM sqlite_master WHERE type='index'")
            .all() as Array<{ name: string }>
        ).map((r) => r.name)
      );
    const columnsOf = (table: string) =>
      new Set(
        (
          db.query(`PRAGMA table_info("${table}")`).all() as Array<{
            name: string;
          }>
        ).map((r) => r.name)
      );
    const execSafe = (sql: string): boolean => {
      try {
        db.exec(sql);
        return true;
      } catch (error) {
        report.warnings.push(
          `${(error as Error)?.message ?? String(error)} :: ${sql
            .split("\n")
            .slice(0, 2)
            .join(" ")
            .slice(0, 140)}`
        );
        return false;
      }
    };

    let tables = tableNames();
    let indexes = indexNames();

    // — گام ۱: جدول‌ها/ستون‌ها —
    for (const stmt of statements) {
      const createMatch =
        /^CREATE TABLE "([^"]+)"\s*\(([\s\S]*)\)\s*;?$/m.exec(stmt);
      if (!createMatch) continue;
      const [, table, body] = createMatch;
      if (!tables.has(table)) {
        if (execSafe(stmt)) {
          tables = tableNames();
          report.createdTables.push(table);
        }
        continue;
      }
      const existing = columnsOf(table);
      for (const col of parseColumns(body)) {
        if (existing.has(col.name)) continue;
        const clause = alterClause(col.def);
        const alterSql = `ALTER TABLE "${table}" ADD COLUMN "${col.name}" ${clause};`;
        if (execSafe(alterSql)) {
          report.addedColumns.push(`${table}.${col.name}`);
          // ایندکس یکتای درون‌ستونی که جدا افتاد
          if (col.unique) {
            const idxName = `${table}_${col.name}_key`;
            if (!indexes.has(idxName)) {
              if (
                execSafe(
                  `CREATE UNIQUE INDEX "${idxName}" ON "${table}"("${col.name}");`
                )
              ) {
                indexes = indexNames();
                report.createdIndexes.push(idxName);
              }
            }
          }
        }
      }
    }

    // — گام ۲: ایندکس‌ها —
    indexes = indexNames();
    for (const stmt of statements) {
      const idxMatch =
        /^CREATE (UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"\(([^)]*)\)\s*;?$/m.exec(
          stmt
        );
      if (!idxMatch) continue;
      const [, , idxName] = idxMatch;
      if (indexes.has(idxName)) continue;
      if (execSafe(stmt)) {
        indexes = indexNames();
        report.createdIndexes.push(idxName);
      }
    }
  } finally {
    db.close();
  }

  return report;
}

/** اجرای یک‌باره در هر بوتِ سرور — خلاصه‌ی فارسی در لاگ */
export async function ensureSchemaOnBoot(): Promise<void> {
  const g = globalThis as unknown as {
    __avidSchemaHealed?: boolean;
  };
  if (g.__avidSchemaHealed) return;
  g.__avidSchemaHealed = true;

  try {
    const report = await ensureSchema();
    const made =
      report.createdTables.length +
      report.addedColumns.length +
      report.createdIndexes.length;
    if (made > 0) {
      console.log(
        `ensure-schema: خودترمیمی اسکیما — ${report.createdTables.length} جدول، ${report.addedColumns.length} ستون و ${report.createdIndexes.length} ایندکس افزوده شد.`
      );
      if (report.warnings.length > 0) {
        console.warn(
          `ensure-schema: ${report.warnings.length} هشدار — ${report.warnings
            .slice(0, 4)
            .join(" | ")}`
        );
      }
    }
  } catch (error) {
    // هرگز بوتِ سرور را نمی‌شکند — فقط ثبت
    console.warn(
      `ensure-schema: خودترمیمی رد شد — ${(error as Error)?.message ?? error}`
    );
  }
}
