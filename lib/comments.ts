"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { isEmpty, mentionIds, richText } from "@/lib/rich-text";
import { parseUploads } from "@/lib/storage";
import { notifySubscribers } from "@/lib/notify";
import type { Prisma } from "@/app/generated/prisma/client";

// Mentioned members follow the task and get a "mention" notification. Returns who was notified.
async function notifyMentions(tx: Prisma.TransactionClient, workspaceId: string, taskId: string, authorId: string, ids: string[]) {
  const members = await tx.member.findMany({ where: { workspaceId, userId: { in: ids } }, select: { userId: true } });
  const targets = members.map((m) => m.userId).filter((id) => id !== authorId);
  if (targets.length === 0) return [];
  await tx.taskSubscriber.createMany({
    data: targets.map((userId) => ({ taskId, userId, reason: "MENTION" as const })),
    skipDuplicates: true,
  });
  await tx.notification.createMany({ data: targets.map((userId) => ({ userId, actorId: authorId, taskId, type: "mention" })) });
  return targets;
}

export async function addComment(form: FormData) {
  const me = await requireMember();
  const taskId = z.string().parse(form.get("taskId"));
  const task = await prisma.task.findFirst({ where: { id: taskId, workspaceId: me.workspaceId, archivedAt: null } });
  if (!task) throw new Error("Task not found");

  const body = richText.parse(form.get("body"));
  const uploads = parseUploads(form.get("uploads"), me.workspaceId);
  if (isEmpty(body) && uploads.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.comment.create({
      data: { taskId, authorId: me.userId, body, attachments: { create: uploads } },
    });
    // Followers get "comment", except those who just got the more specific "mention".
    const mentioned = await notifyMentions(tx, me.workspaceId, taskId, me.userId, mentionIds(body));
    await notifySubscribers(taskId, "comment", me.userId, mentioned, tx);
  });
  revalidatePath(`/t/${taskId}`);
}

async function ownComment(id: string, userId: string) {
  const comment = await prisma.comment.findFirst({ where: { id, authorId: userId }, include: { task: true } });
  if (!comment) throw new Error("Comment not found");
  return comment;
}

export async function editComment(form: FormData) {
  const me = await requireMember();
  const comment = await ownComment(z.string().parse(form.get("id")), me.userId);
  const body = richText.parse(form.get("body"));
  if (isEmpty(body)) return;

  const before = new Set(mentionIds(comment.body as Parameters<typeof mentionIds>[0]));
  await prisma.$transaction(async (tx) => {
    await tx.comment.update({ where: { id: comment.id }, data: { body, editedAt: new Date() } });
    // Only newly added mentions notify.
    await notifyMentions(tx, me.workspaceId, comment.taskId, me.userId, mentionIds(body).filter((id) => !before.has(id)));
  });
  revalidatePath(`/t/${comment.taskId}`);
}

export async function deleteComment(form: FormData) {
  const me = await requireMember();
  const comment = await ownComment(z.string().parse(form.get("id")), me.userId);
  // ponytail: files of deleted attachments stay on disk; add a sweep job if disk use matters.
  await prisma.comment.delete({ where: { id: comment.id } });
  revalidatePath(`/t/${comment.taskId}`);
}

export async function addTaskFiles(form: FormData) {
  const me = await requireMember();
  const taskId = z.string().parse(form.get("taskId"));
  const task = await prisma.task.findFirst({ where: { id: taskId, workspaceId: me.workspaceId, archivedAt: null } });
  if (!task) throw new Error("Task not found");
  const uploads = parseUploads(form.get("uploads"), me.workspaceId);
  await prisma.attachment.createMany({ data: uploads.map((u) => ({ ...u, taskId })) });
  revalidatePath(`/t/${taskId}`);
}

const tagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

export async function createTag(form: FormData) {
  const me = await requireMember();
  const data = tagSchema.parse(Object.fromEntries(form));
  await prisma.tag.upsert({
    where: { workspaceId_name: { workspaceId: me.workspaceId, name: data.name } },
    update: { color: data.color },
    create: { ...data, workspaceId: me.workspaceId },
  });
  const back = form.get("taskId");
  if (back) revalidatePath(`/t/${back}`);
}
