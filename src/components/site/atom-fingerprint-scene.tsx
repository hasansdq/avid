"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Atom as AtomIcon, Binary, Braces, Sigma } from "lucide-react";

/* ================================================================== */
/*  صحنه‌ی هیرو «اتم ↔ اثر انگشت» — حلقه‌ی بی‌نهایت مورفینگ پیوسته      */
/*                                                                    */
/*  دو مفهوم اتم و اثر انگشت در «یک» انیمیشن پیوسته ادغام شده‌اند:      */
/*  مدارهای الکترونی به‌آرامی تغییر شکل داده و به رگه‌های منحصربه‌فرد  */
/*  اثر انگشت تبدیل می‌شوند و سپس با حرکتی نرم و تدریجی دوباره به      */
/*  مدارهای اتم بازمی‌گردند — بدون توقف، بدون پرش، بدون تعویض ناگهانی  */
/*  و بدون جابه‌جایی اسلایدی؛ ابتدا و انتهای چرخه (T = ۱۸ ثانیه)        */
/*  کاملاً یکپارچه‌اند (t=0 ≡ t=1).                                   */
/*                                                                    */
/*  سازوکار:                                                          */
/*  • هر مدار همان صفحه‌ی سه‌بعدی فعلی اتم است (rotateZ·rotateX روی     */
/*    استیج پرسپکتیو) — هویت بصری، رنگ‌ها، نورپردازی و تمِ اتم کاملاً  */
/*    محفوظ می‌ماند: حلقه با همان گرادیان عمق currentColor، الکترون‌های */
/*    کروی همان `.atom-electron`، هسته و هاله‌ها و المان‌های شناور     */
/*    عیناً همان CSS خالصِ قبلی.                                       */
/*  • «شکل» هر مدار = زنجیره‌ی ثابت سگمنت‌های Bézier مکعبی (تعداد ثابت  */
/*    برای دو سر حالت): حالت «اتم» = دایره‌ی دقیق r=۱۰۰ (۳۲ سگمنت) و حالت  */
/*    «اثر انگشت» = رگه‌ای از خانواده‌ی آفست با فاصله‌ی دقیقاً منظم.      */
/*    مورف = درون‌یابی نقطه‌به‌نقطه‌ی p0/c1/c2/p1 با easing درون-بیرون      */
/*    مکعبی — پیوستگی کامل هندسی در تمام مسیر.                            */
/*  • «اتم» = ۶ مدار (پوسته‌ی ۶‌حلقه‌ای چرخان/ژیروسکوپی) و «اثر انگشت» =   */
/*    ۸ خط: ۶ رگه‌ی بیرونی از مدارها مورف می‌شوند (۳ بیرونی‌ترین باز و      */
/*    منحرف با شکاف‌های پلکانی و انتهای flare) و ۲ رگه‌ی درونی‌ی هسته،      */
/*    هم‌زمان با محو شدن هسته‌ی اتم، در فاز اثر انگشت فید می‌شوند.         */
/*  • رگه‌ها = آفست‌های منحنی پایه (رگه k = پایه + k·D·نرمال + موج مشترک): */
/*    فاصله‌ی عمود خط‌مرکز رگه‌های مجاور «دقیقاً D» است در همه‌ی نقاط (منظم */
/*    بودن فاصله ساختاری) و خطوط هم‌زمان موج‌دار و ارگانیک می‌مانند — جریان */
/*    موازی رگه‌ها مثل اثر انگشت واقعی.                                   */
/*  • هسته‌ی اتم (گوی‌های کروی + هاله‌ها) در فاز اثر انگشت کاملاً محو می‌شود */
/*    تا فقط «خطوط رگه» دیده شود؛ در بازگشت اتم عین می‌گردد.              */
/*  • الکترون‌ها فقط به صحنه‌ی «اتم» تعلق دارند و دقیقاً روی خودِ خط مدار  */
/*    می‌لغزند؛ با شروع مورف زودتر محو می‌شوند (ELECTRON_FADE) تا در فاز    */
/*    اثر انگشت نمایش داده نشوند — موقعیت در حالت نامرئی هم به‌روز می‌شود */
/*    پس بازگشت بی‌پرش است (شکاف‌های رگه‌های باز بعد از محو شدن کامل       */
/*    الکترون‌ها باز می‌شوند).                                             */
/*  • زمان‌بندی پلکانی (stagger): رگه‌ها از هسته به بیرون یکی‌یکی شکل     */
/*    می‌گیرند (t∈[.۲۴,.۴۸]) و در بازگشت از بیرون به هسته بسته            */
/*    می‌شوند (t∈[.۷۲,.۹۳]).                                              */
/*  • موتور rAF سبک است؛ با IntersectionObserver هنگام خروج از دید      */
/*    متوقف می‌شود و با جبران dt (سقف ۱۰۰ms) ادامه می‌یابد؛ پاسبانِ     */
/*    ساعت نیز در تعلیقِ نبض rAF شمارنده‌ی جایگزین ۳۰fps را فعال        */
/*    می‌کند تا اتم هرگز متوقف نماند.                                  */
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
 *  تقریب استاندارد circle-approximation با کنترل‌های مماسی. شروع
 *  از پایین دایره (۹۰°) تا لنگر k دایره با لنگر k رگه — که آن نیز از
 *  پایین بیضی شروع می‌شود — تناظر مستقیم داشته باشد (مورف بی‌پیچش). */
function circleSegs(n: number): Seg[] {
  const alpha = (2 * Math.PI) / n;
  const off = (4 / 3) * Math.tan(alpha / 4) * 100;
  const pt = (k: number): Pt => {
    const a = Math.PI / 2 + alpha * k;
    return [100 + 100 * Math.cos(a), 100 + 100 * Math.sin(a)];
  };
  const tan = (k: number): Pt => {
    const a = Math.PI / 2 + alpha * k;
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

/** Catmull-Rom «بسته» → زنجیره‌ی Bézier مکعبی متصل دورگرد — برای
 *  رگه‌های کامل و بسته‌ی اثر انگشت؛ ۱۶ لنگر، ۱۶ سگمنت (آخرین سگمنت
 *  لنگر آخر را به لنگر اول می‌چسباند) و همسایه‌ها با گردکردن modulo
 *  خوانده می‌شوند — منحنی در سرتاسر C¹-پیوسته و بسته است. */
function closedCRSegs(A: Pt[]): Seg[] {
  const n = A.length;
  const segs: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = A[i];
    const p1 = A[(i + 1) % n];
    const pm = A[(i - 1 + n) % n];
    const pp = A[(i + 2) % n];
    segs.push({
      p0,
      c1: [p0[0] + (p1[0] - pm[0]) / 6, p0[1] + (p1[1] - pm[1]) / 6],
      c2: [p1[0] - (pp[0] - p0[0]) / 6, p1[1] - (pp[1] - p0[1]) / 6],
      p1,
    });
  }
  return segs;
}

/** Catmull-Rom باز → Bézier (انتهاها clamped) — برای رگه‌های بیرونی‌بازی که زنجیره‌شان باز */
function openCRSegs(A: Pt[]): Seg[] {
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

/* ------------------------------------------------------------------ */
/*  رگه‌های اثر انگشت — مختصات صحنه‌ی کامل (۲۰۰×۲۰۰، مرکز ۱۰۰,۱۰۰)     */
/* ------------------------------------------------------------------ */

/* رگه‌های اثر انگشت — خانواده‌ی آفست با فاصله‌ی دقیقاً منظم (parallel flow):
 * رگهِ k(θ) = E(θ) + k·D·N(θ) + W(θ) که E بیضی تخم‌مرغی‌پایه دور هسته‌ی اثر انگشت است، N نرمال رو‌به‌بیرون E و W
 * موج مشترک جریان است (بردار یکسان برای همه‌ی رگه‌ها در هر θ موج‌های 2θ/3θ/4θ + دریفت ریز).
 * رگه‌های مجاور دقیقاً D·N(θ) با هم اختلاف دارند ⇒ فاصله‌ی عمود خط‌مرکزها دقیقاً D در تمام نقاط است —
 * منظم بودن فاصله سازتواری است و همزمان با موج‌دار بودن خطوط قابل مشاهده است (جریان موازی رگه‌ها مثل اثر انگشت واقعی).
 * ۵ رگه‌ی درونی بسته و ۳ رگه‌ی بیرونی «باز و منحرف»: شکاف‌های پلکانی (22°/42°/68°) در پایین‌چپ با
 * انتهای بار بازشدگی‌دار (flare) که مثل رگه‌های بیرونی اثر انگشت به بیرون باز می‌شوند و دامن زدن می‌کنند.
 * ۳۲ لنگر ≡ circleSegs(32) با تناظر لنگر‌به‌لنگر. */
const RIDGE_CORE: Pt = [100, 97];
const RIDGE_BASE_W = 12.5;
const RIDGE_BASE_H = 18.5;
/** فاصله‌ی عمود خط‌مرکز رگه‌های مجاور (واحد viewBox) — دقیقاً یکسان */
const RIDGE_D = 7.8;
/* موج مشترک جریان (واحد): تخم‌مرغی + موج‌های 2θ/3θ/4θ + دریفت ریز پیش‌هر رگه */
const RIDGE_EGG = 0.055;
const RIDGE_EGG_P = 30;
const RIDGE_A2 = 3.2;
const RIDGE_P2 = 50;
const RIDGE_A3 = 2.0;
const RIDGE_P3 = 215;
const RIDGE_A4 = 1.1;
const RIDGE_P4 = 130;
const RIDGE_DRIFT = 3;
/* سه رگه‌ی بیرونی باز: شکاف (درجه) + بازشدگی انتها (واحد) */
const RIDGE_OPEN_GAP = [22, 42, 68];
const RIDGE_OPEN_FLARE = [1.5, 2.4, 3.6];
/** مرکز شکاف رگه‌های باز (درجه) — پایین‌چپ */
const RIDGE_GAP_C = 100;
/** شمار لنگر/سگمنت هر رگه ≡ circleSegs(32) */
const RIDGE_N = 32;

function ridgeBasePoint(th: number): Pt {
  const m = 1 + RIDGE_EGG * Math.sin(th + (RIDGE_EGG_P * Math.PI) / 180);
  return [
    RIDGE_CORE[0] + RIDGE_BASE_W * m * Math.cos(th),
    RIDGE_CORE[1] + RIDGE_BASE_H * m * Math.sin(th),
  ];
}

function ridgeBaseNormal(th: number): Pt {
  const d = Math.PI / 180;
  const p1 = ridgeBasePoint(th - d);
  const p2 = ridgeBasePoint(th + d);
  let tx = p2[0] - p1[0];
  let ty = p2[1] - p1[1];
  const L = Math.hypot(tx, ty) || 1;
  tx /= L;
  ty /= L;
  let nx = -ty;
  let ny = tx;
  const px = ridgeBasePoint(th);
  if (nx * (px[0] - RIDGE_CORE[0]) + ny * (px[1] - RIDGE_CORE[1]) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

/** نقطه رگهِ k در پارامتر θ — آفست k·D + موج مشترک + flare انتها */
function ridgePoint(k: number, th: number, flare = 0): Pt {
  const E = ridgeBasePoint(th);
  const N = ridgeBaseNormal(th);
  const t2 = th + (RIDGE_DRIFT * k * Math.PI) / 180;
  const mag =
    RIDGE_A2 * Math.sin(2 * t2 + (RIDGE_P2 * Math.PI) / 180) +
    RIDGE_A3 * Math.sin(3 * t2 + (RIDGE_P3 * Math.PI) / 180) +
    RIDGE_A4 * Math.sin(4 * t2 + (RIDGE_P4 * Math.PI) / 180);
  return [
    E[0] + k * RIDGE_D * N[0] + mag * Math.cos(t2) + flare * N[0],
    E[1] + k * RIDGE_D * N[1] + mag * Math.sin(t2) + flare * N[1],
  ];
}

/** رگه‌ی بسته — لنگر j هم‌راستای لنگر j دایره (90°+11.25°j) برای مورف بی‌پیچش */
function closedRidgeAnchors(k: number): Pt[] {
  const step = (2 * Math.PI) / RIDGE_N;
  return Array.from({ length: RIDGE_N }, (_, j) =>
    ridgePoint(k, Math.PI / 2 + step * j),
  );
}

/** رگه‌ی باز (سه بیرونی) — کمان 360−gap درجه با انتهای flare‌ دار */
function openRidgeAnchors(k: number, gapDeg: number, flare: number): Pt[] {
  const a0 = ((RIDGE_GAP_C + gapDeg / 2) * Math.PI) / 180;
  const span = ((360 - gapDeg) * Math.PI) / 180;
  return Array.from({ length: RIDGE_N + 1 }, (_, j) => {
    const th = a0 + (span * j) / RIDGE_N;
    const taper = j === 0 || j === RIDGE_N ? 1 : j === 1 || j === RIDGE_N - 1 ? 0.55 : 0;
    return ridgePoint(k, th, flare * taper);
  });
}

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
  fp: Seg[];
  /* جهت‌گیری صفحه‌ی رگه در فاز اثر انگشت — همه‌ی صفحه‌ها به یک صفحه‌ی
     مشترکِ تقریباً رو-به-دوربین (شیب ملایم ۱۶°) هم‌سو می‌شوند تا ۸ خط رگه‌ی
     به‌صورت یک اثر انگشتِ یکپارچه دور هسته بنشینند؛ بازگشت به زاویه‌ی
     مداریِ اصلی در مورفِ معکوس انجام می‌شود. */
  fpTipZ: number;
  fpTipX: number;
  /** جابه‌جایی عمودی صفحه در فاز اثر انگشت (٪ ارتفاع مدار) */
  fpOffY: number;
  /** رهاییِ عمق رگه‌ها (px) — بیرونی جلوتر و درونی‌تر عقب‌تر: برجستگیِ
     سه‌بعدی ملایم مثل اسکن عمقی اثر انگشت (پارالاکس پرسپکتیو) */
  fpOffZ: number;
  electrons: { phase: number; dotCls: string }[];
};

const RING_COLORS = [
  "text-teal-700/75 dark:text-teal-300/50",
  "text-violet-700/70 dark:text-violet-300/45",
  "text-emerald-700/70 dark:text-emerald-300/45",
];

const ORBIT_TIPX = [72, 64, 78, 66, 76, 68];
const ORBIT_LOOPS = [2, 2, 2, 3, 3, 4];
const ORBIT_DIR: (1 | -1)[] = [1, -1, 1, -1, 1, -1];

/* ۶ مدار در فاز اتم (i=0 بیرونی‌ترین … i=5 درونی‌ترین) حمل می‌کنند ۶ رگه‌ی بیرونی اثر انگشت (رگه‌های 2..7) را از طریق مورف،
 * و دو رگه‌ی درونی (0,1) هسته‌ی اثر انگشت به‌صورت مستقل (بدون مورف) در صفحه‌ی درونی‌ترین مدار فید شده برای مورف می‌شوند که
 * به همراه حلقه‌ی هم‌مرکز هسته‌ی اتم دریافت دو لنگر‌گردی می‌شوند؛ لنگر‌ها به‌تناسب 1/size مقیاس می‌شوند تا هندسه‌ی نهایی دقیقاً طرح مشترک باشد. */
const ORBITS: OrbitDef[] = Array.from({ length: 6 }, (_, i) => {
  const size = 1 - 0.03 * i;
  const ridgeIdx = 7 - i; /* مدار i → رگه 7−i (مدار 0 بیرونی ↔ رگهِ 7 بیرونی‌ترین) */
  const openIdx = ridgeIdx - 5; /* ۵ برای رگه‌های بسته؛ 0..2 برای سه رگه‌ی باز */
  const inv = 1 / size;
  const anchors = (
    openIdx >= 0
      ? openRidgeAnchors(ridgeIdx, RIDGE_OPEN_GAP[openIdx], RIDGE_OPEN_FLARE[openIdx])
      : closedRidgeAnchors(ridgeIdx)
  ).map(([x, y]) => [100 + (x - 100) * inv, 100 + (y - 100) * inv] as Pt);
  return {
    tipZ: (i * 360) / 6,
    tipX: ORBIT_TIPX[i],
    size,
    loops: ORBIT_LOOPS[i],
    dir: ORBIT_DIR[i],
    out: [0.24 + 0.02 * (5 - i), 0.38 + 0.02 * (5 - i)],
    back: [0.72 + 0.014 * i, 0.86 + 0.014 * i],
    colorCls: RING_COLORS[i % 3],
    circle: circleSegs(32),
    fp: openIdx >= 0 ? openCRSegs(anchors) : closedCRSegs(anchors),
    fpTipZ: 0,
    fpTipX: 16,
    fpOffY: 0,
    fpOffZ: 14 - 4 * i,
    electrons:
      i === 3
        ? [
            { phase: 215, dotCls: "atom-electron--teal" },
            { phase: 335, dotCls: "atom-electron--amber" },
          ]
        : [
            {
              phase: [35, 155, 80, 0, 105, 280][i],
              dotCls: [
                "atom-electron--teal",
                "atom-electron--violet",
                "atom-electron--emerald",
                "atom-electron--teal",
                "atom-electron--violet",
                "atom-electron--emerald",
              ][i],
            },
          ],
  };
});

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

/* دو رگه‌ی درونی (0,1) — هسته‌ی اثر انگشت: مسیر‌های ایستای مستقل از مدارها که در فاز اثر انگشت فید‌ شده
 * می‌شوند (هم‌زمان با محو شدن هسته‌ی اتم) و در بازگشت محو می‌شوند؛ مقیاس محل درونی‌ترین
 * مدار (size مدار ۵) است تا هندسه هم‌قفیم خانواده‌ی آفست در امتحان مکان مدار مورف‌شدنده باشد. */
const RIDGE_EXTRA_D: string[] = [0, 1].map((k) => {
  const inv = 1 / (1 - 0.03 * 5);
  const anchors = closedRidgeAnchors(k).map(
    ([x, y]) => [100 + (x - 100) * inv, 100 + (y - 100) * inv] as Pt,
  );
  return buildD(closedCRSegs(anchors));
});

/* حلقه‌های فید ستون: هسته‌ی اتم و رگه‌های درونی اثر انگشت (کسر از چرخش ۱۸ ثانیه) */
const NUCLEUS_OUT: Win = [0.22, 0.42];
const NUCLEUS_BACK: Win = [0.84, 0.96];
const EXTRA_OUT: Win = [0.2, 0.36];
const EXTRA_BACK: Win = [0.82, 0.94];

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
/* شفافیت الکترون — الکترون‌ها فقط به صحنه‌ی «اتم» تعلق دارند و دقیقاً روی
 * خودِ خط مدار می‌لغزند؛ با شکل‌گیری رگه‌ها زودتر از تکمیل مورف (در ۳۰٪
 * ابتدای آن) کاملاً محو می‌شوند تا در صحنه‌ی اثر انگشت فقط «خطوط رگه»
 * دیده شود؛ در بازگشت، وقتی حلقه عمدتاً دوباره دایره شده، عین می‌شوند.
 * موقعیت حتی در حالت نامرئی هر فریم به‌روزرسانی می‌شود ⇒ ظاهرشدنِ
 * دوباره بدون هیچ پرش/ناپیوستگی است. */
const ELECTRON_FADE = 0.3;

function electronAlpha(m: number): number {
  const x = Math.max(0, Math.min(1, m / ELECTRON_FADE));
  return 1 - easeIO(x);
}

/* پیش‌سپردن — به‌جای چرخش بی‌وقفه‌ی ۸۰ثانیه‌ای (که رگه‌ها را در زاویه‌های
 * تصادفی می‌چرخاند)، یک «رقص سینوسی پیوسته و بی‌درنگ» است که با چرخه‌ی
 * ۱۸ثانیه‌ای کاملاً سنکرون است و هیچ‌وقت نمی‌ایستد:
 * • در فاز اتم، اتم با نرخ ملایم هم‌ترازِ حالت قبل می‌غلتد (اوج ≈ ۴٫۲°/ث
 *   در برابر ۴٫۵°/ث قبلی) — حس کروی پیوسته‌ی اتم عیناً زنده می‌ماند؛
 * • در فاز اثر انگشت، صحنه به‌جای ایستِ کامل، خیلی ملایم در محدوده‌ی
 *   ±۱۲ درجه سُر می‌خورد (رگه‌ها خوانا می‌مانند و صحنه هرگز «متوقف»
 *   دیده نمی‌شود) — مثل انگشتی که زیر اسکنر آرام تکان می‌خورد؛
 * • تابع در t=0 و t=1 دقیقاً صفر و شیبِ دو انتها دقیقاً برابر است (۲πA/۱۸)
 *   ⇒ بسته‌شدن حلقه کاملاً بی‌پرش و C¹-پیوسته است — همان قاعده‌ی
 *   «دورهای صحیح» الکترون‌ها برای بی‌پرش‌بودن حلقه، اینجا نیز رعایت شده
 *   است (کل چرخه دقیقاً یک نوسان کامل ⇒ زاویه‌ی ابتدا و انتها یکسان). */
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

export function AtomFingerprintScene({
  sceneClassName = "",
}: {
  /** کلاس‌های ریسپانسیو نمایش صحنه (اتم ↔ اثر انگشت) — «انیمیشن‌های هیرو»
   *  از مدیریت صفحه‌ی اول: کلاس پایه = موبایل · md = تبلت · lg = دسکتاپ.
   *  فقط صحنه تابع این کلاس‌هاست؛ نمادهای شناور همیشه نمایان می‌مانند */
  sceneClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const precessRef = useRef<HTMLDivElement>(null);
  const orbitRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gRefs = useRef<(SVGGElement | null)[]>([]);
  const mainRefs = useRef<(SVGPathElement | null)[]>([]);
  const underRefs = useRef<(SVGPathElement | null)[]>([]);
  const eRefs = useRef<(HTMLDivElement | null)[][]>(ORBITS.map(() => []));
  const sizes = useRef<number[]>(ORBITS.map(() => 0));
  const stopRefs = useRef<(SVGStopElement | null)[][]>(ORBITS.map(() => []));
  const nucleusRef = useRef<HTMLDivElement>(null);
  const extraRefs = useRef<(SVGPathElement | null)[][]>([[null, null], [null, null]]);

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
         در فاز اثر انگشت؛ هیچ‌وقت نمی‌ایستد */
      if (precessRef.current) {
        precessRef.current.style.transform = `rotate(${(PRECESS_AMPLITUDE * swayAt(t)).toFixed(2)}deg)`;
      }
      /* هسته‌ی اتم فقط به فاز اتم تعلق دارد — هم‌زمان با شکل‌گیری رگه‌ها محو می‌شود تا در صحنه‌ی
         اثر انگشت فقط «خطوط رگه» دیده شود؛ در بازگشت، وقتی حلقه‌ها عمدتاً دوباره دایره شدند، عین می‌شود. */
      const mN = morphAt(t, NUCLEUS_OUT) - morphAt(t, NUCLEUS_BACK);
      if (nucleusRef.current) {
        nucleusRef.current.style.opacity = (1 - Math.max(0, Math.min(1, mN))).toFixed(3);
      }
      /* رگه‌های درونی هسته — محو شدن هسته و عین شدن هسته هم‌زمان */
      const mE = morphAt(t, EXTRA_OUT) - morphAt(t, EXTRA_BACK);
      for (let e = 0; e < RIDGE_EXTRA_D.length; e++) {
        const el = extraRefs.current[e]?.[1];
        const un = extraRefs.current[e]?.[0];
        if (el) el.setAttribute("opacity", Math.max(0, Math.min(1, mE)).toFixed(3));
        if (un) un.setAttribute("opacity", (0.36 * Math.max(0, Math.min(1, mE))).toFixed(3));
      }
      for (let i = 0; i < ORBITS.length; i++) {
        const o = ORBITS[i];
        const m = morphAt(t, o.out) - morphAt(t, o.back);
        lerpInto(BUF[i], o.circle, o.fp, m);
        const d = buildD(BUF[i]);
        const under = underRefs.current[i];
        const main = mainRefs.current[i];
        const g = gRefs.current[i];
        if (under) under.setAttribute("d", d);
        /* زیرلایه‌ی رگه — در فاز اثر انگشت جسم نورانی خط را سنگین‌تر می‌کند */
        if (under) under.setAttribute("opacity", (0.13 + 0.35 * m).toFixed(3));
        if (under) under.setAttribute("stroke-width", (2.4 + 2.0 * m).toFixed(2));
        if (main) main.setAttribute("d", d);
        if (g) g.setAttribute("stroke-width", (2.4 - 0.2 * m).toFixed(2));

        /* نورپردازی عمق — گرادیان محوِ سمت دور (سنگین‌سازی حلقه‌ی اتم) در
           فاز اثر انگشت به‌آرامی به روشناییِ تقریباً یکنواخت باز می‌شود تا
           نیمه‌ی دورِ رگه‌ها محو نماند و خطوط اثر انگشت خوانا باشند؛
           بازگشت همگام با مورفِ معکوس به همان گرادیان عمق اتم برمی‌گردد. */
        const stops = stopRefs.current[i];
        if (stops[0]) stops[0].setAttribute("stop-opacity", (0.26 + 0.66 * m).toFixed(3));
        if (stops[1]) stops[1].setAttribute("stop-opacity", (0.58 + 0.36 * m).toFixed(3));

        /* جهت‌گیری فعلی صفحه — در فاز اثر انگشت به صفحه‌ی مشترک رگه‌ها
           هم‌سو می‌شود (شیب ملایم ۱۶° + رهایی عمق) تا ۸ خط رگه‌ی یک اثر انگشتِ
           یکپارچه دور هسته بسازند. m=0 ⇒ دقیقاً همان زاویه‌ی مداریِ اتم
           فعلی. */
        const curZ = o.tipZ + (o.fpTipZ - o.tipZ) * m;
        const curX = o.tipX + (o.fpTipX - o.tipX) * m;
        const curOffY = o.fpOffY * m;
        const curOffZ = o.fpOffZ * m;
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
          /* پارامتر روی مسیرِ فعلی — تعداد دورها صحیح ⇒ پیوستگی حلقه
             (زنجیره‌ی دایره از پایین شروع می‌شود: s=(phase−90)/360 ⇒
             زاویه=phase — هم‌راستا با چیدمان ایستای SSR) */
          const s = (e.phase - 90) / 360 + o.dir * o.loops * t;
          const P = samplePoint(BUF[i], s);
          const px = (P[0] / 200) * W;
          const py = (P[1] / 200) * W;
          /* بیل‌بورد: وارونه‌ی چرخش‌های «فعلی» صفحه‌ی مدار ⇒ کره همیشه
             رو به دوربین + translateZ(8px) برای فاصله از صفحه‌ی حلقه */
          el.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px) rotateX(${-curX.toFixed(2)}deg) rotateZ(${-curZ.toFixed(2)}deg) translateZ(8px)`;
          /* شفافیت — در فاز اثر انگشت هیچ الکترونی دیده نمی‌شود؛ محو/عین
             شدن آن همگام با مورف همان مدار است (موقعیت همچنان
             به‌روزرسانی می‌شود تا بازگشت بی‌پرش باشد) */
          el.style.opacity = electronAlpha(m).toFixed(3);
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
        {/* درخشش محیطی خیلی ملایم پشت اتم — در حد المان‌های شناور.
            همراه «اتم ↔ اثر انگشت» روشن/خاموش می‌شود (انیمیشن‌های هیرو) */}
        <div
          className={`absolute inset-[-16%] rounded-full bg-[radial-gradient(circle,rgba(13,148,136,0.05),rgba(124,58,237,0.03)_45%,transparent_70%)] dark:bg-[radial-gradient(circle,rgba(45,212,191,0.07),rgba(167,139,250,0.05)_45%,transparent_70%)]${
            sceneClassName ? ` ${sceneClassName}` : ""
          }`}
        />

        {/* صحنه‌ی سه‌بعدی: پیش‌سپردنِ تناوبی (rAF) ⟵ استیج پرسپکتیو ⟵ فضای preserve-3d.
            کلاس‌های visibility از «انیمیشن‌های هیرو»: کلاس پایه = موبایل ·
            md = تبلت · lg = دسکتاپ؛ absolute/inset-0 با display:block سازگار است */}
        <div
          ref={precessRef}
          className={`absolute inset-0${sceneClassName ? ` ${sceneClassName}` : ""}`}
        >
          <div className="atom-stage absolute inset-0">
            <div className="atom-world">
              {/* هسته — داخل همان فضای سه‌بعدی تا الکترون‌های سمت دور واقعاً پشتش پنهان شوند */}
<div ref={nucleusRef} className="absolute left-1/2 top-1/2">
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
                  حلقه‌ی بی‌نهایت بین «دایره» و «رگه‌ی اثر انگشت» مورف می‌شود */}
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
                        d آن در حلقه‌ی مورف به‌آرامی بین مدار و رگه‌ی اثر
                        انگشت تغییر می‌کند (زیرسازیِ کم‌رنگ پیوستگی را تضمین
                        می‌کند) */}
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
                        strokeLinecap="round"
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

                    {/* رگه‌های درونی هسته‌ی اثر انگشت — فید شدن در فاز اثر انگشت هم‌زمان
                        با محو شدن هسته‌ی اتم؛ اولیا در SSR/ایستا مرئی */}
                    {i === 5 &&
                      RIDGE_EXTRA_D.map((d, e) => (
                        <g key={`ridge-extra-${e}`} strokeWidth={2.0} strokeLinecap="round" fill="none">
                          {/* زیرلایه‌ِ نورانی پهن */}
                          <path
                            ref={(el) => {
                              extraRefs.current[e][0] = el;
                            }}
                            d={d}
                            stroke="currentColor"
                            strokeWidth={4.4}
                            opacity={0}
                          />
                          <path
                            ref={(el) => {
                              extraRefs.current[e][1] = el;
                            }}
                            d={d}
                            stroke="url(#atom-ring-grad-5)"
                            opacity={0}
                          />
                        </g>
                      ))}

                    {/* الکترون — کره‌ی همان `.atom-electron`؛ دقیقاً روی
                        خودِ خط مدار حرکت می‌کند؛ با شکل‌گیری رگه‌های اثر
                        انگشت زودتر از تکمیل مورف محو می‌شود و در فاز اثر
                        انگشت نمایش داده نمی‌شود */}
                    {o.electrons.map((e, j) => (
                      <div
                        key={j}
                        ref={(el) => {
                          eRefs.current[i][j] = el;
                        }}
                        className="atom-scene-token"
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

        {/* المان‌های شناور اطراف اتم — همیشه نمایان (تابعِ سوئیچ‌های
            «انیمیشن‌های هیرو» نیستند؛ با خاموش‌شدن صحنه‌ی اتم ↔ اثر انگشت
            هم π، ∑، ∞، </> و آیکون‌های شناور سرِ جایشان می‌مانند).
            شناورها absolute نسبت به کانتینر مربعی‌اند، پس رفتار ریسپانسیوِ
            خودِ آیتم‌ها (mobile/desktop) عیناً محفوظ است */}
        <div className="contents">
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
    </div>
  );
}
