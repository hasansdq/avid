/**
 * قرارداد آزمون‌ها — انواع سوال، ساختار JSON گزینه‌ها/پاسخ‌ها و تصحیح خودکار.
 *
 * این فایل هم در سرور (تصحیح پاسخ‌ها) و هم در کلاینت (ادیتور مدیر/پلیر کاربر)
 * استفاده می‌شود؛ بنابراین هیچ وابستگی سروری (Node/Prisma/Next) ندارد.
 *
 * ————————————————— ساختار JSON به ازای هر نوع سوال —————————————————
 *
 * options (ساختار سوال) · answer (پاسخ صحیح/مجاز) · پاسخ کاربر:
 *
 *  multiple_choice : options={ options: string[] } · answer={ answer: number } (اندیس گزینه صحیح)
 *                    پاسخ کاربر: number | null
 *  true_false      : options={} · answer={ answer: "true" | "false" } · پاسخ کاربر: "true"|"false"|null
 *  fill_blank      : متن سوال با نشانگر ___ · answer={ blanks: string[][] } (پاسخ‌های مجاز هر جای خالی)
 *                    پاسخ کاربر: string[] (به ازای هر جای خالی)
 *  short_answer    : options={} · answer={ accepted: string[] } (هر یک از این متن‌ها پذیرفته است)
 *                    پاسخ کاربر: string
 *  essay           : options={} · answer={ sample: string } (پاسخ نمونه — فقط برای مدیر) · پاسخ کاربر: string
 *                    تصحیح: دستی توسط مدیر (خودکار = در انتظار)
 *  matching        : options={ left: string[]; right: string[] } · answer={ pairs: number[] } (left[i]↔right[pairs[i]])
 *                    پاسخ کاربر: number[] (به ازای هر آیتم چپ، اندیس آیتم راست)
 *  ordering        : options={ items: string[] } (به ترتیب صحیح) · answer={} (ترتیب ذخیره‌شده همان ترتیب صحیح است)
 *                    پاسخ کاربر: number[] (توالی اندیس‌ها به ترتیب انتخاب کاربر)
 *  table_fill      : options={ headers: string[]; rows: string[][] } (خانه‌ی خالی «» یعنی جای پاسخ کاربر)
 *                    answer={ cells: Record<string, string[]> } (کلید «r,c» → پاسخ‌های مجاز آن خانه)
 *                    پاسخ کاربر: Record<string, string> (کلید «r,c» → متن کاربر)
 */

/* ————————————————— انواع و برچسب‌ها ————————————————— */

/** کلیدهای انواع سوال (مقدار ذخیره‌شده در دیتابیس) */
export const QUESTION_TYPES = [
  "multiple_choice",
  "true_false",
  "fill_blank",
  "short_answer",
  "essay",
  "matching",
  "ordering",
  "table_fill",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "چهارگزینه‌ای",
  true_false: "دوگزینه‌ای (درست/نادرست)",
  fill_blank: "جای خالی",
  short_answer: "پاسخ کوتاه",
  essay: "تشریحی",
  matching: "وصل‌کردنی",
  ordering: "مرتب‌کردنی",
  table_fill: "پرکردن جدول",
};

export const isQuestionType = (v: unknown): v is QuestionType =>
  typeof v === "string" && (QUESTION_TYPES as readonly string[]).includes(v);

/** انواع دسترسی آزمون */
export const ACCESS_TYPES = ["course", "open", "password"] as const;
export type ExamAccessType = (typeof ACCESS_TYPES)[number];

export const ACCESS_TYPE_LABELS: Record<ExamAccessType, string> = {
  course: "آزمون دوره",
  open: "آزمون آزاد",
  password: "آزمون رمزدار",
};

export const isExamAccessType = (v: unknown): v is ExamAccessType =>
  typeof v === "string" && (ACCESS_TYPES as readonly string[]).includes(v);

/* ————————————————— ساختارهای گزینه/پاسخ ————————————————— */

export interface McOptions {
  options: string[];
}
export interface MatchingOptions {
  left: string[];
  right: string[];
}
export interface OrderingOptions {
  items: string[];
}
export interface TableFillOptions {
  headers: string[];
  rows: string[][];
}
/** همه‌ی ساختارهای ممکن options */
export type QuestionOptions =
  | McOptions
  | MatchingOptions
  | OrderingOptions
  | TableFillOptions
  | Record<string, never>;

export interface FillBlankAnswer {
  blanks: string[][];
}
export interface ShortAnswerAnswer {
  accepted: string[];
}
export interface EssayAnswer {
  sample: string;
}
export interface TableFillAnswer {
  cells: Record<string, string[]>;
}
export type QuestionAnswer =
  | { answer: number } // multiple_choice
  | { answer: "true" | "false" } // true_false
  | FillBlankAnswer
  | ShortAnswerAnswer
  | EssayAnswer
  | { pairs: number[] } // matching
  | TableFillAnswer
  | Record<string, never>; // ordering (خود ترتیب صحیح است)

/** پاسخ کاربر به یک سوال — ساختار بر اساس نوع (در بالا) */
export type UserAnswer = unknown;

/** سوال آماده‌ی نمایش به کاربر (بدون پاسخ صحیح) */
export interface PanelQuestion {
  id: string;
  type: QuestionType;
  text: string;
  image: string;
  video: string;
  points: number;
  options: QuestionOptions;
  order: number;
}

/* ————————————————— ابزارهای مشترک ————————————————— */

/** پارس امن JSON ذخیره‌شده در فیلد رشته‌ای دیتابیس */
export function parseJsonField<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** نرمال‌سازی متن پاسخ برای مقایسه‌ی منصفانه:
 *  ارقام فارسی/عربی → لاتین · ي/ك عربی → ی/ک فارسی · نیم‌فاصله → فاصله · فشرده‌سازی فاصله‌ها · حروف کوچک لاتین */
export function normalizeAnswerText(input: string): string {
  return input
    .trim()
    .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) =>
      String(d.charCodeAt(0) & 0x0f)
    )
    .replace(/\u064A/g, "ی")
    .replace(/\u0643/g, "ک")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** شمارش جای خالی متن (هر «___» یا بیشتر یک جای خالی) */
export function countBlanks(text: string): number {
  return (text.match(/_{3,}/g) ?? []).length;
}

/** کلید خانه‌های خالی جدول — «r,c» (خانه‌ی خالی یعنی رشته‌ی تهی در rows) */
export function tableBlankKeys(options: TableFillOptions): string[] {
  const keys: string[] = [];
  options.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell || !cell.trim()) keys.push(`${r},${c}`);
    });
  });
  return keys;
}

/* ————————————————— ساخت پیش‌فرض ادیتور (پنل مدیر) ————————————————— */

/** options/answer پیش‌فرض برای سوال تازه‌ی هر نوع (ادیتور مدیر) */
export function defaultsForType(
  type: QuestionType
): { options: QuestionOptions; answer: QuestionAnswer } {
  switch (type) {
    case "multiple_choice":
      return {
        options: { options: ["", "", "", ""] },
        answer: { answer: 0 },
      };
    case "true_false":
      return { options: {}, answer: { answer: "true" } };
    case "fill_blank":
      return { options: {}, answer: { blanks: [] } };
    case "short_answer":
      return { options: {}, answer: { accepted: [] } };
    case "essay":
      return { options: {}, answer: { sample: "" } };
    case "matching":
      return {
        options: { left: ["", ""], right: ["", ""] },
        answer: { pairs: [0, 1] },
      };
    case "ordering":
      return { options: { items: ["", "", ""] }, answer: {} };
    case "table_fill":
      return {
        options: { headers: ["", ""], rows: [["", ""], ["", ""]] },
        answer: { cells: {} },
      };
  }
}

/* ————————————————— تصحیح خودکار ————————————————— */

/** سوال آماده‌ی تصحیح (با پاسخ صحیح) — سمت سرور از دیتابیس ساخته می‌شود */
export interface GradingQuestion {
  id: string;
  type: QuestionType;
  points: number;
  options: QuestionOptions;
  answer: QuestionAnswer;
}

/** نتیجه‌ی تصحیح یک سوال — correct===null یعنی تشریحی (در انتظار تصحیح مدیر) */
export interface QuestionGrade {
  questionId: string;
  correct: boolean | null;
  earned: number; // نمره‌ی کسب‌شده (۰ یا points؛ تشریحی ۰)
}

export interface AttemptGrade {
  autoScore: number; // نمره‌ی خودکار (سوالات عینی)
  autoMax: number; // جمع نمره‌ی سوالات عینی
  totalPoints: number; // جمع نمره‌ی همه‌ی سوالات
  hasEssay: boolean; // دارای تشریحی؟
  perQuestion: QuestionGrade[];
}

function matchesList(userText: string, accepted: string[] | undefined): boolean {
  if (!accepted || accepted.length === 0) return false;
  const u = normalizeAnswerText(userText);
  return accepted.some((a) => normalizeAnswerText(a) === u && u !== "");
}

function sameSequence(user: unknown, expected: number[]): boolean {
  if (!Array.isArray(user) || user.length !== expected.length) return false;
  return expected.every((v, i) => user[i] === v);
}

/** تصحیح پاسخ‌های کاربر به سوالات آزمون — سوالات عینی خودکار، تشریحی در انتظار مدیر */
export function gradeAttempt(
  questions: GradingQuestion[],
  answers: Record<string, UserAnswer>
): AttemptGrade {
  let autoScore = 0;
  let autoMax = 0;
  let totalPoints = 0;
  let hasEssay = false;
  const perQuestion: QuestionGrade[] = [];

  for (const q of questions) {
    totalPoints += q.points;
    const user = answers[q.id];
    let correct: boolean | null = false;

    switch (q.type) {
      case "multiple_choice": {
        correct = user === (q.answer as { answer: number }).answer;
        break;
      }
      case "true_false": {
        correct = user === (q.answer as { answer: string }).answer;
        break;
      }
      case "fill_blank": {
        const blanks = (q.answer as FillBlankAnswer).blanks ?? [];
        const arr = Array.isArray(user) ? (user as string[]) : [];
        correct =
          blanks.length > 0 &&
          blanks.every((accepted, i) => matchesList(arr[i] ?? "", accepted));
        break;
      }
      case "short_answer": {
        correct =
          typeof user === "string" &&
          matchesList(user, (q.answer as ShortAnswerAnswer).accepted ?? []);
        break;
      }
      case "essay": {
        correct = null; // در انتظار تصحیح مدیر
        hasEssay = true;
        break;
      }
      case "matching": {
        const pairs = (q.answer as { pairs: number[] }).pairs ?? [];
        correct =
          Array.isArray(user) &&
          pairs.length > 0 &&
          pairs.every((v, i) => (user as number[])[i] === v);
        break;
      }
      case "ordering": {
        const items = (q.options as OrderingOptions).items ?? [];
        correct = sameSequence(
          user,
          items.map((_, i) => i)
        );
        break;
      }
      case "table_fill": {
        const opts = q.options as TableFillOptions;
        const cells = (q.answer as TableFillAnswer).cells ?? {};
        const keys = tableBlankKeys(opts);
        const userMap =
          user && typeof user === "object" && !Array.isArray(user)
            ? (user as Record<string, string>)
            : {};
        correct =
          keys.length > 0 &&
          keys.every((k) => matchesList(userMap[k] ?? "", cells[k] ?? []));
        break;
      }
    }

    perQuestion.push({
      questionId: q.id,
      correct,
      earned: correct === true ? q.points : 0,
    });

    if (q.type !== "essay") {
      autoMax += q.points;
      if (correct) autoScore += q.points;
    }
  }

  return { autoScore, autoMax, totalPoints, hasEssay, perQuestion };
}
