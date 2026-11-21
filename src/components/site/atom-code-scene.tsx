"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Atom as AtomIcon, Binary, Braces, Sigma } from "lucide-react";

/* ================================================================== */
/*  صحنه‌ی هیرو «اتم ↔ کدنویسی» — حلقه‌ی بی‌نهایت مورفینگ پیوسته        */
/*                                                                    */
/*  دو مفهوم اتم و برنامه‌نویسی در «یک» انیمیشن پیوسته ادغام شده‌اند:  */
/*  مدارهای الکترونی به‌آرامی تغییر شکل داده و به خطوط کدنویسی و       */
/*  نمادهای `</>` و `{}` و `>_` (پرامپت ترمینال) تبدیل می‌شوند و سپس    */
/*  با حرکتی نرم و تدریجی دوباره به مدارهای اتم بازمی‌گردند — بدون     */
/*  توقف، بدون پرش، بدون تعویض ناگهانی و بدون جابه‌جایی اسلایدی؛      */
/*  ابتدا و انتهای چرخه (T = ۱۸ ثانیه) کاملاً یکپارچه‌اند (t=0 ≡ t=1). */
/*                                                                    */
/*  سازوکار:                                                          */
/*  • هر مدار همان صفحه‌ی سه‌بعدی فعلی اتم است (rotateZ·rotateX روی     */
/*    استیج پرسپکتیو) — هویت بصری، رنگ‌ها، نورپردازی و تمِ اتم کاملاً  */
/*    محفوظ می‌ماند: حلقه با همان گرادیان عمق currentColor و ضخامت     */
/*    یکنواخت، الکترون‌های کروی همان `.atom-electron`، هسته و هاله‌ها   */
/*    و المان‌های شناور عیناً همان CSS خالصِ قبلی.                      */
/*  • «شکل» هر مدار = زنجیره‌ی ثابت سگمنت‌های Bézier مکعبی (تعداد ثابت  */
/*    برای دو سر حالت): حالت «اتم» = دایره‌ی دقیق r=۱۰۰ و حالت «کد» = */
/*    خط کد (گوشه‌های تیز با کنترل‌های هم‌خط؛ آکولادها با Catmull-Rom  */
/*    نرم). مورف = درون‌یابی نقطه‌به‌نقطه‌ی p0/c1/c2/p1 با easing درون- */
/*    بیرون مکعبی — پیوستگی کامل هندسی در تمام مسیر.                  */
/*  • الکترون‌ها هیچ‌وقت نمی‌ایستند: در فاز اتم روی مدار و در فاز کد     */
/*    به‌شکل «توکن‌های داده» روی خط کد می‌لغزند؛ موقعیت هر فریم با       */
/*    نمونه‌برداری از «همان مسیرِ در حال تغییر» محاسبه می‌شود پس هیچ‌گاه */
/*    از خط جدا نمی‌شوند. تعداد دورِ هر الکترون در هر چرخه عدد صحیح     */
/*    است تا در بسته‌شدن حلقه هیچ پرشی نداشته باشیم.                    */
/*  • زمان‌بندی پلکانی (stagger): مدارها با اختلاف ~۰٫۷ ثانیه یکی‌یکی  */
/*    مورف می‌شوند — به کد: t∈[.۳۰,.۵۲] و بازگشت: t∈[.۷۲,.۹۴].         */
/*  • موتور rAF سبک است (چند path و transform در هر فریم)؛ با         */
/*    IntersectionObserver هنگام خروج از دید متوقف می‌شود و با         */
/*    جبران dt (سقف ۱۰۰ms) پس از مخفی‌بودن تب، بدون پرش ادامه می‌یابد؛  */
/*    پاسبانِ ساعت نیز در تعلیقِ نبض rAF (فریمِ توکارِ پیش‌نمایش)         */
/*    شمارنده‌ی جایگزین ۳۰fps را فعال می‌کند تا اتم هرگز متوقف نماند.    */
/*  • prefers-reduced-motion → صحنه‌ی ایستای اتم (همان مارک‌آپ SSR).     */
/*  • رندر اولیه (SSR / بدون JS) = دایره‌های کامل اتم؛ موتور دقیقاً از */
/*    همان حالت شروع می‌کند پس هیچ پرش هیدرشن رخ نمی‌دهد.              */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  هندسه — ساخت و درون‌یابی زنجیره‌ی Bézier                            */
/* ------------------------------------------------------------------ */

type Pt = [number, number];
type Seg = { p0: Pt; c1: Pt; c2: Pt; p1: Pt };

/** دایره‌ی دقیق با n سگمنت مکعبی (n+1 لنگر؛ لنگر آخر = اول) — همان
 *  تقریب استاندارد circle-approximation با کنترل‌های مماسی. */
function circleSegs(n: number): Seg[] {
  const alpha = (2 * Math.PI) / n;
  const off = (4 / 3) * Math.tan(alpha / 4) * 100;
  const pt = (k: number): Pt => {
    const a = -Math.PI / 2 + alpha * k;
    return [100 + 100 * Math.cos(a), 100 + 100 * Math.sin(a)];
  };
  const tan = (k: number): Pt => {
    const a = -Math.PI / 2 + alpha * k;
    return [-Math.sin(a), Math.cos(a)];
  };
  const segs: Seg[] = [];
  for (let k = 0; k < n; k++) {
    const p0 = pt(k);
    const p1 = pt(k + 1);
    const t0 = tan(k);
    const t1 = tan(k + 1);
    segs.push({
      p0,
      c1: [p0[0] + off * t0[0], p0[1] + off * t0[1]],
      c2: [p1[0] - off * t1[0], p1[1] - off * t1[1]],
      p1,
    });
  }
  return segs;
}

/** خط کدِ گوشه‌دار — کنترل‌ها روی ⅓ و ⅔ هر پاره (هم‌خط ⇒ خط راست). */
function straightSegs(A: Pt[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < A.length - 1; i++) {
    const [x0, y0] = A[i];
    const [x1, y1] = A[i + 1];
    segs.push({
      p0: A[i],
      c1: [x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3],
      c2: [x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3],
      p1: A[i + 1],
    });
  }
  return segs;
}

/** Catmull-Rom یکنواخت → Bézier (انتهاها با همسایه‌ی تکراری clamped) —
 *  برای آکولادهای نرم `{ }` که با همان لنگرها خمیده رندر می‌شوند. */
function crSegs(A: Pt[]): Seg[] {
  const n = A.length;
  const P = (i: number): Pt => A[Math.max(0, Math.min(n - 1, i))];
  const segs: Seg[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = A[i];
    const p1 = A[i + 1];
    const pm = P(i - 1);
    const pp = P(i + 2);
    segs.push({
      p0,
      c1: [p0[0] + (p1[0] - pm[0]) / 6, p0[1] + (p1[1] - pm[1]) / 6],
      c2: [p1[0] - (pp[0] - p0[0]) / 6, p1[1] - (pp[1] - p0[1]) / 6],
      p1,
    });
  }
  return segs;
}

/** مسیر کدِ «بسته» — خط کد + بازگشتِ همان خط روی خودش (retrace):
 *  زنجیره‌ی پیوسته‌ی بسته (نقطه‌ی پایان ≡ نقطه‌ی شروع) که نماد را عیناً
 *  همان‌طور رندر می‌کند (بازگشت دقیقاً روی خودِ خط می‌رود و دیده نمی‌شود)
 *  اما الکترون/توکن تا انتهای خط می‌لغزد و بی‌هیچ پرشی همان مسیر را
 *  برگردانی می‌خزد — مثل قلمِ تایپ که سطر را می‌نویسد و به ابتدای سطر
 *  برمی‌گردد. بسته‌بودنِ زنجیره در «هر» فاز مورف (دایره یا کد) تضمین
 *  می‌کند دورِ الکترون همیشه پیوسته بسته می‌شود — هرگز تلپورت نمی‌شود. */
function closedCodeSegs(make: (A: Pt[]) => Seg[], A: Pt[]): Seg[] {
  const fwd = make(A);
  const back = make([...A].reverse());
  return [...fwd, ...back];
}

/* خطوط کد در مختصات صفحه‌ی مدار (viewBox 200×200) — هرکدام یک خطِ
 * پیوسته‌ی «کدنویسی» است که از یک حرکت قلم رسم می‌شود:
 *  • مدار ۱ (teal)    → `</>` : خطی که < و / و > را در یک پیچ‌وتاب می‌نویسد؛
 *  • مدار ۲ (violet)  → `{ }` : دو آکولاد نرم که با خط زیرین به هم متصل‌اند؛
 *  • مدار ۳ (emerald) → `>_`  : پرامپت ترمینال (شورون + خط تایپ). */
const CODE_O1: Pt[] = [
  [62, 52],
  [32, 100],
  [62, 148],
  [72, 147],
  [100, 100],
  [128, 53],
  [138, 52],
  [168, 100],
  [138, 148],
];
const CODE_O2: Pt[] = [
  [75, 45],
  [35, 80],
  [65, 100],
  [35, 120],
  [75, 155],
  [125, 155],
  [165, 120],
  [135, 100],
  [165, 80],
  [125, 45],
];
const CODE_O3: Pt[] = [
  [140, 60],
  [155, 80],
  [170, 100],
  [155, 120],
  [140, 140],
  [110, 147],
  [80, 148],
  [50, 149],
  [25, 149],
];

/* پنجره‌های مورف هر مدار (کسری از چرخه‌ی ۱۸ ثانیه) — پلکانی برای
 * موج آبشاری طبیعی؛ «بازگشت» همیشه پیش از پایان چرخه کامل می‌شود تا
 * حالت t=1 دقیقاً با t=0 (اتم کامل) برابر باشد. */
type Win = readonly [number, number];

type OrbitDef = {
  tipZ: number;
  tipX: number;
  size: number;
  colorCls: string;
  /** دورهای الکترون در هر چرخه — عدد صحیح ⇒ بدون پرش در بسته‌شدن حلقه */
  loops: number;
  dir: 1 | -1;
  out: Win;
  back: Win;
  circle: Seg[];
  code: Seg[];
  /* جهت‌گیری «خط کد» — در فاز کد صفحه‌ی مدار به‌آرامی به این جهت
     هم‌سو می‌شود تا سه خط، مثل سه سطر کد، تقریباً افقی و لایه‌لایه
     دور هسته بنشینند (به‌جای سه زاویه‌ی متقاطعِ مداری)؛ بازگشت به
     زاویه‌ی مداریِ اصلی در مورفِ معکوس انجام می‌شود. */
  codeTipZ: number;
  codeTipX: number;
  /** جابه‌جایی عمودی صفحه در فاز کد (٪ ارتفاع مدار) — پله‌ای نرم */
  codeOffY: number;
  /** جابه‌جایی عمق صفحه در فاز کد (px) — پارالاکس ملایم */
  codeOffZ: number;
  electrons: { phase: number; dotCls: string }[];
};

const ORBITS: OrbitDef[] = [
  {
    tipZ: 0,
    tipX: 72,
    size: 1,
    loops: 2,
    dir: 1,
    out: [0.3, 0.44],
    back: [0.8, 0.94],
    colorCls: "text-teal-700/75 dark:text-teal-300/50",
    circle: circleSegs(16),
    code: closedCodeSegs(straightSegs, CODE_O1),
    codeTipZ: -6,
    codeTipX: 64,
    codeOffY: -17,
    codeOffZ: 14,
    electrons: [
      { phase: 35, dotCls: "atom-electron--teal" },
      { phase: 215, dotCls: "atom-electron--teal" },
    ],
  },
  {
    tipZ: 62,
    tipX: 64,
    size: 0.96,
    loops: 1,
    dir: -1,
    out: [0.34, 0.48],
    back: [0.76, 0.9],
    colorCls: "text-violet-700/70 dark:text-violet-300/45",
    circle: circleSegs(18),
    code: closedCodeSegs(crSegs, CODE_O2),
    codeTipZ: 0,
    codeTipX: 64,
    codeOffY: 0,
    codeOffZ: 0,
    electrons: [{ phase: 150, dotCls: "atom-electron--violet" }],
  },
  {
    tipZ: 119,
    tipX: 78,
    size: 0.9,
    loops: 1,
    dir: 1,
    out: [0.38, 0.52],
    back: [0.72, 0.86],
    colorCls: "text-emerald-700/70 dark:text-emerald-300/45",
    circle: circleSegs(16),
    code: closedCodeSegs(straightSegs, CODE_O3),
    codeTipZ: 6,
    codeTipX: 64,
    codeOffY: 17,
    codeOffZ: -14,
    electrons: [
      { phase: 80, dotCls: "atom-electron--emerald" },
      { phase: 260, dotCls: "atom-electron--amber" },
    ],
  },
];

/** طول چرخه‌ی بی‌نهایت (ثانیه) */
const CYCLE = 18;

/* درون‌یابی در بافر مشترک (بدون تخصیص جدید در هر فریم) */
const BUF: Seg[][] = ORBITS.map((o) =>
  o.circle.map((s) => ({
    p0: [...s.p0] as Pt,
    c1: [...s.c1] as Pt,
    c2: [...s.c2] as Pt,
    p1: [...s.p1] as Pt,
  })),
);

function lerpInto(buf: Seg[], a: Seg[], b: Seg[], m: number) {
  for (let i = 0; i < buf.length; i++) {
    const A = a[i];
    const B = b[i];
    const D = buf[i];
    D.p0[0] = A.p0[0] + (B.p0[0] - A.p0[0]) * m;
    D.p0[1] = A.p0[1] + (B.p0[1] - A.p0[1]) * m;
    D.c1[0] = A.c1[0] + (B.c1[0] - A.c1[0]) * m;
    D.c1[1] = A.c1[1] + (B.c1[1] - A.c1[1]) * m;
    D.c2[0] = A.c2[0] + (B.c2[0] - A.c2[0]) * m;
    D.c2[1] = A.c2[1] + (B.c2[1] - A.c2[1]) * m;
    D.p1[0] = A.p1[0] + (B.p1[0] - A.p1[0]) * m;
    D.p1[1] = A.p1[1] + (B.p1[1] - A.p1[1]) * m;
  }
}

const f2 = (v: number) => Math.round(v * 100) / 100;

function buildD(segs: Seg[]): string {
  let d = `M ${f2(segs[0].p0[0])} ${f2(segs[0].p0[1])}`;
  for (const s of segs) {
    d += ` C ${f2(s.c1[0])} ${f2(s.c1[1])} ${f2(s.c2[0])} ${f2(s.c2[1])} ${f2(s.p1[0])} ${f2(s.p1[1])}`;
  }
  return d;
}

/** نمونه‌برداری نقطه روی زنجیره (s ∈ [0,1) روی کل مسیر) */
function samplePoint(segs: Seg[], sRaw: number): Pt {
  const n = segs.length;
  const s = ((sRaw % 1) + 1) % 1;
  const x = Math.min(n - 1e-6, s * n);
  const i = Math.floor(x);
  const u = x - i;
  const sg = segs[i];
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return [
    a * sg.p0[0] + b * sg.c1[0] + c * sg.c2[0] + d * sg.p1[0],
    a * sg.p0[1] + b * sg.c1[1] + c * sg.c2[1] + d * sg.p1[1],
  ];
}

/* easing درون-بیرون مکعبی — شروع/پایان هر مورف با سرعت صفر (نرم) */
function easeIO(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function morphAt(t: number, w: Win): number {
  return easeIO((t - w[0]) / (w[1] - w[0]));
}

/* پیش‌سپردن — به‌جای چرخش بی‌وقفه‌ی ۸۰ثانیه‌ای (که خطوط کد را در زاویه‌های
 * تصادفی می‌چرخاند)، یک «رقص سینوسی پیوسته و بی‌درنگ» است که با چرخه‌ی
 * ۱۸ثانیه‌ای کاملاً سنکرون است و هیچ‌وقت نمی‌ایستد:
 *  • در فاز اتم، اتم با نرخ ملایم هم‌ترازِ حالت قبل می‌غلتد (اوج ≈ ۴٫۲°/ث
 *    در برابر ۴٫۵°/ث قبلی) — حس کروی پیوسته‌ی اتم عیناً زنده می‌ماند؛
 *  • در فاز کد، صحنه به‌جای ایستِ کامل، خیلی ملایم در محدوده‌ی ±۱۲ درجه
 *    سُر می‌خورد (گلیف‌ها خوانا می‌مانند و صحنه هرگز «متوقف» دیده نمی‌شود)؛
 *  • تابع در t=0 و t=1 دقیقاً صفر و شیبِ دو انتها دقیقاً برابر است (۲πA/۱۸)
 *    ⇒ بسته‌شدن حلقه کاملاً بی‌پرش و C¹-پیوسته است — همان قاعده‌ی
 *    «دورهای صحیح» الکترون‌ها برای بی‌پرش‌بودن حلقه، اینجا نیز رعایت شده
 *    است (کل چرخه دقیقاً یک نوسان کامل ⇒ زاویه‌ی ابتدا و انتها یکسان). */
const PRECESS_AMPLITUDE = 12; /* اوج نوسان (درجه) — سرعت اوج ≈ ۴٫۲°/ث (≈ ۴٫۵°/ث قبلی) */

function swayAt(t: number): number {
  return Math.sin(2 * Math.PI * t);
}

/** d اولیه (حالت اتم) برای رندر SSR — بدون JS همین دایره‌ها دیده می‌شود */
const INIT_D = ORBITS.map((o) => buildD(o.circle));

/** وضعیت ایستای الکترون‌ها (SSR/کاهش حرکت): نقطه‌ی دایره در همان
 *  فاز + بیل‌بورد وارونه — دقیقاً هم‌ارز چیدمان ایستای اتم فعلی. */
const TOKEN_INIT = ORBITS.map((o) =>
  o.electrons.map((e) => {
    const a = (e.phase * Math.PI) / 180;
    const P: Pt = [100 + 100 * Math.cos(a), 100 + 100 * Math.sin(a)];
    return {
      left: P[0] / 2,
      top: P[1] / 2,
      transform: `rotateX(${-o.tipX}deg) rotateZ(${-o.tipZ}deg) translateZ(8px)`,
    };
  }),
);

/* ------------------------------------------------------------------ */
/*  المان‌های شناور — نمادهای ریاضی، برنامه‌نویسی و اتم                    */
/*  آیتم‌های «mobile» در موبایل هم نمایش داده می‌شوند (بقیه فقط دسکتاپ)  */
/* ------------------------------------------------------------------ */

function FloaterChip({ Icon, colorCls }: { Icon: LucideIcon; colorCls: string }) {
  return (
    <span
      className={`flex size-10 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03] shadow-lg shadow-black/10 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-black/20 ${colorCls}`}
    >
      <Icon className="size-5" strokeWidth={1.7} />
    </span>
  );
}

const FLOATERS: {
  node: ReactNode;
  posCls: string;
  anim: "a" | "b" | "c";
  dur: number;
  delay: number;
  mobile: boolean;
}[] = [
  {
    node: (
      <span className="font-serif text-2xl italic text-teal-600/60 dark:text-teal-300/55 md:text-4xl">
        π
      </span>
    ),
    posCls: "right-[2%] top-[10%]",
    anim: "a",
    dur: 9,
    delay: -1.2,
    mobile: true,
  },
  {
    node: (
      <span className="font-serif text-2xl italic text-emerald-600/55 dark:text-emerald-300/50 md:text-3xl">
        ∑
      </span>
    ),
    posCls: "left-[2%] top-[24%]",
    anim: "b",
    dur: 11,
    delay: -3.4,
    mobile: true,
  },
  {
    node: (
      <span className="font-mono text-base font-bold text-teal-600/55 dark:text-teal-300/50 md:text-xl">
        &lt;/&gt;
      </span>
    ),
    posCls: "left-[12%] top-[2%]",
    anim: "c",
    dur: 8,
    delay: -2.1,
    mobile: false,
  },
  {
    node: (
      <FloaterChip
        Icon={AtomIcon}
        colorCls="text-violet-600/70 dark:text-violet-300/70"
      />
    ),
    posCls: "right-[-2%] top-[44%]",
    anim: "b",
    dur: 12,
    delay: -4.8,
    mobile: false,
  },
  {
    node: (
      <span className="font-mono text-xl font-bold text-violet-600/50 dark:text-violet-300/45 md:text-2xl">
        √x
      </span>
    ),
    posCls: "right-[3%] top-[64%]",
    anim: "c",
    dur: 10,
    delay: -0.6,
    mobile: false,
  },
  {
    node: (
      <span className="font-serif text-2xl italic text-amber-600/50 dark:text-amber-200/45 md:text-3xl">
        ∞
      </span>
    ),
    posCls: "left-[6%] bottom-[6%]",
    anim: "a",
    dur: 12,
    delay: -5.2,
    mobile: false,
  },
  {
    node: (
      <span className="font-serif text-xl italic text-violet-600/50 dark:text-violet-300/45 md:text-2xl">
        λ
      </span>
    ),
    posCls: "right-[16%] bottom-[-2%]",
    anim: "b",
    dur: 9.5,
    delay: -2.7,
    mobile: false,
  },
  {
    node: (
      <span className="font-mono text-base font-bold text-emerald-600/45 dark:text-emerald-300/40 md:text-lg">
        {"{ }"}
      </span>
    ),
    posCls: "left-[20%] bottom-[-4%]",
    anim: "a",
    dur: 10.5,
    delay: -7.3,
    mobile: false,
  },
  {
    node: (
      <FloaterChip
        Icon={Sigma}
        colorCls="text-teal-600/70 dark:text-teal-300/70"
      />
    ),
    posCls: "left-[-5%] top-[2%]",
    anim: "c",
    dur: 9,
    delay: -1.9,
    mobile: false,
  },
  {
    node: (
      <FloaterChip
        Icon={Binary}
        colorCls="text-amber-600/70 dark:text-amber-200/70"
      />
    ),
    posCls: "right-[10%] bottom-[-6%]",
    anim: "b",
    dur: 11,
    delay: -6.4,
    mobile: false,
  },
  {
    node: (
      <FloaterChip
        Icon={Braces}
        colorCls="text-rose-600/60 dark:text-rose-300/60"
      />
    ),
    posCls: "left-[-6%] top-[52%]",
    anim: "a",
    dur: 10.5,
    delay: -3.9,
    mobile: false,
  },
];

export function AtomCodeScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  const precessRef = useRef<HTMLDivElement>(null);
  const orbitRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gRefs = useRef<(SVGGElement | null)[]>([]);
  const mainRefs = useRef<(SVGPathElement | null)[]>([]);
  const underRefs = useRef<(SVGPathElement | null)[]>([]);
  const eRefs = useRef<(HTMLDivElement | null)[][]>([[], [], []]);
  const sizes = useRef<number[]>([0, 0, 0]);
  const stopRefs = useRef<(SVGStopElement | null)[][]>([[], [], []]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return; // صحنه‌ی ایستای اتم — همان مارک‌آپ SSR
    }

    /* ۱) اندازه‌گیری صفحه‌های مدار + سوئیچ توکن‌ها به جای‌گذاری transform
       (نقطه‌ی درصدیِ قبل و translate بعدی دقیقاً یکجا هستند ⇒ بدون پرش) */
    ORBITS.forEach((_, i) => {
      sizes.current[i] = orbitRefs.current[i]?.offsetWidth ?? 0;
      const stops = orbitRefs.current[i]?.querySelectorAll(".atom-stop");
      if (stops) {
        stopRefs.current[i] = Array.from(stops) as unknown as SVGStopElement[];
      }
      for (const el of eRefs.current[i]) {
        if (el) {
          el.style.left = "0px";
          el.style.top = "0px";
        }
      }
    });

    /* ۲) به‌روزرسانی یک فریم از صحنه — t=0 ⇒ همان حالت SSR */
    const update = (t: number) => {
      /* پیش‌سپردن سینوسی پیوسته — غلتش آرام در فاز اتم و سُرخوردن ملایم
         در فاز کد؛ هیچ‌وقت نمی‌ایستد */
      if (precessRef.current) {
        precessRef.current.style.transform = `rotate(${(PRECESS_AMPLITUDE * swayAt(t)).toFixed(2)}deg)`;
      }
      for (let i = 0; i < ORBITS.length; i++) {
        const o = ORBITS[i];
        const m = morphAt(t, o.out) - morphAt(t, o.back);
        lerpInto(BUF[i], o.circle, o.code, m);
        const d = buildD(BUF[i]);
        const under = underRefs.current[i];
        const main = mainRefs.current[i];
        const g = gRefs.current[i];
        if (under) under.setAttribute("d", d);
        if (main) main.setAttribute("d", d);
        if (g) g.setAttribute("stroke-width", (2.4 + 1.8 * m).toFixed(2));

        /* نورپردازی عمق — گرادیان محوِ سمت دور (سنگین‌سازی حلقه‌ی اتم) در
           فاز کد به‌آرامی به روشناییِ تقریباً یکنواخت باز می‌شود تا نیمه‌ی
           دورِ نمادها محو نماند و خطوط کد خوانا باشند؛ بازگشت همگام با
           مورفِ معکوس به همان گرادیان عمق اتم برمی‌گردد. */
        const stops = stopRefs.current[i];
        if (stops[0]) stops[0].setAttribute("stop-opacity", (0.26 + 0.52 * m).toFixed(3));
        if (stops[1]) stops[1].setAttribute("stop-opacity", (0.58 + 0.34 * m).toFixed(3));

        /* جهت‌گیری فعلی صفحه — در فاز کد به «سطر کد» هم‌سو و لایه‌لایه
           می‌شود؛ جابه‌جایی (٪ ارتفاع / px عمق) هم قبل از چرخش‌ها در
           مختصات جهان اعمال می‌شود تا سه خط دورِ هسته پله‌ای بنشینند.
           m=0 ⇒ دقیقاً همان زاویه‌ی مداریِ اتم فعلی. */
        const curZ = o.tipZ + (o.codeTipZ - o.tipZ) * m;
        const curX = o.tipX + (o.codeTipX - o.tipX) * m;
        const curOffY = o.codeOffY * m;
        const curOffZ = o.codeOffZ * m;
        const orbitEl = orbitRefs.current[i];
        if (orbitEl) {
          orbitEl.style.transform = `translate(-50%, -50%) translate3d(0px, ${curOffY.toFixed(2)}%, ${curOffZ.toFixed(2)}px) rotateZ(${curZ.toFixed(2)}deg) rotateX(${curX.toFixed(2)}deg)`;
        }

        const W = sizes.current[i];
        if (W <= 0) continue;
        for (let j = 0; j < o.electrons.length; j++) {
          const el = eRefs.current[i][j];
          if (!el) continue;
          const e = o.electrons[j];
          /* پارامتر روی مسیرِ فعلی — تعداد دورها صحیح ⇒ پیوستگی حلقه */
          const s = (e.phase + 90) / 360 + o.dir * o.loops * t;
          const P = samplePoint(BUF[i], s);
          const px = (P[0] / 200) * W;
          const py = (P[1] / 200) * W;
          /* بیل‌بورد: وارونه‌ی چرخش‌های «فعلی» صفحه‌ی مدار ⇒ کره همیشه
             رو به دوربین + translateZ(8px) برای فاصله از صفحه‌ی حلقه */
          el.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px) rotateX(${-curX.toFixed(2)}deg) rotateZ(${-curZ.toFixed(2)}deg) translateZ(8px)`;
        }
      }
    };
    update(0);

    /* ۳) ردیابی تغییر اندازه (رزولوشن/چرخش) برای مقیاس translate توکن‌ها */
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) {
        const idx = orbitRefs.current.indexOf(en.target as HTMLDivElement);
        if (idx >= 0) sizes.current[idx] = en.contentRect.width;
      }
    });
    for (const el of orbitRefs.current) if (el) ro.observe(el);

    /* ۴) ساعتِ انیمیشن — rAF اصلی + پاسبانِ مقاوم:
       نبضِ rAF ممکن است در بسترهای توکار/پیش‌نمایش (فریمِ خارج از دید،
       درجه‌بندی شدید فریم‌های توافق‌ناپذیرِ متقاطع و…) توسط مرورگر کاملاً
       معلق شود — در این حالت انیمیشن‌های CSS خالص (هسته/هاله/نمادهای
       شناور) همچنان کار می‌کنند اما بدون ساعت، اتم (حلقه‌ها و الکترون‌ها)
       کاملاً می‌ایستد. پاسبان در صورت سکونِ نبض، شمارنده‌ی جایگزین ۳۰fps
       را خودکار فعال می‌کند و به‌محض بازگشت rAF، ساعت را بی‌درنگ به آن
       بازمی‌گرداند — انیمیشن هرگز متوقف نمی‌ماند. */
    let raf = 0;
    let fallbackIv: ReturnType<typeof setInterval> | 0 = 0; /* شمارنده‌ی جایگزین — فقط هنگام تعلیق نبض rAF */
    let lastTick = performance.now(); /* آخرین لحظه‌ی اجرای واقعیِ step */
    let running = true;
    let inView = true;
    let elapsed = 0;
    let last = performance.now();
    const step = (now: number) => {
      lastTick = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt < 0) dt = 0;
      if (dt > 0.1) dt = 0.1;
      elapsed += dt;
      update((elapsed % CYCLE) / CYCLE);
      if (running && !fallbackIv) raf = requestAnimationFrame(step);
    };
    const armRaf = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(step);
    };
    armRaf();

    /* پاسبان — اگر بیش از ~۰٫۶ ثانیه (با دیده‌شدن صفحه و صحنه) نبضی نرسد،
       جایگزین ۳۰fps فعال می‌شود؛ هر دور یک rAF آزمایشی: به‌محض شلیکِ
       نبض مرورگر، جایگزین جمع می‌شود و rAF اصلی فرمان را می‌گیرد. */
    const watchdog = setInterval(() => {
      if (!running || !inView || document.hidden) return;
      const stalled = performance.now() - lastTick > 600;
      if (stalled && !fallbackIv) {
        last = performance.now();
        lastTick = performance.now();
        fallbackIv = setInterval(() => step(performance.now()), 33);
      }
      if (fallbackIv) {
        requestAnimationFrame(() => {
          if (fallbackIv) {
            clearInterval(fallbackIv);
            fallbackIv = 0;
            last = performance.now();
            lastTick = performance.now();
            armRaf();
          }
        });
      }
    }, 300);

    /* بازگشت به تبِ دیده‌شده — نبض بلافاصله کیک می‌شود (بدون انتظارِ پاسبان) */
    const onVisible = () => {
      if (document.hidden || !running || !inView) return;
      if (performance.now() - lastTick > 600) {
        last = performance.now();
        lastTick = performance.now();
        armRaf();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    /* ۵) توقف/ادامه با دیده‌شدن صحنه — فقط وقتی هیرو در دید است بچرخ */
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries[0]?.isIntersecting ?? false;
        inView = vis;
        if (vis && !running) {
          running = true;
          last = performance.now();
          lastTick = performance.now();
          if (!fallbackIv) armRaf();
        } else if (!vis && running) {
          running = false;
          cancelAnimationFrame(raf);
          if (fallbackIv) {
            clearInterval(fallbackIv);
            fallbackIv = 0;
          }
        }
      },
      { threshold: 0 },
    );
    if (rootRef.current) io.observe(rootRef.current);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      if (fallbackIv) clearInterval(fallbackIv);
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisible);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      /* پس‌زمینه‌ی کامل صحنه:
         • دسکتاپ: سمت چپ (نزدیک ستون دکمه‌های سه‌گانه) — md:right-auto + w-[46..48%]
         • موبایل: پس‌زمینه‌ی محتوا — از بالاترین نقطه‌ی زیر هدر (pt-24 ≈ ارتفاع هدر)
           شروع می‌شود و متن‌ها/دکمه‌ها روی آن قرار می‌گیرند (بدون بیرون‌زدگی) */
      className="absolute top-0 bottom-0 left-0 right-0 z-0 flex items-center justify-center max-md:items-start max-md:pt-24 md:right-auto md:w-[46%] lg:w-[48%]"
    >
      <div
        className="animate-hero-in-scale relative aspect-square w-[min(88vw,320px)] md:w-[min(46vw,430px)] lg:w-[520px] xl:w-[560px]"
        style={{ animationDelay: "0.05s" }}
      >
        {/* درخشش محیطی خیلی ملایم پشت اتم — در حد المان‌های شناور */}
        <div className="absolute inset-[-16%] rounded-full bg-[radial-gradient(circle,rgba(13,148,136,0.05),rgba(124,58,237,0.03)_45%,transparent_70%)] dark:bg-[radial-gradient(circle,rgba(45,212,191,0.07),rgba(167,139,250,0.05)_45%,transparent_70%)]" />

        {/* صحنه‌ی سه‌بعدی: پیش‌سپردنِ تناوبی (rAF) ⟵ استیج پرسپکتیو ⟵ فضای preserve-3d */}
        <div ref={precessRef} className="absolute inset-0">
          <div className="atom-stage absolute inset-0">
            <div className="atom-world">
              {/* هسته — داخل همان فضای سه‌بعدی تا الکترون‌های سمت دور واقعاً پشتش پنهان شوند */}
              <div className="absolute left-1/2 top-1/2">
                <div className="atom-glow-pulse absolute left-1/2 top-1/2 size-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(13,148,136,0.14),rgba(13,148,136,0.06)_30%,rgba(124,58,237,0.05)_55%,transparent_72%)] dark:bg-[radial-gradient(circle,rgba(45,212,191,0.15),rgba(45,212,191,0.07)_30%,rgba(167,139,250,0.05)_55%,transparent_72%)]" />
                <span className="atom-halo absolute left-1/2 top-1/2 size-[120px] rounded-full border border-teal-600/20 dark:border-teal-300/15" />
                <span
                  className="atom-halo absolute left-1/2 top-1/2 size-[120px] rounded-full border border-teal-600/14 dark:border-teal-300/10"
                  style={{ animationDelay: "-2.2s" }}
                />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className="atom-nucleus-spin relative size-[76px]">
                    {/* هسته — خوشه‌ی فشرده‌ی «تقریبا هم‌اندازه» ها: چهار
                        پروتون/نوترون با قطر تقریباً یکسان (۱۵±۱px) که
                        به هم چسبیده‌اند و دورِ نقطه‌ی داغ مرکزی می‌چرخند */}
                    <span className="atom-nd atom-nd--teal absolute left-[44%] top-[40%] size-[15px]" />
                    <span className="atom-nd atom-nd--violet absolute left-[38%] top-[50%] size-[15px]" />
                    <span className="atom-nd atom-nd--emerald absolute left-[50%] top-[45%] size-[14px]" />
                    <span className="atom-nd atom-nd--amber absolute left-[45%] top-[55%] size-[14px]" />
                    <span className="atom-nd-hot absolute left-1/2 top-1/2" />
                  </div>
                </div>
              </div>

              {/* مدارها — همان صفحه‌های سه‌بعدی اتم؛ شکل هرکدام در
                  حلقه‌ی بی‌نهایت بین «دایره» و «خط کد» مورف می‌شود */}
              {ORBITS.map((o, i) => {
                const init = TOKEN_INIT[i];
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      orbitRefs.current[i] = el;
                    }}
                    className={`atom-orbit aspect-square ${o.colorCls}`}
                    style={{
                      width: `${(o.size * 100).toFixed(2)}%`,
                      transform: `translate(-50%, -50%) rotateZ(${o.tipZ}deg) rotateX(${o.tipX}deg)`,
                    }}
                  >
                    {/* حلقه‌ی تمیز سه‌بعدی — ضخامت یکنواخت + گرادیان عمق؛
                        d آن در حلقه‌ی مورف به‌آرامی بین مدار و خط کد تغییر
                        می‌کند (زیرسازیِ کم‌رنگ پیوستگی را تضمین می‌کند) */}
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                      viewBox="0 0 200 200"
                      fill="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient
                          id={`atom-ring-grad-${i}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0"
                            className="atom-stop"
                            stopColor="currentColor"
                            stopOpacity="0.26"
                          />
                          <stop
                            offset="0.52"
                            className="atom-stop"
                            stopColor="currentColor"
                            stopOpacity="0.58"
                          />
                          <stop
                            offset="1"
                            className="atom-stop"
                            stopColor="currentColor"
                            stopOpacity="1"
                          />
                        </linearGradient>
                      </defs>
                      <g
                        ref={(el) => {
                          gRefs.current[i] = el;
                        }}
                        strokeWidth={2.4}
                      >
                        {/* زیرسازی نرم — مسیر در تمام مورف پیوسته می‌ماند */}
                        <path
                          ref={(el) => {
                            underRefs.current[i] = el;
                          }}
                          d={INIT_D[i]}
                          stroke="currentColor"
                          opacity="0.13"
                        />
                        {/* مسیر اصلی — ضخامت یکنواخت؛ عمق با گرادیان شفافیت */}
                        <path
                          ref={(el) => {
                            mainRefs.current[i] = el;
                          }}
                          d={INIT_D[i]}
                          stroke={`url(#atom-ring-grad-${i})`}
                        />
                      </g>
                    </svg>

                    {/* الکترون/توکن — کره‌ی همان `.atom-electron`؛ در فاز اتم
                        روی مدار و در فاز کد به‌شکل توکنِ داده روی خط کد */}
                    {o.electrons.map((e, j) => (
                      <div
                        key={j}
                        ref={(el) => {
                          eRefs.current[i][j] = el;
                        }}
                        className="atom-code-token"
                        style={{
                          left: `${init[j].left}%`,
                          top: `${init[j].top}%`,
                          transform: init[j].transform,
                        }}
                      >
                        <span className={`atom-electron ${e.dotCls}`} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* المان‌های شناور اطراف اتم */}
        {FLOATERS.map((f, i) => (
          <span
            key={i}
            className={`atom-float-${f.anim} absolute ${f.posCls} ${
              f.mobile ? "" : "hidden md:block"
            }`}
            style={{
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
            }}
          >
            {f.node}
          </span>
        ))}
      </div>
    </div>
  );
}
