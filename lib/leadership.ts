import "server-only";
import type { Prisma } from "@/app/generated/prisma/client";

type Tx = Prisma.TransactionClient;
const OPEN = { archivedAt: null, status: { not: "DONE" as const } };

// Subscribe a user (reason LEADERSHIP) to every open task matching `where`.
// Existing follows keep their reason (skipDuplicates).
export async function backfill(tx: Tx, userId: string, where: Prisma.TaskWhereInput) {
  const tasks = await tx.task.findMany({ where: { ...OPEN, ...where }, select: { id: true } });
  await tx.taskSubscriber.createMany({
    data: tasks.map((t) => ({ taskId: t.id, userId, reason: "LEADERSHIP" as const })),
    skipDuplicates: true,
  });
}

// Drop LEADERSHIP follows in `where`, except on categories the user still watches
// (or anywhere, if they still hold the LEADERSHIP role). Manual/creator/assignee/mention follows stay.
export async function removeLeadershipFollows(tx: Tx, workspaceId: string, userId: string, where: Prisma.TaskWhereInput) {
  const member = await tx.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (member?.role === "LEADERSHIP") return;
  const watched = await tx.categoryWatcher.findMany({ where: { userId }, select: { categoryId: true } });
  await tx.taskSubscriber.deleteMany({
    where: {
      userId,
      reason: "LEADERSHIP",
      task: { workspaceId, AND: [where, { categoryId: { notIn: watched.map((w) => w.categoryId) } }] },
    },
  });
}
