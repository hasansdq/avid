"use client";

import * as React from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock,
  FileQuestion,
  Globe,
  GraduationCap,
  GripVertical,
  Inbox,
  KeyRound,
  Link as LinkIcon,
  ListChecks,
  Loader2,
  Lock,
  Timer,
  X,
  XCircle,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { faDate, faDigits } from "@/lib/fa";
import {
  countBlanks,
  tableBlankKeys,
  type MatchingOptions,
  type OrderingOptions,
  type TableFillOptions,
} from "@/lib/exam";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PanelExam,
  PanelExamResult,
  PanelExamStart,
  PanelQuestionView,
  PanelReviewQuestion,
} from "@/components/panel/types";

/* ————————————————— ابزارهای مشترک ————————————————— */

/** کارت شیشه‌ای هماهنگ با بقیه‌ی پنل */
const CARD =
  "rounded-2xl border border-foreground/[0.08] bg-card/85 p-4 shadow-xl shadow-black/[0.04] backdrop-blur-xl sm:p-6 dark:border-white/[0.08] dark:bg-[#08110e]/70 dark:shadow-black/20";

/** به‌هم‌ریختن قطعی (برای سوال مرتب‌کردنی) — بر اساس شناسه‌ی سوال */
function seededShuffle(length: number, seed: string): number[] {
  const idx = Array.from({ length }, (_, i) => i);
  if (length <= 1) return idx;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  for (let i = length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  // اگر به‌هم‌ریختن تغییری نداشت (برای آرایه‌های کوچک)، جابه‌جایی اجباری
  if (idx.every((v, i) => v === i)) {
    [idx[0], idx[length - 1]] = [idx[length - 1], idx[0]];
  }
  return idx;
}

/** مقدار پیش‌فرض پاسخ کاربر برای هر نوع سوال */
function defaultAnswerFor(q: PanelQuestionView): unknown {
  switch (q.type) {
    case "fill_blank":
      return Array.from({ length: countBlanks(q.text) }, () => "");
    case "short_answer":
    case "essay":
      return "";
    case "matching": {
      const o = q.options as MatchingOptions;
      return Array.from({ length: o.left?.length ?? 0 }, () => -1);
    }
    case "ordering": {
      const o = q.options as OrderingOptions;
      return seededShuffle(o.items?.length ?? 0, q.id);
    }
    case "table_fill": {
      const o = q.options as TableFillOptions;
      const map: Record<string, string> = {};
      for (const k of tableBlankKeys(o)) map[k] = "";
      return map;
    }
    default:
      return null; // چندگزینه‌ای / درست-نادرست
  }
}

/** نمایش متنی پاسخ کاربر (برگه‌ی مرور) */
function describeUserAnswer(
  q: PanelQuestionView | PanelReviewQuestion,
  user: unknown
): string {
  const opts = q.options as Record<string, unknown>;
  switch (q.type) {
    case "multiple_choice": {
      const list = (opts.options as string[]) ?? [];
      return typeof user === "number" && list[user] ? list[user] : "بی‌پاسخ";
    }
    case "true_false":
      return user === "true"
        ? "درست"
        : user === "false"
          ? "نادرست"
          : "بی‌پاسخ";
    case "fill_blank":
      return Array.isArray(user)
        ? (user as string[]).map((s) => s || "—").join(" / ")
        : "بی‌پاسخ";
    case "short_answer":
    case "essay":
      return typeof user === "string" && user.trim() ? user : "بی‌پاسخ";
    case "matching": {
      const left = (opts.left as string[]) ?? [];
      const right = (opts.right as string[]) ?? [];
      if (!Array.isArray(user)) return "بی‌پاسخ";
      return (user as number[])
        .map((v, i) => `${left[i] ?? "؟"} ← ${v >= 0 ? (right[v] ?? "—") : "بی‌پاسخ"}`)
        .join("؛ ");
    }
    case "ordering": {
      const items = (opts.items as string[]) ?? [];
      if (!Array.isArray(user)) return "بی‌پاسخ";
      return (user as number[]).map((v) => items[v] ?? "؟").join(" ← ");
    }
    case "table_fill": {
      if (!user || typeof user !== "object") return "بی‌پاسخ";
      const headers = (opts.headers as string[]) ?? [];
      return Object.entries(user as Record<string, string>)
        .map(([k, v]) => {
          const c = parseInt(k.split(",")[1] ?? "0", 10);
          return `${headers[c] ?? k}: ${v || "—"}`;
        })
        .join("؛ ");
    }
    default:
      return "—";
  }
}

/** نمایش متنی پاسخ صحیح (برگه‌ی مرور) */
function describeCorrectAnswer(q: PanelReviewQuestion): string {
  const opts = q.options as Record<string, unknown>;
  const ans = q.correctAnswer as Record<string, unknown>;
  switch (q.type) {
    case "multiple_choice": {
      const list = (opts.options as string[]) ?? [];
      const i = (ans.answer as number) ?? 0;
      return list[i] ?? "—";
    }
    case "true_false":
      return (ans.answer as string) === "true" ? "درست" : "نادرست";
    case "fill_blank": {
      const blanks = (ans.blanks as string[][]) ?? [];
      return blanks.map((b) => b.join(" یا ")).join(" / ");
    }
    case "short_answer":
      return ((ans.accepted as string[]) ?? []).join(" یا ");
    case "essay":
      return (ans.sample as string) || "— (تشریحی — با تصحیح مدیر)";
    case "matching": {
      const left = (opts.left as string[]) ?? [];
      const right = (opts.right as string[]) ?? [];
      const pairs = (ans.pairs as number[]) ?? [];
      return pairs
        .map((v, i) => `${left[i] ?? "؟"} ← ${right[v] ?? "—"}`)
        .join("؛ ");
    }
    case "ordering": {
      const items = (opts.items as string[]) ?? [];
      return items.join(" ← ");
    }
    case "table_fill": {
      const headers = (opts.headers as string[]) ?? [];
      const cells = (ans.cells as Record<string, string[]>) ?? {};
      return Object.entries(cells)
        .map(([k, v]) => {
          const c = parseInt(k.split(",")[1] ?? "0", 10);
          return `${headers[c] ?? k}: ${v.join(" یا ")}`;
        })
        .join("؛ ");
    }
    default:
      return "—";
  }
}

/** قالب زمان شمار mm:ss */
function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${faDigits(m)}:${faDigits(String(s).padStart(2, "0"))}`;
}

/* ————————————————— رسانه‌ی سوال (تصویر/ویدئو) ————————————————— */

function QuestionMedia({
  image,
  video,
  compact = false,
}: {
  image: string;
  video: string;
  compact?: boolean;
}) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const trimmedImage = image.trim();
  const trimmedVideo = video.trim();

  const isDirectVideo =
    /^https?:\/\//i.test(trimmedVideo)
      ? /\.(mp4|webm|ogv|ogg|mov)(\?.*)?$/i.test(trimmedVideo)
      : trimmedVideo.startsWith("/uploads/") ||
        /\.(mp4|webm|ogv|ogg|mov)$/i.test(trimmedVideo);

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {trimmedImage && !imgFailed ? (
        <img
          src={trimmedImage}
          alt="تصویر سوال"
          onError={() => setImgFailed(true)}
          className={cn(
            "w-auto rounded-xl border border-foreground/[0.1] dark:border-white/[0.1]",
            compact ? "max-h-40" : "max-h-64"
          )}
          style={{ maxWidth: "100%" }}
        />
      ) : null}
      {trimmedVideo ? (
        isDirectVideo ? (
          <video
            src={trimmedVideo}
            controls
            preload="metadata"
            className={cn(
              "w-full rounded-xl border border-foreground/[0.1] dark:border-white/[0.1]",
              compact ? "max-h-40" : "max-h-72"
            )}
          />
        ) : (
          <a
            href={trimmedVideo}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-500/20 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300"
          >
            <FileQuestion className="size-4" />
            تماشای ویدئو این سوال (تب جدید)
          </a>
        )
      ) : null}
    </div>
  );
}

/* ————————————————— بخش آزمون‌های پنل ————————————————— */

export function ExamsSection() {
  const [exams, setExams] = React.useState<PanelExam[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  // دیالوگ رمز آزمون رمزدار
  const [pwdExam, setPwdExam] = React.useState<PanelExam | null>(null);
  const [password, setPassword] = React.useState("");
  const [starting, setStarting] = React.useState(false);

  // پلیر آزمون جاری
  const [start, setStart] = React.useState<PanelExamStart | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const res = await fetch("/api/panel/exams", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { exams: PanelExam[] };
      setExams(json.exams);
    } catch {
      setExams([]);
      toast.error("دریافت آزمون‌ها ناموفق بود؛ دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** شروع آزمون (بدون رمز — آزمون آزاد/دوره) */
  async function startExam(exam: PanelExam) {
    setStarting(true);
    try {
      const res = await fetch(`/api/panel/exams/${exam.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "خطا در شروع آزمون.");
      }
      setPwdExam(null);
      setPassword("");
      setStart(data as unknown as PanelExamStart);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "خطا در شروع آزمون."
      );
    } finally {
      setStarting(false);
    }
  }

  /** شروع آزمون رمزدار — با رمز واردشده */
  async function startPasswordExam() {
    if (!pwdExam) return;
    if (password.trim().length === 0) {
      toast.error("رمز آزمون را وارد کنید.");
      return;
    }
    setStarting(true);
    try {
      const res = await fetch(`/api/panel/exams/${pwdExam.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "رمز آزمون اشتباه است.");
      }
      setPwdExam(null);
      setPassword("");
      setStart(data as unknown as PanelExamStart);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "رمز آزمون اشتباه است."
      );
    } finally {
      setStarting(false);
    }
  }

  const courseExams = exams?.filter((e) => e.accessType === "course") ?? [];
  const openExams = exams?.filter((e) => e.accessType === "open") ?? [];
  const pwdExams = exams?.filter((e) => e.accessType === "password") ?? [];

  return (
    <section aria-label="آزمون‌ها">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
          <ClipboardCheck className="size-5 text-teal-600 dark:text-teal-300" />
          آزمون‌ها
        </h2>
        <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
          {faDigits(exams?.length ?? 0)} آزمون
        </span>
      </div>

      {loading ? (
        <div className={cn(CARD, "flex items-center gap-3 py-8")}>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="text-sm font-bold text-muted-foreground">
            در حال دریافت آزمون‌ها...
          </span>
        </div>
      ) : !exams || exams.length === 0 ? (
        <div
          className={cn(
            CARD,
            "flex flex-col items-center gap-4 px-6 py-12 text-center"
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04] dark:bg-white/[0.04]">
            <Inbox className="size-7 text-muted-foreground" />
          </span>
          <p className="text-base font-black text-foreground">
            آزمونی برای شما نمایش داده نمی‌شود
          </p>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            با انتشار آزمون‌های آزاد، رمزدار یا آزمون‌های دوره‌های شما،
            این‌جا فهرست می‌شوند.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {courseExams.length > 0 ? (
            <ExamGroup
              icon={GraduationCap}
              title="آزمون‌های دوره‌های من"
              exams={courseExams}
              starting={starting}
              onStart={startExam}
              onLocked={setPwdExam}
            />
          ) : null}
          {openExams.length > 0 ? (
            <ExamGroup
              icon={Globe}
              title="آزمون‌های آزاد"
              exams={openExams}
              starting={starting}
              onStart={startExam}
              onLocked={setPwdExam}
            />
          ) : null}
          {pwdExams.length > 0 ? (
            <ExamGroup
              icon={KeyRound}
              title="آزمون‌های رمزدار"
              exams={pwdExams}
              starting={starting}
              onStart={startExam}
              onLocked={setPwdExam}
            />
          ) : null}
        </div>
      )}

      {/* ————— دیالوگ رمز آزمون ————— */}
      <Dialog
        open={!!pwdExam}
        onOpenChange={(open) => {
          if (!open) {
            setPwdExam(null);
            setPassword("");
          }
        }}
      >
        <DialogContent dir="rtl" className="max-w-sm rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="size-5 text-amber-600 dark:text-amber-300" />
              آزمون رمزدار
            </DialogTitle>
            <DialogDescription>
              برای شرکت در «{pwdExam?.title}» رمز آزمون را وارد کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="exam-pwd">رمز آزمون</Label>
            <Input
              id="exam-pwd"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="رمزی که از مدرس/پشتیبانی دریافت کرده‌اید"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") void startPasswordExam();
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={starting}
              onClick={() => void startPasswordExam()}
              className="rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 font-black text-teal-950 shadow-lg shadow-teal-500/25 hover:shadow-teal-400/40"
            >
              {starting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              ورود به آزمون
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={starting}
              onClick={() => {
                setPwdExam(null);
                setPassword("");
              }}
              className="rounded-xl"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ————— پلیر آزمون ————— */}
      {start ? (
        <ExamPlayer
          start={start}
          onClose={() => setStart(null)}
          onFinished={load}
        />
      ) : null}
    </section>
  );
}

/* ————————————————— گروه آزمون‌ها ————————————————— */

function ExamGroup({
  icon: Icon,
  title,
  exams,
  starting,
  onStart,
  onLocked,
}: {
  icon: typeof Globe;
  title: string;
  exams: PanelExam[];
  starting: boolean;
  onStart: (exam: PanelExam) => void;
  onLocked: (exam: PanelExam) => void;
}) {
  return (
    <div className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-black text-foreground/90">
        <Icon className="size-4 text-muted-foreground" />
        {title}
        <span className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
          {faDigits(exams.length)}
        </span>
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {exams.map((exam) => (
          <ExamCard
            key={exam.id}
            exam={exam}
            starting={starting}
            onStart={onStart}
            onLocked={onLocked}
          />
        ))}
      </div>
    </div>
  );
}

/* ————————————————— کارت آزمون ————————————————— */

function ExamCard({
  exam,
  starting,
  onStart,
  onLocked,
}: {
  exam: PanelExam;
  starting: boolean;
  onStart: (exam: PanelExam) => void;
  onLocked: (exam: PanelExam) => void;
}) {
  const last = exam.myAttempts[0] ?? null;

  return (
    <div className={cn(CARD, "flex flex-col gap-3 p-4 sm:p-5")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black leading-6 text-foreground">
            {exam.title}
          </p>
          {exam.courseTitle ? (
            <p className="mt-1 flex items-center gap-1.5 text-[0.7rem] font-bold text-muted-foreground">
              <LinkIcon className="size-3" />
              {exam.courseTitle}
            </p>
          ) : null}
        </div>
        {exam.accessType === "password" ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.55rem] font-black text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
            <Lock className="size-3" />
            رمزدار
          </span>
        ) : null}
      </div>

      {exam.description ? (
        <p className="line-clamp-2 text-xs leading-6 text-muted-foreground">
          {exam.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.65rem] font-bold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ListChecks className="size-3.5" />
          {faDigits(exam.questionCount)} سوال
        </span>
        {exam.durationMinutes > 0 ? (
          <span className="flex items-center gap-1.5">
            <Timer className="size-3.5" />
            {faDigits(exam.durationMinutes)} دقیقه
          </span>
        ) : null}
      </div>

      {/* آخرین نتیجه */}
      {last ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-500/25 bg-teal-500/[0.05] px-3 py-2 dark:border-teal-400/20 dark:bg-teal-400/[0.04]">
          <Award className="size-4 text-teal-600 dark:text-teal-300" />
          <span className="text-xs font-black text-foreground">
            {faDigits(last.score ?? last.autoScore)} از{" "}
            {faDigits(last.totalPoints)}
          </span>
          <span className="text-[0.6rem] font-bold text-muted-foreground">
            آخرین شرکت: {faDate(last.finishedAt)}
          </span>
          {last.hasEssay && last.score === null ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.55rem] font-black text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
              در انتظار تصحیح تشریحی
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-2">
        {exam.accessType === "password" ? (
          <Button
            type="button"
            disabled={starting}
            onClick={() => onLocked(exam)}
            className="h-10 flex-1 rounded-xl bg-gradient-to-l from-amber-400 to-amber-600 text-xs font-black text-amber-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-400/30"
          >
            <KeyRound className="size-4" />
            ورود با رمز
          </Button>
        ) : (
          <Button
            type="button"
            disabled={starting}
            onClick={() => onStart(exam)}
            className="h-10 flex-1 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 text-xs font-black text-teal-950 shadow-lg shadow-teal-500/25 hover:shadow-teal-400/40"
          >
            <ClipboardCheck className="size-4" />
            {exam.myAttempts.length > 0 ? "شرکت مجدد" : "شروع آزمون"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ————————————————— پلیر آزمون (تمام‌صفحه) ————————————————— */

export function ExamPlayer({
  start,
  onClose,
  onFinished,
}: {
  start: PanelExamStart;
  onClose: () => void;
  onFinished: () => void;
}) {
  const { exam, questions } = start;

  // پاسخ‌های کاربر — به ازای شناسه‌ی هر سوال
  const [answers, setAnswers] = React.useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const q of questions) initial[q.id] = defaultAnswerFor(q);
    return initial;
  });

  const [current, setCurrent] = React.useState(0);
  const [phase, setPhase] = React.useState<"exam" | "submitting" | "result">(
    "exam"
  );
  const [result, setResult] = React.useState<PanelExamResult | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // آخرین نسخه‌ی پاسخ‌ها برای ارسال خودکار پایان زمان
  const answersRef = React.useRef(answers);
  React.useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const [submitting, setSubmitting] = React.useState(false);

  /** ثبت نهایی پاسخ‌ها */
  const submit = React.useCallback(async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setPhase("submitting");
    try {
      const res = await fetch(`/api/panel/exams/${exam.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: start.attemptId,
          answers: answersRef.current,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "خطا در ثبت پاسخ‌ها.");
      }
      setResult(data as unknown as PanelExamResult);
      setPhase("result");
      setConfirmOpen(false);
      toast.success("پاسخ‌های شما ثبت شد.");
      onFinished();
    } catch (error) {
      setPhase("exam");
      toast.error(
        error instanceof Error ? error.message : "خطا در ثبت پاسخ‌ها."
      );
    } finally {
      setSubmitting(false);
    }
  }, [exam.id, start.attemptId, submitting, onFinished]);

  // شمارش معکوس (در صورت محدودیت زمانی) + ثبت خودکار در پایان
  React.useEffect(() => {
    if (exam.durationMinutes <= 0) return;
    const deadline =
      new Date(start.startedAt).getTime() + exam.durationMinutes * 60000 + 3000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [exam.durationMinutes, start.startedAt]);

  React.useEffect(() => {
    if (secondsLeft === 0 && phase === "exam") {
      toast.warning("زمان آزمون تمام شد؛ پاسخ‌ها به‌صورت خودکار ثبت شد.");
      void submit();
    }
  }, [secondsLeft, phase, submit]);

  const q = questions[current];

  /** آیا این سوال پاسخ دارد؟ (برای نقطه‌های ناوبری) */
  function isAnswered(question: PanelQuestionView): boolean {
    const a = answers[question.id];
    switch (question.type) {
      case "multiple_choice":
      case "true_false":
        return a !== null && a !== undefined;
      case "fill_blank":
        return Array.isArray(a) && (a as string[]).some((s) => s.trim());
      case "short_answer":
      case "essay":
        return typeof a === "string" && a.trim().length > 0;
      case "matching":
        return (
          Array.isArray(a) && (a as number[]).some((v) => v >= 0)
        );
      case "ordering":
        return true;
      case "table_fill":
        return !!(
          a &&
          typeof a === "object" &&
          Object.values(a as Record<string, string>).some((s) => s.trim())
        );
      default:
        return false;
    }
  }

  const setAnswer = (qid: string, value: unknown) =>
    setAnswers((prev) => ({ ...prev, [qid]: value }));

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background">
      {/* ————— نوار بالای پلیر ————— */}
      <header className="sticky top-0 z-10 border-b border-foreground/[0.08] bg-background/95 px-4 py-3 backdrop-blur-md dark:border-white/[0.08]">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25">
            <ClipboardCheck className="size-5 text-teal-950" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-foreground">
              {exam.title}
            </p>
            <p className="text-[0.65rem] font-bold text-muted-foreground">
              {phase === "result"
                ? "برگه‌ی مرور پاسخ‌ها"
                : `سوال ${faDigits(current + 1)} از ${faDigits(questions.length)}`}
            </p>
          </div>

          {secondsLeft !== null && phase !== "result" ? (
            <span
              className={cn(
                "flex select-none items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-black tabular-nums",
                secondsLeft <= 60
                  ? "animate-pulse border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300"
                  : "border-foreground/[0.1] bg-foreground/[0.04] text-foreground dark:border-white/[0.1] dark:bg-white/[0.04]"
              )}
              role="timer"
              aria-live="off"
            >
              <Clock className="size-4" />
              {formatCountdown(secondsLeft)}
            </span>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="بستن آزمون"
            className="size-9 shrink-0 rounded-xl text-muted-foreground"
          >
            <X className="size-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {phase === "result" && result ? (
          /* ————— نتیجه و مرور ————— */
          <ExamResultView result={result} questions={questions} />
        ) : phase === "submitting" ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <Loader2 className="size-10 animate-spin text-teal-600 dark:text-teal-300" />
            <p className="text-sm font-black text-foreground">
              در حال ثبت پاسخ‌ها...
            </p>
          </div>
        ) : (
          /* ————— سوال جاری ————— */
          <div className="flex flex-col gap-5">
            {/* نقطه‌های ناوبری */}
            <div className="flex flex-wrap items-center gap-1.5" role="navigation" aria-label="رفتن به سوال">
              {questions.map((question, i) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-label={`سوال ${faDigits(i + 1)}`}
                  aria-current={i === current ? "true" : undefined}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg text-xs font-black tabular-nums transition-all",
                    i === current
                      ? "bg-gradient-to-br from-teal-400 to-emerald-600 text-teal-950 shadow-md shadow-teal-500/25"
                      : isAnswered(question)
                        ? "bg-teal-500/15 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300"
                        : "bg-foreground/[0.05] text-muted-foreground dark:bg-white/[0.05]"
                  )}
                >
                  {faDigits(i + 1)}
                </button>
              ))}
            </div>

            <QuestionView
              index={current}
              question={q}
              value={answers[q.id]}
              onChange={(value) => setAnswer(q.id, value)}
            />

            {/* ناوبری قبلی/بعدی + ثبت نهایی */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={current === 0}
                onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                className="rounded-xl"
              >
                <ChevronRight className="size-4" />
                سوال قبلی
              </Button>
              {current < questions.length - 1 ? (
                <Button
                  type="button"
                  onClick={() =>
                    setCurrent((c) => Math.min(questions.length - 1, c + 1))
                  }
                  className="rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 font-black text-teal-950 shadow-lg shadow-teal-500/25 hover:shadow-teal-400/40"
                >
                  سوال بعدی
                  <ChevronLeft className="size-4" />
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="ms-auto rounded-xl bg-gradient-to-l from-violet-400 to-violet-600 font-black text-violet-950 shadow-lg shadow-violet-500/25 hover:shadow-violet-400/40"
              >
                <ClipboardCheck className="size-4" />
                ثبت نهایی پاسخ‌ها
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* ————— تایید ثبت نهایی ————— */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent dir="rtl" className="max-w-sm rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base">ثبت نهایی پاسخ‌ها؟</DialogTitle>
            <DialogDescription className="leading-6">
              پس از ثبت نهایی امکان ویرایش پاسخ‌ها نیست.
              {(() => {
                const unanswered = questions.filter(
                  (question) => !isAnswered(question)
                ).length;
                return unanswered > 0
                  ? ` ${faDigits(unanswered)} سوال بی‌پاسخ است.`
                  : " همه‌ی سوالات پاسخ داده شده‌اند.";
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="rounded-xl bg-gradient-to-l from-violet-400 to-violet-600 font-black text-violet-950 shadow-lg shadow-violet-500/25"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              بله، ثبت نهایی
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmOpen(false)}
              className="rounded-xl"
            >
              بازگشت به آزمون
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ————————————————— نمایش یک سوال + ورودی پاسخ ————————————————— */

function QuestionView({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: PanelQuestionView;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const opts = question.options as Record<string, unknown>;

  return (
    <div className={cn(CARD, "space-y-4")}>
      {/* متن سوال */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-sm font-black tabular-nums text-foreground dark:bg-white/[0.05]">
            {faDigits(index + 1)}
          </span>
          <span className="text-[0.65rem] font-black text-muted-foreground">
            {faDigits(question.points)} نمره
          </span>
        </div>

        {question.type === "fill_blank" ? (
          <FillBlankInput
            text={question.text}
            values={Array.isArray(value) ? (value as string[]) : []}
            onChange={(next) => onChange(next)}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm font-bold leading-7 text-foreground">
            {question.text}
          </p>
        )}

        <QuestionMedia image={question.image} video={question.video} />
      </div>

      {/* ورودی پاسخ بر اساس نوع */}
      {question.type === "multiple_choice" ? (
        <div className="space-y-2" role="radiogroup" aria-label="گزینه‌ها">
          {((opts.options as string[]) ?? []).map((option, i) => {
            const active = value === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-right transition-all",
                  active
                    ? "border-teal-500/50 bg-teal-500/[0.07] shadow-sm shadow-teal-500/10 dark:border-teal-400/50 dark:bg-teal-400/[0.06]"
                    : "border-foreground/[0.12] bg-foreground/[0.02] hover:border-teal-500/30 dark:border-white/[0.12] dark:bg-white/[0.02] dark:hover:border-teal-400/30"
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    active
                      ? "border-teal-500 bg-gradient-to-br from-teal-400 to-emerald-500 dark:border-teal-400"
                      : "border-foreground/30 bg-card dark:border-white/30"
                  )}
                >
                  {active ? (
                    <CheckCircle2 className="size-3 text-teal-950" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 text-sm font-bold leading-6 text-foreground">
                  {option}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {question.type === "true_false" ? (
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { v: "true", label: "درست" },
              { v: "false", label: "نادرست" },
            ] as const
          ).map((opt) => {
            const active = value === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(opt.v)}
                className={cn(
                  "rounded-2xl border py-4 text-base font-black transition-all",
                  active
                    ? "border-teal-500/50 bg-teal-500/[0.07] text-teal-700 shadow-sm shadow-teal-500/10 dark:border-teal-400/50 dark:bg-teal-400/[0.06] dark:text-teal-300"
                    : "border-foreground/[0.12] bg-foreground/[0.02] text-foreground hover:border-teal-500/30 dark:border-white/[0.12] dark:bg-white/[0.02] dark:hover:border-teal-400/30"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {question.type === "short_answer" ? (
        <div className="space-y-2">
          <Label htmlFor={`sa-${question.id}`}>پاسخ کوتاه شما</Label>
          <Input
            id={`sa-${question.id}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="پاسخ خود را بنویسید..."
          />
        </div>
      ) : null}

      {question.type === "essay" ? (
        <div className="space-y-2">
          <Label htmlFor={`es-${question.id}`}>پاسخ تشریحی شما</Label>
          <Textarea
            id={`es-${question.id}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="پاسخ خود را کامل بنویسید؛ پس از ثبت، توسط مدرس تصحیح می‌شود..."
            className="min-h-36"
          />
        </div>
      ) : null}

      {question.type === "matching" ? (
        <MatchingInput
          left={((opts.left as string[]) ?? [])}
          right={((opts.right as string[]) ?? [])}
          values={Array.isArray(value) ? (value as number[]) : []}
          onChange={(next) => onChange(next)}
        />
      ) : null}

      {question.type === "ordering" ? (
        <OrderingInput
          items={((opts.items as string[]) ?? [])}
          values={Array.isArray(value) ? (value as number[]) : []}
          onChange={(next) => onChange(next)}
        />
      ) : null}

      {question.type === "table_fill" ? (
        <TableFillInput
          options={opts as unknown as TableFillOptions}
          values={
            value && typeof value === "object" && !Array.isArray(value)
              ? (value as Record<string, string>)
              : {}
          }
          onChange={(next) => onChange(next)}
        />
      ) : null}
    </div>
  );
}

/* ————————————————— ورودی جای خالی (داخل متن) ————————————————— */

function FillBlankInput({
  text,
  values,
  onChange,
}: {
  text: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const parts = text.split(/_{3,}/);
  return (
    <p className="text-sm font-bold leading-9 text-foreground">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          <span className="whitespace-pre-wrap">{part}</span>
          {i < parts.length - 1 ? (
            <input
              type="text"
              value={values[i] ?? ""}
              onChange={(e) => {
                const next = Array.from(
                  { length: parts.length - 1 },
                  (_, j) => (j === i ? e.target.value : values[j] ?? "")
                );
                onChange(next);
              }}
              placeholder="پاسخ"
              aria-label={`جای خالی ${faDigits(i + 1)}`}
              className="mx-1 inline-block w-32 rounded-lg border-0 border-b-2 border-teal-500/50 bg-teal-500/[0.06] px-2 py-0.5 text-center text-sm font-black text-foreground outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25 dark:border-teal-400/50 dark:bg-teal-400/[0.06]"
            />
          ) : null}
        </React.Fragment>
      ))}
    </p>
  );
}

/* ————————————————— ورودی وصل‌کردنی ————————————————— */

function MatchingInput({
  left,
  right,
  values,
  onChange,
}: {
  left: string[];
  right: string[];
  values: number[];
  onChange: (next: number[]) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.7rem] font-bold text-muted-foreground">
        برای هر آیتم ستون اول، گزینه‌ی درست ستون دوم را انتخاب کنید.
      </p>
      <div className="space-y-2">
        {left.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 rounded-xl border border-foreground/[0.1] bg-foreground/[0.02] px-3 py-2.5 text-sm font-bold leading-6 text-foreground dark:border-white/[0.1] dark:bg-white/[0.02]">
              {l}
            </span>
            <Select
              value={values[i] !== undefined && values[i] >= 0 ? String(values[i]) : ""}
              onValueChange={(v) => {
                const next = Array.from(
                  { length: left.length },
                  (_, j) => (j === i ? parseInt(v, 10) : values[j] ?? -1)
                );
                onChange(next);
              }}
            >
              <SelectTrigger dir="rtl" className="w-40 shrink-0">
                <SelectValue placeholder="انتخاب..." />
              </SelectTrigger>
              <SelectContent>
                {right.map((r, j) => (
                  <SelectItem key={j} value={String(j)}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ————————————————— ورودی مرتب‌کردنی ————————————————— */

/** ردیف مرتب‌کردنی — قابل جابه‌جایی با کشیدن دستگیره یا دکمه‌های بالا/پایین */
function OrderingRow({
  id,
  pos,
  label,
  total,
  onMove,
}: {
  id: number;
  pos: number;
  label: string;
  total: number;
  onMove: (index: number, delta: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties | undefined = transform
    ? {
        transform: CSS.Translate.toString(transform),
        transition: transition ?? undefined,
      }
    : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-foreground/[0.1] bg-foreground/[0.02] p-2 dark:border-white/[0.1] dark:bg-white/[0.02]",
        isDragging && "relative z-20 opacity-80 ring-2 ring-teal-500/50"
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-xs font-black tabular-nums text-foreground dark:bg-white/[0.05]">
        {faDigits(pos + 1)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onMove(pos, -1)}
        disabled={pos === 0}
        aria-label="انتقال به بالا"
        className="size-8 text-muted-foreground"
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onMove(pos, 1)}
        disabled={pos === total - 1}
        aria-label="انتقال به پایین"
        className="size-8 text-muted-foreground"
      >
        <ChevronDown className="size-4" />
      </Button>
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label="جابه‌جایی این آیتم با کشیدن"
        title="بکشید و در جای درست رها کنید"
        className="flex size-8 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
    </li>
  );
}

function OrderingInput({
  items,
  values,
  onChange,
}: {
  items: string[];
  values: number[];
  onChange: (next: number[]) => void;
}) {
  const sensors = useSensors(
    // فاصله‌ی ۵ پیکسل برای متمایز شدن از کلیک روی دکمه‌ها
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function move(index: number, delta: number) {
    const next = [...values];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = values.indexOf(Number(active.id));
    const to = values.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(values, from, to));
  }

  return (
    <div className="space-y-2">
      <p className="text-[0.7rem] font-bold text-muted-foreground">
        ترتیب درست را با کشیدن و رها کردن آیتم‌ها (یا دکمه‌های بالا/پایین) بچینید.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={values}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {values.map((itemIndex, pos) => (
              <OrderingRow
                key={itemIndex}
                id={itemIndex}
                pos={pos}
                label={items[itemIndex] ?? "—"}
                total={values.length}
                onMove={move}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

/* ————————————————— ورودی پرکردن جدول ————————————————— */

function TableFillInput({
  options,
  values,
  onChange,
}: {
  options: TableFillOptions;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const { headers, rows } = options;
  return (
    <div className="space-y-2">
      <p className="text-[0.7rem] font-bold text-muted-foreground">
        خانه‌های خالی جدول را پر کنید.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-foreground/[0.1] dark:border-white/[0.1]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-foreground/[0.04] dark:bg-white/[0.04]">
              {headers.map((h, c) => (
                <th
                  key={c}
                  className="px-3 py-2 text-center text-xs font-black text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr
                key={r}
                className="border-t border-foreground/[0.07] dark:border-white/[0.07]"
              >
                {row.map((cell, c) => {
                  const key = `${r},${c}`;
                  const blank = !cell || !cell.trim();
                  return (
                    <td key={c} className="p-1.5">
                      {blank ? (
                        <input
                          type="text"
                          value={values[key] ?? ""}
                          onChange={(e) =>
                            onChange({ ...values, [key]: e.target.value })
                          }
                          aria-label={`خانه ${faDigits(r + 1)},${faDigits(c + 1)}`}
                          placeholder="—"
                          className="w-full min-w-24 rounded-lg border border-dashed border-teal-500/40 bg-teal-500/[0.04] px-2 py-1.5 text-center text-sm font-bold text-foreground outline-none transition-colors focus:ring-2 focus:ring-teal-500/25 dark:border-teal-400/40 dark:bg-teal-400/[0.03]"
                        />
                      ) : (
                        <span className="block px-2 py-1.5 text-center font-bold text-muted-foreground">
                          {cell}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ————————————————— نمایش نتیجه و مرور ————————————————— */

function ExamResultView({
  result,
  questions,
}: {
  result: PanelExamResult;
  questions: PanelQuestionView[];
}) {
  const pct = result.autoMax > 0
    ? Math.round((result.autoScore / result.autoMax) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* کارت نمره */}
      <div className={cn(CARD, "flex flex-col items-center gap-4 py-8 text-center")}>
        <span
          className={cn(
            "flex size-20 items-center justify-center rounded-full bg-gradient-to-br shadow-xl",
            pct >= 70
              ? "from-emerald-400 to-teal-600 shadow-emerald-500/25"
              : pct >= 50
                ? "from-amber-400 to-amber-600 shadow-amber-500/25"
                : "from-rose-400 to-rose-600 shadow-rose-500/25"
          )}
        >
          <Award className="size-10 text-white" strokeWidth={2.2} />
        </span>
        <div>
          <p className="text-2xl font-black tabular-nums text-foreground">
            {faDigits(result.hasEssay ? result.autoScore : (result.score ?? result.autoScore))}{" "}
            از {faDigits(result.totalPoints)}
          </p>
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            {result.hasEssay
              ? `نمره‌ی سوالات عینی (خودکار) — سوالات تشریحی پس از تصحیح مدرس اعلام می‌شود`
              : `درصد سوالات عینی: ${faDigits(pct)}٪`}
          </p>
        </div>
        {result.hasEssay && result.score === null ? (
          <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-[0.7rem] font-bold text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
            <AlertCircle className="size-4 shrink-0" />
            این آزمون دارای سوال تشریحی است؛ نمره‌ی نهایی پس از تصحیح در همین بخش
            نمایش داده می‌شود.
          </p>
        ) : null}
      </div>

      {/* برگه‌ی مرور سوال به سوال */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
          <ListChecks className="size-4 text-teal-600 dark:text-teal-300" />
          مرور پاسخ‌ها
        </h3>
        {result.review.map((item, i) => {
          const question = questions.find((question2) => question2.id === item.id);
          const correct = item.correct;
          return (
            <div
              key={item.id}
              className={cn(
                CARD,
                "space-y-3 p-4 sm:p-5",
                correct === true &&
                  "border-emerald-500/30 dark:border-emerald-400/25",
                correct === false && "border-red-500/30 dark:border-red-400/25",
                correct === null &&
                  "border-amber-500/30 dark:border-amber-400/25"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-xs font-black tabular-nums text-foreground dark:bg-white/[0.05]">
                    {faDigits(i + 1)}
                  </span>
                  <Badge3
                    correct={correct}
                    label={
                      correct === true
                        ? "درست"
                        : correct === false
                          ? "نادرست"
                          : "تشریحی — در انتظار تصحیح"
                    }
                  />
                </div>
                <span className="shrink-0 text-[0.65rem] font-black text-muted-foreground">
                  {faDigits(item.earned)} از {faDigits(item.points)} نمره
                </span>
              </div>

              {item.type === "fill_blank" && question ? (
                <FillBlankInput
                  text={item.text}
                  values={Array.isArray(item.userAnswer) ? (item.userAnswer as string[]) : []}
                  onChange={() => undefined}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm font-bold leading-7 text-foreground">
                  {item.text}
                </p>
              )}

              {item.image || item.video ? (
                <QuestionMedia image={item.image} video={item.video} compact />
              ) : null}

              <div className="space-y-1.5 rounded-xl bg-foreground/[0.03] p-3 text-xs leading-6 dark:bg-white/[0.03]">
                <p className="text-foreground">
                  <span className="font-black">پاسخ شما: </span>
                  <bdi>{describeUserAnswer(item, item.userAnswer)}</bdi>
                </p>
                <p className="text-muted-foreground">
                  <span className="font-black">پاسخ صحیح: </span>
                  <bdi>{describeCorrectAnswer(item)}</bdi>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** نشان درست/نادرست/تشریحی */
function Badge3({
  correct,
  label,
}: {
  correct: boolean | null;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-black",
        correct === true
          ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
          : correct === false
            ? "bg-red-500/15 text-red-700 dark:bg-red-400/15 dark:text-red-300"
            : "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
      )}
    >
      {correct === true ? (
        <CheckCircle2 className="size-3" />
      ) : correct === false ? (
        <XCircle className="size-3" />
      ) : (
        <Clock className="size-3" />
      )}
      {label}
    </span>
  );
}
