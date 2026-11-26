"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { applySenderQuality, canRetuneQuality } from "./sender-quality";
import { EarlyIce, PeerSession, receivedMedia, parseStreamIce } from "./peer-session";

/**
 * اتصال بلادرنگ کلاس آنلاین — سرویس سیگنالینگ socket.io.
 *
 * آدرس و مسیر اتصال از متغیرهای NEXT_PUBLIC می‌آیند (در بیلد جایگزین می‌شوند):
 *  • پیش‌فرض محیط توسعه: «/?XTransformPort=3005» — روتینگ گیت‌وی سندباکس
 *  • بیلد استقرار (Docker + Apache/nginx): «/» با مسیر /stream-socket
 */
const SOCKET_URI =
  process.env.NEXT_PUBLIC_STREAM_SOCKET_URI ?? "/?XTransformPort=3005";
const SOCKET_PATH =
  process.env.NEXT_PUBLIC_STREAM_SOCKET_PATH ?? "/socket.io";

/* ------------------------------------------------------------------ */
/*  WebRTC helpers                                                     */
/* ------------------------------------------------------------------ */

interface IceConfiguration extends RTCConfiguration {
  turnConfigured: boolean;
  expiresAt: number;
}

/** قید ویدئوی کم‌مصرف استاد — 480p@15fps (پهنای باند محدود کلاس آنلاین) */
const HOST_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 15 },
};

import type {
  ChatMsg,
  MediaRequest,
  QualityMode,
  RemotePublisher,
  RoomUser,
  StreamRole,
} from "@/components/stream/types";

export interface UseStreamRoomOptions {
  streamId: string;
  role: StreamRole;
}

export interface UseStreamRoom {
  connStatus: "connecting" | "connected" | "error";
  connError: string | null;
  mediaError: string | null;
  retryMedia: () => Promise<void>;
  me: { name: string; role: StreamRole } | null;
  roomStatus: "scheduled" | "live" | "ended";
  hostOnline: boolean;
  users: RoomUser[];
  chat: ChatMsg[];
  kicked: boolean;
  granted: boolean;
  mediaRequests: MediaRequest[];
  remotePublishers: RemotePublisher[];
  publishing: boolean;
  screenSharing: boolean;
  micMuted: boolean;
  camOff: boolean;
  localStream: MediaStream | null;
  quality: QualityMode;
  setQuality: (mode: QualityMode) => void;
  sendChat: (text: string) => void;
  requestMedia: () => void;
  respondMedia: (userId: string, grant: boolean) => void;
  revokeMedia: (userId: string) => void;
  kickUser: (userId: string) => Promise<void>;
  startBroadcast: (mode: "av" | "audio") => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleMic: () => void;
  toggleCam: () => void;
  stopPublishing: () => void;
  endStream: () => Promise<void>;
  leaveRoom: () => void;
}

/** وضعیت خام اشتراک به یک ناشر دور */
interface RemoteSub {
  pc: RTCPeerConnection;
  session: PeerSession;
  state: "connecting" | "live" | "error";
  error?: string;
  monitor?: ReturnType<typeof setInterval>;
  deadline?: ReturnType<typeof setTimeout>;
  name: string;
  role: StreamRole;
  userId: string | null;
  camStream: MediaStream | null;
  screenStream: MediaStream | null;
  audioTrack: MediaStreamTrack | null;
}

/** اتصال ناشر به یک بیننده */
interface ViewerEntry {
  pc: RTCPeerConnection;
  session: PeerSession;
  quality: QualityMode;
}

export function useStreamRoom(
  options: UseStreamRoomOptions
): UseStreamRoom {
  const { streamId, role } = options;

  const [connStatus, setConnStatus] = useState<
    "connecting" | "connected" | "error"
  >("connecting");
  const [connError, setConnError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [me, setMe] = useState<{ name: string; role: StreamRole } | null>(null);
  const [roomStatus, setRoomStatus] = useState<
    "scheduled" | "live" | "ended"
  >("scheduled");
  const [hostOnline, setHostOnline] = useState(false);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [kicked, setKicked] = useState(false);
  const [granted, setGranted] = useState(false);
  const [mediaRequests, setMediaRequests] = useState<MediaRequest[]>([]);
  const [remotePublishers, setRemotePublishers] = useState<
    RemotePublisher[]
  >([]);
  const [publishing, setPublishing] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [quality, setQualityState] = useState<QualityMode>("full");

  const socketRef = useRef<Socket | null>(null);
  const roleRef = useRef<StreamRole>(role);
  const kickedRef = useRef(false);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  /** آینه‌ی publishing برای event handlerها — اعلام دوباره‌ی پخش پس از اتصال مجدد */
  const publishingRef = useRef(false);

  useEffect(() => {
    publishingRef.current = publishing;
  }, [publishing]);

  /** رسانه‌ی محلی ناشر (دوربین/میکروفون + صفحه) */
  const localMediaRef = useRef<{
    camStream: MediaStream | null;
    screenStream: MediaStream | null;
  }>({ camStream: null, screenStream: null });

  /** اتصال‌های ناشر → بیننده‌ها (وقتی خودم ناشرم) */
  const viewersRef = useRef<Map<string, ViewerEntry>>(new Map());
  /** اتصال‌های بیننده → ناشرهای دور */
  const subsRef = useRef<Map<string, RemoteSub>>(new Map());
  const qualityRef = useRef<QualityMode>("full");
  const earlyIceRef = useRef(new EarlyIce());
  const knownPublishersRef = useRef(new Map<string, string>());
  const offerTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const rtcConfigRef = useRef<IceConfiguration | null>(null);
  const rtcRequestRef = useRef<Promise<IceConfiguration> | null>(null);
  const roomEpoch = useRef(0);
  const offerEpochs = useRef(new Map<string, number>());
  const viewerEpochs = useRef(new Map<string, number>());

  const ensureRtcConfig = useCallback(async () => {
    if (rtcConfigRef.current && rtcConfigRef.current.expiresAt > Date.now() + 120_000)
      return rtcConfigRef.current;
    if (rtcRequestRef.current) return rtcRequestRef.current;
    const request = (async () => {
      const response = await fetch(`/api/streams/${encodeURIComponent(streamId)}`, {
        cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("دریافت تنظیمات انتقال رسانه ممکن نشد.");
      const data = await response.json();
      if (!data.canJoin || !data.iceConfig?.iceServers)
        throw new Error("اجازهٔ دریافت رسانهٔ این کلاس وجود ندارد.");
      rtcConfigRef.current = data.iceConfig as IceConfiguration;
      return rtcConfigRef.current;
    })();
    rtcRequestRef.current = request;
    try { return await request; }
    finally { if (rtcRequestRef.current === request) rtcRequestRef.current = null; }
  }, [streamId]);

  const mediaFailure = useCallback((operation: string, error: unknown) => {
    // Never log SDP, candidate IP addresses or TURN credentials.
    console.warn("[stream-media]", operation, error instanceof Error ? error.name : "Error");
    setMediaError("ارتباط صدا و تصویر برقرار نشد. دوباره تلاش کنید؛ اگر ادامه داشت، تنظیمات سرویس انتقال رسانه باید بررسی شود.");
  }, []);

  const closeOutgoing = useCallback(() => {
    viewerEpochs.current.clear();
    for (const [from, entry] of viewersRef.current) {
      entry.session.close();
      earlyIceRef.current.retire(`${from}:${entry.session.id}`);
    }
    viewersRef.current.clear();
  }, []);

  /* ———————————— ابزارهای پایه ———————————— */

  const emitSignal = useCallback(
    (to: string, kind: string, payload: unknown) => {
      if (socketRef.current?.connected)
        socketRef.current.emit("signal", { streamId, to, kind, payload });
    },
    [streamId]
  );

  /** توقف همه‌ی trackهای محلی (بدون اعلام publish) */
  const stopLocalMedia = useCallback(() => {
    const { camStream, screenStream } = localMediaRef.current;
    for (const t of camStream?.getTracks() ?? []) t.stop();
    for (const t of screenStream?.getTracks() ?? []) t.stop();
    localMediaRef.current = { camStream: null, screenStream: null };
    setLocalStream(null);
    setScreenSharing(false);
    setMicMuted(false);
    setCamOff(false);
  }, []);

  /** همگام‌سازی state نمایشی از روی وضعیت خام subsRef */
  const syncPublisherState = useCallback(() => {
    setRemotePublishers(
      Array.from(subsRef.current.entries()).map(([socketId, sub]) => {
        const mainTracks =
          sub.screenStream?.getVideoTracks() ??
          sub.camStream?.getVideoTracks() ??
          [];
        // استاد «فقط صدا» پخش می‌کند؟ — بدون ویدئو، main فقط صدا می‌شود تا
        // <video> صدا را پخش کند (در غیر این صورت کلاس بی‌صدا می‌شد).
        const main =
          mainTracks.length > 0
            ? new MediaStream([
                ...mainTracks,
                ...(sub.audioTrack ? [sub.audioTrack] : []),
              ])
            : sub.audioTrack
              ? new MediaStream([sub.audioTrack])
              : null;
        const pipTracks = sub.screenStream
          ? (sub.camStream?.getVideoTracks() ?? [])
          : [];
        const pip = pipTracks.length > 0 ? new MediaStream(pipTracks) : null;
        return {
          socketId,
          userId: sub.userId,
          role: sub.role,
          name: sub.name,
          main,
          pip,
          state: sub.state,
          error: sub.error,
        };
      })
    );
  }, []);

  /** بستن یک اشتراک (توقف ناشر/خروج او) */
  const dropSubscription = useCallback((publisherSocketId: string) => {
    clearTimeout(offerTimersRef.current.get(publisherSocketId));
    offerTimersRef.current.delete(publisherSocketId);
    const sub = subsRef.current.get(publisherSocketId);
    if (sub) {
      try {
        clearInterval(sub.monitor);
        clearTimeout(sub.deadline);
        sub.session.close();
        earlyIceRef.current.retire(`${publisherSocketId}:${sub.session.id}`);
      } catch {
        /* بسته */
      }
      subsRef.current.delete(publisherSocketId);
    }
    setRemotePublishers((prev) =>
      prev.filter((p) => p.socketId !== publisherSocketId)
    );
  }, []);

  /** درخواست اشتراک از یک ناشر با کیفیت فعلی */
  const subscribeTo = useCallback(
    (publisherSocketId: string, name = "") => {
      knownPublishersRef.current.set(publisherSocketId, name);
      clearTimeout(offerTimersRef.current.get(publisherSocketId));
      offerTimersRef.current.set(publisherSocketId, setTimeout(() => {
        const error = "پاسخ اتصال صدا و تصویر دریافت نشد. دوباره تلاش کنید.";
        setMediaError(error);
        setRemotePublishers((prev) => prev.map((p) => p.socketId === publisherSocketId
          ? { ...p, state: "error", error } : p));
      }, 30_000));
      socketRef.current?.emit("subscribe-request", {
        streamId,
        publisherId: publisherSocketId,
        quality: qualityRef.current,
      });
      setRemotePublishers((prev) => {
        const exists = prev.some((p) => p.socketId === publisherSocketId);
        if (exists) return prev;
        return [
          ...prev,
          {
            socketId: publisherSocketId,
            userId: null,
            name,
            main: null,
            pip: null,
            state: "connecting" as const,
          },
        ];
      });
    },
    [streamId]
  );

  /* ———————————— سمت بیننده: offer ناشر ———————————— */

  /** An offer owns one PC, queue and media watchdog until explicitly replaced. */
  const handleRemoteOffer = useCallback(async (from: string, fromName: string, payload: unknown, publisherRole: StreamRole = "host", publisherUserId: string | null = null) => {
    const data = payload as { sdp?: RTCSessionDescriptionInit; sessionId?: string;
      meta?: { cam?: string | null; screen?: string | null } } | null;
    if (!data?.sdp || data.sdp.type !== "offer" || typeof data.sdp.sdp !== "string" || data.sdp.sdp.length > 131072) return;
    if (data.sessionId && (typeof data.sessionId !== "string" || data.sessionId.length > 128)) return;
    const id = data.sessionId || `legacy-${from}`;
    if (subsRef.current.get(from)?.session.id === id && data.sessionId) return;
    const epoch = (offerEpochs.current.get(from) ?? 0) + 1;
    offerEpochs.current.set(from, epoch);
    const lifetime = roomEpoch.current;
    try {
      const config = await ensureRtcConfig();
      if (lifetime !== roomEpoch.current || offerEpochs.current.get(from) !== epoch) return;
      dropSubscription(from);
      const pc = new RTCPeerConnection(config);
      const session = new PeerSession(id, pc, mediaFailure);
      const sub: RemoteSub = { pc, session, name: fromName, role: publisherRole, userId: publisherUserId, camStream: null,
        screenStream: null, audioTrack: null, state: "connecting" };
      subsRef.current.set(from, sub);
      const current = () => subsRef.current.get(from) === sub;
      const meta = data.meta ?? {};
      for (const c of earlyIceRef.current.take(`${from}:${id}`)) session.addIce(c);
      pc.onicecandidate = (ev) => {
        if (ev.candidate && current()) emitSignal(from, "ice", {
          ...ev.candidate.toJSON(), ...(data.sessionId ? { sessionId: id } : {}),
        });
      };
      pc.onicecandidateerror = () => {
        if (current()) console.warn("[stream-media] ICE server could not be reached");
      };
      pc.ontrack = (ev) => {
        if (!current()) return;
        const track = ev.track;
        if (track.kind === "audio") sub.audioTrack = track;
        else if (meta.screen && ev.streams[0]?.id === meta.screen)
          sub.screenStream = new MediaStream([track]);
        else sub.camStream = new MediaStream([track]);
        syncPublisherState(); // Still connecting: an ontrack event is not proof of received frames.
      };
      const fail = () => {
        if (!current()) return;
        sub.state = "error";
        sub.error = config.turnConfigured
          ? "ارتباط صدا و تصویر برقرار نشد؛ اتصال شبکه یا سرویس انتقال رسانه را بررسی کنید."
          : "ارتباط مستقیم صدا و تصویر برقرار نشد؛ سرویس انتقال رسانه برای این کلاس تنظیم نشده است.";
        setMediaError(sub.error);
        syncPublisherState();
      };
      pc.onconnectionstatechange = () => {
        if (!current()) return;
        if (pc.connectionState === "failed") fail();
        else if (pc.connectionState !== "connected") {
          sub.state = "connecting";
          clearTimeout(sub.deadline);
          sub.deadline = setTimeout(fail, 30_000);
          syncPublisherState();
        }
      };
      let checking = false;
      sub.monitor = setInterval(async () => {
        if (!current() || checking) return;
        if (pc.connectionState !== "connected") return;
        checking = true;
        try {
          const needsVideo = !!(sub.camStream?.getVideoTracks().length || sub.screenStream?.getVideoTracks().length);
          const ready = await receivedMedia(await pc.getStats(), needsVideo);
          if (current() && ready && sub.state !== "live") {
            clearTimeout(sub.deadline);
            sub.state = "live"; sub.error = undefined;
            setMediaError(null); syncPublisherState();
          }
        } catch (error) { if (current()) mediaFailure("media-stats", error); }
        finally { checking = false; }
      }, 1000);
      sub.deadline = setTimeout(fail, 30_000);
      await session.setRemote(data.sdp);
      if (!current()) return;
      await pc.setLocalDescription(await pc.createAnswer());
      if (!current()) return;
      emitSignal(from, "answer", { sdp: pc.localDescription,
        ...(data.sessionId ? { sessionId: id } : {}) });
      syncPublisherState();
    } catch (error) {
      if (lifetime === roomEpoch.current && offerEpochs.current.get(from) === epoch)
        mediaFailure("accept-offer", error);
    }
  }, [ensureRtcConfig, dropSubscription, emitSignal, mediaFailure, syncPublisherState]);

  const rebuildViewer = useCallback(async (viewerSocketId: string, quality: QualityMode, retuneOnly = false) => {
    const epoch = (viewerEpochs.current.get(viewerSocketId) ?? 0) + 1;
    viewerEpochs.current.set(viewerSocketId, epoch);
    const lifetime = roomEpoch.current;
    try {
      const config = await ensureRtcConfig();
      if (lifetime !== roomEpoch.current || viewerEpochs.current.get(viewerSocketId) !== epoch) return;
      const old = viewersRef.current.get(viewerSocketId);
      if (retuneOnly && old && canRetuneQuality(old.pc, old.quality, quality, [
        ...(localMediaRef.current.camStream?.getTracks() ?? []),
        ...(localMediaRef.current.screenStream?.getVideoTracks() ?? []),
      ]) && await applySenderQuality(old.pc, quality)) {
        if (viewersRef.current.get(viewerSocketId) === old) old.quality = quality;
        return;
      }
      if (lifetime !== roomEpoch.current || viewerEpochs.current.get(viewerSocketId) !== epoch) return;
      if (old) {
        old.session.close();
        earlyIceRef.current.retire(`${viewerSocketId}:${old.session.id}`);
      }
      const { camStream, screenStream } = localMediaRef.current;
      if (!camStream && !screenStream) return;
      const pc = new RTCPeerConnection(config);
      const id = crypto.randomUUID();
      const session = new PeerSession(id, pc, mediaFailure);
      const entry: ViewerEntry = { pc, session, quality };
      viewersRef.current.set(viewerSocketId, entry);
      const current = () => viewersRef.current.get(viewerSocketId) === entry;
      pc.onicecandidate = (ev) => {
        if (ev.candidate && current()) emitSignal(viewerSocketId, "ice", {
          ...ev.candidate.toJSON(), sessionId: id,
        });
      };
      pc.onconnectionstatechange = () => {
        if (current() && pc.connectionState === "failed") mediaFailure("send-media", new Error("ICE failed"));
      };
      const wantVideo = quality !== "audio";
      for (const t of camStream?.getTracks() ?? [])
        if (wantVideo || t.kind === "audio") pc.addTrack(t, camStream!);
      if (wantVideo) for (const t of screenStream?.getVideoTracks() ?? []) pc.addTrack(t, screenStream!);
      await pc.setLocalDescription(await pc.createOffer());
      if (!current()) return;
      // Send SDP before bitrate work so candidate events never have to wait on it.
      emitSignal(viewerSocketId, "offer", { sdp: pc.localDescription, sessionId: id,
        quality, meta: { cam: camStream?.id ?? null, screen: screenStream?.id ?? null } });
      await applySenderQuality(pc, quality);
    } catch (error) {
      if (lifetime === roomEpoch.current && viewerEpochs.current.get(viewerSocketId) === epoch)
        mediaFailure("create-offer", error);
    }
  }, [ensureRtcConfig, emitSignal, mediaFailure]);

  const rebuildAllViewers = useCallback(async () => {
    const entries = Array.from(viewersRef.current.entries());
    for (const [viewerSocketId, entry] of entries) {
      await rebuildViewer(viewerSocketId, entry.quality);
    }
  }, [rebuildViewer]);

  /* ———————————— اتصال و رویدادهای سرویس ———————————— */

  useEffect(() => {
    const socket = io(SOCKET_URI, {
      path: SOCKET_PATH,
      // «polling» پیش از «websocket»: handshake همیشه با HTTP برقرار می‌شود و
      // بعد در صورت پشتیبانی پروکسی، به websocket ارتقاا می‌یابد. ترتیب
      // قبلی (websocket اول) در سرورهایی که Upgrade را پاس نمی‌دهند هرگز
      // fallback نمی‌کرد و صفحه در «اتصال...» گیر می‌کرد.
      // tryAllTransports: اگر upgrade/اولین transport شکست خورد، بقیه را
      // امتحان می‌کند (پیش‌فرض خاموش است).
      transports: ["polling", "websocket"],
      tryAllTransports: true,
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 1500,
      timeout: 10000,
    });
    socketRef.current = socket;

    const requestJoin = () => {
      socket.emit(
        "join",
        { streamId },
        (res: {
          ok: boolean;
          error?: string;
          me?: { userId: string | null; name: string; role: StreamRole };
          room?: {
            status: "scheduled" | "live" | "ended";
            hostOnline: boolean;
            users: RoomUser[];
            publishers: string[];
            granted: boolean;
            chat: ChatMsg[];
          };
        }) => {
          if (!res?.ok) {
            setConnStatus("error");
            setConnError(res?.error ?? "ورود به کلاس ممکن نشد.");
            socket.disconnect();
            return;
          }
          setConnStatus("connected");
          setConnError(null);
          setMe(res.me ? { name: res.me.name, role: res.me.role } : null);
          setRoomStatus(res.room?.status ?? "scheduled");
          setHostOnline(!!res.room?.hostOnline);
          setUsers(res.room?.users ?? []);
          setChat(res.room?.chat ?? []);
          setGranted(!!res.room?.granted);
          for (const oldId of knownPublishersRef.current.keys()) {
            if (!res.room?.publishers?.includes(oldId)) {
              knownPublishersRef.current.delete(oldId); dropSubscription(oldId);
            }
          }
          for (const pubId of res.room?.publishers ?? []) {
            if (pubId !== socket.id) subscribeTo(pubId);
          }

          // اتصال مجدد (شبکه/اسلیپ مرورگر/HMR): اگر از قبل در حال پخش بودیم،
          // پخش را در سرویس دوباره اعلام می‌کنیم — publishers سمت سرویس با
          // قطع سوکت قبلی پاک شده و بدون این اعلام، بیننده‌ها تصویر را
          // برای همیشه در انتظار می‌مانند.
          if (
            publishingRef.current &&
            (localMediaRef.current.camStream || localMediaRef.current.screenStream)
          ) {
            socket.emit("publish", { streamId, active: true });
            if (roleRef.current === "host") {
              socket.emit("host:live", { streamId });
            }
          }
        }
      );
    };

    socket.on("connect", () => {
      requestJoin();
      // دانشجو: ثبت حضور در دیتابیس (منبع گزارش اکسل مدیر)
      if (roleRef.current === "student" && !kickedRef.current) {
        void fetch(`/api/streams/${streamId}/join`, { method: "POST" }).catch(
          () => {}
        );
      }
    });

    socket.on("disconnect", (reason) => {
      roomEpoch.current++;
      for (const entry of viewersRef.current.values()) entry.session.close();
      viewersRef.current.clear(); viewerEpochs.current.clear();
      for (const from of Array.from(subsRef.current.keys())) dropSubscription(from);
      offerEpochs.current.clear(); earlyIceRef.current.clear();
      for (const timer of offerTimersRef.current.values()) clearTimeout(timer);
      offerTimersRef.current.clear();
      if (reason !== "io client disconnect") setConnStatus("connecting");
    });

    socket.on("connect_error", (err: Error) => {
      setConnStatus("error");
      const reason = err?.message ? ` (${err.message})` : "";
      setConnError(
        `ارتباط با سرویس کلاس برقرار نشد${reason} — در حال تلاش مجدد...`
      );
    });

    // تلاش مجدد — وضعیت به «در حال اتصال» برمی‌گردد تا کاربر ببیند تلاش ادامه دارد
    socket.on("reconnect_attempt", () => {
      setConnStatus("connecting");
    });

    /* — حضور اعضا — */
    socket.on(
      "user-joined",
      (data: { userId: string | null; name: string; role: StreamRole }) => {
        setUsers((prev) => {
          if (data.userId) {
            if (prev.some((u) => u.userId === data.userId)) return prev;
          } else if (prev.some((u) => u.role === "host")) {
            return prev;
          }
          return [
            ...prev,
            {
              socketId: "",
              userId: data.userId,
              name: data.name,
              role: data.role,
            },
          ];
        });
      }
    );

    socket.on(
      "user-left",
      (data: { userId: string | null; name: string; kicked?: boolean }) => {
        setUsers((prev) => {
          if (data.userId) {
            return prev.filter((u) => u.userId !== data.userId);
          }
          // استاد خارج شد — یک ردیف استاد را بردار
          const idx = prev.findIndex((u) => u.role === "host");
          if (idx < 0) return prev;
          return prev.filter((_, i) => i !== idx);
        });
        if (data.userId) {
          setMediaRequests((prev) =>
            prev.filter((r) => r.userId !== data.userId)
          );
        }
      }
    );

    /* — چت — */
    socket.on("chat", (msg: ChatMsg) => {
      setChat((prev) => [...prev.slice(-80), msg]);
    });

    /* — چرخه‌ی ناشرها — */
    socket.on(
      "publisher-changed",
      (data: {
        publisherId: string;
        userId: string | null;
        name: string;
        active: boolean;
      }) => {
        if (data.active) {
          setRemotePublishers((prev) =>
            prev.map((p) =>
              p.socketId === data.publisherId
                ? { ...p, name: data.name, userId: data.userId }
                : p
            )
          );
          if (data.publisherId !== socket.id) {
            subscribeTo(data.publisherId, data.name);
          }
          if (data.userId === null) setHostOnline(true);
        } else {
          knownPublishersRef.current.delete(data.publisherId);
          offerEpochs.current.set(data.publisherId, (offerEpochs.current.get(data.publisherId) ?? 0) + 1);
          dropSubscription(data.publisherId);
          if (data.userId === null) setHostOnline(false);
        }
      }
    );

    socket.on("stream:live", () => setRoomStatus("live"));
    socket.on("stream:ended", () => {
      setRoomStatus("ended");
      roomEpoch.current++;
      knownPublishersRef.current.clear();
      setHostOnline(false);
      for (const pubId of Array.from(subsRef.current.keys())) {
        dropSubscription(pubId);
      }
    });
    socket.on("host:offline", () => setHostOnline(false));

    /* — سیگنالینگ رسانه — */
    socket.on(
      "signal",
      (data: { from: string; fromName?: string; fromRole?: StreamRole; fromUserId?: string | null; kind: string; payload: unknown }) => {
        if (data.kind === "offer") {
          void handleRemoteOffer(
            data.from,
            data.fromName ?? "",
            data.payload,
            data.fromRole ?? "host",
            data.fromUserId ?? null
          );
        } else if (data.kind === "answer") {
          const entry = viewersRef.current.get(data.from);
          const payload = data.payload as { sdp?: RTCSessionDescriptionInit; sessionId?: string } | null;
          if (entry && entry.pc.signalingState === "have-local-offer" && payload?.sdp?.type === "answer" &&
              (!payload.sessionId || payload.sessionId === entry.session.id)) {
            void entry.session.setRemote(payload.sdp).then(async () => {
              if (viewersRef.current.get(data.from) === entry)
                await applySenderQuality(entry.pc, entry.quality);
            }).catch((error) => mediaFailure("accept-answer", error));
          }
        } else if (data.kind === "ice") {
          const parsed = parseStreamIce(data.payload);
          if (!parsed) return;
          const cand = parsed.candidate;
          const outgoing = viewersRef.current.get(data.from)?.session;
          const incoming = subsRef.current.get(data.from)?.session;
          const id = parsed.sessionId;
          const target = id ? [outgoing, incoming].find((p) => p?.id === id) : outgoing ?? incoming;
          if (target) target.addIce(cand);
          else earlyIceRef.current.push(`${data.from}:${id || `legacy-${data.from}`}`, cand);
        }
      }
    );

    socket.on(
      "subscribe-request",
      (data: { viewerSocketId: string; viewerName?: string; quality?: QualityMode }) => {
        const q: QualityMode =
          data.quality === "low" || data.quality === "audio"
            ? data.quality
            : "full";
        void rebuildViewer(data.viewerSocketId, q, true);
      }
    );

    /* — اجازه‌ی رسانه‌ی دانشجو — */
    socket.on("media:request", (data: { userId: string; name: string }) => {
      setMediaRequests((prev) =>
        prev.some((r) => r.userId === data.userId)
          ? prev
          : [...prev, { userId: data.userId, name: data.name, ts: Date.now() }]
      );
    });
    socket.on("media:granted", () => setGranted(true));
    socket.on("media:denied", () => setGranted(false));
    socket.on("media:revoked", () => {
      setGranted(false);
      closeOutgoing();
      stopLocalMedia();
      socket.emit("publish", { streamId, active: false });
      publishingRef.current = false;
      setPublishing(false);
    });

    /* — اخراج — */
    socket.on("kicked", () => {
      kickedRef.current = true;
      closeOutgoing(); stopLocalMedia(); publishingRef.current = false; setPublishing(false);
      setKicked(true);
      setHostOnline(false);
      for (const pubId of Array.from(subsRef.current.keys())) {
        dropSubscription(pubId);
      }
      if (roleRef.current === "student") {
        void fetch(`/api/streams/${streamId}/leave`, {
          method: "POST",
        }).catch(() => {});
      }
      socket.disconnect();
    });

    /* — خروج خودکار (بستن تب/ترک صفحه) — */
    const handleUnload = () => {
      if (roleRef.current === "student" && !kickedRef.current) {
        try {
          navigator.sendBeacon(`/api/streams/${streamId}/leave`);
        } catch {
          /* noop */
        }
      }
    };
    window.addEventListener("pagehide", handleUnload);

    return () => {
      window.removeEventListener("pagehide", handleUnload);
      handleUnload();
      roomEpoch.current++;
      stopLocalMedia();
      earlyIceRef.current.clear();
      knownPublishersRef.current.clear();
      for (const timer of offerTimersRef.current.values()) clearTimeout(timer);
      offerTimersRef.current.clear();
      offerEpochs.current.clear(); viewerEpochs.current.clear();
      for (const [, entry] of viewersRef.current) {
        try {
          entry.session.close();
        } catch {
          /* بسته */
        }
      }
      viewersRef.current.clear();
      for (const [, sub] of subsRef.current) {
        try {
          clearInterval(sub.monitor); clearTimeout(sub.deadline);
          sub.session.close();
        } catch {
          /* بسته */
        }
      }
      subsRef.current.clear();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    streamId,
    subscribeTo,
    dropSubscription,
    handleRemoteOffer,
    rebuildViewer,
    stopLocalMedia,
    closeOutgoing,
    mediaFailure,
  ]);

  /* ———————————— انتشار رسانه (استاد/دانشجوی اجازه‌گرفته) ———————————— */

  /** اعلام شروع پخش به اتاق + دیتابیس (برای استاد/مدیر) */
  const announcePublishStart = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("publish", { streamId, active: true });
    publishingRef.current = true;
    setPublishing(true);
    if (role === "host") {
      socket.emit("host:live", { streamId });
      setRoomStatus("live");
      setHostOnline(true);
      // مسیر مشترک میزبان (مدیر یا استادِ مالک) — وضعیت جلسه در دیتابیس
      // هم‌زمان درست می‌شود تا جلسات استاد هم «زنده» دیده شوند
      void fetch(`/api/streams/${streamId}/host-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "live" }),
      }).catch(() => {});
    }
  }, [streamId, role]);

  /** شروع پخش (دوربین + میکروفون یا فقط میکروفون) */
  const startBroadcast = useCallback(
    async (mode: "av" | "audio") => {
      try {
        const gum = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: mode === "av" ? HOST_VIDEO_CONSTRAINTS : false,
        });
        localMediaRef.current.camStream = gum;
        setLocalStream(gum);
        announcePublishStart();
        await rebuildAllViewers();
      } catch {
        throw new Error(
          "دسترسی به دوربین/میکروفون داده نشد؛ دسترسی‌های مرورگر را بررسی کنید."
        );
      }
    },
    [announcePublishStart, rebuildAllViewers]
  );

  /** اشتراک/توقف صفحه‌ی دسکتاپ */
  const toggleScreenShare = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
    const { camStream, screenStream } = localMediaRef.current;
    if (screenStream) {
      // — توقف اشتراک صفحه —
      for (const t of screenStream.getVideoTracks()) t.stop();
      localMediaRef.current.screenStream = null;
      setScreenSharing(false);
      if (!camStream) {
        socket.emit("publish", { streamId, active: false });
        publishingRef.current = false;
        setPublishing(false);
        return;
      }
      await rebuildAllViewers();
      return;
    }

    // — شروع اشتراک صفحه —
    try {
      const ss = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      localMediaRef.current.screenStream = ss;
      setScreenSharing(true);
      ss.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (localMediaRef.current.screenStream === ss) {
          localMediaRef.current.screenStream = null;
          setScreenSharing(false);
          if (!localMediaRef.current.camStream) {
            socketRef.current?.emit("publish", { streamId, active: false });
            publishingRef.current = false;
            setPublishing(false);
          } else {
            void rebuildAllViewers();
          }
        }
      });
      if (!publishing) announcePublishStart();
      await rebuildAllViewers();
    } catch {
      throw new Error("اشتراک صفحه لغو شد.");
    }
  }, [streamId, publishing, rebuildAllViewers, announcePublishStart]);

  /** توقف کامل پخش خودم */
  const stopPublishing = useCallback(() => {
    stopLocalMedia();
    socketRef.current?.emit("publish", { streamId, active: false });
    publishingRef.current = false;
    setPublishing(false);
    closeOutgoing();
  }, [streamId, stopLocalMedia, closeOutgoing]);

  const toggleMic = useCallback(() => {
    const tracks = localMediaRef.current.camStream?.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    const next = !micMuted;
    for (const t of tracks) t.enabled = !next;
    setMicMuted(next);
  }, [micMuted]);

  const toggleCam = useCallback(() => {
    const tracks = localMediaRef.current.camStream?.getVideoTracks() ?? [];
    if (tracks.length === 0) return;
    const next = !camOff;
    for (const t of tracks) t.enabled = !next;
    setCamOff(next);
  }, [camOff]);

  /* ———————————— اقدامات ———————————— */

  const sendChat = useCallback(
    (text: string) => {
      const clean = text.trim().slice(0, 500);
      if (!clean) return;
      socketRef.current?.emit("chat", { streamId, text: clean });
    },
    [streamId]
  );

  /** تغییر کیفیت دریافت — اشتراک‌ها با کیفیت نو دوباره ساخته می‌شوند */
  const setQuality = useCallback((mode: QualityMode) => {
    if (qualityRef.current === mode) return;
    qualityRef.current = mode;
    setQualityState(mode);
    const socket = socketRef.current;
    if (!socket?.connected) return;
    // Keep receiving audio while the publisher adjusts bitrate or negotiates a new offer.
    for (const [publisherId] of knownPublishersRef.current) {
      socket.emit("subscribe-request", { streamId, publisherId, quality: mode });
    }
  }, [streamId]);

  const requestMedia = useCallback(() => {
    socketRef.current?.emit("media:request", { streamId });
  }, [streamId]);

  const respondMedia = useCallback(
    (userId: string, grant: boolean) => {
      socketRef.current?.emit("media:response", { streamId, userId, grant });
      setMediaRequests((prev) => prev.filter((r) => r.userId !== userId));
    },
    [streamId]
  );

  const revokeMedia = useCallback(
    (userId: string) => {
      socketRef.current?.emit("media:revoke", { streamId, userId });
    },
    [streamId]
  );

  const kickUser = useCallback(
    async (userId: string) => {
      // سند ماندگار در دیتابیس + اخراج لحظه‌ای از سرویس
      try {
        await fetch(`/api/admin/streams/${streamId}/kick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
      } catch {
        /* سرویس خودش اخراج را انجام می‌دهد */
      }
      socketRef.current?.emit("kick", { streamId, userId });
    },
    [streamId]
  );

  const endStream = useCallback(async () => {
    stopPublishing();
    socketRef.current?.emit("host:ended", { streamId });
    setRoomStatus("ended");
    // پایان جلسه برای هر دو نقش میزبان (مدیر/استاد) — با بسته‌شدن جلسه،
    // باکس «دعوت به کلاس» هم بلافاصله از پنل کاربران حذف می‌شود
    try {
      await fetch(`/api/streams/${streamId}/host-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended" }),
      });
    } catch {
      /* بهترین تلاش */
    }
  }, [streamId, stopPublishing]);

  const leaveRoom = useCallback(() => {
    if (roleRef.current === "student" && !kickedRef.current) {
      void fetch(`/api/streams/${streamId}/leave`, {
        method: "POST",
      }).catch(() => {});
    }
    socketRef.current?.emit("leave", { streamId });
    socketRef.current?.disconnect();
  }, [streamId]);

  const retryMedia = useCallback(async () => {
    setMediaError(null);
    rtcConfigRef.current = null;
    try {
      await ensureRtcConfig();
      await rebuildAllViewers();
      for (const [from, name] of knownPublishersRef.current) subscribeTo(from, name);
    } catch (error) { mediaFailure("retry-media", error); }
  }, [ensureRtcConfig, rebuildAllViewers, subscribeTo, mediaFailure]);

  useEffect(() => {
    const timer = setInterval(() => {
      const config = rtcConfigRef.current;
      if (config?.turnConfigured && config.expiresAt <= Date.now() + 120_000)
        void retryMedia();
    }, 30_000);
    return () => clearInterval(timer);
  }, [retryMedia]);

  return useMemo(
    () => ({
      connStatus,
      connError,
      me,
      roomStatus,
      hostOnline,
      users,
      chat,
      kicked,
      granted,
      mediaRequests,
      remotePublishers,
      publishing,
      mediaError,
      retryMedia,
      screenSharing,
      micMuted,
      camOff,
      localStream,
      quality,
      setQuality,
      sendChat,
      requestMedia,
      respondMedia,
      revokeMedia,
      kickUser,
      startBroadcast,
      toggleScreenShare,
      toggleMic,
      toggleCam,
      stopPublishing,
      endStream,
      leaveRoom,
    }),
    [
      connStatus,
      connError,
      me,
      roomStatus,
      hostOnline,
      users,
      chat,
      kicked,
      granted,
      mediaRequests,
      remotePublishers,
      publishing,
      mediaError,
      retryMedia,
      screenSharing,
      micMuted,
      camOff,
      localStream,
      quality,
      setQuality,
      sendChat,
      requestMedia,
      respondMedia,
      revokeMedia,
      kickUser,
      startBroadcast,
      toggleScreenShare,
      toggleMic,
      toggleCam,
      stopPublishing,
      endStream,
      leaveRoom,
    ]
  );
}
