import "server-only";

// Fire-and-forget push to the socket service. A realtime outage must never fail a write.
export async function emit(rooms: string[], event: string, data: unknown) {
  if (rooms.length === 0) return;
  try {
    await fetch(`${process.env.REALTIME_URL ?? "http://localhost:3001"}/emit`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.REALTIME_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ rooms, event, data }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    console.warn("[realtime] emit failed:", (err as Error).message);
  }
}
