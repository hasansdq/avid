import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Atom as AtomIcon, Binary, Braces, Sigma } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  صحنه‌ی سه‌بعدی اتم هیرو — CSS 3D واقعی (نه بیضی مسطح)               */
/*  - استیجِ دارای perspective و فضای preserve-3d                      */
/*  - هر مدار = یک صفحه‌ی دایره‌ای واقعی در فضا:                        */
/*      rotateZ(γ) rotateX(β)                                          */
/*    پرسپکتیو آن را به بیضیِ دارای عمق فشرده می‌کند.                   */
/*  - حلقه‌ی مدار = «حلقه‌ی سه‌بعدی تمیز»: ضخامت در تمام مسیر          */
/*    یکنواخت است و عمق صرفاً با گرادیانِ شفافیت بیان می‌شود            */
/*    (نیمه‌ی دور محو، نیمه‌ی نزدیک پررنگ) — دیگر قطعه‌ی ضخیم/نازک     */
/*    نامتعادل ندارد. الکترون دقیقاً روی خودِ حلقه (r=100) می‌نشیند.    */
/*  - الکترون با «بیل‌بورد» (وارونه‌ی کامل چرخش‌ها) همیشه رو به          */
/*    دوربین است؛ پرسپکتیو نزدیک=درشت/دور=کوچک و پشت هسته واقعاً       */
/*    پنهان می‌شود.                                                    */
/*  - کل اتم در «پس‌زمینه» و به‌صورت عمدی تیره و کم‌نور رندر می‌شود      */
/*    (هم‌سطح المان‌های شناور ریاضی) تا از متن‌های روی آن کاملاً          */
/*    متمایز باشد. رنگ‌ها از تم روشن/تیره سایت پیروی می‌کنند.             */
/*  - چیدمان: دسکتاپ = سمت چپ، نزدیک ستون دکمه‌های سه‌گانه؛            */
/*    موبایل = پس‌زمینه‌ی تمام‌عریض زیر محتوا: بالاترین نقطه‌ی زیر هدر    */
/*    شروع می‌شود و متن‌ها/دکمه‌ها روی آن قرار می‌گیرند.                   */
/* ------------------------------------------------------------------ */

type ElectronDef = {
  /** زاویه‌ی ایستای الکترون روی مدار (درجه) */
  phase: number;
  dotCls: string;
};

type OrbitDef = {
  /** γ — جهت‌گیری بیضی نمایش‌داده‌شده در صفحه‌ی نمایش (درجه) */
  tipZ: number;
  /** β — کج‌شدگی سه‌بعدی صفحه‌ی مدار حول محور X (درجه؛ هرچه بیشتر، مدار ایستاده‌تر/عمقی‌تر) */
  tipX: number;
  /** نسبت قطر مدار به قطر صحنه (۰..۱) */
  size: number;
  /** دوره‌ی چرخش الکترون (ثانیه) */
  dur: number;
  reverse?: boolean;
  /** رنگ خط مدار — از طریق currentColor به SVG می‌رسد (تیره/ملایم، هم‌سطح المان‌های شناور) */
  colorCls: string;
  electrons: ElectronDef[];
};

const ORBITS: OrbitDef[] = [
  {
    tipZ: 0,
    tipX: 72,
    size: 1,
    dur: 9,
    colorCls: "text-teal-700/75 dark:text-teal-300/50",
    electrons: [
      { phase: 35, dotCls: "atom-electron--teal" },
      { phase: 215, dotCls: "atom-electron--teal" },
    ],
  },
  {
    tipZ: 62,
    tipX: 64,
    size: 0.96,
    dur: 13,
    reverse: true,
    colorCls: "text-violet-700/70 dark:text-violet-300/45",
    electrons: [{ phase: 150, dotCls: "atom-electron--violet" }],
  },
  {
    tipZ: 119,
    tipX: 78,
    size: 0.9,
    dur: 17,
    colorCls: "text-emerald-700/70 dark:text-emerald-300/45",
    electrons: [
      { phase: 80, dotCls: "atom-electron--emerald" },
      { phase: 260, dotCls: "atom-electron--amber" },
    ],
  },
];

/**
 * بیل‌بورد الکترون — وارونه‌ی کاملِ چرخش صفحه‌ی مدار (γ، β) و چرخش
 * اسپینر (θ از طریق keyframes)؛ نتیجه: الکترون همیشه رو به دوربین و
 * دقیقاً روی نقطه‌ی مدار. translateZ(8px) آن را چند پیکسل رو به دوربین
 * می‌برد تا با صفحه‌ی حلقه برخورد عمقی (z-fight) نداشته باشد.
 * این رشته با حالت «from» در keyframesِ atom-billboard3d یکسان است تا
 * هنگام شروع/توقف انیمیشن هیچ پرشی رخ ندهد.
 */
const BILLBOARD_TRANSFORM =
  "rotate(calc(-1 * var(--ph, 0deg))) rotateX(var(--bx, -70deg)) rotateZ(var(--bz, 0deg)) translateZ(8px)";

/**
 * حلقه‌ی مدار — «حلقه‌ی سه‌بعدی تمیز»:
 *  • ضخامت خط در تمام مسیر یکنواخت (strokeWidth ثابت) — بدون قطعه‌ی
 *    ضخیم/نازک نامتعادل؛
 *  • عمق با گرادیانِ شفافیت عمودی در فضای محلی صفحه‌ی مدار بیان
 *    می‌شود: بالای صفحه (نیمه‌ی دور پس از rotateX) محو و کم‌رنگ،
 *    پایین صفحه (نیمه‌ی نزدیک) پررنگ و شفاف — حلقه مثل یک «توروس»
 *    سه‌بعدی واقعی دیده می‌شود که دورش نرم محو می‌شود؛
 *  • زیرسازیِ خیلی کم‌رنگ، پیوستگی کامل حلقه را تضمین می‌کند؛
 *  • رنگ از currentColor (کلاس تم orbit) → متاهای روشن/تیره.
 */
function OrbitRing({ gradId }: { gradId: string }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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
      {/* زیرسازی نرم — حلقه در تمام مدار پیوسته می‌ماند */}
      <circle
        cx="100"
        cy="100"
        r="100"
        stroke="currentColor"
        strokeWidth="2.4"
        opacity="0.13"
      />
      {/* حلقه‌ی اصلی — ضخامت یکنواخت؛ عمق با گرادیان شفافیت */}
      <circle
        cx="100"
        cy="100"
        r="100"
        stroke={`url(#${gradId})`}
        strokeWidth="2.4"
      />
    </svg>
  );
}

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

export function AtomScene() {
  return (
    <div
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

        {/* صحنه‌ی سه‌بعدی: پیش‌سپردن آرام ⟵ استیج پرسپکتیو ⟵ فضای preserve-3d */}
        <div className="atom-precess absolute inset-0">
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

              {/* مدارها — هرکدام یک صفحه‌ی واقعی سه‌بعدی (دایره) که با rotateZ·rotateX کج شده است */}
              {ORBITS.map((o, i) => {
                const vars = {
                  "--dur": `${o.dur}s`,
                  "--dir": o.reverse ? "reverse" : "normal",
                  "--bx": `${-o.tipX}deg`,
                  "--bz": `${-o.tipZ}deg`,
                } as CSSProperties;
                return (
                  <div
                    key={i}
                    className={`atom-orbit aspect-square ${o.colorCls}`}
                    style={{
                      ...vars,
                      width: `${(o.size * 100).toFixed(2)}%`,
                      transform: `translate(-50%, -50%) rotateZ(${o.tipZ}deg) rotateX(${o.tipX}deg)`,
                    }}
                  >
                    {/* حلقه‌ی تمیز سه‌بعدی — ضخامت یکنواخت + گرادیان عمق */}
                    <OrbitRing gradId={`atom-ring-grad-${i}`} />
                    {o.electrons.map((e, j) => (
                      <div
                        key={j}
                        className="atom-spinner"
                        style={
                          {
                            "--ph": `${e.phase}deg`,
                            // حالت ایستا (reduce-motion): الکترون روی همان زاویه‌ی فاز روی مدار
                            transform: `rotate(${e.phase}deg)`,
                          } as CSSProperties
                        }
                      >
                        {/* لنگر — نقطه‌ی صفربُعد دقیقاً روی خودِ حلقه (لبه‌ی صفحه) */}
                        <div className="atom-anchor">
                          <div
                            className="atom-billboard"
                            style={{ transform: BILLBOARD_TRANSFORM }}
                          >
                            <span className={`atom-electron ${e.dotCls}`} />
                          </div>
                        </div>
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
