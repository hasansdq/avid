import { db } from "@/lib/db";

/**
 * لایه‌ی منطقی سمت سرور «نمونه سوالات» — Node + Prisma.
 * (ثابت‌های client-safe در lib/sample-questions.ts نگهداری می‌شوند.)
 *
 *  • SAMPLE_QUESTION_CATEGORY_SEEDS: هجده دسته‌ی موضوعی پیش‌فرض با id قطعی
 *  • ensureSampleQuestionCategoriesSeeded(): درج idempotent هنگام جدولِ خالی
 *  • getPublishedCategoriesWithItems(): داده‌ی صفحه‌ی /samples و صفحه‌ی اول
 */

export interface SampleQuestionCategorySeed {
  /** شناسه‌ی قطعی — جلوگیری از درج تکراری در رقابت همزمانی */
  id: string;
  title: string;
  description: string;
  /** کلید آیکون از رجیستری lib/sample-questions.ts */
  icon: string;
  sortOrder: number;
  published: boolean;
}

/** هجده دسته‌ی موضوعی پیش‌فرض — عنوان/آیکون/تم مرتبط با هر موضوع */
export const SAMPLE_QUESTION_CATEGORY_SEEDS: SampleQuestionCategorySeed[] = [
  {
    id: "seed-sqcat-chem",
    title: "شیمی",
    description: "نمونه سوالات شیمی — از مفاهیم پایه تا سوالات ترکیبی و آزمون‌های جامع.",
    icon: "FlaskConical",
    sortOrder: 1,
    published: true,
  },
  {
    id: "seed-sqcat-math",
    title: "ریاضی",
    description: "نمونه سوالات ریاضی — حسابان، مثلثات و مسئله‌های کاربردی.",
    icon: "Sigma",
    sortOrder: 2,
    published: true,
  },
  {
    id: "seed-sqcat-sci",
    title: "علوم تجربی",
    description: "نمونه سوالات علوم تجربی — مجموعه‌ای برای آزمون‌های عمومی.",
    icon: "Microscope",
    sortOrder: 3,
    published: true,
  },
  {
    id: "seed-sqcat-phys",
    title: "فیزیک",
    description: "نمونه سوالات فیزیک — مکانیک، برق، موج‌ها و اپتیک.",
    icon: "Atom",
    sortOrder: 4,
    published: true,
  },
  {
    id: "seed-sqcat-bio",
    title: "زیست شناسی",
    description: "نمونه سوالات زیست شناسی — سلول، ژنتیک و سیستم‌های بدن.",
    icon: "Dna",
    sortOrder: 5,
    published: true,
  },
  {
    id: "seed-sqcat-comp",
    title: "کامپیوتر",
    description: "نمونه سوالات عمومی کامپیوتر — مفاهیم پایه و کاربردها.",
    icon: "Monitor",
    sortOrder: 6,
    published: true,
  },
  {
    id: "seed-sqcat-prog",
    title: "برنامه نویسی",
    description: "نمونه سوالات برنامه نویسی — الگوریتم، ساختار داده و منطق کد.",
    icon: "Code2",
    sortOrder: 7,
    published: true,
  },
  {
    id: "seed-sqcat-python",
    title: "پایتون",
    description: "نمونه سوالات پایتون — از مبانی تا پروژه‌های عملی.",
    icon: "FileCode2",
    sortOrder: 8,
    published: true,
  },
  {
    id: "seed-sqcat-ai",
    title: "هوش مصنوعی",
    description: "نمونه سوالات هوش مصنوعی — مفاهیم، ابزارها و کاربردها.",
    icon: "Bot",
    sortOrder: 9,
    published: true,
  },
  {
    id: "seed-sqcat-word",
    title: "ورد",
    description: "نمونه تمرین‌ها و سوالات ورد — قالب‌بندی و نگارش حرفه‌ای.",
    icon: "SquarePen",
    sortOrder: 10,
    published: true,
  },
  {
    id: "seed-sqcat-excel",
    title: "اکسل",
    description: "نمونه تمرین‌ها و سوالات اکسل — فرمول‌ها، جدول‌ها و نمودارها.",
    icon: "Table",
    sortOrder: 11,
    published: true,
  },
  {
    id: "seed-sqcat-powerpoint",
    title: "پاورپوینت",
    description: "نمونه تمرین‌ها و سوالات پاورپوینت — طراحی ارائه‌ی حرفه‌ای.",
    icon: "Presentation",
    sortOrder: 12,
    published: true,
  },
  {
    id: "seed-sqcat-access",
    title: "اکسس",
    description: "نمونه تمرین‌ها و سوالات اکسس — بانک اطلاعاتی، جدول‌ها و کوئری‌ها.",
    icon: "Database",
    sortOrder: 13,
    published: true,
  },
  {
    id: "seed-sqcat-photoshop",
    title: "فتوشاپ",
    description: "نمونه تمرین‌ها و سوالات فتوشاپ — ابزارها، لایه‌ها و روتوش.",
    icon: "Palette",
    sortOrder: 14,
    published: true,
  },
  {
    id: "seed-sqcat-net",
    title: "اینترنت",
    description: "نمونه سوالات اینترنت — جستجو، ایمیل و امنیت در وب.",
    icon: "Globe",
    sortOrder: 15,
    published: true,
  },
  {
    id: "seed-sqcat-content",
    title: "تولید محتوا",
    description: "نمونه سوالات تولید محتوا — ایده‌پردازی، نگارش و سئو.",
    icon: "PenTool",
    sortOrder: 16,
    published: true,
  },
  {
    id: "seed-sqcat-webdesign",
    title: "طراحی سایت",
    description: "نمونه سوالات طراحی سایت — HTML، CSS و طراحی واکنش‌گرا.",
    icon: "LayoutTemplate",
    sortOrder: 17,
    published: true,
  },
  {
    id: "seed-sqcat-appdesign",
    title: "طراحی اپلیکیشن",
    description: "نمونه سوالات طراحی اپلیکیشن — UI/UX و نمونه‌سازی.",
    icon: "Smartphone",
    sortOrder: 18,
    published: true,
  },
];

/**
 * ساخت دسته‌های پیش‌فرض در صورت خالی بودن جدول
 * (idempotent و امن در برابر رقابت همزمانی — الگوی ensureNavLinksSeeded).
 */
export async function ensureSampleQuestionCategoriesSeeded(): Promise<void> {
  const count = await db.sampleQuestionCategory.count();
  if (count === 0) {
    try {
      await db.sampleQuestionCategory.createMany({
        data: SAMPLE_QUESTION_CATEGORY_SEEDS,
      });
    } catch {
      // رقابت همزمانی: درخواست دیگری همین لحظه دسته‌ها را ساخته است
    }
  }
}

/**
 * دسته‌های منتشرشده همراه نمونه‌سؤال‌های منتشرشده‌ی هرکدام —
 * مرتب‌سازی مثل صفحه‌ی اول (sortOrder صعودی، سپس createdAt).
 */
export async function getPublishedCategoriesWithItems() {
  await ensureSampleQuestionCategoriesSeeded();
  return db.sampleQuestionCategory.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      items: {
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      },
    },
  });
}
