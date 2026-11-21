"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Info,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { tileGradient } from "@/components/admin/shared/styles";
import {
  HOMEPAGE_SECTIONS,
  PLATFORM_LABELS,
  type HomepageSectionKey,
  type SectionVisibility,
} from "@/lib/homepage-sections";
import {
  HERO_ANIMATIONS,
  type HeroAnimationKey,
} from "@/lib/hero-animations";
import { cn } from "@/lib/utils";

/* — انواع پاسخ API — */

/** یک سطر پاسخ GET /api/admin/homepage-sections */
interface SectionState extends SectionVisibility {
  key: HomepageSectionKey;
  updatedAt: string | null;
}

/** یک سطر پاسخ GET /api/admin/hero-animations — زیرمجموعه‌ی هیرو */
interface AnimationState extends SectionVisibility {
  key: HeroAnimationKey;
  updatedAt: string | null;
}

/* — ثابت‌های نمایش — */

const PLATFORM_COLUMNS = [
  { field: "mobile", icon: Smartphone },
  { field: "tablet", icon: Tablet },
  { field: "desktop", icon: Monitor },
] as const;

/** وضعیت خلاصه‌ی هر سطر: کجا نمایان/مخفی است */
function summarize(v: SectionVisibility): string {
  const hidden = (["mobile", "tablet", "desktop"] as const).filter(
    (f) => !v[f]
  );
  if (hidden.length === 0) return "نمایان در همه‌ی پلتفرم‌ها";
  if (hidden.length === 3) return "مخفی در همه‌ی پلتفرم‌ها";
  return `مخفی در: ${hidden.map((f) => PLATFORM_LABELS[f].label).join("، ")}`;
}

/**
 * HomepageSectionsModule — مدیریت صفحه‌ی اول سایت.
 *
 * ۸ سکشن اصلی صفحه‌ی اول به‌صورت لیستی نمایش داده می‌شوند و روبروی هرکدام
 * سه سوئیچ (موبایل · تبلت · دسکتاپ) قرار دارد؛ با خاموش‌کردن هر سوئیچ،
 * همان سکشن در آن پلتفرم مخفی می‌شود (مثلاً: «نمونه سوالات» فقط در
 * دسکتاپ نمایان و در موبایل/تبلت مخفی). سوئیچ‌های سکشن «هیرو» کل
 * هیرو (متن، دکمه‌ها و همه‌چیز) را مخفی می‌کنند.
 *
 * سکشن «هیرو» زیرمجموعه‌ی «انیمیشن‌ها» دارد (دکمه‌ی بازشونده):
 * فقط انیمیشن «اتم ↔ اثر انگشت» با سه سوئیچ پلتفرمی کنترل می‌شود؛
 * نمادهای شناور (π، ∑، ∞، </>)، آیکون‌ها و متن‌ها همیشه نمایان
 * می‌مانند و با سوئیچ‌های انیمیشن مخفی نمی‌شوند.
 *
 * هر تغییر بلافاصله در سرور ذخیره می‌شود (PUT) و صفحه‌ی اصلی سایت در
 * رندر بعدی (رفرش) آن را اعمال می‌کند.
 */
export function HomepageSectionsModule() {
  const [sections, setSections] = useState<SectionState[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  /* زیرمجموعه‌ی «انیمیشن‌ها»ی هیرو */
  const [animations, setAnimations] = useState<AnimationState[] | null>(null);
  const [savingAnim, setSavingAnim] = useState<string | null>(null);
  const [heroOpen, setHeroOpen] = useState(false);

  /* بارگذاری اولیه */
  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ sections: SectionState[] }>(
        "/api/admin/homepage-sections"
      );
      setSections(data.sections);
    } catch (error) {
      toastApiError(error);
      setSections([]);
    }
    try {
      const data = await apiFetch<{ animations: AnimationState[] }>(
        "/api/admin/hero-animations"
      );
      setAnimations(data.animations);
    } catch (error) {
      toastApiError(error);
      setAnimations([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* تغییر یک سوئیچ سکشن — ذخیره‌ی فوری با به‌روزرسانی خوش‌بینانه */
  const toggle = useCallback(
    async (key: HomepageSectionKey, field: keyof SectionVisibility, next: boolean) => {
      const current = sections?.find((s) => s.key === key);
      if (!current) return;
      const updated: SectionState = { ...current, [field]: next };

      // خوش‌بینانه: سوئیچ فوری جابه‌جا می‌شود
      setSections((list) =>
        list ? list.map((s) => (s.key === key ? updated : s)) : list
      );
      setSaving(`${key}:${field}`);

      try {
        await apiFetch<SectionState>("/api/admin/homepage-sections", {
          method: "PUT",
          body: JSON.stringify({
            key,
            mobile: updated.mobile,
            tablet: updated.tablet,
            desktop: updated.desktop,
          }),
        });
        toast.success(
          `سکشن «${
            HOMEPAGE_SECTIONS.find((s) => s.key === key)?.label ?? key
          }» ${next ? "نمایان" : "مخفی"} شد در ${
            PLATFORM_LABELS[field].label
          } — با رفرش سایت اعمال می‌شود.`
        );
      } catch (error) {
        // شکست: برگرداندن سوئیچ به وضعیت قبلی
        setSections((list) =>
          list ? list.map((s) => (s.key === key ? current : s)) : list
        );
        toastApiError(error);
      } finally {
        setSaving(null);
      }
    },
    [sections]
  );

  /* تغییر یک سوئیچ انیمیشن هیرو — همان الگو با endpoint انیمیشن‌ها */
  const toggleAnimation = useCallback(
    async (key: HeroAnimationKey, field: keyof SectionVisibility, next: boolean) => {
      const current = animations?.find((s) => s.key === key);
      if (!current) return;
      const updated: AnimationState = { ...current, [field]: next };

      setAnimations((list) =>
        list ? list.map((s) => (s.key === key ? updated : s)) : list
      );
      setSavingAnim(`${key}:${field}`);

      try {
        await apiFetch<AnimationState>("/api/admin/hero-animations", {
          method: "PUT",
          body: JSON.stringify({
            key,
            mobile: updated.mobile,
            tablet: updated.tablet,
            desktop: updated.desktop,
          }),
        });
        toast.success(
          `انیمیشن «${
            HERO_ANIMATIONS.find((s) => s.key === key)?.label ?? key
          }» ${next ? "روشن" : "خاموش"} شد در ${
            PLATFORM_LABELS[field].label
          } — با رفرش سایت اعمال می‌شود.`
        );
      } catch (error) {
        setAnimations((list) =>
          list ? list.map((s) => (s.key === key ? current : s)) : list
        );
        toastApiError(error);
      } finally {
        setSavingAnim(null);
      }
    },
    [animations]
  );

  const summary = useMemo(
    () => (key: HomepageSectionKey) => {
      const s = sections?.find((x) => x.key === key);
      return s ? summarize(s) : "";
    },
    [sections]
  );

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="مدیریت صفحه اول سایت"
        description="سکشن‌های صفحه‌ی اصلی و انیمیشن‌های هیرو به تفکیک پلتفرم — سوئیچ‌های سکشن، کل سکشن را مخفی می‌کنند؛ سوئیچ‌های انیمیشن‌ها فقط صحنه‌ی اتم ↔ اثر انگشت را (نمادهای شناور همیشه نمایان‌اند)."
      />

      {/* راهنمای بریک‌پوینت‌ها */}
      <Card className="border-teal-600/20 bg-teal-500/[0.04] dark:border-teal-400/20 dark:bg-teal-400/[0.05]">
        <CardContent className="flex items-start gap-3 p-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
            <Info className="size-4.5" />
          </span>
          <div className="min-w-0 text-xs leading-6 text-muted-foreground">
            محدوده‌ی هر پلتفرم:{" "}
            <span className="font-bold text-foreground">
              موبایل &lt; ۷۶۸px
            </span>{" "}
            ·{" "}
            <span className="font-bold text-foreground">
              تبلت ۷۶۸ تا ۱۰۲۳px
            </span>{" "}
            ·{" "}
            <span className="font-bold text-foreground">
              دسکتاپ ≥ ۱۰۲۴px
            </span>
            . سکشن «هیرو» دو گروه سوئیچ جدا دارد: سوئیچ‌های خودِ سطر هیرو کل
            سکشن هیرو را مخفی می‌کنند و زیرمجموعه‌ی «انیمیشن‌ها» فقط
            صحنه‌ی «اتم ↔ اثر انگشت» را روشن/خاموش می‌کند — نمادهای شناور
            (π، ∑، ∞، &lt;/&gt;)، آیکون‌ها و متن‌ها همیشه نمایان می‌مانند.
            تغییرات بلافاصله ذخیره می‌شوند و در رفرش بعدی صفحه‌ی اصلی
            سایت اعمال می‌گردند.
          </div>
        </CardContent>
      </Card>

      {/* جدول سکشن‌ها × سوئیچ‌ها */}
      {sections === null ? (
        /* اسکلتون بارگذاری */
        <div className="space-y-2">
          {HOMEPAGE_SECTIONS.map((s) => (
            <div key={s.key} className="flex items-center gap-4 rounded-xl border border-foreground/[0.07] p-4">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <div className="hidden gap-6 sm:flex">
                <Skeleton className="h-6 w-11" />
                <Skeleton className="h-6 w-11" />
                <Skeleton className="h-6 w-11" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-foreground/[0.07] dark:border-white/[0.08]">
          <Table>
            <TableHeader>
              <TableRow className="bg-foreground/[0.03] hover:bg-foreground/[0.03] dark:bg-white/[0.03]">
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>سکشن صفحه‌ی اول</TableHead>
                {PLATFORM_COLUMNS.map(({ field, icon: ColIcon }) => (
                  <TableHead key={field} className="w-24 text-center">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <ColIcon className="size-3.5 text-teal-600 dark:text-teal-300" />
                      {PLATFORM_LABELS[field].label}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {HOMEPAGE_SECTIONS.map((def, index) => {
                const state = sections.find((s) => s.key === def.key);
                const Icon = def.icon;
                const isHero = def.key === "hero";
                return (
                  <Fragment key={def.key}>
                    <TableRow className="group">
                      <TableCell className="text-center text-xs font-bold text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl text-teal-950 shadow-md shadow-teal-500/20",
                              tileGradient
                            )}
                          >
                            <Icon className="size-5" strokeWidth={2.1} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-black text-foreground">
                                {def.label}
                              </p>
                              {isHero ? (
                                /* دکمه‌ی بازشونده‌ی زیرمجموعه‌ی «انیمیشن‌ها» —
                                   فقط سطر هیرو */
                                <button
                                  type="button"
                                  onClick={() => setHeroOpen((v) => !v)}
                                  aria-expanded={heroOpen}
                                  aria-controls="hero-animations-sub"
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.7rem] font-bold transition-colors",
                                    heroOpen
                                      ? "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-200"
                                      : "border-foreground/[0.12] bg-foreground/[0.03] text-muted-foreground hover:border-teal-500/40 hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
                                  )}
                                >
                                  <ChevronDown
                                    className={cn(
                                      "size-3.5 transition-transform duration-200",
                                      heroOpen && "rotate-180"
                                    )}
                                  />
                                  انیمیشن‌ها
                                </button>
                              ) : null}
                            </div>
                            <p className="mt-1 hidden max-w-xl text-xs leading-5 text-muted-foreground md:block">
                              {def.description}
                            </p>
                            <p
                              className={cn(
                                "mt-1.5 text-[0.65rem] font-bold",
                                state && (state.mobile && state.tablet && state.desktop)
                                  ? "text-muted-foreground/80"
                                  : "text-amber-600 dark:text-amber-300"
                              )}
                            >
                              {state ? summary(def.key) : "—"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      {PLATFORM_COLUMNS.map(({ field }) => {
                        const cellSaving =
                          saving === `${def.key}:${field}`;
                        return (
                          <TableCell key={field} className="text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {cellSaving ? (
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                              ) : null}
                              <Switch
                                checked={state ? state[field] : true}
                                onCheckedChange={(next) =>
                                  void toggle(def.key, field, next)
                                }
                                disabled={!state || cellSaving}
                                aria-label={`${PLATFORM_LABELS[field].label} — ${def.label}`}
                              />
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    {/* زیرمجموعه‌ی «انیمیشن‌ها» — فقط سطر هیرو، بازشونده */}
                    {isHero && heroOpen ? (
                      <TableRow
                        key="hero-animations"
                        className="bg-teal-500/[0.035] hover:bg-teal-500/[0.035] dark:bg-teal-400/[0.04]"
                      >
                        <TableCell colSpan={5} className="p-0">
                          <div
                            id="hero-animations-sub"
                            className="border-t border-teal-500/15 px-4 pb-4 pt-3 dark:border-teal-400/15 md:px-6"
                          >
                            {/* عنوان زیرمجموعه */}
                            <p className="mb-3 flex flex-wrap items-center gap-2 text-xs font-black text-teal-700 dark:text-teal-200">
                              <span aria-hidden="true">—</span>
                              انیمیشن‌ها
                              <span className="font-normal text-muted-foreground">
                                (زیرمجموعه‌ی هیرو — جدا از سوئیچ‌های خودِ هیرو؛ فقط صحنه‌ی اتم ↔ اثر انگشت)
                              </span>
                            </p>

                            {animations === null ? (
                              <div className="space-y-2">
                                {HERO_ANIMATIONS.map((a) => (
                                  <div
                                    key={a.key}
                                    className="flex items-center gap-4 rounded-xl border border-foreground/[0.07] bg-background/60 p-3"
                                  >
                                    <Skeleton className="size-8 rounded-lg" />
                                    <div className="flex-1 space-y-1.5">
                                      <Skeleton className="h-3.5 w-32" />
                                      <Skeleton className="h-3 w-56 max-w-full" />
                                    </div>
                                    <div className="hidden gap-6 sm:flex">
                                      <Skeleton className="h-6 w-11" />
                                      <Skeleton className="h-6 w-11" />
                                      <Skeleton className="h-6 w-11" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="grid gap-2">
                                {HERO_ANIMATIONS.map((a) => {
                                  const animState = animations.find(
                                    (s) => s.key === a.key
                                  );
                                  const AnimIcon = a.icon;
                                  return (
                                    <div
                                      key={a.key}
                                      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-foreground/[0.07] bg-background/60 p-3 dark:border-white/[0.08]"
                                    >
                                      <span
                                        className={cn(
                                          "flex size-8 shrink-0 items-center justify-center rounded-lg text-teal-950 shadow-md shadow-teal-500/20",
                                          tileGradient
                                        )}
                                      >
                                        <AnimIcon className="size-4" strokeWidth={2.1} />
                                      </span>
                                      <div className="min-w-[9rem] flex-1">
                                        <p className="text-[0.8rem] font-black text-foreground">
                                          {a.label}
                                        </p>
                                        <p className="mt-0.5 hidden text-[0.68rem] leading-5 text-muted-foreground sm:block">
                                          {a.description}
                                        </p>
                                        <p
                                          className={cn(
                                            "mt-1 text-[0.62rem] font-bold",
                                            animState &&
                                              animState.mobile &&
                                              animState.tablet &&
                                              animState.desktop
                                              ? "text-muted-foreground/80"
                                              : "text-amber-600 dark:text-amber-300"
                                          )}
                                        >
                                          {animState
                                            ? summarize(animState)
                                            : "—"}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-3 sm:gap-5">
                                        {PLATFORM_COLUMNS.map(({ field }) => {
                                          const cellSaving =
                                            savingAnim === `${a.key}:${field}`;
                                          return (
                                            <div
                                              key={field}
                                              className="flex w-16 flex-col items-center gap-1 sm:w-20"
                                            >
                                              <span className="flex items-center gap-1 text-[0.62rem] font-bold text-muted-foreground sm:hidden">
                                                {PLATFORM_LABELS[field].label}
                                              </span>
                                              <div className="flex items-center gap-1.5">
                                                {cellSaving ? (
                                                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                                ) : null}
                                                <Switch
                                                  checked={
                                                    animState
                                                      ? animState[field]
                                                      : true
                                                  }
                                                  onCheckedChange={(next) =>
                                                    void toggleAnimation(
                                                      a.key,
                                                      field,
                                                      next
                                                    )
                                                  }
                                                  disabled={
                                                    !animState || cellSaving
                                                  }
                                                  aria-label={`${PLATFORM_LABELS[field].label} — انیمیشن ${a.label}`}
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
