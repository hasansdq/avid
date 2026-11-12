/**
 * انواع مشترک پنل کاربر — مطابق قرارداد تاییدشده‌ی APIهای /api/panel/*
 * (تاریخ‌ها به‌صورت رشته‌ی ISO از JSON می‌آیند)
 */

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
  createdAt: string;
}

/** پاسخ کامل GET /api/panel/me */
export interface PanelMe {
  user: PanelUser;
  enrollments: PanelEnrollment[];
}
