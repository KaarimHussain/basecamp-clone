// Server-rendered, so stick to UTC-stable output (no locale/timezone guesses).

export function relative(d: Date, now = new Date()) {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(d);
}

export function shortDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// "Due Oct 31" / "Due today" / "Overdue · Oct 2"
export function dueLabel(due: Date, today = new Date(new Date().toISOString().slice(0, 10))) {
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return { text: "Due today", tone: "warn" as const };
  if (diff === 1) return { text: "Due tomorrow", tone: "warn" as const };
  if (diff < 0) return { text: `Overdue · ${shortDate(due)}`, tone: "bad" as const };
  return { text: `Due ${shortDate(due)}`, tone: "ok" as const };
}
