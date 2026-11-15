import { db } from "@/lib/db";

/**
 * بکاپ و بازیابی داده‌های «آوید» — لایه‌ی منطقی (بدون فایل).
 *
 * ساختار فایل بکاپ (JSON):
 *  {
 *    format: "avid-backup",
 *    version: 2,
 *    exportedAt: "<ISO>",
 *    tables: { users: [...], courses: [...], ... }
 *  }
 *
 * دامنه:
 *  • شامل همه‌ی داده‌های محتوایی سایت است: تنظیمات، متن‌های ویرایشگر
 *    ظاهری مدادی (SiteText — متن/رنگ/فونت/اندازه/مخفی‌بودن جایگاه‌ها)،
 *    دوره‌ها و گروه‌ها و قالب اقساط، ویدئوها و لیست‌های پخش، آزمون‌ها و
 *    سؤال‌ها و پاسخ‌های کاربران، نمونه‌سؤال‌ها (دسته‌ها و فایل‌ها)،
 *    گواهی‌نامه‌ها، کاربران و ثبت‌نام‌ها و اقساط و حضور و غیاب، کدهای
 *    تخفیف، فونت‌ها، لینک‌های هدر/فوتر، نظرات، تنظیمات پیامک/پرداخت/چت،
 *    گزارش پیامک‌ها و گفتگوهای چت.
 *  • خارج از بکاپ (عمداً): حساب‌ها و نشست‌های مدیر (AdminUser/AdminSession)،
 *    نشست‌های کاربران (UserSession) و کدهای یک‌بارمصرف (OtpCode).
 *    نتیجه: مدیرِ در حال بازیابی از پنل خارج نمی‌شود و رمز عبور مدیر
 *    به فایل بکاپ راه پیدا نمی‌کند.
 *  • فایل‌های آپلودی (تصویر/ویدئو/فونت) در ZIP بکاپ کامل قرار می‌گیرند —
 *    این لایه فقط رکوردهای دیتابیس را مدیریت می‌کند (مسیر فایل‌ها در
 *    روت API انجام می‌شود).
 *
 * بازیابی، داده‌های فعلیِ «جدول‌های موجود در فایل» را «جایگزین» می‌کند —
 * داخل یک تراکنش واحد: یا همه‌چیز برمی‌گردد یا هیچ‌چیز تغییر نمی‌کند.
 * جدول‌هایی که در فایل بکاپ «نباشند» دست‌نخورده می‌مانند (بکاپ‌های قدیمیِ
 * فاقد بخش آزمون‌ها/نمونه‌سؤال‌ها/گواهی‌نامه‌ها، داده‌ی فعلی این بخش‌ها را
 * پاک نمی‌کنند) — مگر آنکه «حذف رکوردهای والد» به‌صورت آبشاری آن‌ها را
 * تهدید کند؛ آن حالت پیش از هر تغییری بررسی و بدون تأیید صریح رد می‌شود.
 */

export const BACKUP_FORMAT = "avid-backup";
export const BACKUP_VERSION = 2;

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
  | "exam"
  | "examQuestion"
  | "sampleQuestionCategory"
  | "sampleQuestion"
  | "user"
  | "examAttempt"
  | "certificate"
  | "enrollment"
  | "installment"
  | "attendanceSession"
  | "attendanceRecord"
  | "smsLog"
  | "chatConversation"
  | "chatMessage"
  | "chatWelcomeLog"
  | "uploadedFile";

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
  { key: "exam", label: "آزمون‌ها" },
  { key: "examQuestion", label: "سؤال‌های آزمون" },
  { key: "sampleQuestionCategory", label: "دسته‌های نمونه‌سؤال" },
  { key: "sampleQuestion", label: "نمونه‌سؤال‌ها" },
  { key: "user", label: "کاربران" },
  // پاسخ‌های آزمون: والد = Exam (پایین‌تر) و User (بالا‌تر) — بعد از هر دو
  { key: "examAttempt", label: "پاسخ‌های کاربران به آزمون‌ها" },
  // گواهی‌نامه: والد = User و Course — بعد از هر دو
  { key: "certificate", label: "گواهی‌نامه‌ها" },
  { key: "enrollment", label: "ثبت‌نام‌ها" },
  { key: "installment", label: "اقساط" },
  { key: "attendanceSession", label: "جلسات حضور و غیاب" },
  { key: "attendanceRecord", label: "ردیف‌های حضور و غیاب" },
  { key: "smsLog", label: "گزارش پیامک‌ها" },
  { key: "chatConversation", label: "گفتگوهای چت" },
  { key: "chatMessage", label: "پیام‌های چت" },
  { key: "chatWelcomeLog", label: "لاگ خوش‌آمدگویی چت" },
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

/**
 * جدول‌هایی که «نبودنشان در فایل بکاپ قدیمی» باید پیش از بازیابی بررسی
 * شود — حذف رکوردهای والد (دوره/کاربر/آزمون/دسته) نباید داده‌ی فعلیِ
 * این بخش‌ها را به‌صورت آبشاری پاک کند.
 */
const PROTECTED_TABLES: {
  key: BackupTableKey;
  label: string;
  /** والد‌هایی که حذفشان روی این جدول اثر می‌گذارد */
  parents: { key: BackupTableKey; onDelete: "cascade" | "setnull" }[];
}[] = [
  {
    key: "exam",
    label: "آزمون‌ها",
    parents: [{ key: "course", onDelete: "cascade" }],
  },
  {
    key: "examQuestion",
    label: "سؤال‌های آزمون",
    parents: [{ key: "exam", onDelete: "cascade" }],
  },
  {
    key: "examAttempt",
    label: "پاسخ‌های کاربران به آزمون‌ها",
    parents: [
      { key: "exam", onDelete: "cascade" },
      { key: "user", onDelete: "cascade" },
    ],
  },
  {
    key: "sampleQuestionCategory",
    label: "دسته‌های نمونه‌سؤال",
    parents: [],
  },
  {
    key: "sampleQuestion",
    label: "نمونه‌سؤال‌ها",
    parents: [
      { key: "sampleQuestionCategory", onDelete: "setnull" },
    ],
  },
  {
    key: "certificate",
    label: "گواهی‌نامه‌ها",
    parents: [
      { key: "user", onDelete: "cascade" },
      { key: "course", onDelete: "setnull" },
    ],
  },
];

/** مدل‌های prisma به‌صورت امن-نوع برای فراخوانی پویا در تراکنش */
interface BatchModel {
  deleteMany(args?: { where?: unknown }): Promise<unknown>;
  createMany(args: { data: unknown[] }): Promise<unknown>;
  count(args?: { where?: unknown }): Promise<number>;
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
    counts[key] = Number(await model.count());
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

/** یک مورد «از دست رفتن داده‌ی فعلی» در صورت بازیابی بکاپ قدیمی */
export interface DataLossItem {
  /** کلید جدولی که داده‌ی فعلی‌اش در خطر است */
  key: string;
  /** برچسب فارسی همان بخش */
  label: string;
  /** شمار رکوردهای فعلی در خطر */
  currentCount: number;
  /** کلیدهای جدول‌های والدی که حذف می‌شوند */
  parentKeys: string[];
  /** آیا حذف والد رکوردها را «پاک» می‌کند (cascade) یا فقط پیوند را قطع (setnull) */
  mode: "cascade" | "setnull";
}

/**
 * خطای «بازیابی نیازمند تأیید» — بکاپ قدیمی، داده‌ی فعلیِ بخش‌های
 * حفاظت‌شده را حذف/آسیب می‌زند؛ مدیر باید با force=1 صریحاً تأیید کند.
 */
export class BackupDataLossError extends Error {
  readonly losses: DataLossItem[];
  constructor(losses: DataLossItem[]) {
    super(
      "بازیابی این بکاپ، داده‌های فعلی برخی بخش‌ها را پاک می‌کند؛ برای ادامه تأیید صریح لازم است."
    );
    this.name = "BackupDataLossError";
    this.losses = losses;
  }
}

/**
 * بررسی پیش از بازیابی: آیا جایگزینی والد‌های موجود در فایل، داده‌ی
 * فعلیِ بخش‌های «حفاظت‌شده‌ی غایب از فایل» را آبشاری پاک می‌کند؟
 *
 * سناریوی هدف: فایل بکاپ از نسخه‌ی قدیمی است و بخش آزمون‌ها/سؤال‌ها/
 * پاسخ‌ها/نمونه‌سؤال‌ها/گواهی‌نامه‌ها را ندارد؛ ولی دوره‌ها و کاربران
 * (والدها) را جایگزین می‌کند — حذف والدها به‌صورت آبشاری داده‌ی فعلیِ
 * این بخش‌ها را پاک می‌کرد. این حالت تنها با تأیید صریح مجاز است.
 */
async function checkProtectedDataLoss(
  payload: BackupPayload
): Promise<DataLossItem[]> {
  const restoreSet = new Set(
    Object.keys(payload.tables) as BackupTableKey[]
  );
  const losses: DataLossItem[] = [];

  for (const protectedTable of PROTECTED_TABLES) {
    // بخش در فایل هست → به‌طور کامل جایگزین می‌شود (رفتار عادی بازیابی)
    if (restoreSet.has(protectedTable.key)) continue;

    // شمار رکوردهای فعلیِ این بخش
    let currentCount = 0;
    try {
      currentCount = Number(await modelOf(db, protectedTable.key).count());
    } catch {
      continue; // جدول در این نسخه/دیتابیس وجود ندارد — مشکلی نیست
    }
    if (currentCount === 0) continue;

    // کدام والدها جایگزین می‌شوند؟
    const affectedParents = protectedTable.parents.filter((p) =>
      restoreSet.has(p.key)
    );
    if (affectedParents.length === 0) continue;

    // حذف آبشاری از جدولِ اولِ مؤثر مهم‌تر است (پاک‌شدن کامل رکورد)
    const cascade = affectedParents.find((p) => p.onDelete === "cascade");
    losses.push({
      key: protectedTable.key,
      label: protectedTable.label,
      currentCount,
      parentKeys: affectedParents.map((p) => p.key),
      mode: cascade ? "cascade" : "setnull",
    });
  }
  return losses;
}

/**
 * جایگزینی داده‌های محتوایی با محتوای فایل بکاپ —
 * داخل یک تراکنش: پاک‌سازی فرزند→والد، سپس درج والد→فرزند.
 *
 *  • فقط جدول‌های «موجود در فایل» جایگزین می‌شوند؛ جدول‌های غایب از
 *    فایل (بکاپ قدیمی) دست‌نخورده می‌مانند.
 *  • نشست مدیر دست‌نخورده می‌ماند؛ نشست کاربران و کدهای OTP فعال
 *    همیشه پاک می‌شوند (کاربرانِ بازیابی‌شده باید دوباره ورود کنند).
 *  • اگر حذف والد‌ها داده‌ی فعلیِ بخش‌های حفاظت‌شده را تهدید کند و
 *    force نباشد، BackupDataLossError پرتاب می‌شود (قبل از هر تغییری).
 */
export async function importBackup(
  payload: BackupPayload,
  opts?: { force?: boolean }
): Promise<ImportSummary> {
  // — بررسی پیش از هر تغییری: از دست رفتن داده‌ی فعلی بخش‌های حفاظت‌شده —
  const losses = await checkProtectedDataLoss(payload);
  if (losses.length > 0 && !opts?.force) {
    throw new BackupDataLossError(losses);
  }

  const restored: Partial<Record<BackupTableKey, number>> = {};
  const labels: Partial<Record<BackupTableKey, string>> = {};

  // — فقط جدول‌های حاضر در فایل جایگزین می‌شوند (به ترتیب حذف معکوس) —
  const restoreSet = new Set(
    Object.keys(payload.tables) as BackupTableKey[]
  );
  const deleteOrder = DELETE_ORDER.filter(
    (key) => key === "userSession" || key === "otpCode" || restoreSet.has(key as BackupTableKey)
  );
  const createOrder = CREATE_ORDER.filter((t) => restoreSet.has(t.key));

  await db.$transaction(
    async (tx) => {
      // ۱) پاک‌سازی (فرزند → والد) + نشست کاربران و کدهای یک‌بارمصرف
      for (const key of deleteOrder) {
        await modelOf(tx, key).deleteMany({});
      }

      // ۲) درج رکوردهای بکاپ (والد → فرزند)
      for (const { key, label } of createOrder) {
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
