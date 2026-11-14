"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Clock,
  Eye,
  Film,
  ListVideo,
  Loader2,
  Play,
  Search,
  SearchX,
  UserCheck,
  Users,
  VideoOff,
  WifiOff,
  X,
} from "lucide-react";
import type { Playlist, Video } from "@prisma/client";
import { cn } from "@/lib/utils";
import { faDigits } from "@/lib/fa";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { VideoSourcePlayer } from "@/components/site/video-source-player";
import { LogoMark } from "@/components/admin/shared/logo-mark";
import { EditableText } from "@/components/site/editable-texts";

/* ------------------------------------------------------------------ */
/*  ابزارهای مشترک پخش ویدئو — تشخیص منبع از src/lib/video           */
/*  (فایل محلی / لینک مستقیم MP4 / یوتیوب / آپارات / وی‌میو)           */
/* ------------------------------------------------------------------ */

/** استایل اسکرول‌بار نازک */
const THIN_SCROLLBAR =
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20";

/** تصویر با جایگزین گرادیانی در صورت نبود/خطا */
function ThumbImage({
  src,
  alt,
  sizes,
  icon: Icon = Film,
}: {
  src: string;
  alt: string;
  sizes: string;
  icon?: typeof Film;
}) {
  const [failed, setFailed] = React.useState(false);
  const trimmed = src.trim();

  if (!trimmed || failed) {
    return (
      <div className="flex size-full items-center justify-center bg-gradient-to-br from-teal-500/15 to-violet-500/15 dark:from-teal-500/25 dark:via-[#07100d] dark:to-violet-500/25">
        <Icon className="size-10 text-teal-600/50 dark:text-teal-300/40" strokeWidth={1.6} />
      </div>
    );
  }

  return (
    <Image
      src={trimmed}
      alt={alt}
      fill
      sizes={sizes}
      className="object-cover transition-transform duration-500 group-hover:scale-110"
      onError={() => setFailed(true)}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  داده‌ی صفحه                                                          */
/* ------------------------------------------------------------------ */

interface VideosPageData {
  isLoggedIn: boolean;
  videos: Video[];
  playlists: Playlist[];
}

/** وضعیت‌های بارگذاری صفحه */
type LoadState = "loading" | "ready" | "error";

/** نرمال‌سازی متن جستجو: یکسان‌سازی ی/ك عربی، نیم‌فاصله و فاصله‌های تکراری */
function normalizeFa(text: string): string {
  return text
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function VideosPage() {
  const [state, setState] = React.useState<LoadState>("loading");
  const [data, setData] = React.useState<VideosPageData | null>(null);

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/videos", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()) as VideosPageData);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // لیست پخش باز + ویدئوی جاری صف
  const [openGroup, setOpenGroup] = React.useState<{
    playlist: Playlist;
    items: Video[];
  } | null>(null);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);

  const activeItem = openGroup
    ? (openGroup.items.find((v) => v.id === activeVideoId) ??
      openGroup.items[0] ??
      null)
    : null;
  const activeItemIndex = activeItem
    ? (openGroup?.items.findIndex((v) => v.id === activeItem.id) ?? -1)
    : -1;

  function openPlaylist(playlist: Playlist) {
    const items = (data?.videos ?? []).filter((v) => v.playlistId === playlist.id);
    if (items.length === 0) {
      toast.info("این لیست پخش هنوز ویدئویی ندارد.");
      return;
    }
    setOpenGroup({ playlist, items });
    setActiveVideoId(items[0]?.id ?? null);
  }

  /** پخش خودکار ویدئوی بعدی پس از پایان */
  function playNext() {
    if (!openGroup) return;
    const next =
      activeItemIndex >= 0 ? openGroup.items[activeItemIndex + 1] : undefined;
    if (next) setActiveVideoId(next.id);
  }

  const playlistGroups = React.useMemo(() => {
    if (!data) return [];
    return data.playlists
      .map((playlist) => ({
        playlist,
        count: data.videos.filter((v) => v.playlistId === playlist.id).length,
      }))
      .filter((g) => g.count > 0);
  }, [data]);

  const standalone = React.useMemo(
    () => (data?.videos ?? []).filter((v) => !v.playlistId),
    [data]
  );

  /* ————— جستجوی ویدئوها ————— */

  const [query, setQuery] = React.useState("");
  const normQuery = React.useMemo(() => normalizeFa(query), [query]);
  const searching = normQuery.length > 0;

  /** عنوان لیست پخش هر ویدئو — برای جستجو و برچسب کارت نتیجه */
  const playlistTitleById = React.useMemo(() => {
    const m = new Map<string, string>();
    (data?.playlists ?? []).forEach((p) => m.set(p.id, p.title));
    return m;
  }, [data]);

  /** ویدئوهای منطبق با عبارت جستجو — همه‌ی واژه‌ها باید پیدا شوند */
  const matches = React.useMemo(() => {
    if (!normQuery) return [];
    const terms = normQuery.split(" ").filter(Boolean);
    return (data?.videos ?? []).filter((v) => {
      const playlistTitle = playlistTitleById.get(v.playlistId ?? "") ?? "";
      const haystack = normalizeFa(
        `${v.title} ${v.description ?? ""} ${v.level} ${playlistTitle}`
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [normQuery, data, playlistTitleById]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background">
      {/* پس‌زمینه‌ی تزئینی نرم */}
      <div className="pointer-events-none absolute inset-0 -z-[1]">
        <div className="absolute -top-32 right-1/4 size-[26rem] rounded-full bg-teal-500/[0.08] blur-[130px] dark:bg-teal-400/[0.06]" />
        <div className="absolute bottom-0 left-1/4 size-[24rem] rounded-full bg-violet-500/[0.07] blur-[130px] dark:bg-violet-400/[0.05]" />
      </div>

      {/* هدر مینیمال */}
      <header className="px-4 pt-5">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] px-4 backdrop-blur-md md:px-6 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <Link href="/" className="flex items-center gap-3" aria-label="بازگشت به صفحه اصلی">
            <LogoMark className="size-11" iconClassName="size-5" />
            <span className="leading-tight">
              <span className="block text-lg font-black tracking-tight text-foreground">
                ویدئوهای آموزشی
              </span>
              <span className="block text-[0.65rem] font-medium text-muted-foreground">
                آکادمی آوید
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              asChild
              variant="outline"
              className="hidden h-10 rounded-xl border-foreground/[0.12] bg-foreground/[0.04] px-4 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 sm:inline-flex dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
            >
              <Link href="/">
                <ArrowRight className="size-4" />
                بازگشت به سایت
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:pt-10">
        {/* سربرگ بخش */}
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
            <Film className="size-3.5" />
            کتابچه‌ی ویدئویی
          </span>
          <h1 className="mt-5 text-3xl font-black leading-[1.25] text-foreground md:text-[2.6rem] md:leading-[1.2]">
            <EditableText k="videosPage.title">
              <>
                لیست‌های پخش <span className="text-gradient">آموزشی</span> آوید
              </>
            </EditableText>
          </h1>
          <p className="mt-4 text-sm leading-8 text-muted-foreground md:text-base">
            <EditableText k="videosPage.description">
              <>
                مجموعه‌های ویدئویی ما را اینجا تماشا کنید؛ روی هر لیست پخش کلیک کنید تا ویدئوها را
                پشت‌سرهم ببینید.
                {data?.isLoggedIn ? null : (
                  <>
                    {" "}
                    برخی مجموعه‌ها مخصوص کاربران عضو هستند —{" "}
                    <Link
                      href="/panel"
                      className="font-bold text-teal-600 underline-offset-4 hover:underline dark:text-teal-300"
                    >
                      وارد حساب خود شوید
                    </Link>
                    .
                  </>
                )}
              </>
            </EditableText>
          </p>
        </div>

        {/* ————— جستجوی ویدئوها ————— */}
        <div className="mx-auto mb-10 max-w-xl">
          <div className="glass relative flex items-center gap-2 rounded-2xl px-4 py-1.5 transition-shadow focus-within:shadow-lg focus-within:shadow-teal-500/10">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو در ویدئوها و لیست‌های پخش…"
              aria-label="جستجوی ویدئو"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="پاک کردن جستجو"
                title="پاک کردن جستجو"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* ————— حالت‌های بارگذاری ————— */}
        {state === "loading" ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass overflow-hidden rounded-3xl">
                <div className="aspect-video animate-pulse bg-foreground/[0.05]" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-24 animate-pulse rounded-md bg-foreground/[0.05]" />
                  <div className="h-3.5 w-40 animate-pulse rounded-md bg-foreground/[0.05]" />
                </div>
              </div>
            ))}
          </div>
        ) : state === "error" ? (
          <div className="glass mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl px-6 py-14 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
              <WifiOff className="size-8 text-amber-950" strokeWidth={2.2} />
            </span>
            <p className="text-sm font-black text-foreground">
              ارتباط با سرور برقرار نشد
            </p>
            <p className="text-xs leading-6 text-muted-foreground">
              در دریافت ویدئوها خطایی رخ داد؛ دوباره تلاش کنید.
            </p>
            <Button
              onClick={load}
              className="rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25"
            >
              <Loader2 className="size-4" />
              تلاش مجدد
            </Button>
          </div>
        ) : (
          <>
            {searching ? (
              /* ————— نتایج جستجو ————— */
              <section aria-label="نتایج جستجوی ویدئو">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Search className="size-5 text-teal-600 dark:text-teal-300" />
                    <h2 className="text-base font-black text-foreground">
                      نتایج جستجو
                    </h2>
                  </div>
                  <span className="rounded-full bg-teal-500/10 px-3 py-1 text-[0.65rem] font-bold text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">
                    {faDigits(matches.length)} ویدئو
                  </span>
                </div>

                {matches.length === 0 ? (
                  <div className="glass mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl px-6 py-16 text-center">
                    <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
                      <SearchX className="size-8 text-white" />
                    </span>
                    <p className="text-sm font-black text-foreground">
                      نتیجه‌ای برای «{query.trim()}» یافت نشد
                    </p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      عبارت دیگری را امتحان کنید یا همه‌ی ویدئوها را ببینید.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setQuery("")}
                      className="rounded-xl border-foreground/[0.12] bg-foreground/[0.04] text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
                    >
                      <X className="size-4" />
                      پاک کردن جستجو
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {matches.map((video) => (
                      <StandaloneVideoCard
                        key={video.id}
                        video={video}
                        playlistTitle={
                          playlistTitleById.get(video.playlistId ?? "")
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <>
            {/* ————— شبکه‌ی لیست‌های پخش ————— */}
            {playlistGroups.length === 0 && standalone.length === 0 ? (
              <div className="glass mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl px-6 py-16 text-center">
                <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
                  <VideoOff className="size-8 text-white" />
                </span>
                <p className="text-sm font-black text-foreground">
                  هنوز ویدئویی برای نمایش وجود ندارد
                </p>
                <p className="text-xs leading-6 text-muted-foreground">
                  به‌زودی مجموعه‌های آموزشی جدید اضافه می‌شود.
                </p>
              </div>
            ) : null}

            {playlistGroups.length > 0 ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {playlistGroups.map(({ playlist, count }) => (
                  <article
                    key={playlist.id}
                    onClick={() => openPlaylist(playlist)}
                    className="group glass cursor-pointer overflow-hidden rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:border-foreground/20 hover:shadow-2xl hover:shadow-teal-500/10 dark:hover:border-white/20"
                    role="button"
                    tabIndex={0}
                    aria-label={`باز کردن لیست پخش ${playlist.title}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPlaylist(playlist);
                      }
                    }}
                  >
                    {/* بندانگشتی ۱۶:۹ */}
                    <div className="relative aspect-video overflow-hidden">
                      <ThumbImage
                        src={playlist.thumbnail}
                        alt={`جلد لیست پخش ${playlist.title}`}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        icon={ListVideo}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/20" />

                      {/* دکمه پخش */}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex size-14 items-center justify-center rounded-full border border-white/25 bg-white/10 shadow-xl backdrop-blur-md transition-all duration-300 group-hover:scale-110 group-hover:border-teal-300/60 group-hover:bg-teal-400/25">
                          <Play className="size-6 fill-white text-white drop-shadow" />
                        </span>
                      </span>

                      {/* تعداد ویدئو */}
                      <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[0.65rem] font-bold text-white backdrop-blur-md">
                        <ListVideo className="size-3" />
                        {faDigits(count)} ویدئو
                      </span>

                      {/* برچسب مخاطب ویژه */}
                      {playlist.visibility === "user" ? (
                        <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/30 px-2.5 py-1 text-[0.6rem] font-black text-white backdrop-blur-md">
                          <UserCheck className="size-3" />
                          ویژه اعضا
                        </span>
                      ) : playlist.visibility === "guest" ? (
                        <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-teal-400/40 bg-teal-500/30 px-2.5 py-1 text-[0.6rem] font-black text-white backdrop-blur-md">
                          <Users className="size-3" />
                          ویژه مهمان‌ها
                        </span>
                      ) : null}
                    </div>

                    {/* بدنه کارت */}
                    <div className="p-4">
                      <p className="text-[0.6rem] font-black text-teal-700 dark:text-teal-300">
                        لیست پخش
                      </p>
                      <h2 className="mt-1.5 line-clamp-1 text-sm font-black leading-6 text-foreground transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-300">
                        {playlist.title}
                      </h2>
                      {playlist.description ? (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {playlist.description}
                        </p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {/* ————— ویدئوهای مستقل ————— */}
            {standalone.length > 0 ? (
              <section className="mt-12" aria-label="ویدئوهای مستقل">
                <div className="mb-5 flex items-center gap-2">
                  <Film className="size-5 text-teal-600 dark:text-teal-300" />
                  <h2 className="text-base font-black text-foreground">
                    ویدئوهای تک‌گانه
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {standalone.map((video) => (
                    <StandaloneVideoCard key={video.id} video={video} />
                  ))}
                </div>
              </section>
            ) : null}
              </>
            )}
          </>
        )}
      </main>

      {/* ————— دیالوگ لیست پخش ————— */}
      <Dialog
        open={!!openGroup}
        onOpenChange={(o) => {
          if (!o) {
            setOpenGroup(null);
            setActiveVideoId(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto rounded-3xl border-border bg-popover p-0 dark:border-white/10 md:max-h-[85vh] md:overflow-hidden md:max-w-5xl sm:max-w-[calc(100%-2rem)]">
          {openGroup && activeItem ? (
            <div className="flex flex-col md:max-h-[85vh] md:flex-row-reverse">
              {/* ناحیه اصلی: پلیر + اطلاعات */}
              <div className="min-w-0 md:min-h-0 md:flex-1 md:overflow-y-auto">
                <VideoSourcePlayer
                  key={activeItem.id}
                  url={activeItem.url}
                  title={activeItem.title}
                  poster={activeItem.thumbnail || undefined}
                  autoPlay
                  onEnded={playNext}
                  className="w-full"
                />

                {/* اطلاعات ویدئوی جاری */}
                <div className="p-4 sm:p-5">
                  <DialogTitle className="text-right text-base font-black leading-7 text-foreground sm:text-lg">
                    {activeItem.title}
                  </DialogTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[0.6rem] font-black text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">
                      {activeItem.level}
                    </span>
                    <span className="flex items-center gap-1 text-[0.6rem] font-bold text-muted-foreground">
                      <Eye className="size-3" />
                      {faDigits(activeItem.views.toLocaleString("en-US"))} بازدید
                    </span>
                    <span className="flex items-center gap-1.5 text-[0.6rem] font-bold text-muted-foreground">
                      <ListVideo className="size-3" />
                      {openGroup.playlist.title}
                    </span>
                  </div>
                  {activeItem.description ? (
                    <DialogDescription className="mt-3 text-right text-xs leading-6 text-muted-foreground">
                      {activeItem.description}
                    </DialogDescription>
                  ) : (
                    <DialogDescription className="sr-only">
                      پخش ویدئو از لیست پخش {openGroup.playlist.title}
                    </DialogDescription>
                  )}
                </div>
              </div>

              {/* صف پخش */}
              <aside className="flex w-full shrink-0 flex-col border-t border-border bg-background/40 md:w-80 md:border-t-0 md:border-e">
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground">
                      {openGroup.playlist.title}
                    </p>
                    <p className="text-[0.65rem] font-bold text-muted-foreground">
                      {faDigits(openGroup.items.length)} ویدئو
                    </p>
                  </div>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-teal-500/10">
                    <ListVideo className="size-4 text-teal-600 dark:text-teal-300" />
                  </span>
                </div>
                <div
                  className={cn(
                    "max-h-[70vh] flex-1 overflow-y-auto",
                    THIN_SCROLLBAR
                  )}
                >
                  {openGroup.items.map((video) => {
                    const isActive = video.id === activeItem.id;
                    return (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => setActiveVideoId(video.id)}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2.5 border-b border-border/60 p-2.5 text-right transition-colors",
                          isActive
                            ? "border-s-2 border-s-teal-500 bg-teal-500/10"
                            : "hover:bg-foreground/[0.04]"
                        )}
                      >
                        <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-foreground/[0.03]">
                          <ThumbImage
                            src={video.thumbnail}
                            alt={video.title}
                            sizes="96px"
                          />
                          {video.duration ? (
                            <span
                              dir="ltr"
                              className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[0.55rem] font-bold text-white"
                            >
                              {video.duration}
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "line-clamp-2 text-xs font-bold leading-5",
                              isActive
                                ? "text-teal-700 dark:text-teal-300"
                                : "text-foreground"
                            )}
                          >
                            {video.title}
                          </span>
                          {isActive ? (
                            <span className="mt-1 flex items-center gap-1 text-[0.6rem] font-black text-teal-600 dark:text-teal-300">
                              <Play className="size-2.5 fill-current" />
                              در حال پخش
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* فوتر مینیمال */}
      <footer className="mt-auto border-t border-foreground/[0.06] py-6 text-center dark:border-white/[0.06]">
        <p className="text-xs font-bold text-muted-foreground">
          آکادمی آوید — دسترسی آزاد به آموزش
        </p>
      </footer>
    </div>
  );
}

/* ————— کارت ویدئوی مستقل (با دیالوگ تکی) ————— */

function StandaloneVideoCard({
  video,
  playlistTitle,
}: {
  video: Video;
  /** نام لیست پخش — برای کارت‌های نتیجه‌ی جستجو */
  playlistTitle?: string;
}) {
  const [active, setActive] = React.useState(false);

  return (
    <>
      <article
        onClick={() => setActive(true)}
        className="group glass cursor-pointer overflow-hidden rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:border-foreground/20 hover:shadow-2xl hover:shadow-teal-500/10 dark:hover:border-white/20"
        role="button"
        tabIndex={0}
        aria-label={`پخش ویدئو ${video.title}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setActive(true);
          }
        }}
      >
        <div className="relative aspect-video overflow-hidden">
          <ThumbImage
            src={video.thumbnail}
            alt={video.title}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/20" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full border border-white/25 bg-white/10 shadow-xl backdrop-blur-md transition-all duration-300 group-hover:scale-110 group-hover:border-teal-300/60 group-hover:bg-teal-400/25">
              <Play className="size-6 fill-white text-white drop-shadow" />
            </span>
          </span>
          <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[0.65rem] font-bold text-white backdrop-blur-md">
            <Eye className="size-3" />
            {faDigits(video.views.toLocaleString("en-US"))}
          </span>
          {video.duration ? (
            <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[0.65rem] font-bold text-white backdrop-blur-md">
              <Clock className="size-3" />
              {video.duration}
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[0.6rem] font-black text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">
              {video.level}
            </span>
            {playlistTitle ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-1 text-[0.6rem] font-bold text-muted-foreground dark:bg-white/[0.08]">
                <ListVideo className="size-2.5 shrink-0" />
                <span className="truncate">{playlistTitle}</span>
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-black leading-6 text-foreground transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-300">
            {video.title}
          </h3>
        </div>
      </article>

      {/* دیالوگ تکی */}
      <Dialog open={active} onOpenChange={(o) => !o && setActive(false)}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-3xl border-border bg-popover p-0 dark:border-white/10">
          {active ? (
            <>
              <VideoSourcePlayer
                key={video.id}
                url={video.url}
                title={video.title}
                poster={video.thumbnail || undefined}
                autoPlay
                className="w-full"
              />
              <div className="p-6">
                <DialogTitle className="pr-10 text-right text-lg font-black leading-8 text-foreground">
                  {video.title}
                </DialogTitle>
                {video.description ? (
                  <DialogDescription className="mt-2 text-right text-sm leading-7 text-muted-foreground">
                    {video.description}
                  </DialogDescription>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
