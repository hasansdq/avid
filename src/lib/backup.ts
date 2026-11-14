import { db } from "@/lib/db";

/**
 * بکاپ و بازیابی داده‌های «آوید» — لایه‌ی منطقی (بدون فایل).
 *
 * ساختار فایل بکاپ (JSON):
 *  {
 *    format: "avid-backup",
 *    version: 1,
 *    exportedAt: "<ISO>",
 *    tables: { users: [...], courses: [...], ... }
 *  }
 *
 * دامنه:
 *  • شامل همه‌ی داده‌های محتوایی سایت است: تنظیمات، متن‌های ویرایشگر
 *    ظاهری مدادی (SiteText — متن/رنگ/فونت/اندازه/مخفی‌بودن جایگاه‌ها)،
 *    دوره‌ها و گروه‌ها و قالب اقساط، ویدئوها و لیست‌های پخش، کاربران و
 *    ثبت‌نام‌ها و اقساط و حضور و غیاب، کدهای تخفیف، فونت‌ها، لینک‌های
 *    هدر/فوتر، نظرات، تنظیمات پیامک/پرداخت/چت، گزارش پیامک‌ها و
 *    گفتگوهای چت.
 *  • خارج از بکاپ (عمداً): حساب‌ها و نشست‌های مدیر (AdminUser/AdminSession)،
 *    نشست‌های کاربران (UserSession) و کدهای یک‌بارمصرف (OtpCode).
 *    نتیجه: مدیرِ در حال بازیابی از پنل خارج نمی‌شود و رمز عبور مدیر
 *    به فایل بکاپ راه پیدا نمی‌کند.
 *  • فایل‌های آپلودی (تصویر/ویدئو/فونت) در ZIP بکاپ کامل قرار می‌گیرند —
 *    این لایه فقط رکوردهای دیتابیس را مدیریت می‌کند (مسیر فایل‌ها در
 *    روت API انجام می‌شود).
 *
 * بازیابی، کل داده‌های فعلیِ همان جدول‌ها را «جایگزین» می‌کند —
 * داخل یک تراکنش واحد: یا همه‌چیز برمی‌گردد یا هیچ‌چیز تغییر نمی‌کند.
 */

export const BACKUP_FORMAT = "avid-backup";
export const BACKUP_VERSION = 1;

/** کلیدهای prisma-ی جدول‌های بکاپ */
export type BackupTableKey =
  | "siteSettings"
  | "siteText"
  | "chatSettings"
  | "smsSettings"
  | "paymentSettings"
  | "installedFont"
  | "navLink"
  | "testimonial"
  | "discountCode"
  | "course"
  | "courseGroup"
  | "courseInstallment"
  | "playlist"
  | "video"
  | "user"
  | "enrollment"
  | "installment"
  | "attendanceSession"
  | "attendanceRecord"
  | "smsLog"
  | "chatConversation"
  | "chatMessage"
  | "chatWelcomeLog"
  | "uploadedFile"
  | "sampleQuestionCategory"
  | "sampleQuestion"
  | "certificate"
  | "exam"
  | "examQuestion"
  | "examAttempt";

interface TableSpec {
  key: BackupTableKey;
  /** برچسب فارسی برای نمایش در پنل و گزارش بازیابی */
  label: string;
}

/**
 * ترتیب «ایجاد» (والد → فرزند) — ترتیب حذف دقیقاً معکوس همین است
 * (فرزند → والد) تا قیدهای کلید خارجی هرگز نقض نشوند.
 */
const CREATE_ORDER: TableSpec[] = [
  { key: "siteSettings", label: "تنظیمات سایت" },
  { key: "siteText", label: "متن‌های ویرایشگر مدادی" },
  { key: "chatSettings", label: "تنظیمات چت" },
  { key: "smsSettings", label: "تنظیمات پیامک" },
  { key: "paymentSettings", label: "تنظیمات پرداخت" },
  { key: "installedFont", label: "فونت‌ها" },
  { key: "navLink", label: "لینک‌های هدر و فوتر" },
  { key: "testimonial", label: "نظرات کاربران" },
  { key: "discountCode", label: "کدهای تخفیف" },
  { key: "course", label: "دوره‌ها" },
  { key: "courseGroup", label: "گروه‌های دوره" },
  { key: "courseInstallment", label: "قالب اقساط دوره" },
  { key: "playlist", label: "لیست‌های پخش" },
  { key: "video", label: "ویدئوها" },
  { key: "user", label: "کاربران" },
  { key: "enrollment", label: "ثبت‌نام‌ها" },
  { key: "installment", label: "اقساط" },
  { key: "attendanceSession", label: "جلسات حضور و غیاب" },
  { key: "attendanceRecord", label: "ردیف‌های حضور و غیاب" },
  { key: "smsLog", label: "گزارش پیامک‌ها" },
  { key: "chatConversation", label: "گفتگوهای چت" },
  { key: "chatMessage", label: "پیام‌های چت" },
  { key: "chatWelcomeLog", label: "لاگ خوش‌آمدگویی چت" },
  { key: "sampleQuestionCategory", label: "دسته‌بندی نمونه سؤال" },
  { key: "sampleQuestion", label: "نمونه سؤال" },
  { key: "certificate", label: "گواهی‌نامه" },
  { key: "exam", label: "آزمون" },
  { key: "examQuestion", label: "سؤال آزمون" },
  { key: "examAttempt", label: "پاسخ آزمون" },
  { key: "uploadedFile", label: "گالری فایل‌ها" },
];

/** کلید اصلی هر جدول — id؛ SiteText با key و ChatWelcomeLog با ip */
const PRIMARY_KEYS: Record<BackupTableKey, string> = {
  siteText: "key",
  chatWelcomeLog: "ip",
} as Record<BackupTableKey, string>;
function primaryKeyOf(key: BackupTableKey): string {
  return PRIMARY_KEYS[key] ?? "id";
}

/** ترتیب حذف = معکوس ترتیب ایجاد + پاک‌سازی نشست کاربران/کدهای OTP */
const DELETE_ORDER: string[] = [
  ...CREATE_ORDER.map((t) => t.key).reverse(),
  "userSession",
  "otpCode",
];

/** مدل‌های prisma به‌صورت امن-نوع برای فراخوانی پویا در تراکنش */
interface BatchModel {
  deleteMany(args?: { where?: unknown }): Promise<unknown>;
  createMany(args: { data: unknown[] }): Promise<unknown>;
}

function modelOf(tx: unknown, key: string): BatchModel {
  const model = (tx as Record<string, unknown>)[key] as BatchModel | undefined;
  if (!model) throw new Error(`مدل دیتابیس ناشناخته: ${key}`);
  return model;
}

/* ------------------------------------------------------------------ */
/*                              ساخت بکاپ                              */
/* ------------------------------------------------------------------ */

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Partial<Record<BackupTableKey, Record<string, unknown>[]>>;
}

/** خواندن همه‌ی جدول‌های محتوایی — برای JSON و ZIP مشترک است */
export async function buildBackupPayload(): Promise<BackupPayload> {
  const tables: BackupPayload["tables"] = {};
  for (const { key } of CREATE_ORDER) {
    const model = modelOf(db, key);
    // findMany بدون فیلتر — پر کردن جدول با findMany مستقیم مدل
    const rows = await (
      model as unknown as {
        findMany(args?: { orderBy?: unknown }): Promise<Record<string, unknown>[]>;
      }
    ).findMany();
    tables[key] = rows;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

/** خلاصه‌ی آماری برای نمایش در پنل مدیریت */
export async function backupCounts(): Promise<
  Partial<Record<BackupTableKey, number>>
> {
  const counts: Partial<Record<BackupTableKey, number>> = {};
  for (const { key } of CREATE_ORDER) {
    const model = modelOf(db, key);
    counts[key] = Number(
      await (model as unknown as { count(): Promise<number> }).count()
    );
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/*                             اعتبارسنجی                              */
/* ------------------------------------------------------------------ */

/**
 * اعتبارسنجی ساختار فایل بکاپ — پیش از هرگونه تغییر روی دیسک/دیتابیس
 * صدا زده می‌شود. هر خطا پیام فارسی برای نمایش به مدیر برمی‌گرداند.
 */
export function validateBackupPayload(raw: unknown): BackupPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ساختار فایل بکاپ معتبر نیست.");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    throw new Error(
      "این فایل یک بکاپ «آوید» نیست (شناسه‌ی ساختار ناشناخته)."
    );
  }
  const version = Number(obj.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("نسخه‌ی فایل بکاپ نامعتبر است.");
  }
  if (version > BACKUP_VERSION) {
    throw new Error(
      `این بکاپ با نسخه‌ی جدیدتری ساخته شده است (${version} > ${BACKUP_VERSION}) و در این نسخه‌ی سایت قابل بازیابی نیست.`
    );
  }
  const tablesRaw = obj.tables;
  if (!tablesRaw || typeof tablesRaw !== "object" || Array.isArray(tablesRaw)) {
    throw new Error("بخش جدول‌ها در فایل بکاپ یافت نشد.");
  }

  const known = new Set<string>(CREATE_ORDER.map((t) => t.key));
  const tables: BackupPayload["tables"] = {};
  for (const [key, rows] of Object.entries(
    tablesRaw as Record<string, unknown>
  )) {
    if (!known.has(key)) {
      throw new Error(`جدول ناشناخته در فایل بکاپ: «${key}».`);
    }
    if (!Array.isArray(rows)) {
      throw new Error(`داده‌های جدول «${key}» در فایل بکاپ خراب است.`);
    }
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`یک ردیف نامعتبر در جدول «${key}» وجود دارد.`);
      }
      const pk = primaryKeyOf(key as BackupTableKey);
      const pkValue = (row as Record<string, unknown>)[pk];
      if (typeof pkValue !== "string" || !pkValue) {
        throw new Error(
          `ردیف‌های جدول «${key}» فاقد کلید اصلی (${pk}) هستند — فایل بکاپ خراب است.`
        );
      }
    }
    tables[key as BackupTableKey] = rows as Record<string, unknown>[];
  }
  return {
    format: BACKUP_FORMAT,
    version,
    exportedAt:
      typeof obj.exportedAt === "string" ? obj.exportedAt : new Date(0).toISOString(),
    tables,
  };
}

/* ------------------------------------------------------------------ */
/*                             بازیابی                                 */
/* ------------------------------------------------------------------ */

export interface ImportSummary {
  /** تعداد رکورد بازیابی‌شده به‌ازای هر جدول (فقط جدول‌های موجود در فایل) */
  restored: Partial<Record<BackupTableKey, number>>;
  /** برچسب فارسی جدول برای پیام موفقیت */
  labels: Partial<Record<BackupTableKey, string>>;
}

/**
 * جایگزینی کل داده‌های محتوایی با محتوای فایل بکاپ —
 * داخل یک تراکنش: پاک‌سازی فرزند→والد، سپس درج والد→فرزند.
 * نشست مدیر دست‌نخورده می‌ماند؛ نشست کاربران و کدهای OTP فعال پاک می‌شوند.
 */
export async function importBackup(
  payload: BackupPayload
): Promise<ImportSummary> {
  const restored: Partial<Record<BackupTableKey, number>> = {};
  const labels: Partial<Record<BackupTableKey, string>> = {};

  await db.$transaction(
    async (tx) => {
      // Older exports omit new tables. Avoid deleting data that cannot be restored.
      for (const { key, label } of CREATE_ORDER) {
        if (payload.tables[key] !== undefined) continue;
        const model = modelOf(tx, key) as BatchModel & { count(): Promise<number> };
        if (await model.count()) {
          throw new Error(`بکاپ شامل «${label}» نیست و داده‌های فعلی این بخش قابل بازیابی نیستند.`);
        }
      }

      // ۱) پاک‌سازی کامل (فرزند → والد) + نشست کاربران و کدهای یک‌بارمصرف
      for (const key of DELETE_ORDER) {
        await modelOf(tx, key).deleteMany({});
      }

      // ۲) درج رکوردهای بکاپ (والد → فرزند)
      for (const { key, label } of CREATE_ORDER) {
        const rows = payload.tables[key];
        if (!rows || rows.length === 0) continue;
        await modelOf(tx, key).createMany({ data: rows });
        restored[key] = rows.length;
        labels[key] = label;
      }
    },
    { timeout: 300_000, maxWait: 20_000 }
  );

  return { restored, labels };
}
