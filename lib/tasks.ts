"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { isEmpty, mentionIds, richText } from "@/lib/rich-text";
import { changeEvents, notifyMentions, notifySubscribers, pushTaskChanged } from "@/lib/notify";
import { diffTask, logActivity } from "@/lib/activity";
import { Prisma, type SubReason } from "@/app/generated/prisma/client";

const STATUS = z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]);

const fields = z.object({
  title: z.string().trim().min(1).max(200),
  status: STATUS.default("TODO"),
  priority: z.coerce.number().int().min(0).max(3).default(0),
  // <input type="date"> sends "" when cleared
  dueAt: z.string().optional().transform((s) => (s ? new Date(`${s}T00:00:00Z`) : null)),
});

function readForm(form: FormData) {
  return {
    ...fields.parse(Object.fromEntries(form)),
    assigneeIds: form.getAll("assigneeIds").map(String),
  };
}

// Drops any id that isn't a member of this workspace.
async function validAssignees(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await prisma.member.findMany({ where: { workspaceId, userId: { in: ids } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

function validTags(workspaceId: string, form: FormData) {
  return prisma.tag.findMany({ where: { workspaceId, id: { in: form.getAll("tagIds").map(String) } }, select: { id: true } });
}

async function ownTask(id: string, workspaceId: string) {
  const task = await prisma.task.findFirst({ where: { id, workspaceId, archivedAt: null } });
  if (!task) throw new Error("Task not found");
  return task;
}

export async function createTask(form: FormData) {
  const me = await requireMember();
  const categoryId = z.string().parse(form.get("categoryId"));
  const category = await prisma.category.findFirst({ where: { id: categoryId, workspaceId: me.workspaceId, archivedAt: null } });
  if (!category) throw new Error("Category not found");

  const { assigneeIds, ...data } = readForm(form);
  const assignees = await validAssignees(me.workspaceId, assigneeIds);
  const tags = await validTags(me.workspaceId, form);

  await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        ...data,
        workspaceId: me.workspaceId,
        categoryId,
        createdById: me.userId,
        position: Date.now(), // ponytail: append-only ordering; fractional reorder when in-column drag lands
        completedAt: data.status === "DONE" ? new Date() : null,
        assignees: { create: assignees.map((userId) => ({ userId })) },
        tags: { create: tags.map((t) => ({ tagId: t.id })) },
      },
    });

    // Leadership auto-loop. Later entries win, so creator/assignee reasons survive a demotion.
    const [leaders, watchers] = await Promise.all([
      tx.member.findMany({ where: { workspaceId: me.workspaceId, role: "LEADERSHIP" }, select: { userId: true } }),
      tx.categoryWatcher.findMany({ where: { categoryId }, select: { userId: true } }),
    ]);
    const subs = new Map<string, SubReason>([
      ...leaders.map((l) => [l.userId, "LEADERSHIP"] as const),
      ...watchers.map((w) => [w.userId, "LEADERSHIP"] as const),
      ...assignees.map((id) => [id, "ASSIGNEE"] as const),
      [me.userId, "CREATOR"],
    ]);
    await tx.taskSubscriber.createMany({
      data: [...subs].map(([userId, reason]) => ({ taskId: task.id, userId, reason })),
      skipDuplicates: true,
    });
    await logActivity(tx, task.id, me.userId, [{ action: "created" }]);
    await notifySubscribers(task.id, "task_created", me.userId, [], tx);
    await pushTaskChanged(me.workspaceId, task, me.userId);
  });

  revalidatePath(`/c/${categoryId}`);
}

export async function updateTask(form: FormData) {
  const me = await requireMember();
  const task = await ownTask(z.string().parse(form.get("id")), me.workspaceId);
  const { assigneeIds, ...data } = readForm(form);
  const assignees = await validAssignees(me.workspaceId, assigneeIds);
  const description = form.has("description") ? richText.parse(form.get("description")) : undefined;
  const tags = await validTags(me.workspaceId, form);

  // Names for the activity diff, before and after.
  const [oldAssignees, oldTags, people, tagRows] = await Promise.all([
    prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { user: { select: { name: true } } } }),
    prisma.taskTag.findMany({ where: { taskId: task.id }, select: { tag: { select: { name: true } } } }),
    prisma.user.findMany({ where: { id: { in: assignees } }, select: { name: true } }),
    prisma.tag.findMany({ where: { id: { in: tags.map((t) => t.id) } }, select: { name: true } }),
  ]);
  const changes = diffTask(
    { ...task, assignees: oldAssignees.map((a) => a.user.name), tags: oldTags.map((t) => t.tag.name) },
    { ...data, assignees: people.map((p) => p.name), tags: tagRows.map((t) => t.name) },
  );
  const newDescription = description && !isEmpty(description) ? description : null;
  if (description && JSON.stringify(newDescription) !== JSON.stringify(task.description)) changes.push({ action: "description" });

  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: {
        ...data,
        ...(description && { description: isEmpty(description) ? Prisma.DbNull : description }),
        completedAt: data.status === "DONE" ? (task.completedAt ?? new Date()) : null,
      },
    }),
    prisma.taskTag.deleteMany({ where: { taskId: task.id } }),
    prisma.taskTag.createMany({ data: tags.map((t) => ({ taskId: task.id, tagId: t.id })) }),
    prisma.taskAssignee.deleteMany({ where: { taskId: task.id } }),
    prisma.taskAssignee.createMany({ data: assignees.map((userId) => ({ taskId: task.id, userId })) }),
    prisma.taskSubscriber.createMany({
      data: assignees.map((userId) => ({ taskId: task.id, userId, reason: "ASSIGNEE" as const })),
      skipDuplicates: true,
    }),
  ]);
  await logActivity(prisma, task.id, me.userId, changes);
  for (const type of changeEvents(task, data)) await notifySubscribers(task.id, type, me.userId);
  // @mentions newly added to the notes notify just like comment mentions.
  if (newDescription) {
    const before = new Set(task.description ? mentionIds(task.description as Parameters<typeof mentionIds>[0]) : []);
    await notifyMentions(prisma, me.workspaceId, task.id, me.userId, mentionIds(newDescription).filter((id) => !before.has(id)));
  }
  await pushTaskChanged(me.workspaceId, task, me.userId);

  revalidatePath(`/c/${task.categoryId}`);
  revalidatePath(`/t/${task.id}`);
}

// Called from the Kanban board on drop. With `beforeId`, the card lands just above that card;
// otherwise at the bottom of the column. Positions are floats, so a move touches one row.
export async function moveTask(id: string, status: string, beforeId?: string) {
  const me = await requireMember();
  const task = await ownTask(id, me.workspaceId);
  const next = STATUS.parse(status);

  let position = Date.now();
  if (beforeId && beforeId !== id) {
    const before = await prisma.task.findFirst({ where: { id: beforeId, categoryId: task.categoryId, archivedAt: null } });
    if (before) {
      const above = await prisma.task.findFirst({
        where: { categoryId: task.categoryId, status: before.status, archivedAt: null, position: { lt: before.position }, id: { not: id } },
        orderBy: { position: "desc" },
      });
      position = above ? (above.position + before.position) / 2 : before.position - 1;
    }
  }
  if (next === task.status && !beforeId) return;

  await prisma.task.update({
    where: { id },
    data: {
      status: next,
      position,
      completedAt: next === "DONE" ? (task.completedAt ?? new Date()) : null,
    },
  });
  if (next === task.status) {
    revalidatePath(`/c/${task.categoryId}`);
    return; // reorder only: nothing to log or notify
  }
  await logActivity(prisma, id, me.userId, [{ action: "status", meta: { from: task.status, to: next } }]);
  for (const type of changeEvents(task, { status: next })) await notifySubscribers(id, type, me.userId);
  await pushTaskChanged(me.workspaceId, task, me.userId);
  revalidatePath(`/c/${task.categoryId}`);
}

// ── Following ─────────────────────────────────────────────

export async function followTask(form: FormData) {
  const me = await requireMember();
  const task = await ownTask(z.string().parse(form.get("id")), me.workspaceId);
  await prisma.taskSubscriber.upsert({
    where: { taskId_userId: { taskId: task.id, userId: me.userId } },
    update: { mutedAt: null },
    create: { taskId: task.id, userId: me.userId, reason: "MANUAL" },
  });
  revalidatePath(`/t/${task.id}`);
}

// Leadership follows can't be dropped (only muted); everything else can.
export async function unfollowTask(form: FormData) {
  const me = await requireMember();
  const task = await ownTask(z.string().parse(form.get("id")), me.workspaceId);
  await prisma.taskSubscriber.deleteMany({ where: { taskId: task.id, userId: me.userId, reason: { not: "LEADERSHIP" } } });
  revalidatePath(`/t/${task.id}`);
}

export async function setMuted(form: FormData) {
  const me = await requireMember();
  const task = await ownTask(z.string().parse(form.get("id")), me.workspaceId);
  const muted = form.get("muted") === "1";
  await prisma.taskSubscriber.updateMany({
    where: { taskId: task.id, userId: me.userId },
    data: { mutedAt: muted ? new Date() : null },
  });
  revalidatePath(`/t/${task.id}`);
}

export async function archiveTask(form: FormData) {
  const me = await requireMember();
  const task = await ownTask(z.string().parse(form.get("id")), me.workspaceId);
  await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date() } });
  await logActivity(prisma, task.id, me.userId, [{ action: "archived" }]);
  await pushTaskChanged(me.workspaceId, task, me.userId);
  revalidatePath(`/c/${task.categoryId}`);
  redirect(`/c/${task.categoryId}`);
}

// The round checkbox on a to-do. Reopening puts it back where it was before it was completed
// (e.g. Review), read from the activity log, instead of always resetting to To do.
export async function toggleDone(form: FormData) {
  const me = await requireMember();
  const task = await ownTask(z.string().parse(form.get("id")), me.workspaceId);
  let next = "DONE";
  if (task.status === "DONE") {
    const completed = await prisma.activity.findFirst({
      where: { taskId: task.id, action: "status", meta: { path: ["to"], equals: "DONE" } },
      orderBy: { createdAt: "desc" },
    });
    const from = (completed?.meta as { from?: string } | null)?.from;
    next = from && from !== "DONE" ? from : "TODO";
  }
  await moveTask(task.id, next);
  revalidatePath(`/t/${task.id}`);
}

export async function restoreTask(form: FormData) {
  const me = await requireMember();
  const task = await prisma.task.findFirst({ where: { id: z.string().parse(form.get("id")), workspaceId: me.workspaceId, archivedAt: { not: null } } });
  if (!task) throw new Error("Task not found");
  await prisma.task.update({ where: { id: task.id }, data: { archivedAt: null } });
  await logActivity(prisma, task.id, me.userId, [{ action: "restored" }]);
  await pushTaskChanged(me.workspaceId, task, me.userId);
  revalidatePath(`/c/${task.categoryId}`);
}
