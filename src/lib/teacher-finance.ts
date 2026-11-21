import { db } from "@/lib/db";
import { teacherCourseTitles } from "@/lib/teacher";

/**
 * منطق مشترک «مالی و درآمد استاد» —
 * محاسبه‌ی درآمد/فروش/اقساط از روی دوره‌های خودِ استاد (Enrollment با
 * «عنوان دوره» به Course وصل است) + ابزارهای واریز درآمد استاد
 * (TeacherPayout). هم پنل خودِ استاد (GET/PUT /api/teacher/finance) و هم
 * پنل مدیر (GET/PUT /api/admin/teachers/[id]/finance و …) از همین منبعِ
 * واحد استفاده می‌کنند تا اعداد دو طرف همیشه یکی باشند.
 */

/** سقف ردیف‌های «صورت حساب فروش» که برگردانده می‌شوند */
const SALES_LIMIT = 200;

/** شروع روز (ساعت ۰۰:۰۰ به وقت محلی سرور) */
function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** برچسب نسبی سررسید قسط — مقایسه‌ی «روز تقویمی» با امروز */
function relativeDay(
  dueDate: Date
): "overdue" | "today" | "tomorrow" | "dayAfter" | "later" {
  const today = startOfDay(new Date()).getTime();
  const t = startOfDay(new Date(dueDate)).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  if (t < today) return "overdue";
  if (t === today) return "today";
  if (t === today + DAY) return "tomorrow";
  if (t === today + 2 * DAY) return "dayAfter";
  return "later";
}

/** نام نمایشی دارنده‌ی قسط — نام حساب (کاربر) یا نام ثبت‌نام */
function holderName(e: {
  firstName: string;
  lastName: string;
  name: string;
}): string {
  const account = `${e.firstName} ${e.lastName}`.trim();
  return account || e.name;
}

/* ————————————————— گزارش مالی (اشکال عمومی) ————————————————— */

export interface TeacherFinanceSummary {
  salesCount: number;
  salesPaid: number;
  salesPaidAmount: number;
  salesPendingAmount: number;
  installmentsPaidCount: number;
  installmentsPaidAmount: number;
  installmentsPendingCount: number;
  installmentsPendingAmount: number;
  totalIncome: number;
  studentsCount: number;
}

export interface TeacherFinanceCourse {
  id: string;
  title: string;
  studentsCount: number;
  salesPaidAmount: number;
  installmentsPaidAmount: number;
  income: number;
}

export interface TeacherFinanceSaleInstallment {
  index: number;
  amount: number;
  dueDate: Date;
  status: string;
  paidAt: Date | null;
}

export interface TeacherFinanceSale {
  id: string;
  name: string;
  course: string;
  status: string;
  paymentMethod: string | null;
  paymentAmount: number | null;
  paymentStatus: string;
  paidAt: Date | null;
  discountCode: string | null;
  discountAmount: number | null;
  createdAt: Date;
  installments: TeacherFinanceSaleInstallment[];
}

export interface TeacherFinanceInstallment {
  id: string;
  enrollmentId: string;
  index: number;
  amount: number;
  dueDate: Date;
  status: string;
  paidAt: Date | null;
  holder: string;
  course: string;
  relative: "overdue" | "today" | "tomorrow" | "dayAfter" | "later";
}

/**
 * گزارش کامل مالی یک استاد — خلاصه، تفکیک درآمد دوره‌ها، صورت حساب فروش
 * و اقساط پرداخت‌نشده (قدیمی‌ترین سررسید اول).
 */
export async function computeTeacherFinance(teacherId: string): Promise<{
  summary: TeacherFinanceSummary;
  courses: TeacherFinanceCourse[];
  sales: TeacherFinanceSale[];
  installments: TeacherFinanceInstallment[];
}> {
  // — فروش‌های دوره‌های استاد (Enrollment با «عنوان دوره» وصل است) —
  const titles = await teacherCourseTitles(teacherId);
  const enrollments = titles.length
    ? await db.enrollment.findMany({
        where: { course: { in: titles } },
        include: { installments: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // — خلاصه‌ی مالی —
  let salesPaid = 0;
  let salesPaidAmount = 0;
  let salesPendingAmount = 0;
  let installmentsPaidCount = 0;
  let installmentsPaidAmount = 0;
  let installmentsPendingCount = 0;
  let installmentsPendingAmount = 0;
  const students = new Set<string>();

  // سبد تفکیک درآمد به ازای هر عنوان دوره
  const buckets = new Map<
    string,
    {
      students: Set<string>;
      salesPaidAmount: number;
      installmentsPaidAmount: number;
    }
  >();

  for (const e of enrollments) {
    if (e.userId) students.add(e.userId);

    const bucket =
      buckets.get(e.course) ??
      {
        students: new Set<string>(),
        salesPaidAmount: 0,
        installmentsPaidAmount: 0,
      };
    if (e.userId) bucket.students.add(e.userId);

    if (e.paymentStatus === "paid") {
      salesPaid += 1;
      salesPaidAmount += e.paymentAmount ?? 0;
      bucket.salesPaidAmount += e.paymentAmount ?? 0;
    } else if (e.paymentStatus === "pending") {
      salesPendingAmount += e.paymentAmount ?? 0;
    }

    for (const inst of e.installments) {
      if (inst.status === "paid") {
        installmentsPaidCount += 1;
        installmentsPaidAmount += inst.amount;
        bucket.installmentsPaidAmount += inst.amount;
      } else {
        installmentsPendingCount += 1;
        installmentsPendingAmount += inst.amount;
      }
    }

    buckets.set(e.course, bucket);
  }

  const summary: TeacherFinanceSummary = {
    salesCount: enrollments.length,
    salesPaid,
    salesPaidAmount,
    salesPendingAmount,
    installmentsPaidCount,
    installmentsPaidAmount,
    installmentsPendingCount,
    installmentsPendingAmount,
    totalIncome: salesPaidAmount + installmentsPaidAmount,
    studentsCount: students.size,
  };

  // — درآمد تفکیک‌شده‌ی هر دوره (یک ردیف برای هر دوره‌ی استاد) —
  const courses = await db.course.findMany({
    where: { teacherId },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
  const courseRows = courses.map((c) => {
    const bucket = buckets.get(c.title);
    const courseSalesPaid = bucket?.salesPaidAmount ?? 0;
    const courseInstallmentsPaid = bucket?.installmentsPaidAmount ?? 0;
    return {
      id: c.id,
      title: c.title,
      studentsCount: bucket?.students.size ?? 0,
      salesPaidAmount: courseSalesPaid,
      installmentsPaidAmount: courseInstallmentsPaid,
      income: courseSalesPaid + courseInstallmentsPaid,
    };
  });

  // — صورت حساب فروش (۲۰۰ مورد اخیر) —
  const sales: TeacherFinanceSale[] = enrollments.slice(0, SALES_LIMIT).map((e) => ({
    id: e.id,
    name: e.name,
    course: e.course,
    status: e.status,
    paymentMethod: e.paymentMethod,
    paymentAmount: e.paymentAmount,
    paymentStatus: e.paymentStatus,
    paidAt: e.paidAt,
    discountCode: e.discountCode,
    discountAmount: e.discountAmount,
    createdAt: e.createdAt,
    installments: [...e.installments]
      .sort((a, b) => a.index - b.index)
      .map((inst) => ({
        index: inst.index,
        amount: inst.amount,
        dueDate: inst.dueDate,
        status: inst.status,
        paidAt: inst.paidAt,
      })),
  }));

  // — همه‌ی اقساط پرداخت‌نشده (قدیمی‌ترین سررسید اول) —
  const installments: TeacherFinanceInstallment[] = enrollments
    .flatMap((e) =>
      e.installments
        .filter((inst) => inst.status !== "paid")
        .map((inst) => ({ inst, e }))
    )
    .sort((a, b) => a.inst.dueDate.getTime() - b.inst.dueDate.getTime())
    .map(({ inst, e }) => ({
      id: inst.id,
      enrollmentId: inst.enrollmentId,
      index: inst.index,
      amount: inst.amount,
      dueDate: inst.dueDate,
      status: inst.status,
      paidAt: inst.paidAt,
      holder: holderName(e),
      course: e.course,
      relative: relativeDay(inst.dueDate),
    }));

  return { summary, courses: courseRows, sales, installments };
}

/* ————————————————— واریز درآمد استاد (TeacherPayout) ————————————————— */

/** وضعیت‌های مجاز یک واریز */
export const TEACHER_PAYOUT_STATUSES = new Set(["paid", "pending"]);

export function isTeacherPayoutStatus(v: unknown): v is "paid" | "pending" {
  return v === "paid" || v === "pending";
}

/** یک واریز درآمد استاد (ردیف خروجی API) */
export interface TeacherPayoutRow {
  id: string;
  amount: number;
  status: string;
  note: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

/** واریزهای درآمد استاد — جدیدترین اول */
export async function listTeacherPayouts(
  teacherId: string
): Promise<TeacherPayoutRow[]> {
  return db.teacherPayout.findMany({
    where: { teacherId },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      amount: true,
      status: true,
      note: true,
      paidAt: true,
      createdAt: true,
    },
  });
}

/** خلاصه‌ی وضعیت واریز درآمد — مقایسه‌ی درآمد کل با واریزهای «paid» */
export interface TeacherPayoutSummary {
  /** جمع واریزهای ثبت‌شده با وضعیت paid */
  paidAmount: number;
  /** جمع واریزهای در انتظار (pending) */
  pendingAmount: number;
  /** شمار واریزهای در انتظار */
  pendingCount: number;
  /** شمار کل واریزها */
  count: number;
  /** مانده‌ی تسویه = max(۰، درآمد کل − paidAmount) */
  remaining: number;
  /** آیا درآمد استاد کامل تسویه شده است؟ */
  settled: boolean;
}

export function payoutSummaryOf(
  totalIncome: number,
  payouts: { status: string; amount: number }[]
): TeacherPayoutSummary {
  let paidAmount = 0;
  let pendingAmount = 0;
  let pendingCount = 0;
  for (const p of payouts) {
    if (p.status === "paid") paidAmount += p.amount;
    else {
      pendingAmount += p.amount;
      pendingCount += 1;
    }
  }
  const remaining = Math.max(0, totalIncome - paidAmount);
  return {
    paidAmount,
    pendingAmount,
    pendingCount,
    count: payouts.length,
    remaining,
    settled: totalIncome > 0 && remaining === 0,
  };
}

/** سقف مبلغ یک واریز (تومان) — هم‌قاب سایر مبلغ‌های سیستم */
export const PAYOUT_MAX_AMOUNT = 100_000_000;
