/**
 * اعتبارسنجی ورودی‌های آزمون — مشترک بین روت‌های ادمین
 * (ایجاد/ویرایش آزمون و ذخیره‌ی سوالات). خروجی یا داده‌ی پاک یا
 * پیام خطای فارسی (رشته) است.
 */

import { bool, float, int, str } from "@/lib/api-helpers";
import {
  countBlanks,
  isExamAccessType,
  isQuestionType,
  type QuestionType,
} from "@/lib/exam";

/* ---------------- آزمون (ایجاد/ویرایش) ---------------- */

export interface ExamInput {
  title: string;
  description: string;
  accessType: string;
  courseId: string | null;
  password: string;
  durationMinutes: number;
  published: boolean;
}

/** پارس بدنه‌ی ایجاد/ویرایش آزمون — رشته‌ی برگشتی یعنی خطا */
export function parseExamInput(body: unknown): ExamInput | string {
  if (!body || typeof body !== "object") return "داده‌ی ارسالی معتبر نیست.";
  const b = body as Record<string, unknown>;

  const title = str(b.title);
  if (title.length < 2) return "عنوان آزمون حداقل ۲ نویسه است.";

  const accessType = str(b.accessType) || "open";
  if (!isExamAccessType(accessType))
    return "نوع دسترسی آزمون معتبر نیست (دوره / آزاد / رمزدار).";

  let courseId: string | null = null;
  if (accessType === "course") {
    courseId = str(b.courseId) || null;
    if (!courseId) return "آزمون دوره باید به یک دوره متصل باشد.";
  }

  let password = str(b.password);
  if (accessType === "password" && password.length < 3)
    return "رمز آزمون رمزدار حداقل ۳ نویسه است.";

  const durationMinutes = int(b.durationMinutes, 0);

  return {
    title,
    description: str(b.description),
    accessType,
    courseId,
    password: accessType === "password" ? password : "",
    durationMinutes,
    published: bool(b.published, true),
  };
}

/* ---------------- سوالات (ذخیره‌ی گروهی) ---------------- */

export interface QuestionRow {
  type: string;
  text: string;
  image: string;
  video: string;
  points: number;
  options: string; // JSON
  answer: string; // JSON
  order: number;
}

const nonEmptyStr = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

function strArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (!nonEmptyStr(item)) return null;
    out.push(item);
  }
  return out;
}

/** پارس و اعتبارسنجی لیست سوالات — رشته‌ی برگشتی یعنی خطا */
export function parseQuestionsInput(body: unknown): QuestionRow[] | string {
  if (!body || typeof body !== "object") return "داده‌ی ارسالی معتبر نیست.";
  const raw = (body as Record<string, unknown>).questions;
  if (!Array.isArray(raw) || raw.length === 0)
    return "حداقل یک سوال برای آزمون لازم است.";
  if (raw.length > 200) return "حداکثر ۲۰۰ سوال برای هر آزمون مجاز است.";

  const rows: QuestionRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as Record<string, unknown>;
    const n = i + 1;
    const label = `سوال ${n}`;

    const type = str(q.type);
    if (!isQuestionType(type)) return `${label}: نوع سوال معتبر نیست.`;
    const t = type as QuestionType;

    const text = str(q.text);
    if (!nonEmptyStr(text) && t !== "table_fill")
      return `${label}: متن سوال خالی است.`;

    const points = float(q.points, 1);
    if (points <= 0) return `${label}: نمره‌ی سوال باید مثبت باشد.`;

    const image = str(q.image);
    const video = str(q.video);
    const options = (q.options ?? {}) as Record<string, unknown>;
    const answer = (q.answer ?? {}) as Record<string, unknown>;

    switch (t) {
      case "multiple_choice": {
        const opts = strArray(options.options);
        if (!opts || opts.length < 2)
          return `${label}: حداقل دو گزینه‌ی غیرخالی لازم است.`;
        const ans = (answer as { answer?: unknown }).answer;
        if (typeof ans !== "number" || ans < 0 || ans >= opts.length)
          return `${label}: گزینه‌ی صحیح انتخاب نشده است.`;
        rows.push({
          type, text, image, video, points,
          options: JSON.stringify({ options: opts }),
          answer: JSON.stringify({ answer: Math.round(ans) }),
          order: n,
        });
        break;
      }
      case "true_false": {
        const ans = (answer as { answer?: unknown }).answer;
        if (ans !== "true" && ans !== "false")
          return `${label}: پاسخ صحیح (درست/نادرست) انتخاب نشده است.`;
        rows.push({
          type, text, image, video, points,
          options: JSON.stringify({}),
          answer: JSON.stringify({ answer: ans }),
          order: n,
        });
        break;
      }
      case "fill_blank": {
        const blanksCount = countBlanks(text);
        if (blanksCount === 0)
          return `${label}: متن سوال جای خالی باید شامل نشانگر ___ باشد.`;
        const blanksRaw = (answer as { blanks?: unknown }).blanks;
        if (!Array.isArray(blanksRaw) || blanksRaw.length !== blanksCount)
          return `${label}: برای هر ${blanksCount} جای خالی، پاسخ‌های مجاز تعریف کنید.`;
        const blanks: string[][] = [];
        for (const accepted of blanksRaw) {
          const arr = strArray(accepted);
          if (!arr || arr.length === 0)
            return `${label}: هر جای خالی حداقل به یک پاسخ مجاز نیاز دارد.`;
          blanks.push(arr);
        }
        rows.push({
          type, text, image, video, points,
          options: JSON.stringify({}),
          answer: JSON.stringify({ blanks }),
          order: n,
        });
        break;
      }
      case "short_answer": {
        const accepted = strArray((answer as { accepted?: unknown }).accepted);
        if (!accepted || accepted.length === 0)
          return `${label}: حداقل یک پاسخ صحیح لازم است (پاسخ‌های مجاز با | جدا شوند).`;
        rows.push({
          type, text, image, video, points,
          options: JSON.stringify({}),
          answer: JSON.stringify({ accepted }),
          order: n,
        });
        break;
      }
      case "essay": {
        const sample = typeof (answer as { sample?: unknown }).sample === "string"
          ? ((answer as { sample: string }).sample)
          : "";
        rows.push({
          type, text, image, video, points,
          options: JSON.stringify({}),
          answer: JSON.stringify({ sample }),
          order: n,
        });
        break;
      }
      case "matching": {
        const left = strArray(options.left);
        const right = strArray(options.right);
        if (!left || left.length < 2)
          return `${label}: حداقل دو آیتم سمت چپ لازم است.`;
        if (!right || right.length < 2)
          return `${label}: حداقل دو آیتم سمت راست لازم است.`;
        const pairs = (answer as { pairs?: unknown }).pairs;
        if (!Array.isArray(pairs) || pairs.length !== left.length)
          return `${label}: پاسخ صحیح هر آیتم چپ تعیین نشده است.`;
        for (const p of pairs) {
          if (typeof p !== "number" || p < 0 || p >= right.length)
            return `${label}: جفت‌کردن صحیح کامل نیست.`;
        }
        rows.push({
          type, text, image, video, points,
          options: JSON.stringify({ left, right }),
          answer: JSON.stringify({ pairs: pairs.map((p) => Math.round(p)) }),
          order: n,
        });
        break;
      }
      case "ordering": {
        const items = strArray(options.items);
        if (!items || items.length < 2)
          return `${label}: حداقل دو آیتم برای مرتب‌کردن لازم است.`;
        rows.push({
          type, text, image, video, points,
          options: JSON.stringify({ items }),
          answer: JSON.stringify({}),
          order: n,
        });
        break;
      }
      case "table_fill": {
        const headers = strArray(options.headers);
        if (!headers || headers.length === 0)
          return `${label}: حداقل یک ستون برای جدول لازم است.`;
        const rowsRaw = options.rows;
        if (!Array.isArray(rowsRaw) || rowsRaw.length === 0)
          return `${label}: حداقل یک ردیف برای جدول لازم است.`;
        const table: string[][] = [];
        for (const row of rowsRaw) {
          if (!Array.isArray(row) || row.length !== headers.length)
            return `${label}: تعداد خانه‌های هر ردیف جدول باید با ستون‌ها برابر باشد.`;
          table.push(row.map((cell) => (typeof cell === "string" ? cell : "")));
        }
        // خانه‌های خالی → باید پاسخ مجاز داشته باشند
        const cellsRaw = (answer as { cells?: unknown }).cells;
        const cells =
          cellsRaw && typeof cellsRaw === "object" && !Array.isArray(cellsRaw)
            ? (cellsRaw as Record<string, unknown>)
            : {};
        const tableObj = { headers, rows: table };
        const blankKeys: string[] = [];
        table.forEach((row, r) =>
          row.forEach((cell, c) => {
            if (!cell || !cell.trim()) blankKeys.push(`${r},${c}`);
          })
        );
        for (const key of blankKeys) {
          const accepted = strArray(cells[key]);
          if (!accepted || accepted.length === 0)
            return `${label}: برای هر خانه‌ی خالی جدول حداقل یک پاسخ مجاز لازم است.`;
        }
        const cleanCells: Record<string, string[]> = {};
        for (const key of blankKeys) {
          cleanCells[key] = strArray(cells[key]) ?? [];
        }
        rows.push({
          type, text, image, video, points,
          options: JSON.stringify(tableObj),
          answer: JSON.stringify({ cells: cleanCells }),
          order: n,
        });
        break;
      }
    }
  }
  return rows;
}
