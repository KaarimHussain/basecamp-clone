// Standalone Socket.io service: `npm run realtime`.
// Browsers connect with a token from /api/realtime/token; Next.js pushes events via POST /emit.
// Rooms: ws:<workspaceId> (everyone), user:<userId> (one person, all tabs).
import "dotenv/config";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Server } from "socket.io";
import { verifyToken } from "../lib/realtime-token";

const SECRET = process.env.REALTIME_SECRET;
if (!SECRET) throw new Error("REALTIME_SECRET is required");
const PORT = Number(process.env.REALTIME_PORT ?? 3001);

function authorized(header: string | undefined) {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const http = createServer((req, res) => {
  // socket.io intercepts /socket.io/* before this handler; anything else that isn't /emit is a 404.
  if (req.method !== "POST" || req.url !== "/emit") {
    res.writeHead(404).end();
    return;
  }
  if (!authorized(req.headers.authorization)) {
    res.writeHead(401).end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const { rooms, event, data } = JSON.parse(body) as { rooms: string[]; event: string; data: unknown };
      io.to(rooms).emit(event, data);
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
  });
});

const io = new Server(http, { cors: { origin: process.env.APP_URL ?? "http://localhost:3000" } });

// Presence: workspace → user → open socket count.
// ponytail: in-memory, single instance; move to the Redis adapter if this ever runs on more than one box.
const online = new Map<string, Map<string, number>>();
const broadcastPresence = (ws: string) => io.to(`ws:${ws}`).emit("presence", [...(online.get(ws)?.keys() ?? [])]);

io.use((socket, next) => {
  const claims = verifyToken(String(socket.handshake.auth.token ?? ""), SECRET);
  if (!claims) return next(new Error("unauthorized"));
  socket.data = claims;
  next();
});

io.on("connection", (socket) => {
  const { uid, ws } = socket.data as { uid: string; ws: string };
  socket.join([`ws:${ws}`, `user:${uid}`]);

  const users = online.get(ws) ?? new Map<string, number>();
  users.set(uid, (users.get(uid) ?? 0) + 1);
  online.set(ws, users);
  broadcastPresence(ws);

  // ponytail: typing goes to the whole workspace and clients filter by channel; scope to channel members if DM privacy matters.
  socket.on("typing", (channelId: unknown) => {
    if (typeof channelId === "string") socket.to(`ws:${ws}`).emit("typing", { channelId, uid });
  });

  socket.on("disconnect", () => {
    const n = (users.get(uid) ?? 1) - 1;
    if (n > 0) users.set(uid, n);
    else users.delete(uid);
    broadcastPresence(ws);
  });
});

http.listen(PORT, () => console.log(`realtime listening on :${PORT}`));
