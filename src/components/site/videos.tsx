"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Play,
  Eye,
  Clock,
  Film,
  BadgeCheck,
  VideoOff,
  ExternalLink,
  ListVideo,
} from "lucide-react";
import type { Playlist, Video } from "@prisma/client";
import { cn } from "@/lib/utils";
import { faDigits } from "@/lib/fa";
import { SectionHeading, Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { EditableText, renderGradientText } from "@/components/site/editable-texts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VideoSourcePlayer } from "@/components/site/video-source-player";
import { resolveVideoSource } from "@/lib/video";

/** استایل اسکرول‌بار نازک برای صف پخش */
const THIN_SCROLLBAR =
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20";

/** تصویر ویدئو با جایگزین گرادیانی در صورت نبود/خطا */
function VideoImage({
  video,
  sizes,
  iconSize = "size-10",
}: {
  video: Video;
  sizes: string;
  iconSize?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const trimmed = video.thumbnail.trim();

  if (!trimmed || failed) {
    return (
      <div className="flex size-full items-center justify-center bg-gradient-to-br from-teal-500/15 to-violet-500/15 dark:from-teal-500/25 dark:via-[#07100d] dark:to-violet-500/25">
        <Film
          className={cn(iconSize, "text-teal-600/50 dark:text-teal-300/40")}
          strokeWidth={1.6}
        />
      </div>
    );
  }

  return (
    <Image
      src={trimmed}
      alt={video.title}
      fill
      sizes={sizes}
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/** تصویر لیست پخش با جایگزین گرادیانی در صورت نبود/خطا */
function PlaylistImage({ playlist, sizes }: { playlist: Playlist; sizes: string }) {
  const [failed, setFailed] = React.useState(false);
  const trimmed = playlist.thumbnail.trim();

  if (!trimmed || failed) {
    return (
      <div className="flex size-full items-center justify-center bg-gradient-to-br from-teal-500/15 to-violet-500/15 dark:from-teal-500/25 dark:via-[#07100d] dark:to-violet-500/25">
        <ListVideo
          className="size-10 text-teal-600/50 dark:text-teal-300/40"
          strokeWidth={1.6}
        />
      </div>
    );
  }

  return (
    <Image
      src={trimmed}
      alt={playlist.title}
      fill
      sizes={sizes}
      className="object-cover transition-transform duration-500 group-hover:scale-110"
      onError={() => setFailed(true)}
    />
  );
}

export function Videos({
  videos,
  playlists = [],
}: {
  videos: Video[];
  /** لیست‌های پخش — ساختار کامل در ماژول ویدئوها مدیریت می‌شود */
  playlists?: Playlist[];
}) {
  // ویدئوی فعال دیالوگ تکی
  const [active, setActive] = React.useState<Video | null>(null);
  // منبع پخش ویدئوی فعال — فایل محلی/لینک مستقیم/iframe و…
  const activeSource = active?.url ? resolveVideoSource(active.url) : null;

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
    ? openGroup?.items.findIndex((v) => v.id === activeItem.id) ?? -1
    : -1;
  const activeItemSource = activeItem?.url ? resolveVideoSource(activeItem.url) : null;

  /** ویدئوهای مستقل (بدون لیست پخش) */
  const standalone = React.useMemo(
    () => videos.filter((v) => !v.playlistId),
    [videos]
  );

  /** لیست‌های پخش همراه ویدئوهای منتشرشده‌ی آن‌ها — لیست خالی کارت ندارد */
  const playlistGroups = React.useMemo(
    () =>
      playlists
        .map((playlist) => ({
          playlist,
          items: videos.filter((v) => v.playlistId === playlist.id),
        }))
        .filter((group) => group.items.length > 0),
    [playlists, videos]
  );

  function openPlaylist(group: { playlist: Playlist; items: Video[] }) {
    setOpenGroup(group);
    setActiveVideoId(group.items[0]?.id ?? null);
  }

  /** پخش خودکار ویدئوی بعدی لیست پس از پایان ویدئوی جاری */
  function playNext() {
    if (!openGroup) return;
    const next =
      activeItemIndex >= 0 ? openGroup.items[activeItemIndex + 1] : undefined;
    if (next) setActiveVideoId(next.id);
  }

  return (
    <section id="videos" className="relative scroll-mt-28 py-12 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-1/4 -z-[1] mx-auto h-72 max-w-3xl rounded-full bg-emerald-500/[0.06] blur-[120px]" />

      <div className="mx-auto max-w-7xl px-4">
        <SectionHeading
          icon={Film}
          badge="ویدئوهای آموزشی"
          title={
            <EditableText k="videos.title" renderText={renderGradientText}>
              <>
                آموزش‌های رایگان را{" "}
                <span className="text-gradient">تماشا کنید</span>
              </>
            </EditableText>
          }
          description={
            <EditableText k="videos.description">
              همه‌ی ویدئوهای آموزشی به‌صورت کاملاً رایگان و بدون نیاز به ثبت‌نام در دسترس شماست؛ روی هر ویدئو کلیک کنید و همین حالا تماشا کنید.
            </EditableText>
          }
        />

        {/* دکمه‌ی هدایت به صفحه‌ی اختصاصی ویدئوها */}
        <Reveal className="mb-10 flex justify-center">
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-xl border-teal-500/30 bg-teal-500/[0.08] px-5 text-sm font-bold text-teal-700 shadow-sm transition-all hover:bg-teal-500/[0.15] hover:text-teal-800 hover:shadow-md active:scale-95 dark:border-teal-400/30 dark:bg-teal-400/[0.1] dark:text-teal-300 dark:hover:bg-teal-400/[0.16] dark:hover:text-teal-200"
          >
            <Link href="/videos" aria-label="مشاهده صفحه‌ی اختصاصی ویدئوها">
              <ListVideo className="size-4" />
              مشاهده همه‌ی ویدئوها
            </Link>
          </Button>
        </Reveal>

        {videos.length === 0 ? (
          <Reveal>
            <div className="glass mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl px-6 py-16 text-center">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
                <Film className="size-8 text-white" />
              </span>
              <p className="text-sm font-black text-foreground">
                به‌زودی ویدئوهای آموزشی جدید اضافه می‌شود.
              </p>
              <p className="text-xs leading-6 text-muted-foreground">
                در همین حین می‌توانید دوره‌های آکادمی را بررسی کنید تا مسیر یادگیری خود را انتخاب نمایید.
              </p>
            </div>
          </Reveal>
        ) : (
          <>
            {/* ————— کارت‌های لیست پخش ————— */}
            {playlistGroups.length > 0 ? (
              <Reveal className="mb-8">
                <div className="mb-4 flex items-center gap-2">
                  <ListVideo className="size-5 text-teal-600 dark:text-teal-300" />
                  <h3 className="text-base font-black text-foreground">
                    لیست‌های پخش
                  </h3>
                </div>
                <div
                  className={cn(
                    "-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3",
                    THIN_SCROLLBAR
                  )}
                >
                  {playlistGroups.map(({ playlist, items }) => (
                    <article
                      key={playlist.id}
                      onClick={() => openPlaylist({ playlist, items })}
                      className="group glass w-64 shrink-0 cursor-pointer snap-start overflow-hidden rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:border-foreground/20 hover:shadow-2xl hover:shadow-teal-500/10 dark:hover:border-white/20 sm:w-72"
                      role="button"
                      tabIndex={0}
                      aria-label={`باز کردن لیست پخش ${playlist.title}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openPlaylist({ playlist, items });
                        }
                      }}
                    >
                      {/* بندانگشتی ۱۶:۹ */}
                      <div className="relative aspect-video overflow-hidden">
                        <PlaylistImage playlist={playlist} sizes="288px" />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-80 dark:from-[#04080a]" />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex size-14 items-center justify-center rounded-full border border-white/25 bg-white/10 shadow-xl backdrop-blur-md transition-all duration-300 group-hover:scale-110 group-hover:border-teal-300/60 group-hover:bg-teal-400/25">
                            <Play className="size-6 fill-white text-white drop-shadow" />
                          </span>
                        </span>
                        <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[0.65rem] font-bold text-white backdrop-blur-md">
                          <ListVideo className="size-3" />
                          {faDigits(items.length)} ویدئو
                        </span>
                      </div>

                      {/* بدنه کارت */}
                      <div className="p-4">
                        <p className="text-[0.6rem] font-black text-teal-700 dark:text-teal-300">
                          لیست پخش
                        </p>
                        <h4 className="mt-1.5 line-clamp-1 text-sm font-black leading-6 text-foreground transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-300">
                          {playlist.title}
                        </h4>
                        {playlist.description ? (
                          <p className="mt-1.5 line-clamp-1 text-xs leading-5 text-muted-foreground">
                            {playlist.description}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </Reveal>
            ) : null}

            {/* ————— شبکه‌ی ویدئوهای مستقل ————— */}
            {standalone.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {standalone.map((video, i) => (
                  <Reveal key={video.id} delay={i * 0.12}>
                    <article
                      onClick={() => setActive(video)}
                      className="group glass cursor-pointer overflow-hidden rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:border-foreground/20 hover:shadow-2xl hover:shadow-teal-500/10 dark:hover:border-white/20"
                    >
                      {/* thumbnail */}
                      <div className="relative aspect-video overflow-hidden">
                        <VideoImage video={video} sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-80 dark:from-[#04080a]" />

                        {/* play button */}
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex size-16 items-center justify-center rounded-full border border-white/25 bg-white/10 shadow-xl backdrop-blur-md transition-all duration-300 group-hover:scale-110 group-hover:border-teal-300/60 group-hover:bg-teal-400/25">
                            <Play className="size-7 fill-white text-white drop-shadow" />
                          </span>
                        </span>

                        {/* badges */}
                        <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[0.65rem] font-bold text-white backdrop-blur-md">
                          <Eye className="size-3" />
                          {faDigits(video.views.toLocaleString("en-US"))} بازدید
                        </span>
                        {video.duration ? (
                          <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[0.65rem] font-bold text-white backdrop-blur-md">
                            <Clock className="size-3" />
                            {video.duration}
                          </span>
                        ) : null}
                      </div>

                      {/* body */}
                      <div className="p-5">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[0.6rem] font-black text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">
                            {video.level}
                          </span>
                          <span className="flex items-center gap-1 text-[0.6rem] font-bold text-muted-foreground">
                            <BadgeCheck className="size-3 text-teal-600 dark:text-teal-300" />
                            بدون نیاز به ثبت‌نام
                          </span>
                        </div>
                        <h3 className="mt-3 text-sm font-black leading-7 text-foreground transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-300">
                          {video.title}
                        </h3>
                        {video.description ? (
                          <p className="mt-2 text-xs leading-6 text-muted-foreground">
                            {video.description}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ————— دیالوگ ویدئوی تکی (مستقل) ————— */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-3xl border-border bg-popover p-0 dark:border-white/10">
          {active ? (
            <>
              {/* پلیر یکپارچه: فایل محلی/لینک مستقیم → پلیر آوید؛ یوتیوب/آپارات/وی‌میو → iframe */}
              <VideoSourcePlayer
                key={active.id}
                url={active.url}
                title={active.title}
                poster={active.thumbnail || undefined}
                autoPlay
                className="w-full"
              />

              <DialogHeader className="p-6">
                <DialogTitle className="pr-10 text-right text-lg font-black leading-8 text-foreground">
                  {active.title}
                </DialogTitle>
                {active.description ? (
                  <DialogDescription className="text-right text-sm leading-7 text-muted-foreground">
                    {active.description}
                  </DialogDescription>
                ) : null}

                {/* لینک مستقیم خارجی — در صورت ترجیح کاربر، تماشا در منبع */}
                {activeSource?.kind === "direct" && activeSource.external ? (
                  <Button
                    asChild
                    variant="outline"
                    className="mt-4 w-full rounded-xl border-foreground/[0.12] bg-foreground/[0.04] py-6 text-sm font-bold text-foreground transition-all hover:border-teal-500/40 hover:bg-foreground/[0.07] hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:bg-white/[0.07] dark:hover:text-teal-200"
                  >
                    <a href={active.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" />
                      تماشای ویدئو در منبع پخش
                    </a>
                  </Button>
                ) : null}

                {!active.url ? (
                  /* لینک پخش هنوز ثبت نشده — بدون نیاز به ثبت‌نام */
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] p-4 dark:border-amber-400/20 dark:bg-amber-400/[0.07]">
                    <VideoOff className="size-8 shrink-0 text-amber-600 dark:text-amber-300" />
                    <p className="text-xs leading-6 text-foreground/85">
                      لینک پخش این ویدئو به‌زودی فعال می‌شود؛ نیازی به ثبت‌نام نیست و محتوا برای همه آزاد خواهد بود.
                    </p>
                  </div>
                ) : null}
              </DialogHeader>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ————— دیالوگ لیست پخش (چیدمان یوتیوب‌مانند) ————— */}
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
              {/* ناحیه اصلی: پلیر + اطلاعات (در RTL سمت چپ) */}
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

                  {activeItemSource?.kind === "direct" &&
                  activeItemSource.external ? (
                    <Button
                      asChild
                      variant="outline"
                      className="mt-4 w-full rounded-xl border-foreground/[0.12] bg-foreground/[0.04] py-5 text-sm font-bold text-foreground transition-all hover:border-teal-500/40 hover:bg-foreground/[0.07] hover:text-teal-700 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:bg-white/[0.07] dark:hover:text-teal-200"
                    >
                      <a href={activeItem.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" />
                        تماشا در منبع پخش
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* صف پخش (در RTL سمت راست = سمت شروع) */}
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
                          <VideoImage
                            video={video}
                            sizes="96px"
                            iconSize="size-5"
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
    </section>
  );
}
