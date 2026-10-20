import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { archiveTask, updateTask } from "@/lib/tasks";
import { TaskFields } from "@/app/task-fields";

export default async function TaskPage({ params }: PageProps<"/t/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const [task, members] = await Promise.all([
    prisma.task.findFirst({
      where: { id, workspaceId: me.workspaceId, archivedAt: null },
      include: { category: true, assignees: true, createdBy: { select: { name: true } } },
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
  ]);
  if (!task) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href={`/c/${task.categoryId}`} className="text-sm underline">← {task.category.name}</Link>
      <p className="mt-6 mb-4 text-sm text-zinc-500">
        Created by {task.createdBy.name} on {task.createdAt.toISOString().slice(0, 10)}
        {task.completedAt && ` · completed ${task.completedAt.toISOString().slice(0, 10)}`}
      </p>

      <form action={updateTask} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={task.id} />
        <TaskFields members={members} task={{ ...task, assigneeIds: task.assignees.map((a) => a.userId) }} />
        <button className="self-start rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black">Save</button>
      </form>

      <form action={archiveTask} className="mt-10 border-t pt-4">
        <input type="hidden" name="id" value={task.id} />
        <button className="text-sm text-red-600 underline">Archive task</button>
      </form>
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
