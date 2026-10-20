// Server-rendered: dates are formatted in the workspace timezone (WORKSPACE_TZ, default Asia/Karachi),
// never the server's, so a UTC server still flips "today" at local midnight.

export const TZ = process.env.WORKSPACE_TZ ?? "Asia/Karachi";

// Midnight UTC of the current calendar day in the workspace timezone: the same shape due dates are stored in.
export function today(now = new Date()) {
  return new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now)}T00:00:00Z`);
}

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
  // Due dates are calendar days stored at UTC midnight, so format them in UTC to keep the day.
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// "Due Oct 31" / "Due today" / "Overdue · Oct 2"
export function dueLabel(due: Date, now = today()) {
  const diff = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  if (diff === 0) return { text: "Due today", tone: "warn" as const };
  if (diff === 1) return { text: "Due tomorrow", tone: "warn" as const };
  if (diff < 0) return { text: `Overdue · ${shortDate(due)}`, tone: "bad" as const };
  return { text: `Due ${shortDate(due)}`, tone: "ok" as const };
}
