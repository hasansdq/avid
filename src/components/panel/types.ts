/**
 * انواع مشترک پنل کاربر — مطابق قرارداد تاییدشده‌ی APIهای /api/panel/*
 * (تاریخ‌ها به‌صورت رشته‌ی ISO از JSON می‌آیند)
 */

import type {
  QuestionAnswer,
  QuestionOptions,
  QuestionType,
} from "@/lib/exam";

export type PanelInstallmentStatus = "pending" | "paid" | "overdue";
export type PanelPaymentMethod = "cash" | "installment";
export type PanelPaymentStatus = "pending" | "paid" | "failed";

/** قسط — GET /api/panel/me → enrollments[].installments[] (مرتب بر اساس index صعودی) */
export interface PanelInstallment {
  id: string;
  index: number;
  amount: number;
  dueDate: string;
  status: PanelInstallmentStatus;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
}

/** جلسه‌ی حضور و غیاب کاربر — GET /api/panel/me → enrollments[].attendance.sessions[] */
export interface PanelAttendanceSession {
  /** شماره‌ی جلسه (۱ تا N) */
  index: number;
  /** جلسه‌ی در حال برگزاری (فعال) */
  active: boolean;
  /** تاریخ برگزاری جلسه (ISO) — null یعنی بدون تاریخ */
  heldAt: string | null;
  /** null یعنی حضور/غیاب این جلسه هنوز ثبت نشده است */
  present: boolean | null;
}

/** حضور و غیاب ثبت‌نام — GET /api/panel/me → enrollments[].attendance */
export interface PanelAttendance {
  /** تعداد کل جلسات دوره (از تعریف دوره) */
  courseSessions: number;
  /** جلسات ثبت‌شده (برگزارشده/فعال/برنامه‌ریزی‌شده) مرتب بر شماره‌ی جلسه */
  sessions: PanelAttendanceSession[];
}

/** ثبت‌نام دوره همراه اقساط — GET /api/panel/me → enrollments[] (مرتب createdAt نزولی) */
export interface PanelEnrollment {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  course: string;
  status: string; // new | contacted | enrolled | archived
  groupTitle: string | null;
  paymentMethod: PanelPaymentMethod | null;
  paymentAmount: number | null;
  paymentStatus: PanelPaymentStatus;
  paymentGateway: string | null;
  paymentRefId: string | null;
  paidAt: string | null;
  /** کد تخفیف اعمال‌شده (در صورت استفاده) */
  discountCode: string | null;
  /** مبلغ تخفیف (تومان) */
  discountAmount: number | null;
  /** معدل کارآموز در این دوره (۰ تا ۲۰) — null یعنی هنوز ثبت نشده */
  grade: number | null;
  createdAt: string;
  installments: PanelInstallment[];
  /** حضور و غیاب جلسات دوره — null یعنی دوره‌ی متناظر یافت نشد */
  attendance: PanelAttendance | null;
}

/** کاربر نشست‌دار — GET /api/panel/me → user */
export interface PanelUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** کد ملی (اختیاری) — برای استعلام گواهی‌نامه‌ها */
  nationalId: string | null;
  /** نقش حساب — student | teacher؛ استاد بخش‌های ویژه (دوره/کلاس/استریم/مالی) دارد */
  role: "student" | "teacher";
  createdAt: string;
}

/** پاسخ کامل GET /api/panel/me */
export interface PanelMe {
  user: PanelUser;
  enrollments: PanelEnrollment[];
}

/* ————————————————— آزمون‌ها (پنل کاربر) ————————————————— */

/* ————————————————— گواهینامه‌ها (پنل کاربر) ————————————————— */

/** گواهینامه‌ی صادرشده — GET /api/panel/certificates → certificates[] */
export interface PanelCertificate {
  id: string;
  /** کد رهگیری/اعتبارسنجی روی برگه */
  code: string;
  /** عنوان دوره (تصویر لحظه‌ای) */
  courseTitle: string;
  /** معدل ثبت‌شده هنگام صدور (۰ تا ۲۰) */
  grade: number | null;
  /** توضیح/عنوان اختیاری روی گواهینامه */
  note: string;
  /** فایل آپلودشده‌ی گواهینامه (PDF یا تصویر) — خالی یعنی بدون فایل */
  fileUrl: string;
  issuedAt: string;
}

/** آزمون قابل مشاهده برای کاربر — GET /api/panel/exams → exams[] */
export interface PanelExam {
  id: string;
  title: string;
  description: string;
  accessType: ExamAccess;
  durationMinutes: number;
  /** امکان بازگشت به سوالات قبلی هنگام آزمون (false = فقط حرکت به جلو) */
  allowBack: boolean;
  courseTitle: string | null;
  /** کلاس هدف آزمون کلاسی (فقط برای اعضای همان کلاس نمایش داده می‌شود) */
  classTitle: string | null;
  questionCount: number;
  myAttempts: PanelExamAttempt[];
}

/** نوع دسترسی آزمون از دید کاربر */
export type ExamAccess = "course" | "open" | "password" | "class";

/** سابقه‌ی شرکت کاربر در یک آزمون */
export interface PanelExamAttempt {
  id: string;
  score: number | null;
  autoScore: number;
  totalPoints: number;
  hasEssay: boolean;
  finishedAt: string;
}

/** پاسخ POST /api/panel/exams/[id]/start — سوالات بدون پاسخ صحیح */
export interface PanelExamStart {
  attemptId: string;
  startedAt: string;
  exam: {
    id: string;
    title: string;
    description: string;
    durationMinutes: number;
    /** امکان بازگشت به سوالات قبلی هنگام آزمون (false = فقط حرکت به جلو) */
    allowBack: boolean;
    courseTitle: string | null;
    classTitle: string | null;
  };
  questions: PanelQuestionView[];
}

/** سوال آماده‌ی نمایش (بدون پاسخ صحیح) */
export interface PanelQuestionView {
  id: string;
  type: QuestionType;
  text: string;
  image: string;
  video: string;
  points: number;
  order: number;
  options: QuestionOptions;
}

/** سوال برگه‌ی مرور پس از ثبت پاسخ‌ها */
export interface PanelReviewQuestion {
  id: string;
  type: QuestionType;
  text: string;
  image: string;
  video: string;
  points: number;
  options: QuestionOptions;
  userAnswer: unknown;
  correct: boolean | null;
  earned: number;
  correctAnswer: QuestionAnswer;
}

/** پاسخ POST /api/panel/exams/[id]/submit — نمره + برگه‌ی مرور */
export interface PanelExamResult {
  score: number | null;
  autoScore: number;
  autoMax: number;
  totalPoints: number;
  hasEssay: boolean;
  finishedAt: string;
  review: PanelReviewQuestion[];
}
