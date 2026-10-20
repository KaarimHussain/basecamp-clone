import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/app/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;
type Entry = { action: string; meta?: Prisma.InputJsonObject };

// Labels are stored at write time so history still reads right after renames.
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

export async function logActivity(db: Db, taskId: string, actorId: string, entries: Entry[]) {
  if (entries.length === 0) return;
  await db.activity.createMany({ data: entries.map((e) => ({ taskId, actorId, action: e.action, meta: e.meta ?? {} })) });
}

// Field-by-field diff of a task edit.
export function diffTask(
  before: { title: string; status: string; priority: number; dueAt: Date | null; assignees: string[]; tags: string[] },
  after: Partial<typeof before>,
): Entry[] {
  const out: Entry[] = [];
  for (const key of ["title", "status", "priority"] as const) {
    if (after[key] !== undefined && after[key] !== before[key]) out.push({ action: key, meta: { from: before[key], to: after[key]! } });
  }
  if (after.dueAt !== undefined && day(after.dueAt) !== day(before.dueAt)) out.push({ action: "due", meta: { from: day(before.dueAt), to: day(after.dueAt) } });
  for (const key of ["assignees", "tags"] as const) {
    const next = after[key];
    if (!next) continue;
    const added = next.filter((x) => !before[key].includes(x));
    const removed = before[key].filter((x) => !next.includes(x));
    if (added.length || removed.length) out.push({ action: key, meta: { added, removed } });
  }
  return out;
}

const STATUS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", REVIEW: "Review", DONE: "Done" };
const PRIORITY = ["None", "Low", "Medium", "High"];

export function activityText(action: string, meta: unknown): string {
  const m = (meta ?? {}) as { from?: string | number | null; to?: string | number | null; added?: string[]; removed?: string[] };
  const list = (label: string) =>
    [m.added?.length && `added ${label} ${m.added.join(", ")}`, m.removed?.length && `removed ${label} ${m.removed.join(", ")}`].filter(Boolean).join("; ");
  switch (action) {
    case "created": return "created this task";
    case "title": return `renamed it from “${m.from}” to “${m.to}”`;
    case "status": return `moved it from ${STATUS[String(m.from)]} to ${STATUS[String(m.to)]}`;
    case "priority": return `set priority to ${PRIORITY[Number(m.to)]}`;
    case "due": return m.to ? `set the due date to ${m.to}` : "cleared the due date";
    case "assignees": return list("assignee");
    case "tags": return list("tag");
    case "description": return "edited the description";
    case "commented": return "commented";
    case "files": return `attached ${m.added?.join(", ")}`;
    case "archived": return "archived this task";
    case "restored": return "restored this task from the archive";
    default: return action;
  }
}
