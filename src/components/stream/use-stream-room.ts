"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

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

const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  },
];

/** سقف بیت‌ریت هر کیفیت — کلید «بهینه برای سرعت کم» */
const BITRATE_BY_QUALITY: Record<string, number> = {
  full: 600_000,
  low: 250_000,
  audio: 40_000,
};

async function applyBitrate(
  pc: RTCPeerConnection,
  quality: string
): Promise<void> {
  const max = BITRATE_BY_QUALITY[quality] ?? 600_000;
  for (const sender of pc.getSenders()) {
    if (!sender.track || sender.track.kind !== "video") continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = max;
      await sender.setParameters(params);
    } catch {
      /* بهترین تلاش — بعضی مرورگرها قبل از مذاکره اجازه نمی‌دهند */
    }
  }
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
  name: string;
  camStream: MediaStream | null;
  screenStream: MediaStream | null;
  audioTrack: MediaStreamTrack | null;
}

/** اتصال ناشر به یک بیننده */
interface ViewerEntry {
  pc: RTCPeerConnection;
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

  /* ———————————— ابزارهای پایه ———————————— */

  const emitSignal = useCallback(
    (to: string, kind: string, payload: unknown) => {
      socketRef.current?.emit("signal", { streamId, to, kind, payload });
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
          userId: null,
          name: sub.name,
          main,
          pip,
          // trackها رسیده‌اند؟ (رسیده‌های دیرهنگام «connecting» می‌مانند)
          state: (main || pip ? "live" : "connecting") as "live" | "connecting",
        };
      })
    );
  }, []);

  /** بستن یک اشتراک (توقف ناشر/خروج او) */
  const dropSubscription = useCallback((publisherSocketId: string) => {
    const sub = subsRef.current.get(publisherSocketId);
    if (sub) {
      try {
        sub.pc.close();
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

  /** بازسازی کامل اتصال به یک ناشر روی هر offer دریافتی */
  const handleRemoteOffer = useCallback(
    async (
      from: string,
      fromName: string,
      payload: unknown
    ) => {
      const data = payload as
        | {
            sdp?: RTCSessionDescriptionInit;
            quality?: QualityMode;
            meta?: { cam?: string | null; screen?: string | null };
          }
        | null;
      if (!data?.sdp) return;

      const old = subsRef.current.get(from);
      if (old) {
        try {
          old.pc.close();
        } catch {
          /* بسته */
        }
        subsRef.current.delete(from);
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const sub: RemoteSub = {
        pc,
        name: fromName,
        camStream: null,
        screenStream: null,
        audioTrack: null,
      };
      subsRef.current.set(from, sub);

      const meta = data.meta ?? {};
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          emitSignal(from, "ice", ev.candidate.toJSON());
        }
      };
      pc.ontrack = (ev) => {
        const track = ev.track;
        const streamIdOfTrack = ev.streams[0]?.id ?? null;
        if (track.kind === "audio") {
          sub.audioTrack = track;
        } else if (meta.screen && streamIdOfTrack === meta.screen) {
          sub.screenStream = new MediaStream([track]);
        } else {
          sub.camStream = new MediaStream([track]);
        }
        syncPublisherState();
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          // اتصال رسانه شکست — اشتراک را ببند و کمی بعد دوباره بخواه
          dropSubscription(from);
          window.setTimeout(() => {
            if (socketRef.current?.connected) subscribeTo(from, fromName);
          }, 2500);
        }
      };

      try {
        await pc.setRemoteDescription(data.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        emitSignal(from, "answer", { sdp: pc.localDescription });
      } catch {
        dropSubscription(from);
        return;
      }

      // وضعیت نمایشی را از وضعیت واقعیِ sub بساز — نه placeholder با
      // main:null. ontrack هم‌زمان با setRemoteDescription زده می‌شود و
      // trackها از پیش در sub هستند؛ placeholderِ بعدی آنها را پاک می‌کرد و
      // تصویر استاد هرگز نمایش نمی‌افتاد (علت «اتصال... برای همیشه»).
      syncPublisherState();
    },
    [emitSignal, syncPublisherState, dropSubscription, subscribeTo]
  );

  /** بازسازی کامل اتصال به یک بیننده با کیفیت درخواستی */
  const rebuildViewer = useCallback(
    async (viewerSocketId: string, quality: QualityMode) => {
      const { camStream, screenStream } = localMediaRef.current;
      const old = viewersRef.current.get(viewerSocketId);
      if (old) {
        try {
          old.pc.close();
        } catch {
          /* بسته */
        }
        viewersRef.current.delete(viewerSocketId);
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      viewersRef.current.set(viewerSocketId, { pc, quality });
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          emitSignal(viewerSocketId, "ice", ev.candidate.toJSON());
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          viewersRef.current.delete(viewerSocketId);
        }
      };

      // — افزودن trackها بر اساس کیفیت بیننده (audio = فقط صدا) —
      const wantVideo = quality !== "audio";
      if (camStream) {
        for (const t of camStream.getAudioTracks()) pc.addTrack(t, camStream);
        if (wantVideo) {
          for (const t of camStream.getVideoTracks()) pc.addTrack(t, camStream);
        }
      }
      if (wantVideo && screenStream) {
        for (const t of screenStream.getVideoTracks())
          pc.addTrack(t, screenStream);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await applyBitrate(pc, quality);

      emitSignal(viewerSocketId, "offer", {
        sdp: pc.localDescription,
        quality,
        meta: {
          cam: camStream?.id ?? null,
          screen: screenStream?.id ?? null,
        },
      });
    },
    [emitSignal]
  );

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
          dropSubscription(data.publisherId);
          if (data.userId === null) setHostOnline(false);
        }
      }
    );

    socket.on("stream:live", () => setRoomStatus("live"));
    socket.on("stream:ended", () => {
      setRoomStatus("ended");
      setHostOnline(false);
      for (const pubId of Array.from(subsRef.current.keys())) {
        dropSubscription(pubId);
      }
    });
    socket.on("host:offline", () => setHostOnline(false));

    /* — سیگنالینگ رسانه — */
    socket.on(
      "signal",
      (data: { from: string; fromName?: string; kind: string; payload: unknown }) => {
        if (data.kind === "offer") {
          void handleRemoteOffer(
            data.from,
            data.fromName ?? "",
            data.payload
          );
        } else if (data.kind === "answer") {
          const entry = viewersRef.current.get(data.from);
          const sd = (data.payload as { sdp?: RTCSessionDescriptionInit })
            ?.sdp;
          if (entry && sd) {
            void entry.pc.setRemoteDescription(sd).catch(() => {});
          }
        } else if (data.kind === "ice") {
          const cand = data.payload as RTCIceCandidateInit | null;
          if (!cand) return;
          const entry = viewersRef.current.get(data.from);
          if (entry) {
            void entry.pc.addIceCandidate(cand).catch(() => {});
          }
          const sub = subsRef.current.get(data.from);
          if (sub) {
            void sub.pc.addIceCandidate(cand).catch(() => {});
          }
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
        void rebuildViewer(data.viewerSocketId, q);
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
      stopLocalMedia();
      socket.emit("publish", { streamId, active: false });
      setPublishing(false);
    });

    /* — اخراج — */
    socket.on("kicked", () => {
      kickedRef.current = true;
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
      for (const [, entry] of viewersRef.current) {
        try {
          entry.pc.close();
        } catch {
          /* بسته */
        }
      }
      viewersRef.current.clear();
      for (const [, sub] of subsRef.current) {
        try {
          sub.pc.close();
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
  ]);

  /* ———————————— انتشار رسانه (استاد/دانشجوی اجازه‌گرفته) ———————————— */

  /** اعلام شروع پخش به اتاق + دیتابیس (برای استاد/مدیر) */
  const announcePublishStart = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("publish", { streamId, active: true });
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
    setPublishing(false);
    for (const [viewerId, entry] of viewersRef.current) {
      try {
        entry.pc.close();
      } catch {
        /* بسته */
      }
      void viewerId;
    }
    viewersRef.current.clear();
  }, [streamId, stopLocalMedia]);

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
  const setQuality = useCallback(
    (mode: QualityMode) => {
      qualityRef.current = mode;
      setQualityState(mode);
      for (const pubId of Array.from(subsRef.current.keys())) {
        dropSubscription(pubId);
      }
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;
      for (const p of remotePublishers) {
        socket.emit("subscribe-request", {
          streamId,
          publisherId: p.socketId,
          quality: mode,
        });
      }
    },
    [streamId, remotePublishers, dropSubscription]
  );

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
