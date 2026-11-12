"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * اتصال بلادرنگ چت — سرویس رله‌ی socket.io.
 *
 * آدرس اتصال از NEXT_PUBLIC_SOCKET_URI می‌آید (در بیلد جایگزین می‌شود):
 *  • پیش‌فرض محیط توسعه: «/?XTransformPort=3004» — روتینگ گیت‌وی سندباکس
 *  • بیلد استقرار (Docker + Apache/nginx): «/» — همان مبدا با مسیر /socket.io
 */
const SOCKET_URI = process.env.NEXT_PUBLIC_SOCKET_URI ?? "/?XTransformPort=3004";

export interface ActivityEvent {
  conversationId: string;
  kind: "visitor-message" | "admin-message" | "read";
}

export interface TypingEvent {
  conversationId: string;
  who: "visitor" | "admin";
}

export interface ChatSocketHandlers {
  onActivity?: (data: ActivityEvent) => void;
  onTyping?: (data: TypingEvent) => void;
}

export interface ChatSocketApi {
  /** اتصال برقرار است؟ */
  isConnected: () => boolean;
  /** بازدیدکننده: عضویت در اتاق گفتگوی خود (با تیکت امضاشده از API) */
  subscribeVisitor: (conversationId: string, ticket?: string) => void;
  /** مدیر: عضویت در اتاق عمومی مدیران */
  subscribeAdmin: () => void;
  /** مدیر: باز کردن/بستن اتاق یک گفتگو */
  openConversation: (conversationId: string) => void;
  closeConversation: (conversationId: string) => void;
  /** سیگنال فعالیت (بعد از ذخیره‌ی موفق پیام) */
  emitActivity: (conversationId: string, kind: ActivityEvent["kind"]) => void;
  /** نشانگر تایپ */
  emitTyping: (conversationId: string, who: TypingEvent["who"]) => void;
}

export function useChatSocket(handlers: ChatSocketHandlers): ChatSocketApi {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);

  // رویدادها همیشه با آخرین نسخه‌ی هندلرها اجرا می‌شوند (بدون نیاز به اتصال مجدد)
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const socket = io(SOCKET_URI, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 1500,
      timeout: 10000,
    });
    socketRef.current = socket;

    const onActivity = (data: ActivityEvent) => {
      if (data && typeof data.conversationId === "string") {
        handlersRef.current.onActivity?.(data);
      }
    };
    const onTyping = (data: TypingEvent) => {
      if (data && typeof data.conversationId === "string") {
        handlersRef.current.onTyping?.(data);
      }
    };

    socket.on("activity", onActivity);
    socket.on("typing", onTyping);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const isConnected = useCallback(() => socketRef.current?.connected ?? false, []);

  const subscribeVisitor = useCallback(
    (conversationId: string, ticket?: string) => {
      socketRef.current?.emit("visitor:subscribe", { conversationId, ticket });
    },
    []
  );

  const subscribeAdmin = useCallback(() => {
    socketRef.current?.emit("admin:subscribe");
  }, []);

  const openConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit("admin:open", { conversationId });
  }, []);

  const closeConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit("admin:leave", { conversationId });
  }, []);

  const emitActivity = useCallback(
    (conversationId: string, kind: ActivityEvent["kind"]) => {
      socketRef.current?.emit("activity", { conversationId, kind });
    },
    []
  );

  const emitTyping = useCallback(
    (conversationId: string, who: TypingEvent["who"]) => {
      socketRef.current?.emit("typing", { conversationId, who });
    },
    []
  );

  return useMemo(
    () => ({
      isConnected,
      subscribeVisitor,
      subscribeAdmin,
      openConversation,
      closeConversation,
      emitActivity,
      emitTyping,
    }),
    [
      isConnected,
      subscribeVisitor,
      subscribeAdmin,
      openConversation,
      closeConversation,
      emitActivity,
      emitTyping,
    ]
  );
}
