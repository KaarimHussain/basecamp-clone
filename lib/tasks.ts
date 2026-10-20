"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import type { SubReason } from "@/app/generated/prisma/client";

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

async function ownTask(id: string, workspaceId: string) {
  const task = await prisma.task.findFirst({ where: { id, workspaceId, archivedAt: null } });
  if (!task) throw new Error("Task not found");
  return task;
}

export async function createTask(form: FormData) {
  const me = await requireMember();
  const categoryId = z.string().parse(form.get("categoryId"));
  const category = await prisma.category.findFirst({ where: { id: categoryId, workspaceId: me.workspaceId } });
  if (!category) throw new Error("Category not found");

  const { assigneeIds, ...data } = readForm(form);
  const assignees = await validAssignees(me.workspaceId, assigneeIds);

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
  });

  revalidatePath(`/c/${categoryId}`);
}

export async function updateTask(form: FormData) {
  const me = await requireMember();
  const task = await ownTask(z.string().parse(form.get("id")), me.workspaceId);
  const { assigneeIds, ...data } = readForm(form);
  const assignees = await validAssignees(me.workspaceId, assigneeIds);

  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: {
        ...data,
        completedAt: data.status === "DONE" ? (task.completedAt ?? new Date()) : null,
      },
    }),
    prisma.taskAssignee.deleteMany({ where: { taskId: task.id } }),
    prisma.taskAssignee.createMany({ data: assignees.map((userId) => ({ taskId: task.id, userId })) }),
    prisma.taskSubscriber.createMany({
      data: assignees.map((userId) => ({ taskId: task.id, userId, reason: "ASSIGNEE" as const })),
      skipDuplicates: true,
    }),
  ]);

  revalidatePath(`/c/${task.categoryId}`);
  revalidatePath(`/t/${task.id}`);
}

// Called from the Kanban board on drop.
export async function moveTask(id: string, status: string) {
  const me = await requireMember();
  const task = await ownTask(id, me.workspaceId);
  const next = STATUS.parse(status);
  if (next === task.status) return;
  await prisma.task.update({
    where: { id },
    data: {
      status: next,
      position: Date.now(),
      completedAt: next === "DONE" ? new Date() : null,
    },
  });
  revalidatePath(`/c/${task.categoryId}`);
}

export async function archiveTask(form: FormData) {
  const me = await requireMember();
  const task = await ownTask(z.string().parse(form.get("id")), me.workspaceId);
  await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date() } });
  revalidatePath(`/c/${task.categoryId}`);
  redirect(`/c/${task.categoryId}`);
}
