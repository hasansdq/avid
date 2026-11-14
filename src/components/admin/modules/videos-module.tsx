"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Film,
  FileVideo,
  FolderOpen,
  Loader2,
  MonitorPlay,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { ImageUrlField, OptionalImage } from "@/components/admin/shared/image-url-field";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { PublishSwitch } from "@/components/admin/shared/publish-switch";
import { PublishStatusSelect } from "@/components/admin/shared/publish-status-select";
import {
  SortableRows,
  SortableTableRow,
} from "@/components/admin/shared/sortable-rows";
import { btnGradient } from "@/components/admin/shared/styles";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import type { Playlist, Video } from "@/components/admin/types";
import { COURSE_LEVELS } from "@/lib/course-theme";
import {
  PLAYLIST_VISIBILITIES,
  isPlaylistVisibility,
  playlistVisibilityLabel,
} from "@/lib/playlist-visibility";
import { faDigits } from "@/lib/fa";

/** فرمت‌های ویدئوی مجاز برای آپلود مستقیم */
const VIDEO_ACCEPT = "video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogv,.mov";

/** حداکثر حجم فایل ویدئو (۲۵۶ مگابایت) */
const MAX_VIDEO_BYTES = 256 * 1024 * 1024;

/** فرم ویدئو — همه‌ی ورودی‌ها رشته هستند و هنگام ذخیره تبدیل می‌شوند */
interface VideoForm {
  title: string;
  description: string;
  url: string;
  thumbnail: string;
  duration: string;
  views: string;
  level: string;
  sortOrder: string;
  published: boolean;
  /** شناسه‌ی لیست پخش — رشته‌ی خالی یعنی «بدون لیست پخش» */
  playlistId: string;
}

/** فرم لیست پخش */
interface PlaylistForm {
  title: string;
  description: string;
  thumbnail: string;
  sortOrder: string;
  published: boolean;
  /** مخاطب نمایش: مهمان / کاربر / هر دو */
  visibility: "guest" | "user" | "both";
}

function toInt(v: string): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** ماژول ویدئوها — مدیریت ویدئوها و لیست‌های پخش سایت */
export function VideosModule() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [loading, setLoading] = useState(true);

  // دیالوگ ویدئو
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);
  const [form, setForm] = useState<VideoForm | null>(null);
  const [saving, setSaving] = useState(false);

  // آپلود مستقیم ویدئو
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  // دیالوگ لیست پخش
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [playlistForm, setPlaylistForm] = useState<PlaylistForm | null>(null);
  const [savingPlaylist, setSavingPlaylist] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [videoList, playlistList] = await Promise.all([
        apiFetch<Video[]>("/api/admin/videos"),
        apiFetch<Playlist[]>("/api/admin/playlists"),
      ]);
      setVideos(videoList);
      setPlaylists(playlistList);
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** عنوان لیست پخشِ ویدئو (برای ستون جدول) */
  const playlistById = new Map<string, Playlist>(
    (playlists ?? []).map((p) => [p.id, p])
  );

  /** تعداد ویدئوهای یک لیست پخش */
  function countVideos(playlistId: string): number {
    return videos?.filter((v) => v.playlistId === playlistId).length ?? 0;
  }

  /* ---------------- ویدئو: ایجاد / ویرایش ---------------- */

  function openCreate() {
    setEditing(null);
    const nextOrder = videos ? videos.length + 1 : 1;
    setForm({
      title: "",
      description: "",
      url: "",
      thumbnail: "",
      duration: "",
      views: "0",
      level: COURSE_LEVELS[0],
      sortOrder: String(nextOrder),
      published: true,
      playlistId: "",
    });
    setDialogOpen(true);
  }

  function openEdit(video: Video) {
    setEditing(video);
    setForm({
      title: video.title,
      description: video.description,
      url: video.url,
      thumbnail: video.thumbnail,
      duration: video.duration,
      views: String(video.views),
      level: video.level,
      sortOrder: String(video.sortOrder),
      published: video.published,
      playlistId: video.playlistId ?? "",
    });
    setDialogOpen(true);
  }

  const set = <K extends keyof VideoForm>(key: K, value: VideoForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  /* ---------------- ویدئو: آپلود مستقیم فایل ---------------- */

  async function handleVideoUpload(file: File | undefined) {
    if (!file || uploadPct !== null) return;
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("حجم ویدئو حداکثر ۲۵۶ مگابایت می‌تواند باشد.");
      return;
    }
    setUploadPct(0);
    try {
      // apiFetch هدر JSON تنظیم می‌کند؛ برای FormData از fetch خام استفاده می‌شود
      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/admin/upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadPct(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText) as {
              url?: string;
              error?: string;
            };
            if (xhr.status >= 200 && xhr.status < 300 && data.url) {
              resolve(data.url);
            } else {
              reject(new Error(data.error ?? "خطا در بارگذاری ویدئو."));
            }
          } catch {
            reject(new Error("خطا در بارگذاری ویدئو."));
          }
        };
        xhr.onerror = () => reject(new Error("خطا در بارگذاری ویدئو."));
        const body = new FormData();
        body.append("file", file);
        body.append("kind", "video");
        body.append("section", "videos");
        xhr.send(body);
      });
      set("url", url);
      toast.success("ویدئو بارگذاری شد و لینک آن در فیلد پخش ثبت شد");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "خطا در بارگذاری ویدئو."
      );
    } finally {
      setUploadPct(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  /* ---------------- ویدئو: انتشار / حذف / ذخیره ---------------- */

  async function togglePublish(video: Video, next: boolean) {
    setVideos(
      (prev) =>
        prev?.map((v) => (v.id === video.id ? { ...v, published: next } : v)) ??
        prev
    );
    try {
      await apiFetch<Video>(`/api/admin/videos/${video.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...video, published: next }),
      });
      toast.success(next ? "ویدئو منتشر شد" : "ویدئو از نمایش خارج شد");
    } catch (error) {
      setVideos(
        (prev) =>
          prev?.map(
            (v) => (v.id === video.id ? { ...v, published: video.published } : v)
          ) ?? prev
      );
      toastApiError(error);
    }
  }

  async function handleDelete(video: Video) {
    try {
      await apiFetch(`/api/admin/videos/${video.id}`, { method: "DELETE" });
      toast.success(`ویدئو «${video.title}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /* ————— جابه‌جایی با کشیدن و رها کردن ————— */

  /** ذخیره‌ی ترتیب جدید ویدئوها — به‌روی کور محلی، در خطا بازگشت */
  async function handleReorder(orderedIds: string[]): Promise<void> {
    const prev = videos;
    if (!prev) return;
    const byId = new Map(prev.map((v) => [v.id, v]));
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((v): v is Video => v !== undefined);
    setVideos(next);
    try {
      await apiFetch("/api/admin/videos/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: orderedIds }),
      });
      toast.success("ترتیب ویدئوها ذخیره شد.");
    } catch (error) {
      toastApiError(error);
      setVideos(prev);
    }
  }

  async function handleSave() {
    if (!form || saving) return;
    const title = form.title.trim();
    if (title.length < 2 || title.length > 160) {
      toast.error("عنوان ویدئو باید بین ۲ تا ۱۶۰ نویسه باشد.");
      return;
    }
    const views = toInt(form.views);
    const sortOrder = toInt(form.sortOrder);
    if (views < 0 || sortOrder < 0) {
      toast.error("مقادیر عددی نمی‌توانند منفی باشند.");
      return;
    }

    const payload = {
      title,
      description: form.description.trim(),
      url: form.url.trim(),
      thumbnail: form.thumbnail.trim(),
      duration: form.duration.trim(),
      views,
      level: form.level,
      sortOrder,
      published: form.published,
      playlistId: form.playlistId.trim() || null,
    };

    setSaving(true);
    try {
      if (editing) {
        await apiFetch<Video>(`/api/admin/videos/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("ویدئو با موفقیت ویرایش شد");
      } else {
        await apiFetch<Video>("/api/admin/videos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("ویدئوی جدید ایجاد شد");
      }
      setDialogOpen(false);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- لیست پخش: ایجاد / ویرایش / حذف ---------------- */

  function openPlaylistCreate() {
    setEditingPlaylist(null);
    const nextOrder = playlists ? playlists.length + 1 : 1;
    setPlaylistForm({
      title: "",
      description: "",
      thumbnail: "",
      sortOrder: String(nextOrder),
      published: true,
      visibility: "both",
    });
    setPlaylistDialogOpen(true);
  }

  function openPlaylistEdit(playlist: Playlist) {
    setEditingPlaylist(playlist);
    setPlaylistForm({
      title: playlist.title,
      description: playlist.description,
      thumbnail: playlist.thumbnail,
      sortOrder: String(playlist.sortOrder),
      published: playlist.published,
      visibility: isPlaylistVisibility(playlist.visibility)
        ? playlist.visibility
        : "both",
    });
    setPlaylistDialogOpen(true);
  }

  async function togglePlaylistPublish(playlist: Playlist, next: boolean) {
    setPlaylists(
      (prev) =>
        prev?.map((p) => (p.id === playlist.id ? { ...p, published: next } : p)) ??
        prev
    );
    try {
      await apiFetch<Playlist>(`/api/admin/playlists/${playlist.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...playlist, published: next }),
      });
      toast.success(next ? "لیست پخش منتشر شد" : "لیست پخش از نمایش خارج شد");
    } catch (error) {
      setPlaylists(
        (prev) =>
          prev?.map(
            (p) =>
              (p.id === playlist.id ? { ...p, published: playlist.published } : p)
          ) ?? prev
      );
      toastApiError(error);
    }
  }

  async function handleDeletePlaylist(playlist: Playlist) {
    try {
      await apiFetch(`/api/admin/playlists/${playlist.id}`, {
        method: "DELETE",
      });
      toast.success(
        `لیست پخش «${playlist.title}» حذف شد؛ ویدئوهای آن مستقل شدند`
      );
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  async function handleSavePlaylist() {
    if (!playlistForm || savingPlaylist) return;
    const title = playlistForm.title.trim();
    if (title.length < 2 || title.length > 120) {
      toast.error("عنوان لیست پخش باید بین ۲ تا ۱۲۰ نویسه باشد.");
      return;
    }
    const payload = {
      title,
      description: playlistForm.description.trim(),
      thumbnail: playlistForm.thumbnail.trim(),
      sortOrder: toInt(playlistForm.sortOrder),
      published: playlistForm.published,
      visibility: playlistForm.visibility,
    };

    setSavingPlaylist(true);
    try {
      if (editingPlaylist) {
        await apiFetch<Playlist>(`/api/admin/playlists/${editingPlaylist.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("لیست پخش با موفقیت ویرایش شد");
      } else {
        await apiFetch<Playlist>("/api/admin/playlists", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("لیست پخش جدید ایجاد شد");
      }
      setPlaylistDialogOpen(false);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSavingPlaylist(false);
    }
  }

  /* ---------------- رندر ---------------- */

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="ویدئوها"
        description="مدیریت ویدئوهای آموزشی و لیست‌های پخش — همه‌ی ویدئوها برای عموم و بدون نیاز به ثبت‌نام قابل مشاهده هستند؛ ویدئوهای بدون لینک پخش با پیام «به‌زودی فعال می‌شود» نمایش داده می‌شوند."
      >
        <Button onClick={openCreate} className={`rounded-xl ${btnGradient}`}>
          <Plus className="size-4" />
          افزودن ویدئو
        </Button>
      </ModuleHeader>

      {/* ————— مدیر لیست‌های پخش ————— */}
      <section className="space-y-3" aria-label="مدیریت لیست‌های پخش">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10">
              <Film className="size-5 text-teal-700 dark:text-teal-300" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-black text-foreground">
                لیست‌های پخش
              </h2>
              <p className="text-xs leading-5 text-muted-foreground">
                ویدئوها را در قالب مجموعه‌های ویدئویی گروه‌بندی کنید.
              </p>
            </div>
          </div>
          <Button
            onClick={openPlaylistCreate}
            size="sm"
            className={`rounded-xl ${btnGradient}`}
          >
            <Plus className="size-4" />
            افزودن لیست پخش
          </Button>
        </div>

        {loading && !playlists ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="glass flex items-center gap-3 rounded-2xl p-3"
              >
                <Skeleton className="h-14 w-24 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28 rounded-md" />
                  <Skeleton className="h-3 w-16 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : !playlists || playlists.length === 0 ? (
          <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-right">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                <FolderOpen className="size-5.5 text-muted-foreground" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-black text-foreground">
                  هنوز لیست پخشی ثبت نشده است
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  با ساخت لیست پخش، ویدئوهای مرتبط به‌صورت یک مجموعه پشت‌سرهم نمایش داده می‌شوند.
                </p>
              </div>
            </div>
            <Button
              onClick={openPlaylistCreate}
              size="sm"
              className={`shrink-0 rounded-xl ${btnGradient}`}
            >
              <Plus className="size-4" />
              ساخت اولین لیست پخش
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                className="glass flex items-center gap-3 rounded-2xl p-3 transition-colors hover:border-foreground/20"
              >
                <PlaylistThumb src={playlist.thumbnail} alt={playlist.title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">
                    {playlist.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <p className="text-[0.7rem] font-bold text-muted-foreground">
                      {faDigits(countVideos(playlist.id))} ویدئو
                    </p>
                    {/* مخاطب نمایش لیست پخش */}
                    <Badge
                      className={cn(
                        "rounded-full border-0 px-2 py-0.5 text-[0.6rem] font-black",
                        playlist.visibility === "user"
                          ? "bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300"
                          : playlist.visibility === "guest"
                            ? "bg-teal-500/15 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300"
                            : "bg-foreground/[0.06] text-muted-foreground dark:bg-white/[0.06]"
                      )}
                      title={`مخاطب نمایش: ${playlistVisibilityLabel(playlist.visibility)}`}
                    >
                      <Users className="size-2.5" />
                      {playlistVisibilityLabel(playlist.visibility)}
                    </Badge>
                  </div>
                  {playlist.description ? (
                    <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground/80">
                      {playlist.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  <PublishSwitch
                    published={playlist.published}
                    onToggle={(next) => togglePlaylistPublish(playlist, next)}
                  />
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => openPlaylistEdit(playlist)}
                      aria-label={`ویرایش لیست پخش ${playlist.title}`}
                      title="ویرایش"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <ConfirmDelete
                      title="حذف لیست پخش"
                      description={`لیست پخش «${playlist.title}» حذف می‌شود؛ ویدئوهای آن حذف نمی‌شوند و به‌صورت مستقل در سایت نمایش داده می‌شوند. مطمئن هستید؟`}
                      onConfirm={() => handleDeletePlaylist(playlist)}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`حذف لیست پخش ${playlist.title}`}
                        title="حذف"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </ConfirmDelete>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ————— جدول ویدئوها ————— */}
      {loading && !videos ? (
        <TableSkeleton rows={5} cols={7} />
      ) : !videos || videos.length === 0 ? (
        <EmptyState
          icon={MonitorPlay}
          title="هنوز ویدئویی ثبت نشده است"
          description="اولین ویدئوی آموزشی را با تصویر بندانگشتی و لینک پخش ایجاد کنید."
        >
          <Button onClick={openCreate} size="sm" className={`rounded-xl ${btnGradient}`}>
            <Plus className="size-4" />
            افزودن اولین ویدئو
          </Button>
        </EmptyState>
      ) : (
        <SortableRows
          ids={videos.map((v) => v.id)}
          onReorder={(ids) => void handleReorder(ids)}
        >
        <div className="glass overflow-hidden rounded-2xl">
          <div className="max-h-[70vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">تغییر ترتیب</span>
                  </TableHead>
                  <TableHead>ویدئو</TableHead>
                  <TableHead>مدت</TableHead>
                  <TableHead>بازدید</TableHead>
                  <TableHead>لیست پخش</TableHead>
                  <TableHead>پخش</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((video) => (
                  <SortableTableRow key={video.id} id={video.id}>
                    <TableCell className="max-w-72">
                      <div className="flex items-center gap-3">
                        {video.thumbnail.trim() ? (
                          <VideoThumb src={video.thumbnail} alt={video.title} />
                        ) : (
                          <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-foreground/[0.02]">
                            <Film className="size-4 text-muted-foreground" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-foreground">
                            {video.title}
                          </p>
                          <Badge
                            variant="outline"
                            className="mt-1 rounded-full border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-[0.6rem] font-bold text-muted-foreground"
                          >
                            {video.level}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {video.duration ? (
                        <span dir="ltr" className="font-bold">
                          {video.duration}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {faDigits(video.views)}
                    </TableCell>
                    <TableCell>
                      {video.playlistId &&
                      playlistById.get(video.playlistId) ? (
                        <Badge className="rounded-full border-0 bg-violet-500/15 px-2.5 py-1 text-[0.65rem] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
                          {playlistById.get(video.playlistId)?.title}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {video.url.trim() ? (
                        <Badge className="rounded-full border-0 bg-teal-500/15 px-2.5 py-1 text-[0.65rem] font-black text-teal-700 dark:bg-teal-400/15 dark:text-teal-300">
                          لینک فعال
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="rounded-full border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-bold text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
                        >
                          لینک به‌زودی
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <PublishSwitch
                        published={video.published}
                        onToggle={(next) => togglePublish(video, next)}
                      />
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(video)}
                          aria-label={`ویرایش ویدئو ${video.title}`}
                          title="ویرایش"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <ConfirmDelete
                          title="حذف ویدئو"
                          description="این ویدئو برای همیشه حذف می‌شود. مطمئن هستید؟"
                          onConfirm={() => handleDelete(video)}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`حذف ویدئو ${video.title}`}
                            title="حذف"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </ConfirmDelete>
                      </div>
                    </TableCell>
                  </SortableTableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        </SortableRows>
      )}

      {/* دیالوگ ایجاد/ویرایش ویدئو */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editing ? "ویرایش ویدئو" : "افزودن ویدئوی جدید"}
            </DialogTitle>
            <DialogDescription>
              عنوان الزامی است؛ اگر لینک پخش را خالی بگذارید، ویدئو با پیام «به‌زودی فعال می‌شود» نمایش داده می‌شود (بدون نیاز به ثبت‌نام).
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="عنوان ویدئو" htmlFor="video-title">
                  <Input
                    id="video-title"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="مثلاً: معرفی دوره هوش مصنوعی"
                    maxLength={160}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="توضیحات" htmlFor="video-description">
                  <Textarea
                    id="video-description"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="توضیح کوتاه درباره محتوای ویدئو..."
                    className="min-h-20"
                    maxLength={600}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="لینک پخش"
                  htmlFor="video-url"
                  hint="فایل ویدئو (MP4/WebM/OGG/MOV — حداکثر ۲۵۶ مگابایت)، لینک یوتیوب/آپارات/وی‌میو یا لینک مستقیم فایل ویدئو از هر منبعی — همه پخش می‌شوند"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      id="video-url"
                      dir="ltr"
                      className="flex-1 text-left"
                      value={form.url}
                      onChange={(e) => set("url", e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=... یا https://cdn.example.com/file.mp4"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadPct !== null}
                      onClick={() => videoInputRef.current?.click()}
                      className="shrink-0 rounded-lg text-[0.7rem] font-bold"
                      aria-label="بارگذاری فایل ویدئو از سیستم"
                    >
                      {uploadPct !== null ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <FileVideo className="size-3.5" />
                      )}
                      <span className="hidden sm:inline">
                        {uploadPct !== null ? "در حال بارگذاری…" : "بارگذاری ویدئو"}
                      </span>
                    </Button>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept={VIDEO_ACCEPT}
                      className="hidden"
                      aria-hidden
                      tabIndex={-1}
                      onChange={(e) => {
                        void handleVideoUpload(e.target.files?.[0]);
                      }}
                    />
                  </div>
                  {uploadPct !== null ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Progress
                        value={uploadPct}
                        className="h-1.5 flex-1 [&_[data-slot=progress-indicator]]:bg-teal-500"
                      />
                      <span
                        className="shrink-0 text-[0.7rem] font-black text-teal-700 dark:text-teal-300"
                        dir="rtl"
                      >
                        {faDigits(uploadPct)}٪
                      </span>
                    </div>
                  ) : null}
                </Field>
              </div>
              <div className="sm:col-span-2">
                <ImageUrlField
                  id="video-thumbnail"
                  label="تصویر بندانگشتی"
                  value={form.thumbnail}
                  onChange={(v) => set("thumbnail", v)}
                  section="videos"
                  previewClassName="h-[90px] w-40"
                  previewAlt="پیش‌نمایش بندانگشتی"
                  hint="تصویر کاور ویدئو؛ نسبت پیشنهادی ۱۶ به ۹."
                />
              </div>
              <Field label="مدت (مثلاً ۱۸:۴۲)" htmlFor="video-duration">
                <Input
                  id="video-duration"
                  dir="ltr"
                  className="text-left"
                  value={form.duration}
                  onChange={(e) => set("duration", e.target.value)}
                  placeholder="18:42"
                  maxLength={20}
                />
              </Field>
              <Field label="سطح" htmlFor="video-level">
                <Select value={form.level} onValueChange={(v) => set("level", v)}>
                  <SelectTrigger id="video-level" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COURSE_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="تعداد بازدید" htmlFor="video-views">
                <Input
                  id="video-views"
                  type="number"
                  min={0}
                  value={form.views}
                  onChange={(e) => set("views", e.target.value)}
                />
              </Field>
              <Field label="ترتیب نمایش" htmlFor="video-sortOrder">
                <Input
                  id="video-sortOrder"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => set("sortOrder", e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="لیست پخش"
                  htmlFor="video-playlist"
                  hint="ویدئوهای یک لیست پخش به‌صورت پشت‌سرهم و با پخش خودکار بعدی نمایش داده می‌شوند."
                >
                  <Select
                    value={form.playlistId || "none"}
                    onValueChange={(v) => {
                      if (v === "") return;
                      set("playlistId", v === "none" ? "" : v);
                    }}
                  >
                    <SelectTrigger id="video-playlist" className="w-full">
                      <SelectValue placeholder="بدون لیست پخش" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون لیست پخش</SelectItem>
                      {(playlists ?? []).map((playlist) => (
                        <SelectItem key={playlist.id} value={playlist.id}>
                          {playlist.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {/* وضعیت انتشار: منتشر شده (در سایت) یا پیش‌نویس (فقط پنل مدیر) */}
              <Field label="وضعیت انتشار" htmlFor="video-published-published">
                <PublishStatusSelect
                  id="video-published"
                  value={form.published}
                  onChange={(v) => set("published", v)}
                />
              </Field>
            </div>
          ) : null}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={handleSave}
              disabled={saving}
              className={`rounded-xl ${btnGradient}`}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "ذخیره تغییرات" : "ایجاد ویدئو"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="rounded-xl"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ایجاد/ویرایش لیست پخش */}
      <Dialog open={playlistDialogOpen} onOpenChange={setPlaylistDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editingPlaylist ? "ویرایش لیست پخش" : "افزودن لیست پخش جدید"}
            </DialogTitle>
            <DialogDescription>
              لیست پخش مجموعه‌ای از ویدئوهاست که در سایت پشت‌سرهم و با پخش خودکار بعدی نمایش داده می‌شود.
            </DialogDescription>
          </DialogHeader>

          {playlistForm ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="عنوان لیست پخش" htmlFor="playlist-title">
                  <Input
                    id="playlist-title"
                    value={playlistForm.title}
                    onChange={(e) =>
                      setPlaylistForm((prev) =>
                        prev ? { ...prev, title: e.target.value } : prev
                      )
                    }
                    placeholder="مثلاً: آموزش گام‌به‌گام هوش مصنوعی"
                    maxLength={120}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="توضیحات" htmlFor="playlist-description">
                  <Textarea
                    id="playlist-description"
                    value={playlistForm.description}
                    onChange={(e) =>
                      setPlaylistForm((prev) =>
                        prev ? { ...prev, description: e.target.value } : prev
                      )
                    }
                    placeholder="توضیح کوتاه درباره مجموعه ویدئوها..."
                    className="min-h-20"
                    maxLength={600}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <ImageUrlField
                  id="playlist-thumbnail"
                  label="تصویر بندانگشتی"
                  value={playlistForm.thumbnail}
                  onChange={(v) =>
                    setPlaylistForm((prev) =>
                      prev ? { ...prev, thumbnail: v } : prev
                    )
                  }
                  section="videos"
                  previewClassName="h-[90px] w-40"
                  previewAlt="پیش‌نمایش بندانگشتی"
                  hint="تصویر کاور لیست پخش؛ نسبت پیشنهادی ۱۶ به ۹."
                />
              </div>
              <Field label="ترتیب نمایش" htmlFor="playlist-sortOrder">
                <Input
                  id="playlist-sortOrder"
                  type="number"
                  min={0}
                  value={playlistForm.sortOrder}
                  onChange={(e) =>
                    setPlaylistForm((prev) =>
                      prev ? { ...prev, sortOrder: e.target.value } : prev
                    )
                  }
                />
              </Field>

              {/* مخاطب نمایش لیست پخش — مهمان / کاربر / هر دو */}
              <div className="flex flex-col justify-center rounded-xl border border-border bg-foreground/[0.02] p-3">
                <Label className="text-sm font-bold">نمایش به چه کسانی؟</Label>
                <p className="mb-2 mt-0.5 text-[0.65rem] leading-5 text-muted-foreground">
                  مشخص کنید این لیست پخش در صفحه‌ی ویدئوها به کدام بازدیدکنندگان
                  نمایش داده شود.
                </p>
                <Select
                  value={playlistForm.visibility}
                  onValueChange={(v) => {
                    if (v === "") return;
                    if (isPlaylistVisibility(v)) {
                      setPlaylistForm((prev) =>
                        prev ? { ...prev, visibility: v } : prev
                      );
                    }
                  }}
                >
                  <SelectTrigger
                    id="playlist-visibility"
                    className="h-10 w-full rounded-xl text-sm font-bold"
                    aria-label="مخاطب نمایش لیست پخش"
                  >
                    <SelectValue placeholder="مخاطب نمایش" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAYLIST_VISIBILITIES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* وضعیت انتشار لیست پخش: منتشر شده (در سایت) یا پیش‌نویس (فقط پنل مدیر) */}
              <Field label="وضعیت انتشار" htmlFor="playlist-published-published">
                <PublishStatusSelect
                  id="playlist-published"
                  value={playlistForm.published}
                  onChange={(v) =>
                    setPlaylistForm((prev) =>
                      prev ? { ...prev, published: v } : prev
                    )
                  }
                />
              </Field>
            </div>
          ) : null}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={handleSavePlaylist}
              disabled={savingPlaylist}
              className={`rounded-xl ${btnGradient}`}
            >
              {savingPlaylist ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {editingPlaylist ? "ذخیره تغییرات" : "ایجاد لیست پخش"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setPlaylistDialogOpen(false)}
              disabled={savingPlaylist}
              className="rounded-xl"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** بندانگشتی ویدئو با جایگزین در صورت خطا یا خالی بودن */
function VideoThumb({ src, alt }: { src: string; alt: string }) {
  return (
    <OptionalImage
      src={src}
      alt={alt}
      sizes="64px"
      className="h-9 w-16 shrink-0 rounded-lg border border-border bg-foreground/[0.03]"
      fallback={
        <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-foreground/[0.02]">
          <Film className="size-4 text-muted-foreground" />
        </span>
      }
    />
  );
}

/** بندانگشتی لیست پخش با جایگزین در صورت خطا یا خالی بودن */
function PlaylistThumb({ src, alt }: { src: string; alt: string }) {
  return (
    <OptionalImage
      src={src}
      alt={alt}
      sizes="96px"
      className="h-14 w-24 shrink-0 rounded-xl border border-border bg-foreground/[0.03]"
      fallback={
        <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-foreground/[0.02]">
          <Film className="size-5 text-muted-foreground" />
        </span>
      }
    />
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p className="text-[0.7rem] leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
