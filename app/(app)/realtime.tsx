"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

type Realtime = { socket: Socket | null; online: Set<string> };
const Ctx = createContext<Realtime>({ socket: null, online: new Set() });
export const useRealtime = () => useContext(Ctx);

// One socket per tab, shared by every page under the (app) layout.
export default function RealtimeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<Realtime>({ socket: null, online: new Set() });

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

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
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
