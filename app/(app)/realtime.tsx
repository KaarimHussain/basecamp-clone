"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

type Realtime = { socket: Socket | null; online: Set<string>; meId: string };
const Ctx = createContext<Realtime>({ socket: null, online: new Set(), meId: "" });
export const useRealtime = () => useContext(Ctx);

// One socket per tab, shared by every page under the (app) layout.
export default function RealtimeProvider({ meId, children }: { meId: string; children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [state, setState] = useState<Realtime>({ socket: null, online: new Set(), meId });

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3001", {
      // Called on every (re)connect, so an expired token is replaced automatically.
      auth: (cb) => {
        fetch("/api/realtime/token")
          .then((r) => r.json())
          .then(({ token }) => cb({ token }))
          .catch(() => cb({}));
      },
    });
    socket.on("presence", (ids: string[]) => setState((s) => ({ ...s, online: new Set(ids) })));
    socket.on("notification:new", () => router.refresh());
    socket.on("connect", () => setState((s) => ({ ...s, socket })));
    return () => {
      socket.disconnect();
    };
  }, [router]);

  // Outside chat, a new message only needs to bump the Chat badge (the chat room handles itself).
  useEffect(() => {
    const socket = state.socket;
    if (!socket || path.startsWith("/chat")) return;
    const onMessage = (m: { authorId: string }) => {
      if (m.authorId !== meId) router.refresh();
    };
    socket.on("message:new", onMessage);
    return () => {
      socket.off("message:new", onMessage);
    };
  }, [state.socket, path, meId, router]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

// Drop onto a to-do or category page: refreshes it when someone else changes a matching task.
export function LiveTask({ taskId, categoryId }: { taskId?: string; categoryId?: string }) {
  const { socket, meId } = useRealtime();
  const router = useRouter();
  useEffect(() => {
    if (!socket) return;
    const onChange = (e: { taskId: string; categoryId: string; actorId: string }) => {
      if (e.actorId === meId) return;
      if ((taskId && e.taskId === taskId) || (categoryId && e.categoryId === categoryId)) router.refresh();
    };
    socket.on("task:changed", onChange);
    return () => {
      socket.off("task:changed", onChange);
    };
  }, [socket, meId, taskId, categoryId, router]);
  return null;
}

export function PresenceDot({ userId }: { userId: string }) {
  const { online } = useRealtime();
  const on = online.has(userId);
  return (
    <span
      title={on ? "Online" : "Offline"}
      aria-label={on ? "online" : "offline"}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${on ? "bg-green-500" : "border border-muted-foreground/60 bg-card"}`}
    />
  );
}
