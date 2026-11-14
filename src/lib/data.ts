import {
  Bot,
  Code,
  Gamepad2,
  Terminal,
  Palette,
  ShieldCheck,
  ChartColumnBig,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface Course {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  hours: number;
  sessions: number;
  level: "مقدماتی" | "متوسط" | "پیشرفته";
  students: number;
  gradient: string; // tailwind gradient classes for icon tile
  glow: string; // hover glow color
  tag?: string;
}

export const courses: Course[] = [
  {
    id: "ai",
    title: "هوش مصنوعی و یادگیری ماشین",
    description: "از مبانی ML و شبکه‌های عصبی تا ساخت و استقرار مدل‌های واقعی.",
    icon: Bot,
    hours: 42,
    sessions: 24,
    level: "پیشرفته",
    students: 68,
    gradient: "from-teal-400 to-emerald-600",
    glow: "group-hover:shadow-teal-500/25",
    tag: "پرمخاطب",
  },
  {
    id: "web",
    title: "طراحی و توسعه وب",
    description: "HTML، CSS، JavaScript و React برای ساخت سایت‌های مدرن و واکنش‌گرا.",
    icon: Code,
    hours: 36,
    sessions: 20,
    level: "مقدماتی",
    students: 92,
    gradient: "from-violet-400 to-purple-600",
    glow: "group-hover:shadow-violet-500/25",
  },
  {
    id: "kids",
    title: "کامپیوتر و برنامه‌نویسی کودکان",
    description: "یادگیری بازی‌محور برنامه‌نویسی و تفکر الگوریتمی برای ۷ تا ۱۴ سال.",
    icon: Gamepad2,
    hours: 24,
    sessions: 16,
    level: "مقدماتی",
    students: 45,
    gradient: "from-amber-400 to-orange-500",
    glow: "group-hover:shadow-amber-500/25",
    tag: "ویژه کودکان",
  },
  {
    id: "python",
    title: "برنامه‌نویسی پایتون",
    description: "زبان همه‌کاره پایتون از صفر تا ساخت ربات، اسکریپت و اپلیکیشن.",
    icon: Terminal,
    hours: 30,
    sessions: 18,
    level: "مقدماتی",
    students: 77,
    gradient: "from-emerald-400 to-teal-600",
    glow: "group-hover:shadow-emerald-500/25",
  },
  {
    id: "design",
    title: "طراحی گرافیک و UI/UX",
    description: "اصول طراحی، فیگما و تجربه کاربری برای ساخت رابط‌های حرفه‌ای.",
    icon: Palette,
    hours: 28,
    sessions: 15,
    level: "متوسط",
    students: 54,
    gradient: "from-fuchsia-400 to-pink-600",
    glow: "group-hover:shadow-fuchsia-500/25",
  },
  {
    id: "security",
    title: "امنیت و شبکه",
    description: "امنیت سایبری، نفوذ اخلاقی و مدیریت شبکه‌های سازمانی به صورت عملی.",
    icon: ShieldCheck,
    hours: 34,
    sessions: 19,
    level: "پیشرفته",
    students: 31,
    gradient: "from-rose-400 to-red-600",
    glow: "group-hover:shadow-rose-500/25",
  },
  {
    id: "data",
    title: "تحلیل داده و اکسل",
    description: "اکسل پیشرفته، Power BI و تحلیل داده برای تصمیم‌گیری هوشمند.",
    icon: ChartColumnBig,
    hours: 26,
    sessions: 14,
    level: "متوسط",
    students: 48,
    gradient: "from-lime-400 to-green-600",
    glow: "group-hover:shadow-lime-500/25",
  },
  {
    id: "marketing",
    title: "دیجیتال مارکتینگ",
    description: "سئو، تبلیغات، شبکه‌های اجتماعی و استراتژی رشد برند در فضای دیجیتال.",
    icon: TrendingUp,
    hours: 22,
    sessions: 12,
    level: "مقدماتی",
    students: 63,
    gradient: "from-sky-300 to-teal-500",
    glow: "group-hover:shadow-sky-400/25",
  },
];

export interface Testimonial {
  id: number;
  name: string;
  role: string;
  course: string;
  text: string;
  rating: number;
  color: string;
}

export const testimonials: Testimonial[] = [
  {
    id: 1,
    name: "سارا محمدی",
    role: "مهندس هوش مصنوعی",
    course: "دوره هوش مصنوعی",
    text: "دوره هوش مصنوعی مهارت‌یار مسیر شغلی من را کاملاً تغییر داد. پشتیبانی فوق‌العاده و پروژه‌های عملی واقعاً حرفه‌ای بودند. بعد از پایان دوره استخدام شدم!",
    rating: 5,
    color: "from-teal-400 to-emerald-600",
  },
  {
    id: 2,
    name: "علی رضایی",
    role: "توسعه‌دهنده فرانت‌اند",
    course: "دوره طراحی وب",
    text: "از صفر شروع کردم و الان سایت‌های واقعی طراحی می‌کنم. مدرس‌ها مفاهیم رو خیلی روان و با مثال‌های کاربردی توضیح می‌دن. ارزش هر دقیقه‌ش رو داره.",
    rating: 5,
    color: "from-violet-400 to-purple-600",
  },
  {
    id: 3,
    name: "مریم احمدی",
    role: "مادر دو فرزند",
    course: "کامپیوتر کودکان",
    text: "بچه‌هام با اشتیاق کلاس‌ها رو دنبال می‌کنن و بدون اینکه حس کنن دارن درس می‌خونن، برنامه‌نویسی یاد گرفتن. آموزش بازی‌محورشون واقعاً عالیه.",
    rating: 5,
    color: "from-amber-400 to-orange-500",
  },
  {
    id: 4,
    name: "حسین کریمی",
    role: "تحلیل‌گر داده",
    course: "دوره پایتون",
    text: "کیفیت ویدئوها و منظم بودن سرفصل‌ها چیزیه که هیچ‌جای دیگه ندیدم. تمرین‌های هر جلسه دقیقاً همون چیزی بود که تو محیط کار بهش نیاز داشتم.",
    rating: 4,
    color: "from-emerald-400 to-teal-600",
  },
  {
    id: 5,
    name: "نگار موسوی",
    role: "مدیر بازاریابی",
    course: "دیجیتال مارکتینگ",
    text: "بعد از این دوره کل استراتژی دیجیتال تیم‌مون رو بازطراحی کردیم و نتیجه‌ش رشد ۴۰ درصدی فروش بود. گواهینامه معتبرش هم تو رزومه‌م خیلی کمک کرد.",
    rating: 5,
    color: "from-fuchsia-400 to-pink-600",
  },
  {
    id: 6,
    name: "امیر تهرانی",
    role: "کارشناس امنیت شبکه",
    course: "دوره امنیت و شبکه",
    text: "آزمایشگاه‌های عملی و سناریوهای نفوذ واقعی، این دوره رو از بقیه جدا می‌کنه. انگار تو یه شرکت امنیتی دارم کار می‌کنم، نه یه کلاس آنلاین!",
    rating: 5,
    color: "from-rose-400 to-red-600",
  },
];

export interface Video {
  id: string;
  title: string;
  description: string;
  duration: string;
  views: number;
  level: string;
  image: string;
}

export const videos: Video[] = [
  {
    id: "v1",
    title: "هوش مصنوعی چیست؟ شروع سفر به دنیای آینده",
    description: "آشنایی با مفاهیم پایه AI، یادگیری ماشین و کاربردهای آن در زندگی روزمره.",
    duration: "۱۸:۴۲",
    views: 12400,
    level: "مقدماتی",
    image: "/images/video-ai.png",
  },
  {
    id: "v2",
    title: "اولین سایت خودت را بساز!",
    description: "در یک ویدئو، ساخت یک صفحه وب کامل و زیبا با HTML و CSS را یاد بگیر.",
    duration: "۲۴:۱۵",
    views: 9800,
    level: "مقدماتی",
    image: "/images/video-web.png",
  },
  {
    id: "v3",
    title: "برنامه‌نویسی بازی برای کودکان",
    description: "ساخت اولین بازی رایانه‌ای با بلوک‌های رنگی و منطق برنامه‌نویسی.",
    duration: "۱۲:۳۰",
    views: 15600,
    level: "ویژه کودکان",
    image: "/images/video-kids.png",
  },
];

export const navLinks = [
  { href: "#home", label: "خانه" },
  { href: "#courses", label: "دوره‌ها" },
  { href: "#register", label: "ثبت‌نام" },
  { href: "#verify", label: "استعلام گواهینامه" },
  { href: "#videos", label: "ویدئوها" },
  { href: "#testimonials", label: "نظرات" },
];
