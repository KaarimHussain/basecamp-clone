import "server-only";
import { prisma } from "@/lib/db";
import { emit } from "@/lib/realtime";
import type { Prisma } from "@/app/generated/prisma/client";

export type NotifyType = "task_created" | "comment" | "mention" | "status" | "due" | "completed";

export const NOTIFY_TEXT: Record<string, string> = {
  task_created: "created",
  comment: "commented on",
  mention: "mentioned you in",
  status: "changed the status of",
  due: "changed the due date of",
  completed: "completed",
  dm: "sent you a message",
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
  await pushNotified(subs.map((s) => s.userId));
}

// Mentioned members follow the task and get a "mention" notification. Returns who was notified.
export async function notifyMentions(db: Db, workspaceId: string, taskId: string, authorId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const members = await db.member.findMany({ where: { workspaceId, userId: { in: ids } }, select: { userId: true } });
  const targets = members.map((m) => m.userId).filter((id) => id !== authorId);
  if (targets.length === 0) return [];
  await db.taskSubscriber.createMany({
    data: targets.map((userId) => ({ taskId, userId, reason: "MENTION" as const })),
    skipDuplicates: true,
  });
  await db.notification.createMany({ data: targets.map((userId) => ({ userId, actorId: authorId, taskId, type: "mention" })) });
  await pushNotified(targets);
  return targets;
}

// Tells open to-do and category pages to refresh after someone else edits a task.
export function pushTaskChanged(workspaceId: string, task: { id: string; categoryId: string }, actorId: string) {
  return emit([`ws:${workspaceId}`], "task:changed", { taskId: task.id, categoryId: task.categoryId, actorId });
}

// Live inbox badge: tells each user's open tabs to refresh.
export function pushNotified(userIds: string[]) {
  return emit(userIds.map((id) => `user:${id}`), "notification:new", {});
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
