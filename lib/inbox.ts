"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";

// Marks one notification read and jumps to its task.
export async function openNotification(form: FormData) {
  const me = await requireMember();
  const n = await prisma.notification.findFirst({ where: { id: z.string().parse(form.get("id")), userId: me.userId } });
  if (!n) return;
  // Opening one clears every unread notification for the same task.
  await prisma.notification.updateMany({
    where: { userId: me.userId, readAt: null, ...(n.taskId ? { taskId: n.taskId } : { id: n.id }) },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
  if (n.taskId) redirect(`/t/${n.taskId}`);
}

export async function markAllRead() {
  const me = await requireMember();
  await prisma.notification.updateMany({ where: { userId: me.userId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
