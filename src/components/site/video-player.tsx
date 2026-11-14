"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Gauge,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Smartphone,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { faDigits } from "@/lib/fa";

/**
 * پخش‌کننده‌ی ویدئوی اختصاصی «آوید» —
 * بدون کتابخانه‌ی خارجی، مستقیماً روی <video> ساخته شده است.
 *
 * • پخش/توقف + دکمه‌ی بزرگ مرکزی هنگام توقف
 * • نوار پیشرفت سفارشی با نمایش بازه‌های بافر شده + درگ برای جابه‌جایی
 * • نمایش زمان جاری/کل (ارقام لاتین، MM:SS یا H:MM:SS)
 * • صدا: بی‌صدا/باصدا + اسلایدر افقی در هاور (دسکتاپ؛ در موبایل مخفی)
 * • منوی سرعت پخش (۰.۵× تا ۲×) با ارقام فارسی — «داخل خود پلیر» رندر
 *   می‌شود (بدون پرتال به body) تا در حالت تمام‌صفحه نیز دیده شود و
 *   به‌درستی کار کند
 * • تمام‌صفحه (با پشتیبانی webkit) + دابل‌کلیک برای تمام‌صفحه
 * • تشخیص خودکار ویدئوی افقی: در تمام‌صفحه روی صفحه‌ی عمودی، ابتدا قفل
 *   جهت سیستمی «landscape» امتحان می‌شود؛ اگر صفحه عمودی بماند، کل صحنه‌ی
 *   پلیر ۹۰ درجه چرخانده می‌شود تا ویدئو افقی، صفحه را در جهت طولانی پر کند
 * • مخفی شدن خودکار کنترل‌ها پس از ۲.۵ ثانیه بی‌حرکتی هنگام پخش
 * • اسپینر بافرینگ، حالت خطا، میان‌برهای کیبورد (Space/←→/M/F/Escape)
 * • رابط کاربری LTR استاندارد داخل صفحه‌ی RTL، برچسب‌های ARIA فارسی
 */

/** سرعت‌های مجاز پخش — مقدار عددی برای playbackRate، برچسب فارسی برای UI */
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** مدت‌زمان انتظار قبل از مخفی شدن کنترل‌ها (میلی‌ثانیه) */
const HIDE_DELAY_MS = 2500;

/** تأخیر پیش از اعمال چرخش CSS — فرصتی برای موفقیت قفل جهت سیستمی صفحه */
const ROTATE_DELAY_MS = 350;

/** مدت نمایش راهنمای «گوشی را بچرخانید» پس از چرخش (میلی‌ثانیه) */
const ROTATE_HINT_MS = 2600;

/** عناصری که ممکن است پیشوندهای webkit تمام‌صفحه داشته باشند */
type FullscreenContainer = HTMLDivElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/** جهت صفحه همراه با lock اختیاری (مثلاً اندروید کروم در تمام‌صفحه) */
type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
};

/** قالب‌بندی زمان به شکل M:SS یا H:MM:SS (ارقام لاتین) */
function formatTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const total = Math.floor(t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function VideoPlayer({
  src,
  poster,
  title,
  autoPlay = false,
  onEnded,
  className,
}: {
  /** آدرس فایل ویدئو (مسیر نسبی مثل /uploads/videos/x.mp4) */
  src: string;
  /** تصویر کاور (اختیاری) */
  poster?: string;
  /** عنوان ویدئو — برای ARIA */
  title?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const speedOpenRef = useRef(false);
  const rotateTimerRef = useRef<number | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const lockTriedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // هنگام پخش خودکار، از همان ابتدا حالت بارگذاری نشان داده می‌شود
  const [buffering, setBuffering] = useState(autoPlay);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState<number>(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** حالت چرخش ۹۰ درجه‌ی صحنه در تمام‌صفحه (ویدئوی افقی روی صفحه‌ی عمودی) */
  const [rotated, setRotated] = useState(false);
  /** راهنمای گذرا «گوشی را بچرخانید» هنگام اعمال چرخش */
  const [rotateHint, setRotateHint] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const [buffered, setBuffered] = useState<Array<[number, number]>>([]);

  // آینه‌ی ref برای خواندن وضعیت منوی سرعت داخل setTimeout بدون Closure قدیمی
  useEffect(() => {
    speedOpenRef.current = speedOpen;
  }, [speedOpen]);

  /* ---------------- کنترل‌ها: نمایش و مخفی‌سازی خودکار ---------------- */

  /** نمایش کنترل‌ها + زمان‌بندی مخفی‌سازی مجدد (فقط هنگام پخش) */
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    const v = videoRef.current;
    if (v && !v.paused && !v.ended) {
      hideTimerRef.current = window.setTimeout(() => {
        // تا زمانی که منوی سرعت باز است کنترل‌ها مخفی نمی‌شوند
        if (speedOpenRef.current) return;
        const vid = videoRef.current;
        if (vid && !vid.paused && !vid.ended) {
          setControlsVisible(false);
          setSpeedOpen(false);
        }
      }, HIDE_DELAY_MS);
    }
  }, []);

  /** توقف تایمر مخفی‌سازی و تثبیت کنترل‌ها (هنگام توقف/پایان) */
  const pinControls = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setControlsVisible(true);
  }, []);

  // پاک‌سازی تایمرها هنگام unmount
  useEffect(
    () => () => {
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
      if (rotateTimerRef.current !== null) window.clearTimeout(rotateTimerRef.current);
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    },
    []
  );

  /* ---------------- پخش خودکار، صدا و سرعت ---------------- */

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !autoPlay) return;
    v.play().catch(() => {
      // پخش خودکار توسط مرورگر مسدود شد — دکمه‌ی پخش نمایش داده می‌شود
      setPlaying(false);
      setBuffering(false);
    });
  }, [src, autoPlay]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      v.muted = muted;
    }
  }, [volume, muted]);

  /* ---------------- تمام‌صفحه ---------------- */

  useEffect(() => {
    const handler = () => {
      const doc = document as FullscreenDocument;
      setFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    const doc = document as FullscreenDocument;
    const active = doc.fullscreenElement || doc.webkitFullscreenElement;
    try {
      if (active) {
        if (typeof doc.exitFullscreen === "function") await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } else {
        const container = el as FullscreenContainer;
        if (typeof container.requestFullscreen === "function") {
          await container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          await container.webkitRequestFullscreen();
        }
      }
    } catch {
      // برخی محیط‌ها (iframe بدون اجازه) تمام‌صفحه را نمی‌پذیرند
    }
  }, []);

  /* ---------------- چرخش خودکار ویدئوی افقی در تمام‌صفحه ---------------- */

  /**
   * تشخیص جهت: اگر در تمام‌صفحه، صفحه عمودی باشد و خودِ ویدئو افقی
   * (videoWidth > videoHeight)، ابتدا قفل جهت سیستمی «landscape» امتحان
   * می‌شود (اندروید کروم؛ صفحه را واقعاً افقی می‌کند). اگر صفحه عمودی
   * ماند، صحنه‌ی پلیر با CSS ۹۰ درجه چرخانده می‌شود تا ویدئو افقی،
   * محور طولانی صفحه را پر کند.
   */
  useEffect(() => {
    const doc = document as FullscreenDocument;

    const compute = () => {
      const v = videoRef.current;
      const isFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      const portraitScreen = window.innerHeight > window.innerWidth;
      const landscapeVideo =
        !!v && v.videoWidth > 0 && v.videoHeight > 0 && v.videoWidth > v.videoHeight;
      const should = isFs && portraitScreen && landscapeVideo;

      if (rotateTimerRef.current !== null) {
        window.clearTimeout(rotateTimerRef.current);
        rotateTimerRef.current = null;
      }

      if (should) {
        // قفل جهت سیستمی — فقط یک‌بار در هر جلسه‌ی تمام‌صفحه
        if (!lockTriedRef.current) {
          lockTriedRef.current = true;
          const orientation = window.screen
            .orientation as LockableScreenOrientation | undefined;
          if (orientation && typeof orientation.lock === "function") {
            orientation.lock("landscape").catch(() => {
              // پشتیبانی نشد — چرخش CSS جایگزین می‌شود
            });
          }
        }
        // تأخیر کوتاه: اگر قفل سیستمی موفق شود، صفحه افقی می‌شود و
        // چرخش CSS دیگر لازم نیست (شرط‌ها در لحظه‌ی اجرا بازبینی می‌شوند)
        rotateTimerRef.current = window.setTimeout(() => {
          rotateTimerRef.current = null;
          const v2 = videoRef.current;
          const stillFs = Boolean(
            doc.fullscreenElement || doc.webkitFullscreenElement
          );
          if (
            stillFs &&
            window.innerHeight > window.innerWidth &&
            v2 &&
            v2.videoWidth > 0 &&
            v2.videoHeight > 0 &&
            v2.videoWidth > v2.videoHeight
          ) {
            setRotated(true);
          }
        }, ROTATE_DELAY_MS);
      } else {
        setRotated(false);
        lockTriedRef.current = false;
      }
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      if (rotateTimerRef.current !== null) {
        window.clearTimeout(rotateTimerRef.current);
        rotateTimerRef.current = null;
      }
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
    // duration به‌عنوان سیگنال «بارگذاری متادیتا» ویدیو نیز وابسته است
  }, [fullscreen, duration]);

  /** راهنمای گذرا هنگام اعمال چرخش — خارج از صحنه‌ی چرخیده (خوانا در حالت عمودی) */
  useEffect(() => {
    if (rotated) {
      setRotateHint(true);
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = window.setTimeout(
        () => setRotateHint(false),
        ROTATE_HINT_MS
      );
    } else {
      setRotateHint(false);
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
    }
    return () => {
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    };
  }, [rotated]);

  /* ---------------- پخش/توقف و جابه‌جایی ---------------- */

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || failed) return;
    if (v.paused || v.ended) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [failed]);

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(v.duration)) return;
      v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration);
      showControls();
    },
    [showControls]
  );

  /** نسبت موقعیت اشاره‌گر روی نوار پیشرفت (۰ تا ۱) — با پشتیبانی از حالت چرخیده */
  function ratioFromEvent(e: React.PointerEvent<HTMLDivElement>): number {
    const el = seekRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rotated) {
      // نوار ۹۰ درجه چرخیده است: طول آن روی محور عمودی صفحه قرار می‌گیرد
      if (rect.height === 0) return 0;
      return Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    }
    if (rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }

  function handleSeekDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!duration || failed) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = ratioFromEvent(e);
    setDragRatio(r);
    const v = videoRef.current;
    if (v) v.currentTime = r * duration;
    showControls();
  }

  function handleSeekMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !duration) return;
    const r = ratioFromEvent(e);
    setDragRatio(r);
    const v = videoRef.current;
    if (v) v.currentTime = r * duration;
  }

  function handleSeekUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // اشاره‌گر از قبل آزاد شده است
    }
    const r = ratioFromEvent(e);
    setDragRatio(null);
    if (duration) {
      const v = videoRef.current;
      if (v) v.currentTime = r * duration;
    }
    showControls();
  }

  /* ---------------- کلیک روی سطح ویدئو (تک‌کلیک: پخش، دابل: تمام‌صفحه) ---------------- */

  function handleSurfaceClick() {
    // اگر منوی سرعت باز است، کلیک روی ویدئو فقط منو را می‌بندد
    if (speedOpenRef.current) {
      setSpeedOpen(false);
      showControls();
      return;
    }
    if (clickTimerRef.current !== null) {
      // کلیک دوم در بازه‌ی کوتاه → دابل‌کلیک → تمام‌صفحه
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      void toggleFullscreen();
      return;
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      togglePlay();
    }, 220);
  }

  /* ---------------- کیبورد ---------------- */

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case " ":
      case "Spacebar":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        seekBy(-5);
        break;
      case "ArrowRight":
        e.preventDefault();
        seekBy(5);
        break;
      case "m":
      case "M":
        e.preventDefault();
        setMuted((m) => !m);
        showControls();
        break;
      case "f":
      case "F":
        e.preventDefault();
        void toggleFullscreen();
        break;
      case "Escape":
        if (speedOpenRef.current) {
          e.preventDefault();
          setSpeedOpen(false);
          showControls();
        }
        break;
      default:
        break;
    }
  }

  /* ---------------- رویدادهای عنصر ویدئو ---------------- */

  function handleProgress() {
    const v = videoRef.current;
    if (!v || v.buffered.length === 0) return;
    const ranges: Array<[number, number]> = [];
    for (let i = 0; i < v.buffered.length; i++) {
      ranges.push([v.buffered.start(i), v.buffered.end(i)]);
    }
    setBuffered(ranges);
  }

  function retry() {
    const v = videoRef.current;
    if (!v) return;
    setFailed(false);
    setBuffering(true);
    v.load();
    v.play().catch(() => {});
  }

  /* ---------------- محاسبات نمایش ---------------- */

  const displayRatio =
    dragRatio !== null
      ? dragRatio
      : duration > 0
        ? Math.min(1, currentTime / duration)
        : 0;

  const controlsShown = controlsVisible || !playing;

  const iconBtn =
    "flex items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none size-7 sm:size-9";

  // کلاس‌های صحنه: عادی (در جریان) / تمام‌صفحه (کل صفحه) / چرخیده (۹۰ درجه)
  const stageClass = rotated
    ? "absolute"
    : fullscreen
      ? "absolute inset-0"
      : "relative";

  const stageStyle: React.CSSProperties | undefined = rotated
    ? {
        // ابعاد مبادله‌شده با چرخش ۹۰ درجه: عرض = ارتفاع صفحه، ارتفاع = عرض صفحه
        left: "50%",
        top: "50%",
        width: "100vh",
        height: "100vw",
        transform: "translate(-50%, -50%) rotate(90deg)",
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      dir="ltr"
      tabIndex={0}
      role="region"
      data-video-player
      data-rotated={rotated || undefined}
      aria-label={`پخش‌کننده ویدئو${title ? `: ${title}` : ""}`}
      onKeyDown={handleKeyDown}
      onMouseMove={showControls}
      onTouchStart={showControls}
      className={cn(
        "group select-none overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70",
        fullscreen
          ? "fixed inset-0 z-[9999] rounded-none"
          : "relative w-full rounded-2xl",
        controlsShown ? "cursor-default" : "cursor-none",
        className
      )}
    >
      {/* صحنه‌ی پلیر — ویدئو و همه‌ی روکش‌ها/کنترل‌ها؛ در حالت چرخیده، کل صحنه ۹۰ درجه می‌چرخد */}
      <div className={stageClass} style={stageStyle}>
        <video
          ref={videoRef}
          src={src}
          poster={poster || undefined}
          autoPlay={autoPlay}
          playsInline
          preload="metadata"
          aria-label={title}
          className={cn(
            "block object-contain",
            fullscreen || rotated ? "h-full w-full" : "aspect-video w-full"
          )}
          onPlay={() => {
            setPlaying(true);
            showControls();
          }}
          onPause={() => {
            setPlaying(false);
            pinControls();
          }}
          onEnded={() => {
            setPlaying(false);
            pinControls();
            onEnded?.();
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            setDuration(Number.isFinite(d) ? d : 0);
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            setDuration(Number.isFinite(d) ? d : 0);
            handleProgress();
          }}
          onProgress={handleProgress}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onError={() => {
            setFailed(true);
            setBuffering(false);
          }}
          onVolumeChange={(e) => {
            setMuted(e.currentTarget.muted);
            setVolume(e.currentTarget.volume);
          }}
        />

        {/* سطح کلیک (تک‌کلیک: پخش/توقف — دابل‌کلیک: تمام‌صفحه) */}
        <div
          className="absolute inset-0 z-0"
          onClick={handleSurfaceClick}
          aria-hidden="true"
        />

        {/* اسپینر بافرینگ */}
        {buffering && !failed && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <Loader2 className="size-7 animate-spin text-white/95" />
            </span>
          </div>
        )}

        {/* حالت خطا */}
        {failed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-amber-500/15">
              <TriangleAlert className="size-7 text-amber-400" />
            </span>
            <p className="text-sm font-black text-white">خطا در پخش ویدئو</p>
            <button
              type="button"
              onClick={retry}
              className="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20"
            >
              <RotateCcw className="size-3.5" />
              تلاش دوباره
            </button>
          </div>
        )}

        {/* دکمه‌ی بزرگ پخش هنگام توقف */}
        {!playing && !failed && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <button
              type="button"
              onClick={togglePlay}
              aria-label="پخش ویدئو"
              className="pointer-events-auto flex size-16 items-center justify-center rounded-full border border-white/25 bg-black/40 shadow-xl backdrop-blur-md transition-all hover:scale-105 hover:border-teal-300/60 hover:bg-teal-400/30 sm:size-20"
            >
              <Play className="size-7 fill-white text-white drop-shadow sm:size-9" />
            </button>
          </div>
        )}

        {/* نوار کنترل‌ها */}
        <div
          data-controls
          className={cn(
            "absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/55 to-transparent px-2 pb-1.5 pt-6 transition-all duration-300 sm:px-3 sm:pb-2",
            controlsShown
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0"
          )}
        >
          {/* نوار پیشرفت */}
          <div
            ref={seekRef}
            role="slider"
            aria-label="نوار پیشرفت ویدئو"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            className="group/seek relative flex h-5 cursor-pointer touch-none items-center"
            onPointerDown={handleSeekDown}
            onPointerMove={handleSeekMove}
            onPointerUp={handleSeekUp}
            onPointerCancel={handleSeekUp}
          >
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-all group-hover/seek:h-1.5 sm:h-1.5">
              {/* بازه‌های بافر شده */}
              {duration > 0 &&
                buffered.map(([start, end], i) => (
                  <div
                    key={i}
                    className="absolute inset-y-0 left-0 rounded-full bg-white/30"
                    style={{
                      left: `${(start / duration) * 100}%`,
                      width: `${((end - start) / duration) * 100}%`,
                    }}
                  />
                ))}
              {/* پیشرفت پخش */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-teal-400"
                style={{ width: `${displayRatio * 100}%` }}
              />
              {/* دستگیره */}
              <div
                className={cn(
                  "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-300 shadow-md shadow-black/40 transition-transform",
                  dragRatio !== null ? "scale-125" : "scale-0 group-hover/seek:scale-100 sm:scale-100"
                )}
                style={{ left: `${displayRatio * 100}%` }}
              />
            </div>
          </div>

          {/* ردیف دکمه‌ها */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "توقف ویدئو" : "پخش ویدئو"}
              className={iconBtn}
            >
              {playing ? (
                <Pause className="size-4 fill-current sm:size-5" />
              ) : (
                <Play className="size-4 fill-current sm:size-5" />
              )}
            </button>

            <span
              className="whitespace-nowrap px-1 text-[0.6rem] font-bold tabular-nums text-white/90 sm:text-xs"
              dir="ltr"
            >
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* صدا — اسلایدر فقط در دسکتاپ و روی هاور */}
            <div className="group/vol hidden items-center sm:flex">
              <div className="flex w-20 items-center overflow-hidden pl-1 opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setVolume(val);
                    if (val > 0) setMuted(false);
                  }}
                  aria-label="میزان صدا"
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/30 outline-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal-300 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-teal-300"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMuted((m) => !m);
                  showControls();
                }}
                aria-label={muted ? "باصدا کردن ویدئو" : "بی‌صدا کردن ویدئو"}
                className={iconBtn}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="size-4 sm:size-5" />
                ) : (
                  <Volume2 className="size-4 sm:size-5" />
                )}
              </button>
            </div>

            {/* دکمه بی‌صدا در موبایل */}
            <button
              type="button"
              onClick={() => {
                setMuted((m) => !m);
                showControls();
              }}
              aria-label={muted ? "باصدا کردن ویدئو" : "بی‌صدا کردن ویدئو"}
              className={cn(iconBtn, "sm:hidden")}
            >
              {muted || volume === 0 ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>

            {/* منوی سرعت پخش — داخل خود پلیر رندر می‌شود (بدون پرتال)
                تا در حالت تمام‌صفحه نیز دیده شود و به‌درستی کار کند */}
            <div className="relative">
              <button
                type="button"
                aria-label="سرعت پخش"
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                onClick={() => {
                  setSpeedOpen((o) => !o);
                  showControls();
                }}
                className={iconBtn}
              >
                <Gauge className="size-4 sm:size-5" />
                <span className="hidden text-[0.65rem] font-bold tabular-nums sm:inline">
                  {faDigits(speed)}×
                </span>
              </button>

              {speedOpen && (
                <div
                  role="menu"
                  aria-label="انتخاب سرعت پخش"
                  className="absolute bottom-full right-0 z-20 mb-2 w-28 rounded-xl border border-white/10 bg-black/85 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-md"
                >
                  <p className="px-2.5 pb-1 pt-0.5 text-[0.6rem] font-bold text-white/60">
                    سرعت پخش
                  </p>
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="menuitemradio"
                      aria-checked={s === speed}
                      onClick={() => {
                        setSpeed(s);
                        setSpeedOpen(false);
                        showControls();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors",
                        s === speed
                          ? "bg-teal-500/20 text-teal-300"
                          : "text-white/85 hover:bg-white/10"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          s === speed ? "bg-teal-400" : "bg-transparent"
                        )}
                      />
                      {faDigits(s)}×
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* تمام‌صفحه */}
            <button
              type="button"
              onClick={() => {
                void toggleFullscreen();
                showControls();
              }}
              aria-label={fullscreen ? "خروج از حالت تمام‌صفحه" : "نمایش تمام‌صفحه"}
              className={iconBtn}
            >
              {fullscreen ? (
                <Minimize className="size-4 sm:size-5" />
              ) : (
                <Maximize className="size-4 sm:size-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* راهنمای گذرای چرخاندن گوشی — خارج از صحنه‌ی چرخیده تا در حالت عمودی خوانا بماند */}
      {fullscreen && rotated && rotateHint && (
        <div className="pointer-events-none absolute inset-x-0 top-8 z-30 flex justify-center px-4">
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-md">
            <Smartphone className="size-4" />
            <RotateCw className="size-3.5 text-teal-300" />
            برای تماشای بهتر، گوشی را بچرخانید
          </span>
        </div>
      )}
    </div>
  );
}
