import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/app/generated/prisma/client";

export type NotifyType = "task_created" | "comment" | "mention" | "status" | "due" | "completed";

export const NOTIFY_TEXT: Record<string, string> = {
  task_created: "created",
  comment: "commented on",
  mention: "mentioned you in",
  status: "changed the status of",
  due: "changed the due date of",
  completed: "completed",
};

type Db = Prisma.TransactionClient | typeof prisma;

// Fans an event out to everyone following the task, except the actor, muted followers and `skip`.
export async function notifySubscribers(taskId: string, type: NotifyType, actorId: string, skip: string[] = [], db: Db = prisma) {
  const subs = await db.taskSubscriber.findMany({
    where: { taskId, mutedAt: null, userId: { notIn: [actorId, ...skip] } },
    select: { userId: true },
  });
  if (subs.length === 0) return;
  await db.notification.createMany({ data: subs.map((s) => ({ userId: s.userId, actorId, taskId, type })) });
}

// Status/due changes → which notifications a task update should send.
export function changeEvents(
  before: { status: string; dueAt: Date | null },
  after: { status?: string; dueAt?: Date | null },
): NotifyType[] {
  const events: NotifyType[] = [];
  if (after.status && after.status !== before.status) events.push(after.status === "DONE" ? "completed" : "status");
  if (after.dueAt !== undefined && after.dueAt?.getTime() !== before.dueAt?.getTime()) events.push("due");
  return events;
}
